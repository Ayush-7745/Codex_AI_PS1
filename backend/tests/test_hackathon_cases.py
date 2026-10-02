import unittest
from fastapi.testclient import TestClient

from app.main import app
from app.services.catalog import CatalogService
from app.services.conversations import ConversationService
from app.services.llm import LLMService
from app.services.normalization import NormalizationService
from app.services.order_engine import OrderEngine


class HackathonVerificationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.catalog = CatalogService()
        self.engine = OrderEngine(self.catalog)
        self.normalizer = NormalizationService()
        self.llm = LLMService()
        self.conversations = ConversationService(self.catalog, self.engine, self.llm)

    def test_case_1_atta_pack_mismatch_hinglish(self):
        """1. 'bhaiya do kilo atta de do'"""
        res = self.client.post("/conversations", json={"message": "bhaiya do kilo atta de do"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "CLARIFICATION")
        self.assertTrue(data["clarification_needed"])
        self.assertIn("Atta", data["clarification_question"])
        self.assertIn("chahiye", data["clarification_question"].lower())
        items = data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["canonical_product_name"], "atta")
        self.assertEqual(items[0]["quantity"], 2.0)
        self.assertEqual(items[0]["unit"], "kg")
        self.assertEqual(items[0]["issue_type"], "quantity_pack_mismatch")

    def test_case_2_amul_butter_clarification(self):
        """2. 'ek Amul butter bhi dena'"""
        res = self.client.post("/conversations", json={"message": "ek Amul butter bhi dena"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "CLARIFICATION")
        self.assertTrue(data["clarification_needed"])
        self.assertIn("Amul", data["clarification_question"])
        self.assertIn("chahiye", data["clarification_question"].lower())
        items = data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["brand"], "Amul")
        self.assertEqual(items[0]["canonical_product_name"], "butter")
        self.assertEqual(items[0]["quantity"], 1.0)
        self.assertEqual(items[0]["issue_type"], "ambiguous_product")

    def test_case_3_sugar_aadha_kilo(self):
        """3. 'sugar aadha kilo chahiye'"""
        res = self.client.post("/conversations", json={"message": "sugar aadha kilo chahiye"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        items = data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["canonical_product_name"], "sugar")
        self.assertEqual(items[0]["quantity"], 0.5)
        self.assertEqual(items[0]["unit"], "kg")

    def test_case_4_tel_ambiguity(self):
        """4. 'tel bhi chahiye'"""
        res = self.client.post("/conversations", json={"message": "tel bhi chahiye"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "CLARIFICATION")
        self.assertTrue(data["clarification_needed"])
        self.assertIn("chahiye", data["clarification_question"].lower())
        items = data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["canonical_product_name"], "oil")
        self.assertEqual(items[0]["issue_type"], "ambiguous_product")

    def test_case_5_do_kilo_chini(self):
        """5. 'do kilo chini'"""
        res = self.client.post("/conversations", json={"message": "do kilo chini"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        items = data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["canonical_product_name"], "sugar")
        self.assertEqual(items[0]["quantity"], 2.0)
        self.assertEqual(items[0]["unit"], "kg")

    def test_case_6_amul_butter_chahiye(self):
        """6. 'Amul butter chahiye'"""
        res = self.client.post("/conversations", json={"message": "Amul butter chahiye"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "CLARIFICATION")
        self.assertTrue(data["clarification_needed"])
        items = data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["brand"], "Amul")
        self.assertEqual(items[0]["canonical_product_name"], "butter")
        self.assertEqual(items[0]["issue_type"], "ambiguous_product")

    def test_devanagari_transliteration_to_roman_hinglish(self):
        """Devanagari script text input transliteration to Roman Hinglish"""
        transliterated = self.llm.transliterate_to_hinglish("दो किलो आटा दे दो")
        self.assertNotIn("दो", transliterated)
        self.assertNotIn("आटा", transliterated)
        self.assertIn("atta", transliterated.lower())


if __name__ == "__main__":
    unittest.main()
