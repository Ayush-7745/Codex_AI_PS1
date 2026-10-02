from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4
from threading import RLock

import pandas as pd
from rapidfuzz import fuzz

from app.config import CATALOG_FILE


class CatalogService:
    def __init__(self, path: Path = CATALOG_FILE, include_demo: bool = False):
        self.lock = RLock()
        self.include_demo = include_demo
        self.path = path
        self.df = pd.read_csv(path).fillna("")
        for col in ("price", "stock"):
            if col in self.df:
                self.df[col] = pd.to_numeric(self.df[col], errors="coerce").fillna(0).astype(float)
        for col in ["product_name", "brand", "category", "sub_category", "aliases", "unit"]:
            if col in self.df.columns:
                self.df[col] = self.df[col].astype(str)
        if include_demo:
            self._ensure_demo_products()

    def _ensure_demo_products(self):
        """Expose the same small demo catalog the current React app starts with."""
        demo = [
            ("atta", "Aashirvaad Atta", "Aashirvaad", "Atta & Rice", 1, "kg", 55, 18, "atta,aata,flour,wheat,आटा,आटे,गेहूं", "🌾", "sand"),
            ("sugar", "Sugar", "", "Atta & Rice", 1, "kg", 48, 3, "sugar,cheeni,चीनी,शक्कर", "🧂", "pink"),
            ("butter", "Amul Butter", "Amul", "Dairy", "", "pack", 60, 12, "butter,amul butter,makhan,मक्खन,बटर", "🧈", "yellow"),
            ("sunflower", "Fortune Sunflower Oil", "Fortune", "Oil", 1, "L", 140, 8, "sunflower oil,fortune oil,oil", "🫙", "orange"),
            ("mustard", "Fortune Mustard Oil", "Fortune", "Oil", 1, "L", 155, 6, "mustard oil,sarson,sarson oil,oil", "🫙", "gold"),
            ("salt", "Tata Salt", "Tata", "Oil", "", "pack", 25, 24, "salt,namak,नमक", "🧂", "blue"),
            ("milk", "Amul Taaza Milk", "Amul", "Dairy", "", "pack", 29, 2, "milk,doodh,दूध", "🥛", "blue"),
            ("dal", "Toor Dal", "", "Atta & Rice", 1, "kg", 120, 9, "dal,daal,pulses,arhar,दाल", "🫘", "pink"),
            ("rice", "Rice", "", "Atta & Rice", 1, "kg", 65, 15, "rice,chawal,चावल", "🍚", "sand"),
            ("biscuits", "Parle-G Biscuits", "Parle", "Snacks", "", "pack", 10, 20, "biscuit,biskut,parle g", "🍪", "gold"),
            ("tea", "Tata Tea Gold", "Tata", "Beverages", "", "pack", 85, 7, "tea,chai,cai", "🍵", "sand"),
            ("water", "Packaged Water", "", "Beverages", "", "piece", 20, 0, "water,pani,bottle", "💧", "blue"),
        ]
        existing = set(self.df["product_id"].astype(str))
        additions = []
        for pid, name, brand, category, size, unit, price, stock, aliases, emoji, color in demo:
            if pid in existing:
                continue
            additions.append({
                "product_id": pid, "product_name": name, "brand": brand,
                "category": category, "sub_category": category,
                "pack_size": size, "unit": unit, "price": price,
                "stock": stock, "aliases": aliases, "emoji": emoji, "color": color,
                "is_demo": True,
            })
        if additions:
            self.df = pd.concat([self.df, pd.DataFrame(additions)], ignore_index=True).fillna("")

    @staticmethod
    def _product(row: Dict[str, Any]) -> Dict[str, Any]:
        def number(value, default=0):
            try:
                return float(value) if value != "" else default
            except (TypeError, ValueError):
                return default
        aliases = [part.strip() for part in str(row.get("aliases") or "").split(",") if part.strip()]
        pid = str(row.get("product_id") or "")
        return {
            **row,
            "id": pid,
            "name": str(row.get("product_name") or ""),
            "keywords": aliases,
            "price": number(row.get("price")),
            "stock": number(row.get("stock")),
            "pack_size": number(row.get("pack_size"), None),
            "emoji": row.get("emoji") or "📦",
            "color": row.get("color") or "sand",
        }

    def list_products(self) -> List[Dict[str, Any]]:
        with self.lock:
            visible = self.df[self.df["is_demo"].fillna(False).astype(bool)] if "is_demo" in self.df else self.df
            return [self._product(row) for row in visible.to_dict(orient="records")]

    def create_product(self, data: Dict[str, Any]) -> Dict[str, Any]:
        pid = "prod-" + uuid4().hex[:10]
        unit = {"litre": "L", "liter": "L", "liters": "L", "litres": "L"}.get(data.get("unit"), data.get("unit") or "kg")
        row = {
            "product_id": pid, "product_name": data["name"].strip(),
            "brand": data.get("brand") or "", "category": data.get("category") or "Atta & Rice",
            "sub_category": data.get("category") or "Atta & Rice",
            "unit": unit, "pack_size": 1 if unit in {"kg", "g", "L", "ml"} else "",
            "price": data["price"], "stock": data["stock"],
            "aliases": ",".join(data.get("keywords") or []), "emoji": data.get("emoji") or "📦",
            "color": data.get("color") or "sand", "is_demo": True,
        }
        with self.lock:
            self.df = pd.concat([self.df, pd.DataFrame([row])], ignore_index=True).fillna("")
        return self._product(row)

    def update_product(self, product_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        with self.lock:
            indices = self.df.index[self.df["product_id"].astype(str) == str(product_id)].tolist()
            if not indices:
                return None
            idx = indices[0]
            columns = {"name": "product_name", "brand": "brand", "category": "category", "price": "price", "unit": "unit", "stock": "stock", "emoji": "emoji", "color": "color"}
            for key, column in columns.items():
                if key in patch and patch[key] is not None:
                    value = patch[key]
                    if key == "unit":
                        value = {"litre": "L", "liter": "L", "liters": "L", "litres": "L"}.get(value, value)
                    self.df.at[idx, column] = value
                    if key == "unit" and bool(self.df.at[idx, "is_demo"]):
                        self.df.at[idx, "pack_size"] = 1 if value in {"kg", "g", "L", "ml"} else ""
            if patch.get("category") is not None:
                self.df.at[idx, "sub_category"] = patch["category"]
            if patch.get("keywords") is not None:
                self.df.at[idx, "aliases"] = ",".join(patch["keywords"])
            return self._product(self.df.loc[idx].to_dict())

    def delete_product(self, product_id: str) -> bool:
        with self.lock:
            remaining = self.df[self.df["product_id"].astype(str) != str(product_id)]
            if len(remaining) == len(self.df):
                return False
            self.df = remaining.reset_index(drop=True)
            return True

    def update_stock(self, product_id: str, stock: float) -> Optional[Dict[str, Any]]:
        return self.update_product(product_id, {"stock": stock})

    def search(
        self,
        query: str,
        limit: int = 10,
        brand: Optional[str] = None,
        unit: Optional[str] = None,
        pack_size: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        q = " ".join(query.lower().split())
        if not q:
            return []
        with self.lock:
            work = self.df.copy()
        if self.include_demo and "is_demo" in work:
            work = work[work["is_demo"].fillna(False).astype(bool)]

        # These are the canonical grocery choices exposed by the React demo.
        # Prefer their exact ids over similarly named packaged variants.
        demo_aliases = {
            "atta": "atta", "aata": "atta", "आटा": "atta", "आटे": "atta", "गेहूं": "atta", "gehu": "atta",
            "sugar": "sugar", "chini": "sugar", "cheeni": "sugar", "चीनी": "sugar", "शक्कर": "sugar",
            "butter": "butter", "amul butter": "butter", "makhan": "butter", "मक्खन": "butter", "बटर": "butter",
            "milk": "milk", "doodh": "milk", "दूध": "milk", "rice": "rice", "chawal": "rice", "चावल": "rice",
            "dal": "dal", "daal": "dal", "दाल": "dal", "salt": "salt", "namak": "salt", "नमक": "salt",
        }
        preferred_id = demo_aliases.get(q)
        if preferred_id and (self.df["product_id"].astype(str) == preferred_id).any():
            work = work[work["product_id"].astype(str) == preferred_id]

        if brand:
            b = brand.lower().strip()
            work = work[work["brand"].str.lower().eq(b)]

        if unit:
            u = unit.lower()
            compatible_units = {u}
            if u in {"g", "kg"}:
                compatible_units.update({"g", "kg"})
            elif u in {"ml", "l"}:
                compatible_units.update({"ml", "l"})
            compatible = work["unit"].str.lower().isin(compatible_units)
            work = work[compatible | work["unit"].eq("")]

        if pack_size is not None:
            def size_match(v, row_unit):
                try:
                    catalog_unit = str(row_unit).lower()
                    requested_unit = str(unit or "").lower()
                    conversions = {"kg": ("weight", 1000), "g": ("weight", 1), "l": ("volume", 1000), "ml": ("volume", 1)}
                    catalog_conversion = conversions.get(catalog_unit)
                    requested_conversion = conversions.get(requested_unit)
                    if catalog_conversion and requested_conversion and catalog_conversion[0] == requested_conversion[0]:
                        return abs(float(v) * catalog_conversion[1] - float(pack_size) * requested_conversion[1]) < 0.001
                    return float(v) == float(pack_size)
                except (TypeError, ValueError):
                    return False
            work = work[work.apply(lambda row: size_match(row["pack_size"], row["unit"]), axis=1)]

        scored = []
        for _, row in work.iterrows():
            product = " ".join(str(row["product_name"]).lower().split())
            aliases = [a.strip().lower() for a in str(row["aliases"]).split(",") if a.strip()]
            row_brand = str(row["brand"]).lower()

            product_score = fuzz.token_sort_ratio(q, product)
            alias_score = max((fuzz.token_sort_ratio(q, alias) for alias in aliases), default=0)
            full_name_score = fuzz.token_sort_ratio(q, f"{row_brand} {product}")
            score = max(product_score, alias_score, full_name_score)

            # Exact aliases are strong signals. Comparing each alias separately
            # avoids the old behavior where a long comma-separated alias field
            # made unrelated products look like close matches.
            exact_match = q in aliases or q == product or q == f"{row_brand} {product}"
            if exact_match:
                score = 100
            elif any(q in alias and len(q) >= 3 for alias in aliases):
                score = min(100, score + 8)

            item = row.to_dict()
            item["_score"] = round(float(score), 2)
            item["_exact_match"] = exact_match
            if score >= 55:
                scored.append(item)

        scored.sort(key=lambda x: x["_score"], reverse=True)
        return scored[:limit]

    def get_by_id(self, product_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            match = self.df[self.df["product_id"].astype(str) == str(product_id)]
            if self.include_demo and "is_demo" in match:
                match = match[match["is_demo"].fillna(False).astype(bool)]
            if match.empty:
                return None
            return match.iloc[0].to_dict()
