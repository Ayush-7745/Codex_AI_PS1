import re
from typing import List, Optional, Tuple

from app.schemas import OrderItem
from app.services.normalization import NormalizationService


NUMBER_WORDS = {
    "ek": 1, "one": 1, "do": 2, "two": 2, "teen": 3, "three": 3,
    "char": 4, "chaar": 4, "four": 4, "paanch": 5, "panch": 5, "five": 5, "chhe": 6, "cheh": 6, "six": 6,
    "saat": 7, "seven": 7, "aath": 8, "eight": 8, "nau": 9, "nine": 9,
    "das": 10, "ten": 10,
}
FRACTION_WORDS = {"aadha": 0.5, "aadhi": 0.5, "half": 0.5, "dedh": 1.5, "dhai": 2.5, "pauna": 0.75, "paune": 0.75, "sawa": 1.25, "sava": 1.25}

UNIT_WORDS = {
    "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg", "kg": "kg", "kgs": "kg", "किलो": "kg", "किलोग्राम": "kg", "केजी": "kg",
    "gram": "g", "grams": "g", "gm": "g", "g": "g", "ग्राम": "g",
    "litre": "L", "litres": "L", "liter": "L", "liters": "L", "l": "L", "लीटर": "L", "लिटर": "L",
    "ml": "ml", "packet": "pack", "packets": "pack", "pack": "pack", "packs": "pack", "pkt": "pack", "pkts": "pack", "पैकेट": "pack",
    "bottle": "bottle", "bottles": "bottle", "btl": "bottle", "btls": "bottle",
    "dozen": "dozen", "dozens": "dozen", "darjan": "dozen",
}
COUNT_UNITS = {"pack", "bottle"}
MEASURE_UNITS = {"kg", "g", "L", "ml"}

COMMON_BRANDS = [
    "tata sampann", "surf excel", "aashirvaad", "fortune", "amul",
    "tata", "saffola", "parle", "maggi", "dabur", "everest", "mdh",
    "harpic", "colgate", "patanjali", "britannia", "haldiram"
]

PRODUCT_TERMS = [
    "sunflower oil", "mustard oil", "rice bran oil", "toor dal", "moong dal",
    "chana dal", "garam masala", "chana masala", "parle-g", "parle g",
    "surf excel", "maggi", "butter", "atta", "sugar", "oil", "rice", "dal",
    "salt", "biscuit", "tea", "coffee", "milk", "curd", "paneer", "ghee",
    "honey", "masala", "water", "eggs", "onion", "potato", "tomato", "harpic",
    "colgate", "cashew", "cashews", "peanut", "peanuts", "almond", "almonds",
    "dry fruits", "flour", "wheat flour", "wheat", "atta", "sugar", "salt",
    "lentils", "chickpeas", "water", "drinking water", "ghee", "shampoo",
    "detergent", "toilet cleaner", "honey", "coconut", "banana", "apple",
    "bread", "cheese", "curd", "paneer", "eggs", "tomato", "onion", "potato",
    "chai", "puliogare powder", "puliogare", "sambar powder",
]


def normalize_text(text: str) -> str:
    return NormalizationService().normalize_customer_text(text)


def extract_amount_unit(text: str) -> Tuple[Optional[float], Optional[str]]:
    s = text.lower()

    m = re.search(
        r"\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|kilograms?|g|gm|gram|grams|l|litres?|liters?|ml|packet|packets|pkt|pkts|pack|packs|bottle|bottles|btl|btls|dozens?|darjan)?\b",
        s
    )
    if m:
        amount = float(m.group(1))
        raw_unit = m.group(2)
        return amount, UNIT_WORDS.get(raw_unit) if raw_unit else None

    for word, value in FRACTION_WORDS.items():
        if re.search(rf"\b{re.escape(word)}\b", s):
            return float(value), parse_unit(s)

    for word, value in NUMBER_WORDS.items():
        if re.search(rf"\b{re.escape(word)}\b", s):
            return float(value), parse_unit(s)

    if re.search(r"\b(?:dozen|darjan)\b", s):
        return 1.0, "dozen"

    return None, None


def extract_order_and_pack(text: str, product: Optional[str], brand: Optional[str]):
    """Return order quantity/unit separately from an explicitly stated SKU size."""
    unit_pattern = r"kg|kgs|kilos?|kilograms?|grams?|gm|g|liters?|litres?|l|ml|packets?|pkts?|packs?|bottles?|btls?|dozens?|darjan"
    numeric = list(re.finditer(rf"\b(\d+(?:\.\d+)?)\s*({unit_pattern})?\b", text, re.IGNORECASE))
    parsed = []
    for match in numeric:
        raw_unit = (match.group(2) or "").lower()
        unit = UNIT_WORDS.get(raw_unit)
        parsed.append((float(match.group(1)), unit, match.start(), match.end()))

    counts = [entry for entry in parsed if entry[1] in COUNT_UNITS]
    measures = [entry for entry in parsed if entry[1] in MEASURE_UNITS]
    if counts and measures:
        amount, unit, _, _ = counts[0]
        pack_size, pack_unit, _, _ = measures[-1]
        return amount, unit, pack_size, pack_unit
    if counts:
        amount, unit, _, _ = counts[0]
        return amount, unit, None, None
    if measures:
        amount, unit, start, _ = measures[0]
        product_start = text.find(product) if product else -1
        # A branded SKU size after its product name is a pack size. A measure
        # before the product (for example, "0.5 kg sugar") is order quantity.
        if brand and product_start >= 0 and start > product_start:
            return 1.0, "pack", amount, unit
        return amount, unit, None, None

    amount, unit = extract_amount_unit(text)
    if amount is None:
        return 1.0, None, None, None
    return amount, unit, None, None


def parse_unit(text: str):
    for word, unit in UNIT_WORDS.items():
        if re.search(rf"\b{re.escape(word)}\b", text.lower()):
            return unit
    return None


def extract_brand(text: str) -> Optional[str]:
    s = text.lower()
    if re.search(r"\bparle[\s-]+g\b", s):
        return "Parle-G"
    for brand in sorted(COMMON_BRANDS, key=len, reverse=True):
        if re.search(rf"\b{re.escape(brand)}\b", s):
            return "MDH" if brand == "mdh" else brand.title()
    return None


def extract_product(text: str) -> Optional[str]:
    s = text.lower()
    for term in sorted(PRODUCT_TERMS, key=len, reverse=True):
        if re.search(rf"\b{re.escape(term)}\b", s):
            return "parle-g" if term == "parle g" else term
    return None


def parse_message(message: str) -> List[OrderItem]:
    s = normalize_text(message)
    chunks = re.split(r"\s*(?:,|\band\b|\baur\b)\s*", s)
    items: List[OrderItem] = []

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue

        product = extract_product(chunk)
        brand = extract_brand(chunk)

        if not product and brand:
            product = brand.lower()

        if not product:
            continue

        quantity, unit, pack_size, pack_unit = extract_order_and_pack(chunk, product, brand)

        items.append(
            OrderItem(
                product_name=product,
                quantity=quantity,
                quantity_specified=bool(re.search(
                    r"\d|\b(?:" + "|".join(re.escape(word) for word in [*NUMBER_WORDS, *FRACTION_WORDS, "dozen", "darjan"]) + r")\b",
                    chunk,
                )),
                unit=unit,
                brand=brand,
                pack_size=pack_size,
                pack_unit=pack_unit,
            )
        )

    return items
