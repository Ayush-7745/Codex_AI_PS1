from uuid import uuid4

from app.schemas import ConversationResponse, OrderItem
from app.services.catalog import CatalogService
from app.services.llm import LLMService
from app.services.order_engine import OrderEngine
from app.services.parser import extract_amount_unit, extract_brand, extract_product, parse_message


class ConversationService:
    """In-memory conversation and order state for the prototype API."""

    def __init__(self, catalog: CatalogService, engine: OrderEngine, language: LLMService):
        self.catalog = catalog
        self.engine = engine
        self.language = language
        self.conversations: dict[str, dict] = {}

    def create(self, message: str, customer_id=None, customer_name=None, input_mode="text") -> ConversationResponse:
        conversation_id = "CONV-" + uuid4().hex[:8].upper()
        state = {
            "conversation_id": conversation_id,
            "status": "CLARIFICATION",
            "items": [],
            "pending": [],
            "question": None,
            "order": None,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "input_mode": input_mode,
            "original_message": message,
            "owner_message": None,
        }
        self.conversations[conversation_id] = state

        parsed = self.language.parse_order(message)
        if not parsed:
            draft = OrderItem(
                product_name=message,
                quantity=1,
                issue_type="no_match",
                clarification_required=True,
            )
            state["pending"].append({"item": draft})
            state["question"] = "Product samajh nahi aaya. Aapko kya order karna hai?"
            return self._response(state)

        for item in parsed:
            resolved, candidates, issue, question = self.engine.resolve_item(item)
            if issue:
                state["pending"].append({"item": resolved})
                state["question"] = state["question"] or question
            else:
                state["items"].append(resolved)

        self._advance(state)
        return self._response(state)

    def reply(self, conversation_id: str, message: str) -> ConversationResponse | None:
        state = self.conversations.get(conversation_id)
        if not state:
            return None
        if state["status"] == "CONFIRMED":
            return self._response(state)
        if state["status"] == "AWAITING_CONFIRMATION":
            state["question"] = "Aapka order ready hai. Order confirm kar du?"
            return self._response(state)
        if state.get("owner_message"):
            state["owner_message"] = None
            had_no_match = any(entry["item"].issue_type == "no_match" for entry in state["pending"])
            if had_no_match:
                state["pending"] = [entry for entry in state["pending"] if entry["item"].issue_type != "no_match"]
                parsed = self.language.parse_order(message)
                if not parsed:
                    state["question"] = "Please tell us the product name and quantity."
                    return self._response(state)
                for item in parsed:
                    self._add_parsed_item(state, item)
                self._advance(state)
                return self._response(state)
        quantity_index = next((i for i, entry in enumerate(state["pending"])
                               if entry["item"].issue_type == "quantity_required"), None)
        if quantity_index is not None:
            pending = state["pending"][quantity_index]["item"]
            amount, unit = extract_amount_unit(self.language.transliterate_to_hinglish(message))
            if amount is None:
                state["question"] = f"Please tell us how much {pending.product_name} you want, such as 2 kg or 1 pack."
                return self._response(state)
            corrected = pending.model_copy(update={"quantity": amount, "unit": unit, "quantity_specified": True})
            resolved, candidates, issue, question = self.engine.resolve_item(corrected)
            if issue:
                state["pending"][quantity_index]["item"] = resolved
                state["question"] = question
            else:
                state["items"].append(resolved)
                state["pending"].pop(quantity_index)
                self._advance(state)
            return self._response(state)
        if not state["pending"]:
            self._advance(state)
            return self._response(state)

        selection_by_pending = [
            self._select_candidate(entry["item"], message)
            for entry in state["pending"]
        ]
        pending_index = next((i for i, matches in enumerate(selection_by_pending) if len(matches) == 1), 0)
        pending_item = state["pending"][pending_index]["item"]
        selected = selection_by_pending[pending_index]

        if len(selected) != 1:
            if selected:
                state["question"] = self.engine._candidate_question(selected)
            else:
                # A missing product name can be a new customer correction.
                parsed = self.language.parse_order(message)
                if parsed and pending_item.issue_type == "no_match":
                    state["pending"].pop(pending_index)
                    for new_item in parsed:
                        self._add_parsed_item(state, new_item)
                    self._advance(state)
                    return self._response(state)
                state["question"] = self.engine._candidate_question(pending_item.candidates) or "Kaunsa product, brand ya pack size chahiye?"
            return self._response(state)

        product = selected[0]
        # Keep the customer's requested amount and unit. The selected SKU's
        # pack size is catalog metadata and must not overwrite a weight request.
        requested_pack_size = pending_item.pack_size
        if pending_item.unit not in {"kg", "g", "L", "ml"} and requested_pack_size is None:
            requested_pack_size = product["pack_size"]
        selected_item = pending_item.model_copy(update={
            "product_id": product["product_id"],
            "product_name": product["product_name"],
            "brand": product["brand"],
            "pack_size": requested_pack_size,
            "pack_unit": product["pack_unit"],
            "price": product["price"],
            "stock": product["stock"],
            "candidates": [],
            "issue_type": None,
            "clarification_required": False,
        })
        resolved, candidates, issue, question = self.engine.resolve_item(selected_item)
        if issue:
            state["pending"][pending_index]["item"] = resolved
            state["question"] = question
            return self._response(state)

        state["items"].append(resolved)
        state["pending"].pop(pending_index)
        self._advance(state)
        return self._response(state)

    def _add_parsed_item(self, state, item):
        resolved, candidates, issue, question = self.engine.resolve_item(item)
        if issue:
            state["pending"].append({"item": resolved})
            state["question"] = question
        else:
            state["items"].append(resolved)

    def _select_candidate(self, item: OrderItem, message: str):
        candidates = [candidate.model_dump() for candidate in item.candidates]
        if not candidates:
            return []

        brand = extract_brand(message)
        product = extract_product(message)
        parsed_reply = parse_message(message)
        pack_size = None
        pack_unit = None
        for parsed in parsed_reply:
            if parsed.pack_size is not None:
                pack_size, pack_unit = parsed.pack_size, parsed.pack_unit
                break
        # In a pending clarification, an explicit size clue remains useful even
        # when the reply also repeats the brand or product (e.g. "500 gram
        # wala Amul butter"). This is only used to select among catalog
        # candidates; the pending order quantity and unit remain untouched.
        if pack_size is None:
            amount, unit = extract_amount_unit(message)
            if amount is not None and unit in {"kg", "g", "L", "ml"}:
                pack_size, pack_unit = amount, unit

        matches = candidates
        if brand:
            matches = [c for c in matches if str(c.get("brand") or "").casefold() == brand.casefold()]
        if product:
            matches = [c for c in matches if self._candidate_has_product(c, product)]
        if pack_size is not None:
            matches = [c for c in matches if self._same_pack(c, pack_size, pack_unit)]
        return matches

    def _candidate_has_product(self, candidate, product):
        row = self.catalog.get_by_id(candidate["product_id"]) or {}
        aliases = [part.strip().casefold() for part in str(row.get("aliases") or "").split(",")]
        name = str(candidate.get("product_name") or "").casefold()
        needle = product.casefold()
        return needle in aliases or needle in name

    @staticmethod
    def _same_pack(candidate, size, unit):
        try:
            catalog_size = float(candidate.get("pack_size"))
        except (TypeError, ValueError):
            return False
        source = {"kg": ("g", 1000), "g": ("g", 1), "L": ("ml", 1000), "ml": ("ml", 1)}
        left, right = source.get(unit), source.get(str(candidate.get("pack_unit")))
        return bool(left and right and left[0] == right[0] and abs(size * left[1] - catalog_size * right[1]) < 0.001)

    def confirm(self, conversation_id: str):
        state = self.conversations.get(conversation_id)
        if not state:
            return None
        if state["status"] == "CONFIRMED":
            return self._response(state)
        if state["status"] != "AWAITING_CONFIRMATION" or not state["items"]:
            return self._response(state)
        # Owner confirmation approves the draft for the customer. Checkout creates
        # the order and performs the stock decrement later.
        state["order"] = None
        state["status"] = "CONFIRMED"
        state["question"] = "Your items are confirmed. Add them to your cart and check out to place the order."
        return self._response(state)

    def list(self):
        return [self._response(state) for state in reversed(list(self.conversations.values()))]

    def clarify(self, conversation_id: str, message: str):
        state = self.conversations.get(conversation_id)
        if not state:
            return None
        state["owner_message"] = message
        state["question"] = message
        state["status"] = "CLARIFICATION"
        return self._response(state)

    def get(self, conversation_id: str):
        state = self.conversations.get(conversation_id)
        return self._response(state) if state else None

    def _advance(self, state):
        if state["pending"]:
            state["status"] = "CLARIFICATION"
            # Resolve catalog ambiguity before asking about pack/quantity
            # mismatches elsewhere in a multi-item draft.
            first = next(
                (entry["item"] for entry in state["pending"] if entry["item"].issue_type == "ambiguous_product"),
                state["pending"][0]["item"],
            )
            state["question"] = self.engine._candidate_question(first.candidates) or state["question"] or "Kaunsa product chahiye, thoda clarify kar dijiye?"
        elif state["items"]:
            state["status"] = "AWAITING_CONFIRMATION"
            total = round(sum(self.engine.line_total(item) for item in state["items"]), 2)
            state["question"] = self.language.generate_confirmation(total)
        else:
            state["status"] = "CLARIFICATION"

    def _response(self, state):
        order = state.get("order")
        display_items = state["items"] + [entry["item"] for entry in state["pending"]]
        return ConversationResponse(
            conversation_id=state["conversation_id"],
            status=state["status"],
            items=display_items,
            clarification_needed=state["status"] == "CLARIFICATION",
            clarification_question=state["question"] if state["status"] == "CLARIFICATION" else None,
            confirmation_message=state["question"] if state["status"] == "AWAITING_CONFIRMATION" else None,
            order_id=order.get("order_id") if order else None,
            total=order.get("total") if order else round(sum(self.engine.line_total(item) for item in state["items"]), 2) if state["status"] == "CONFIRMED" else None,
            customer_id=state.get("customer_id"),
            customer_name=state.get("customer_name"),
            input_mode=state.get("input_mode") or "text",
            original_message=state.get("original_message"),
            owner_message=state.get("owner_message"),
        )
