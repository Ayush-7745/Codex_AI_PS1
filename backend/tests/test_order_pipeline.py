import csv
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.catalog import CatalogService
from app.services.conversations import ConversationService
from app.services.llm import ExtractedOrder, GeminiLanguageProvider, LLMService
from app.services.order_engine import OrderEngine
from app.services.parser import parse_message
from app.schemas import OrderItem


ROOT = Path(__file__).resolve().parents[1]


class OrderPipelineTests(unittest.TestCase):
    def setUp(self):
        self.catalog = CatalogService()
        self.engine = OrderEngine(self.catalog)
        self.conversations = ConversationService(self.catalog, self.engine, LLMService(api_key=""))

    def test_supplied_order_cases_are_understood_by_parser(self):
        path = ROOT / "datasets" / "order_test_cases.csv"
        with path.open(encoding="utf-8-sig", newline="") as source:
            cases = list(csv.DictReader(source))
        self.assertGreater(len(cases), 0)
        for case in cases:
            if case["test_id"] == "T052":  # This is a reply requiring prior conversation context.
                continue
            with self.subTest(test_id=case["test_id"], message=case["customer_message"]):
                self.assertTrue(parse_message(case["customer_message"]), "No product intent extracted")

    def test_amul_pack_clarification_reply_and_confirmation(self):
        conversation = self.conversations.create("Amul butter chahiye")
        self.assertEqual(conversation.status, "CLARIFICATION")
        self.assertIn("100g", conversation.clarification_question)

        conversation = self.conversations.reply(conversation.conversation_id, "500 gram wala")
        self.assertEqual(conversation.status, "AWAITING_CONFIRMATION")
        self.assertEqual([item.product_id for item in conversation.items], ["P0419"])

        conversation = self.conversations.confirm(conversation.conversation_id)
        self.assertEqual(conversation.status, "CONFIRMED")
        self.assertEqual(conversation.total, 285.0)

    def test_multi_item_order_retains_items_during_clarification(self):
        conversation = self.conversations.create("2 kilo atta aur ek Amul butter de do")
        self.assertEqual(conversation.status, "CLARIFICATION")
        self.assertIsNotNone(conversation.clarification_question)
        conversation = self.conversations.reply(conversation.conversation_id, "500 gram wala")
        self.assertEqual(conversation.status, "CLARIFICATION")
        self.assertTrue(any(item.product_id == "P0419" for item in conversation.items))

    def test_alias_matching_prefers_exact_sugar_aliases(self):
        results = self.catalog.search("sugar", limit=5)
        self.assertTrue(results)
        self.assertTrue(all("sugar" in row["aliases"].lower() for row in results[:2]))

    def test_clarification_intersects_brand_product_and_pack_size(self):
        conversation = self.conversations.create("atta")
        self.assertEqual(conversation.status, "CLARIFICATION")
        self.assertGreater(len(conversation.items[0].candidates), 1)

        conversation = self.conversations.reply(conversation.conversation_id, "Aashirvaad atta 5kg")
        self.assertEqual(conversation.status, "AWAITING_CONFIRMATION")
        self.assertEqual(conversation.items[0].product_id, "P0403")
        self.assertEqual(conversation.items[0].pack_size, 5)

    def test_packet_quantity_is_separate_from_product_pack_size(self):
        parsed = parse_message("2 packets Amul butter 500g")
        self.assertEqual(len(parsed), 1)
        self.assertEqual((parsed[0].quantity, parsed[0].unit), (2, "pack"))
        self.assertEqual((parsed[0].pack_size, parsed[0].pack_unit), (500, "g"))

        resolved, drafts, issues, _ = self.engine.resolve_items_with_drafts(parsed)
        self.assertFalse(drafts)
        self.assertFalse(issues)
        self.assertEqual(resolved[0].product_id, "P0419")
        self.assertEqual(self.engine.pack_count(resolved[0]), 2)
        self.assertEqual(self.engine.line_total(resolved[0]), 570)

    def test_weight_request_is_not_converted_to_fractional_pack_count(self):
        parsed = parse_message("0.5 kg sugar")
        self.assertEqual((parsed[0].quantity, parsed[0].unit), (0.5, "kg"))
        self.assertIsNone(parsed[0].pack_size)

        resolved, drafts, issues, _ = self.engine.resolve_items_with_drafts(parsed)
        self.assertFalse(resolved)
        self.assertEqual(drafts[0].issue_type, "quantity_pack_mismatch")
        self.assertEqual((drafts[0].quantity, drafts[0].unit), (0.5, "kg"))
        self.assertGreaterEqual(len(drafts[0].candidates), 1)

    def test_weight_order_can_match_equivalent_catalog_pack_units(self):
        parsed = parse_message("0.5 kg Amul butter")
        self.assertEqual((parsed[0].quantity, parsed[0].unit), (0.5, "kg"))
        self.assertIsNone(parsed[0].pack_size)
        resolved, drafts, issues, _ = self.engine.resolve_items_with_drafts(parsed)
        self.assertFalse(resolved)
        self.assertEqual(drafts[0].issue_type, "ambiguous_product")
        self.assertEqual({candidate.product_id for candidate in drafts[0].candidates}, {"P0418", "P0419"})

        explicitly_selected = OrderItem(
            product_id="P0419", product_name="Amul Butter 500g", quantity=0.5, unit="kg"
        )
        resolved, drafts, issues, _ = self.engine.resolve_items_with_drafts([explicitly_selected])
        self.assertFalse(drafts)
        self.assertFalse(issues)
        self.assertEqual(self.engine.pack_count(resolved[0]), 1)
        self.assertEqual(self.engine.line_total(resolved[0]), 285)

        fractional_pack = OrderItem(
            product_id="P0419", product_name="Amul Butter 500g", quantity=0.25,
            unit="kg", pack_size=500, pack_unit="g",
        )
        resolved, drafts, _, _ = self.engine.resolve_items_with_drafts([fractional_pack])
        self.assertFalse(resolved)
        self.assertEqual(drafts[0].issue_type, "quantity_pack_mismatch")

    def test_generic_requests_return_candidates_and_need_clarification(self):
        for message in ("biscuit", "tel", "masala", "butter"):
            with self.subTest(message=message):
                conversation = self.conversations.create(message)
                self.assertEqual(conversation.status, "CLARIFICATION")
                self.assertTrue(conversation.items)
                draft = conversation.items[0]
                self.assertTrue(draft.clarification_required)
                self.assertEqual(draft.issue_type, "ambiguous_product")
                self.assertGreaterEqual(len(draft.candidates), 1)

    def test_parse_response_includes_unresolved_draft_and_candidates(self):
        from app.main import parse_order
        from app.schemas import ParseRequest

        with patch("app.main.llm", LLMService(api_key="")):
            response = parse_order(ParseRequest(message="biscuit"))
        self.assertTrue(response.clarification_needed)
        self.assertEqual(len(response.items), 1)
        self.assertTrue(response.items[0].clarification_required)
        self.assertGreaterEqual(len(response.items[0].candidates), 1)

    def test_gemini_structured_extraction_examples(self):
        examples = {
            "bhaiya 2 kilo atta, ek Amul butter aur aadha kilo sugar bhej do": [
                {"product_name": "atta", "brand": None, "quantity": 2, "unit": "kg", "pack_size": None, "pack_unit": None},
                {"product_name": "butter", "brand": "Amul", "quantity": 1, "unit": None, "pack_size": None, "pack_unit": None},
                {"product_name": "sugar", "brand": None, "quantity": 0.5, "unit": "kg", "pack_size": None, "pack_unit": None},
            ],
            "2 packets Amul butter 500g": [
                {"product_name": "butter", "brand": "Amul", "quantity": 2, "unit": "pack", "pack_size": 500, "pack_unit": "g"},
            ],
            "Amul butter chahiye": [
                {"product_name": "butter", "brand": "Amul", "quantity": 1, "unit": None, "pack_size": None, "pack_unit": None},
            ],
            "tel bhi chahiye": [
                {"product_name": "oil", "brand": None, "quantity": 1, "unit": None, "pack_size": None, "pack_unit": None},
            ],
            "biscit 2 packet": [
                {"product_name": "biscuit", "brand": None, "quantity": 2, "unit": "pack", "pack_size": None, "pack_unit": None},
            ],
            "Aashirvaad aata 5kg": [
                {"product_name": "atta", "brand": "Aashirvaad", "quantity": 1, "unit": "pack", "pack_size": 5, "pack_unit": "kg"},
            ],
        }

        class FakeModels:
            def __init__(self):
                self.calls = []

            def generate_content(self, **kwargs):
                self.calls.append(kwargs)
                return type("Response", (), {"parsed": ExtractedOrder.model_validate({"items": examples[kwargs["contents"]]}), "text": None})()

        class FakeClient:
            def __init__(self):
                self.models = FakeModels()

        client = FakeClient()
        provider = GeminiLanguageProvider(api_key="test-key", model="gemini-3.8-flash", client=client)
        service = LLMService(provider=provider)
        resolved_ids = {}
        draft_issue_types = {}
        for message, expected_items in examples.items():
            with self.subTest(message=message):
                actual = service.parse_order(message)
                self.assertEqual(len(actual), len(expected_items))
                for item, expected in zip(actual, expected_items):
                    for field, value in expected.items():
                        self.assertEqual(getattr(item, field), value)
                resolved, drafts, _, _ = self.engine.resolve_items_with_drafts(actual)
                resolved_ids[message] = [item.product_id for item in resolved]
                draft_issue_types[message] = [item.issue_type for item in drafts]

        self.assertEqual(resolved_ids["2 packets Amul butter 500g"], ["P0419"])
        self.assertEqual(resolved_ids["Aashirvaad aata 5kg"], ["P0403"])
        self.assertEqual(draft_issue_types["Amul butter chahiye"], ["ambiguous_product"])
        self.assertEqual(draft_issue_types["tel bhi chahiye"], ["ambiguous_product"])

        self.assertEqual(len(client.models.calls), len(examples))
        config = client.models.calls[0]["config"]
        self.assertEqual(config["response_mime_type"], "application/json")
        response_schema = config["response_schema"]
        item_schema = response_schema["$defs"]["ExtractedOrderItem"]
        self.assertEqual(set(item_schema["properties"]), {"product_name", "brand", "quantity", "unit", "pack_size", "pack_unit"})
        self.assertEqual(item_schema["properties"]["quantity"]["minimum"], 0)
        self.assertEqual(client.models.calls[0]["model"], "gemini-3.8-flash")

    def test_gemini_failure_falls_back_to_deterministic_parser(self):
        class BrokenProvider:
            def parse_order(self, message):
                raise RuntimeError("simulated Gemini request failure")

            def generate_clarification(self, question):
                return question

            def generate_confirmation(self, total):
                return "confirmation"

        service = LLMService(provider=BrokenProvider(), api_key="")
        with self.assertLogs("app.services.llm", level="WARNING"):
            parsed = service.parse_order("2 packets Amul butter 500g")
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0].quantity, 2)
        self.assertEqual(parsed[0].pack_size, 500)
        self.assertEqual(parsed[0].pack_unit, "g")

    def test_missing_gemini_key_uses_deterministic_parser(self):
        service = LLMService(api_key="")
        parsed = service.parse_order("Aashirvaad aata 5kg")
        self.assertEqual(parsed[0].brand, "Aashirvaad")
        self.assertEqual(parsed[0].pack_size, 5)

    def test_deterministic_fallback_understands_dozen_variants(self):
        service = LLMService(api_key="")
        for message in ("ek darjan eggs", "1 dozen eggs"):
            with self.subTest(message=message):
                parsed = service.parse_order(message)
                self.assertEqual(parsed[0].quantity, 12)
                self.assertEqual(parsed[0].unit, "egg")


if __name__ == "__main__":
    unittest.main()
