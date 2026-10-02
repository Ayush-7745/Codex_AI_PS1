import unittest

from app.schemas import OrderItem
from app.services.catalog import CatalogService
from app.services.conversations import ConversationService
from app.services.llm import LLMService
from app.services.normalization import NormalizationService
from app.services.order_engine import OrderEngine


class NormalizationTests(unittest.TestCase):
    def setUp(self):
        self.normalizer = NormalizationService()
        self.catalog = CatalogService()
        self.engine = OrderEngine(self.catalog)
        self.language = LLMService(api_key="")

    def normalized(self, product_name, brand=None, quantity=1, unit=None, pack_size=None, pack_unit=None):
        return self.normalizer.normalize_item(OrderItem(
            product_name=product_name,
            brand=brand,
            quantity=quantity,
            unit=unit,
            pack_size=pack_size,
            pack_unit=pack_unit,
        ))

    def test_product_aliases_canonicalize_and_keep_original_extraction(self):
        examples = {
            "wheat flour": "atta", "aata": "atta", "chini": "sugar", "cheeni": "sugar",
            "tel": "oil", "makhan": "butter", "chawal": "rice", "doodh": "milk",
            "dahi": "curd", "chai patti": "tea", "biscit": "biscuit", "daal": "dal",
            "aloo": "potato", "pyaaz": "onion", "tamatar": "tomato", "ande": "eggs",
        }
        for original, expected in examples.items():
            with self.subTest(original=original):
                item = self.normalized(original)
                self.assertEqual(item.product_name, expected)
                self.assertEqual(item.canonical_product_name, expected)
                self.assertEqual(item.original_extraction["product_name"], original)

    def test_llm_output_keeps_raw_and_canonical_forms(self):
        class Provider:
            def parse_order(self, message):
                return [OrderItem(product_name="flour", quantity=2, unit="kg")]

            def generate_clarification(self, question):
                return question

            def generate_confirmation(self, total):
                return str(total)

        item, = LLMService(provider=Provider()).parse_order("do kilo atta")
        self.assertEqual(item.original_extraction["product_name"], "flour")
        self.assertEqual(item.canonical_product_name, "atta")
        self.assertEqual(item.product_name, "atta")
        self.assertEqual(self.normalized("flour").product_name, "atta")
        self.assertEqual(self.normalizer.normalize_item(
            OrderItem(product_name="flour", quantity=1), source_text="atta and flour"
        ).product_name, "atta")

    def test_extended_hinglish_product_phrases(self):
        examples = {
            "gehu ka atta": "atta", "gehun ka atta": "atta", "yogurt": "curd",
            "kaju": "cashew", "badam": "almond", "moongphali": "peanut",
        }
        for original, expected in examples.items():
            with self.subTest(original=original):
                self.assertEqual(self.normalized(original).product_name, expected)

    def test_brand_spellings_are_normalized_without_inventing_unknown_brands(self):
        examples = {
            "amul": "Amul", "aashirvaad": "Aashirvaad", "ashirwad": "Aashirvaad",
            "fortune": "Fortune", "tata sampann": "Tata Sampann", "parle g": "Parle-G",
            "parle-g": "Parle-G", "maggi": "Maggi", "saffola": "Saffola",
        }
        for original, expected in examples.items():
            with self.subTest(original=original):
                self.assertEqual(self.normalizer.normalize_brand(original), expected)
        self.assertEqual(self.normalizer.normalize_brand("Unlisted Brand"), "Unlisted Brand")

    def test_units_and_quantity_expressions_normalize(self):
        units = {
            "kgs": "kg", "kilos": "kg", "grams": "g", "gm": "g",
            "liters": "L", "litre": "L", "ml": "ml", "packets": "pack",
            "pkt": "pack", "btl": "bottle",
        }
        for raw, expected in units.items():
            with self.subTest(unit=raw):
                self.assertEqual(self.normalizer.normalize_unit(raw), expected)

        cases = {
            "aadha kilo sugar": (0.5, "kg"),
            "do kilo atta": (2, "kg"),
            "ek litre oil": (1, "L"),
            "do packet Maggi": (2, "pack"),
            "ek dozen eggs": (12, "egg"),
            "do dozen eggs": (24, "egg"),
            "pauna kilo sugar": (0.75, "kg"),
            "sawa litre oil": (1.25, "L"),
        }
        for message, expected in cases.items():
            with self.subTest(message=message):
                parsed = self.language.parse_order(message)
                self.assertEqual(len(parsed), 1)
                self.assertEqual((parsed[0].quantity, parsed[0].unit), expected)

    def test_order_quantity_and_pack_size_remain_distinct(self):
        butter = self.language.parse_order("2 packets Amul butter 500g")[0]
        self.assertEqual((butter.quantity, butter.unit), (2, "pack"))
        self.assertEqual((butter.pack_size, butter.pack_unit), (500, "g"))

        sugar = self.language.parse_order("0.5 kg sugar")[0]
        self.assertEqual((sugar.quantity, sugar.unit), (0.5, "kg"))
        self.assertIsNone(sugar.pack_size)

    def test_product_brand_and_pack_clues_match_catalog(self):
        aashirvaad, = self.language.parse_order("Aashirvaad atta 5kg")
        resolved, drafts, issues, _ = self.engine.resolve_items_with_drafts([aashirvaad])
        self.assertFalse(drafts, issues)
        self.assertEqual(resolved[0].product_id, "P0403")
        self.assertEqual(resolved[0].canonical_product_name, "atta")

        amul, = self.language.parse_order("Amul butter 500g")
        resolved, drafts, issues, _ = self.engine.resolve_items_with_drafts([amul])
        self.assertFalse(drafts, issues)
        self.assertEqual(resolved[0].product_id, "P0419")

    def test_wheat_flour_matches_attas_but_generic_categories_stay_ambiguous(self):
        wheat_flour = self.normalizer.normalize_item(OrderItem(product_name="wheat flour", quantity=1))
        result, candidates, issue, _ = self.engine.resolve_item(wheat_flour)
        self.assertEqual(wheat_flour.canonical_product_name, "atta")
        if issue:
            self.assertEqual(issue, "ambiguous_product")
            self.assertTrue(candidates)
            self.assertTrue(all("atta" in candidate.product_name.casefold() for candidate in candidates))
        else:
            self.assertIn("atta", result.product_name.casefold())

        for phrase in ("Amul butter", "tel", "biscuit"):
            with self.subTest(phrase=phrase):
                item, = self.language.parse_order(phrase)
                result, candidates, issue, _ = self.engine.resolve_item(item)
                self.assertEqual(issue, "ambiguous_product")
                self.assertTrue(candidates)

    def test_conversation_clarification_still_resolves_same_conversation(self):
        conversation_service = ConversationService(self.catalog, self.engine, self.language)
        conversation = conversation_service.create("Amul butter")
        self.assertEqual(conversation.status, "CLARIFICATION")
        conversation_id = conversation.conversation_id
        conversation = conversation_service.reply(conversation_id, "500 gram wala")
        self.assertEqual(conversation.conversation_id, conversation_id)
        self.assertEqual(conversation.items[0].product_id, "P0419")
        self.assertEqual(conversation.status, "AWAITING_CONFIRMATION")

    def test_normalization_failure_keeps_extracted_term_for_matching(self):
        class RawProvider:
            def parse_order(self, message):
                return [OrderItem(product_name="wheat flour", quantity=1)]

            def generate_clarification(self, question):
                return question

            def generate_confirmation(self, total):
                return str(total)

        class BrokenNormalizer:
            def normalize_items(self, items, source_text=None):
                raise RuntimeError("simulated normalization failure")

        service = LLMService(provider=RawProvider(), normalizer=BrokenNormalizer())
        with self.assertLogs("app.services.llm", level="WARNING"):
            item, = service.parse_order("wheat flour")
        self.assertEqual(item.product_name, "wheat flour")
        self.assertEqual(item.canonical_product_name, "wheat flour")
        self.assertEqual(item.original_extraction["product_name"], "wheat flour")


if __name__ == "__main__":
    unittest.main()
