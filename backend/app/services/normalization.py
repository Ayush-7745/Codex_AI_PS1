"""Canonicalize grocery terms and quantity units before catalog matching."""

import logging
import re
import unicodedata
from typing import Any

from app.schemas import OrderItem

logger = logging.getLogger(__name__)


# Extend these aliases without changing Gemini prompts or catalog records.
PRODUCT_SYNONYMS = {
    "atta": ("atta", "aata", "आटा", "आटे", "गेहूं", "गेहूँ", "wheat flour", "flour", "gehu ka atta", "gehun ka atta", "gehu ka aata", "gehun ka aata"),
    "sugar": ("sugar", "chini", "cheeni", "chinni", "चीनी", "शक्कर"),
    "salt": ("salt", "namak", "नमक"),
    "oil": ("oil", "tel", "cooking oil", "edible oil", "तेल"),
    "butter": ("butter", "makhan", "makkhan", "buter", "बटर", "मक्खन"),
    "rice": ("rice", "chawal", "चावल"),
    "milk": ("milk", "doodh", "दूध"),
    "curd": ("curd", "dahi", "yogurt", "yoghurt", "दही"),
    "tea": ("tea", "chai", "chai patti", "चाय", "चाय पत्ती"),
    "biscuit": ("biscuit", "biscuits", "biscit", "बिस्कुट", "बिस्किट"),
    "dal": ("dal", "daal", "lentils", "दाल"),
    "potato": ("potato", "potatoes", "aloo", "आलू"),
    "onion": ("onion", "onions", "pyaaz", "pyaz", "प्याज़", "प्याज"),
    "tomato": ("tomato", "tomatoes", "tamatar", "टमाटर"),
    "eggs": ("egg", "eggs", "anda", "ande", "andey", "अंडा", "अंडे"),
    "honey": ("honey", "shahad", "शहद"),
    "water": ("water", "paani", "पानी"),
    "ghee": ("ghee", "clarified butter", "घी"),
    "cashew": ("cashew", "cashews", "kaju", "काजू"),
    "almond": ("almond", "almonds", "badam", "बादाम"),
    "peanut": ("peanut", "peanuts", "moongphali", "मूंगफली"),
    "coffee": ("coffee", "kaapi", "kaffee", "कॉफी"),
    "paneer": ("paneer", "cottage cheese", "पनीर"),
}

PRODUCT_ALIASES = {
    alias: canonical
    for canonical, aliases in PRODUCT_SYNONYMS.items()
    for alias in aliases
}

BRAND_SYNONYMS = {
    "amul": "Amul",
    "aashirvaad": "Aashirvaad",
    "ashirwad": "Aashirvaad",
    "fortune": "Fortune",
    "tata sampann": "Tata Sampann",
    "parle g": "Parle-G",
    "parle-g": "Parle-G",
    "maggi": "Maggi",
    "saffola": "Saffola",
    "अमूल": "Amul",
    "आशीर्वाद": "Aashirvaad",
    "फॉर्च्यून": "Fortune",
    "मैगी": "Maggi",
}

UNIT_SYNONYMS = {
    "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg", "किलो": "kg", "किलोग्राम": "kg", "केजी": "kg", "किग्रा": "kg",
    "g": "g", "gm": "g", "gram": "g", "grams": "g", "ग्राम": "g",
    "l": "L", "litre": "L", "litres": "L", "liter": "L", "liters": "L", "लीटर": "L", "लिटर": "L",
    "ml": "ml", "millilitre": "ml", "millilitres": "ml", "milliliter": "ml", "milliliters": "ml", "एमएल": "ml",
    "packet": "pack", "packets": "pack", "pack": "pack", "packs": "pack", "pkt": "pack", "pkts": "pack", "पैकेट": "pack",
    "bottle": "bottle", "bottles": "bottle", "btl": "bottle", "btls": "bottle", "बोतल": "bottle",
    "dozen": "dozen", "dozens": "dozen", "darjan": "dozen", "दर्जन": "dozen",
    "egg": "egg", "eggs": "egg", "piece": "piece", "pieces": "piece",
}

NUMBER_WORDS = {
    "ek": 1, "one": 1, "এক": 1, "एक": 1, "do": 2, "two": 2, "दो": 2, "teen": 3, "three": 3, "तीन": 3,
    "char": 4, "chaar": 4, "four": 4, "चार": 4, "paanch": 5, "panch": 5, "five": 5, "पांच": 5, "पाँच": 5,
    "chhe": 6, "cheh": 6, "six": 6, "छह": 6, "saat": 7, "seven": 7, "सात": 7,
    "aath": 8, "eight": 8, "आठ": 8, "nau": 9, "nine": 9, "नौ": 9, "das": 10, "ten": 10, "दस": 10,
}
FRACTION_WORDS = {"aadha": 0.5, "aadhi": 0.5, "half": 0.5, "आधा": 0.5, "आधी": 0.5, "डेढ़": 1.5, "ढाई": 2.5, "pauna": 0.75, "paune": 0.75, "sawa": 1.25, "sava": 1.25}


def _text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    value = re.sub(r"[\u2010-\u2015]", "-", value)
    return re.sub(r"\s+", " ", value).strip(" \t\r\n,.;:!?()[]{}\"'")


class NormalizationService:
    """Independent normalization layer; catalog remains authoritative for SKU selection."""

    def normalize_product_name(self, product_name: str, brand: str | None = None) -> str:
        value = _text(product_name)
        if brand:
            brand_text = _text(brand)
            without_brand = re.sub(rf"^{re.escape(brand_text)}\b\s*", "", value).strip()
            if without_brand:
                value = without_brand
        canonical = PRODUCT_ALIASES.get(value)
        if canonical:
            return canonical
        for alias, mapped in sorted(PRODUCT_ALIASES.items(), key=lambda pair: len(pair[0]), reverse=True):
            if re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", value):
                return re.sub(rf"(?<!\w){re.escape(alias)}(?!\w)", mapped, value, count=1)
        return value

    def normalize_brand(self, brand: str | None) -> str | None:
        if brand is None or not str(brand).strip():
            return None
        original = str(brand).strip()
        return BRAND_SYNONYMS.get(_text(original), original)

    @staticmethod
    def normalize_unit(unit: str | None) -> str | None:
        if unit is None or not str(unit).strip():
            return None
        value = _text(str(unit))
        return UNIT_SYNONYMS.get(value, str(unit).strip())

    def normalize_customer_text(self, message: str) -> str:
        """Normalize known product and brand spellings in deterministic-parser input."""
        digit_map = str.maketrans("०१२३४५६७८९", "0123456789")
        result = unicodedata.normalize("NFKC", message or "").casefold().translate(digit_map)
        for alias, canonical in sorted(PRODUCT_ALIASES.items(), key=lambda pair: len(pair[0]), reverse=True):
            result = re.sub(rf"(?<!\w){re.escape(alias)}(?!\w)", canonical, result)
        for alias, canonical in sorted(BRAND_SYNONYMS.items(), key=lambda pair: len(pair[0]), reverse=True):
            result = re.sub(rf"(?<!\w){re.escape(alias)}(?!\w)", canonical.casefold(), result)
        return re.sub(r"\s+", " ", result).strip()

    def normalize_quantity(self, quantity: Any, unit: str | None, product_name: str) -> tuple[float, str | None]:
        """Normalize number words and units; a dozen becomes individual eggs/pieces."""
        normalized_unit = self.normalize_unit(unit)
        normalized_name = self.normalize_product_name(product_name)

        if isinstance(quantity, str):
            quantity_text = _text(quantity)
            number_match = re.fullmatch(r"([\d]+(?:\.\d+)?|[a-z]+)(?:\s+([a-z]+))?", quantity_text)
            if number_match:
                number_token, embedded_unit = number_match.groups()
                if embedded_unit and normalized_unit is None:
                    normalized_unit = self.normalize_unit(embedded_unit)
                if number_token in NUMBER_WORDS:
                    quantity = NUMBER_WORDS[number_token]
                elif number_token in FRACTION_WORDS:
                    quantity = FRACTION_WORDS[number_token]
                else:
                    quantity = float(number_token)
            else:
                quantity = float(quantity_text)
        else:
            quantity = float(quantity)

        if normalized_unit == "dozen":
            quantity *= 12
            normalized_unit = "egg" if normalized_name == "eggs" else "piece"
        return quantity, normalized_unit

    def normalize_item(self, item: OrderItem, source_text: str | None = None) -> OrderItem:
        raw = item.original_extraction or {
            "product_name": item.product_name,
            "brand": item.brand,
            "quantity": item.quantity,
            "unit": item.unit,
            "pack_size": item.pack_size,
            "pack_unit": item.pack_unit,
        }
        try:
            brand = self.normalize_brand(item.brand)
            product_name = self.normalize_product_name(item.product_name, brand)
            if product_name == "flour" and source_text:
                raw_source = _text(source_text)
                atta_pattern = r"(?<!\w)(?:(?:whole\s+)?wheat\s+flour|gehun\s+ka\s+atta|gehu\s+ka\s+atta|aata|atta)(?!\w)"
                other_flours = ("maida", "rice flour", "corn flour", "besan")
                other_flour_type_present = any(term in raw_source for term in other_flours)
                remaining_source = re.sub(r"\b(?:whole\s+)?wheat\s+flour\b|\b(?:rice|corn)\s+flour\b", " ", raw_source)
                source_has_separate_flour = bool(re.search(r"\bflour\b", remaining_source))
                source_atta_matches = list(re.finditer(atta_pattern, raw_source))
                if (len(source_atta_matches) == 1
                        and not other_flour_type_present and not source_has_separate_flour):
                    product_name = "atta"
            quantity, unit = self.normalize_quantity(item.quantity, item.unit, product_name)
            return item.model_copy(update={
                "product_name": product_name,
                "canonical_product_name": product_name,
                "original_extraction": raw,
                "brand": brand,
                "quantity": quantity,
                "unit": unit,
                "pack_unit": self.normalize_unit(item.pack_unit),
            })
        except (TypeError, ValueError, AttributeError):
            logger.warning("Order item normalization failed; keeping original term for catalog matching", exc_info=True)
            return item.model_copy(update={
                "canonical_product_name": item.product_name,
                "original_extraction": raw,
            })

    def normalize_items(self, items: list[OrderItem], source_text: str | None = None) -> list[OrderItem]:
        return [self.normalize_item(item, source_text=source_text) for item in items]
