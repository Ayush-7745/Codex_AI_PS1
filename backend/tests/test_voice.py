import base64
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from app import main as api
from app.main import app
from app.schemas import OrderItem
from app.services.sarvam_voice import SarvamVoiceService


class FakeSarvamClient:
    def __init__(self, transcripts=(), stt_error=None, tts_error=None):
        self.transcripts = list(transcripts)
        self.stt_error = stt_error
        self.tts_error = tts_error
        self.stt_calls = []
        self.tts_calls = []
        self.speech_to_text = SimpleNamespace(transcribe=self.transcribe)
        self.text_to_speech = SimpleNamespace(convert=self.convert)

    def transcribe(self, **kwargs):
        self.stt_calls.append(kwargs)
        if self.stt_error:
            raise self.stt_error
        transcript = self.transcripts.pop(0)
        return SimpleNamespace(transcript=transcript, language_code="hi-IN", language_probability=0.96)

    def convert(self, **kwargs):
        self.tts_calls.append(kwargs)
        if self.tts_error:
            raise self.tts_error
        return SimpleNamespace(audios=[base64.b64encode(b"RIFFmock-wav").decode("ascii")])


class VoiceApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        provider_patch = patch.object(api.conversations.language, "provider", None)
        provider_patch.start()
        self.addCleanup(provider_patch.stop)

    def post_voice(self, text, conversation_id=None, name="customer.webm"):
        data = {"conversation_id": conversation_id} if conversation_id else {}
        return self.client.post(
            "/voice/conversations",
            data=data,
            files={"audio": (name, b"fake audio bytes", "audio/webm")},
        )

    def test_required_voice_flow_reuses_conversation_and_order_engine(self):
        fake = FakeSarvamClient([
            "bhaiya do kilo atta aur Amul butter de do",
            "500 gram wala Amul butter",
        ])
        structured_items = [
            OrderItem(product_name="atta", quantity=2, unit="kg"),
            OrderItem(product_name="butter", brand="Amul", quantity=1),
        ]
        fake_language_provider = Mock()
        fake_language_provider.parse_order.return_value = structured_items
        with patch("app.main.voice", SarvamVoiceService(api_key="test", client=fake)), patch.object(
            api.conversations.language, "provider", fake_language_provider,
        ):
            first = self.post_voice("start")
            self.assertEqual(first.status_code, 200, first.text)
            data = first.json()
            conversation_id = data["conversation"]["conversation_id"]
            self.assertEqual(data["transcript"], "bhaiya do kilo atta aur Amul butter de do")
            self.assertEqual(data["language_code"], "hi-IN")
            self.assertEqual(data["conversation"]["status"], "CLARIFICATION")
            self.assertIn("Amul Butter", data["response_text"])
            self.assertTrue(any(item["product_name"].lower().startswith("atta") for item in data["conversation"]["items"]))
            self.assertTrue(any(item["issue_type"] == "ambiguous_product" for item in data["conversation"]["items"]))
            self.assertTrue(data["response_text"])
            self.assertEqual(data["audio_mime_type"], "audio/wav")
            self.assertEqual(base64.b64decode(data["audio_base64"]), b"RIFFmock-wav")

            second = self.post_voice("reply", conversation_id)
            self.assertEqual(second.status_code, 200, second.text)
            result = second.json()
            self.assertEqual(result["conversation"]["conversation_id"], conversation_id)
            self.assertEqual(result["transcript"], "500 gram wala Amul butter")
            self.assertEqual(result["conversation"]["status"], "CLARIFICATION")
            self.assertIn("P0419", [item["product_id"] for item in result["conversation"]["items"]])
            selected_butter = next(item for item in result["conversation"]["items"] if item["product_id"] == "P0419")
            self.assertEqual((selected_butter["quantity"], selected_butter["pack_size"], selected_butter["pack_unit"]), (1, 500, "g"))
            # Butter is resolved and retained. The 2 kg atta request remains a
            # separate draft because the current catalog has no matching 2 kg SKU.
            self.assertEqual(len(fake.stt_calls), 2)
            self.assertTrue(all(call["model"] == "saaras:v4" and call["mode"] == "codemix" for call in fake.stt_calls))
            self.assertTrue(all(call["model"] == "bulbul:v3" and call["speaker"] == "shubh" for call in fake.tts_calls))

    def test_additional_hinglish_voice_inputs_reach_shared_order_engine(self):
        transcripts = [
            "bhaiya 2 kilo atta, ek Amul butter aur aadha kilo sugar bhej do",
            "tel bhi chahiye",
            "500 gram wala Amul butter",
            "do packet Maggi",
            "biscit 2 packet",
            "Aashirvaad aata 5kg",
        ]
        fake = FakeSarvamClient(transcripts)
        with patch("app.main.voice", SarvamVoiceService(api_key="test", client=fake)):
            results = [self.post_voice(str(index)).json() for index in range(len(transcripts))]

        self.assertEqual([r["transcript"] for r in results], transcripts)
        self.assertEqual(len(fake.tts_calls), len(transcripts))
        # Every transcript was sent into the same stateful text conversation service.
        self.assertEqual(len({r["conversation"]["conversation_id"] for r in results}), len(transcripts))
        self.assertEqual(results[1]["conversation"]["status"], "CLARIFICATION")
        self.assertTrue(results[1]["conversation"]["items"][0]["candidates"])
        self.assertTrue(any(item["canonical_product_name"] == "maggi" for item in results[3]["conversation"]["items"]))
        self.assertTrue(any(item["product_name"].lower().startswith("biscuit") for item in results[4]["conversation"]["items"]))
        self.assertTrue(any(item["product_id"] == "P0403" for item in results[5]["conversation"]["items"]))

    def test_standalone_tts_returns_playable_audio(self):
        fake = FakeSarvamClient()
        with patch("app.main.voice", SarvamVoiceService(api_key="test", client=fake)):
            response = self.client.post("/voice/speech", json={"text": "Amul butter 100 gram, 500 gram ya 1 kilo chahiye?"})
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["response_text"], "Amul butter 100 gram, 500 gram ya 1 kilo chahiye?")
        self.assertEqual(base64.b64decode(data["audio_base64"]), b"RIFFmock-wav")
        self.assertEqual(fake.tts_calls[0]["language_code"], "hi-IN")

    def test_missing_key_and_provider_failures_are_clear_and_text_still_works(self):
        with patch("app.main.voice", SarvamVoiceService(api_key="")):
            missing = self.post_voice("audio")
            self.assertEqual(missing.status_code, 503)
            self.assertIn("SARVAM_API_KEY", missing.json()["detail"])
            chat = self.client.post("/conversations", json={"message": "biscuit"})
            self.assertEqual(chat.status_code, 200, chat.text)

        fake = FakeSarvamClient(stt_error=TimeoutError())
        with patch("app.main.voice", SarvamVoiceService(api_key="test", client=fake)):
            timed_out = self.post_voice("audio")
        self.assertEqual(timed_out.status_code, 504)
        self.assertIn("timed out", timed_out.json()["detail"])

        fake = FakeSarvamClient(tts_error=RuntimeError("provider unavailable"))
        with patch("app.main.voice", SarvamVoiceService(api_key="test", client=fake)):
            failed_tts = self.client.post("/voice/speech", json={"text": "Please clarify."})
        self.assertEqual(failed_tts.status_code, 502)
        self.assertIn("speech generation failed", failed_tts.json()["detail"])

    def test_invalid_audio_is_rejected(self):
        with patch("app.main.voice", SarvamVoiceService(api_key="test", client=FakeSarvamClient())):
            empty = self.client.post("/voice/conversations", files={"audio": ("empty.webm", b"", "audio/webm")})
            unsupported = self.post_voice("audio", name="notes.txt")
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(unsupported.status_code, 415)


if __name__ == "__main__":
    unittest.main()
