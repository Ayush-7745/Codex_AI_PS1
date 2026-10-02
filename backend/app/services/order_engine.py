from typing import List, Tuple
from uuid import uuid4
from datetime import datetime, timezone

from app.schemas import CatalogCandidate, OrderItem
from app.services.catalog import CatalogService


MEASURE_UNITS = {"kg", "g", "L", "ml"}
UNIT_TO_BASE = {"kg": ("g", 1000.0), "g": ("g", 1.0), "L": ("ml", 1000.0), "ml": ("ml", 1.0)}


class OrderEngine:
    def __init__(self, catalog: CatalogService, require_quantity: bool = False):
        self.catalog = catalog
        self.require_quantity = require_quantity
        self.orders = {}
        self._checkout_lock = catalog.lock
        self._checkout_results = {}

    def resolve_item(self, item: OrderItem):
        exact_product = self.catalog.get_by_id(item.product_id) if item.product_id else None
        if item.product_id and exact_product is None:
            return self._draft(item, [], "no_match", f"Unknown product id '{item.product_id}'.")

        query = f"{item.brand} {item.product_name}" if item.brand else item.product_name
        if exact_product:
            matches = [exact_product]
        else:
            unit_filter = item.pack_unit if item.pack_size is not None else item.unit
            if unit_filter not in MEASURE_UNITS:
                unit_filter = None
            matches = self.catalog.search(
                query,
                limit=30,
                brand=item.brand,
                unit=unit_filter,
                pack_size=item.pack_size,
            )

        exact = [candidate for candidate in matches if candidate.get("_exact_match", bool(exact_product))]
        strong = exact or [candidate for candidate in matches if float(candidate.get("_score", 0)) >= 80]
        if exact_product:
            strong = [exact_product]

        # A requested weight/volume is an order amount. It only maps to whole
        # catalog packs; never treat 0.5 kg as half of a retail pack implicitly.
        if item.unit in MEASURE_UNITS:
            sized = [candidate for candidate in strong if self._same_measure(
                item.quantity, item.unit, candidate.get("pack_size"), candidate.get("unit")
            ) or (bool(candidate.get("is_demo"))
                  and self._compatible_measure(item.unit, candidate.get("unit")))]
            if not sized:
                candidates = self._candidate_models(strong)
                question = self._candidate_question(candidates) if candidates else None
                fallback_msg = f"{item.product_name.capitalize()} ke liye {item.quantity:g} {item.unit} pack available nahi hai."
                if question and item.product_name.lower() in ("atta", "aata"):
                    question = f"Atta ke liye kaunsa pack size chahiye? ({question.replace('Isme se kaunsa chahiye: ', '')})"
                return self._draft(
                    item, candidates, "quantity_pack_mismatch",
                    question or fallback_msg,
                )
            strong = sized

        if not strong:
            return self._draft(item, [], "no_match", f"'{item.product_name}' catalog mein nahi mila. Koi aur product chahiye?")

        # Fuzzy-only matches are candidates for clarification, never a silent
        # product decision. Exact aliases can resolve when they identify one SKU.
        if len(strong) != 1 or not exact and not exact_product:
            candidates = self._candidate_models(strong)
            question = self._candidate_question(candidates)
            if not question:
                question = f"{item.product_name.capitalize()} ke liye kaunsa option chahiye?"
            elif item.product_name.lower() in ("butter", "amul butter"):
                # If product is butter, provide a direct pack question format when applicable
                question = f"Amul butter mein kaunsa pack size chahiye? ({question.replace('Isme se kaunsa chahiye: ', '')})"
            return self._draft(
                item,
                candidates,
                "ambiguous_product",
                question,
            )

        product = strong[0]
        if self.require_quantity and item.quantity_specified is False:
            return self._draft(
                item, self._candidate_models([product]), "quantity_required",
                f"How much {product['product_name']} would you like? Please tell us the quantity and unit.",
            )
        stock = float(product.get("stock") or 0)
        required_packs = self.pack_count(item, product)
        if stock <= 0:
            return self._draft(
                item, self._candidate_models([product]), "out_of_stock",
                f"{product['product_name']} abhi stock mein nahi hai. Koi alternative chahiye?",
            )
        if required_packs > stock:
            return self._draft(
                item, self._candidate_models([product]), "insufficient_stock",
                f"{product['product_name']} ke sirf {stock:g} pack available hain. Utna hi chahiye?",
            )

        resolved = OrderItem(
            product_id=str(product["product_id"]),
            product_name=str(product["product_name"]),
            canonical_product_name=item.canonical_product_name or item.product_name,
            original_extraction=item.original_extraction,
            quantity=item.quantity,
            unit=item.unit or "pack",
            brand=str(product.get("brand") or "") or None,
            pack_size=float(product["pack_size"]) if product.get("pack_size") not in (None, "") else None,
            pack_unit=str(product.get("unit") or "") or None,
            price=float(product.get("price") or 0),
            stock=stock,
        )
        return resolved, [], None, None

    def resolve_items_with_drafts(self, items: List[OrderItem]):
        resolved, drafts, issues, questions = [], [], [], []
        for item in items:
            result, candidates, issue, question = self.resolve_item(item)
            if issue:
                drafts.append(result)
                issues.append(f"{issue}: {item.product_name}.")
                if question:
                    questions.append(question)
            else:
                resolved.append(result)
        return resolved, drafts, issues, " ".join(questions) or None

    def resolve_items(self, items: List[OrderItem]) -> Tuple[List[OrderItem], List[str], str | None]:
        resolved, _, issues, question = self.resolve_items_with_drafts(items)
        return resolved, issues, question

    @staticmethod
    def pack_count(item: OrderItem, product=None) -> float:
        pack_size = item.pack_size
        pack_unit = item.pack_unit
        if product:
            pack_size = product.get("pack_size") or pack_size
            pack_unit = product.get("unit") or pack_unit
        if item.unit in MEASURE_UNITS and pack_size not in (None, ""):
            product_size = float(pack_size)
            base = UNIT_TO_BASE.get(str(pack_unit))
            requested_base = UNIT_TO_BASE.get(item.unit)
            if base and requested_base and base[0] == requested_base[0]:
                size_in_base = product_size * base[1]
                requested_in_base = item.quantity * requested_base[1]
                return requested_in_base / size_in_base
        return item.quantity

    @classmethod
    def line_total(cls, item: OrderItem) -> float:
        return round((item.price or 0) * cls.pack_count(item), 2)

    @staticmethod
    def _same_measure(quantity, quantity_unit, pack_size, pack_unit):
        if pack_size in (None, ""):
            return False
        left = UNIT_TO_BASE.get(quantity_unit)
        right = UNIT_TO_BASE.get(str(pack_unit))
        if not left or not right or left[0] != right[0]:
            return False
        pack_count = quantity * left[1] / (float(pack_size) * right[1])
        return pack_count >= 1 and abs(pack_count - round(pack_count)) < 0.001

    @staticmethod
    def _compatible_measure(quantity_unit, pack_unit):
        left = UNIT_TO_BASE.get(quantity_unit)
        right = UNIT_TO_BASE.get(str(pack_unit))
        return bool(left and right and left[0] == right[0])

    @staticmethod
    def _candidate_models(rows):
        return [CatalogCandidate(
            product_id=str(row["product_id"]),
            product_name=str(row["product_name"]),
            brand=str(row.get("brand") or "") or None,
            pack_size=float(row["pack_size"]) if row.get("pack_size") not in (None, "") else None,
            pack_unit=str(row.get("unit") or "") or None,
            price=float(row.get("price") or 0),
            stock=float(row.get("stock") or 0),
        ) for row in rows]

    @staticmethod
    def _candidate_question(candidates):
        if not candidates:
            return None
        labels = []
        for candidate in candidates[:5]:
            get = candidate.get if isinstance(candidate, dict) else lambda key, default=None: getattr(candidate, key, default)
            label = get("product_name", "")
            size, unit = get("pack_size"), get("pack_unit")
            if size is not None and unit:
                label += f" ({size:g} {unit})"
            if label not in labels:
                labels.append(label)
        if not labels:
            return None
        if len(labels) == 1:
            return f"{labels[0]} chahiye?"
        if len(labels) == 2:
            return f"Isme se kaunsa chahiye: {labels[0]} ya {labels[1]}?"
        return f"Isme se kaunsa chahiye: {', '.join(labels[:-1])} ya {labels[-1]}?"

    @staticmethod
    def _draft(item, candidates, issue, question):
        draft = item.model_copy(update={
            "candidates": candidates,
            "issue_type": issue,
            "clarification_required": True,
        })
        return draft, candidates, issue, question

    def confirm(self, items: List[OrderItem], checkout_id=None, customer_id=None, customer_name=None):
        """Validate and decrement stock atomically; an idempotency key replays the same checkout."""
        with self._checkout_lock:
            if checkout_id and checkout_id in self._checkout_results:
                return self.orders[self._checkout_results[checkout_id]]
            resolved, issues, question = self.resolve_items(items)
            if issues or len(resolved) != len(items):
                raise ValueError(question or "One or more items are no longer available.")
            required_by_product = {}
            for item in resolved:
                product = self.catalog.get_by_id(item.product_id)
                required_by_product[item.product_id] = required_by_product.get(item.product_id, 0) + self.pack_count(item, product)
            for product_id, required in required_by_product.items():
                product = self.catalog.get_by_id(product_id)
                available = float(product.get("stock") or 0) if product else 0
                if required > available:
                    raise ValueError(f"Only {available:g} units of {product['product_name'] if product else product_id} remain in stock.")

            # All checks pass before any stock changes, so a failed checkout cannot partially decrement.
            for product_id, required in required_by_product.items():
                product = self.catalog.get_by_id(product_id)
                self.catalog.update_stock(product_id, max(0, float(product.get("stock") or 0) - required))

            subtotal = round(sum(self.line_total(item) for item in resolved), 2)
            delivery_fee = 20.0
            total = round(subtotal + delivery_fee, 2)
            order_id = "ORD-" + uuid4().hex[:8].upper()
            self.orders[order_id] = {
                "order_id": order_id,
                "items": [i.model_dump() for i in resolved],
                "subtotal": subtotal,
                "delivery_fee": delivery_fee,
                "total": total,
                "status": "received",
                "customer_id": customer_id,
                "customer_name": customer_name,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "delivery_fee": 20,
            }
            if checkout_id:
                self._checkout_results[checkout_id] = order_id
            return self.orders[order_id]

    def get(self, order_id: str):
        return self.orders.get(order_id)

    def list_orders(self, customer_id=None):
        orders = list(self.orders.values())
        if customer_id is not None:
            orders = [order for order in orders if str(order.get("customer_id")) == str(customer_id)]
        return sorted(orders, key=lambda order: order.get("created_at") or "", reverse=True)

    def update_status(self, order_id: str, status: str):
        order = self.orders.get(order_id)
        if order is None:
            return None
        order["status"] = status
        order["updated_at"] = datetime.now(timezone.utc).isoformat()
        return order
