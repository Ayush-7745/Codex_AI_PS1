"""Sarvam STT/TTS adapter. Audio is handled in memory and never persisted."""

import base64
import logging
import json
from pathlib import Path
from typing import Any

from app.config import SARVAM_API_KEY

logger = logging.getLogger(__name__)


class VoiceServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class SarvamVoiceService:
    STT_MODEL = "saaras:v4"
    TTS_MODEL = "bulbul:v3"
    MAX_AUDIO_BYTES = 20 * 1024 * 1024
    AUDIO_TYPES = {
        ".wav": ("audio/wav", "wav"),
        ".mp3": ("audio/mpeg", "mp3"),
        ".aac": ("audio/aac", "aac"),
        ".aiff": ("audio/aiff", "aiff"),
        ".ogg": ("audio/ogg", "ogg"),
        ".opus": ("audio/ogg", "opus"),
        ".flac": ("audio/flac", "flac"),
        ".mp4": ("audio/mp4", "mp4"),
        ".m4a": ("audio/mp4", "x-m4a"),
        ".amr": ("audio/amr", "amr"),
        ".wma": ("audio/x-ms-wma", "x-ms-wma"),
        ".webm": ("audio/webm", "webm"),
        ".pcm": ("application/octet-stream", "pcm_s16le"),
    }

    def __init__(self, api_key: str | None = None, client: Any = None):
        self.api_key = SARVAM_API_KEY if api_key is None else api_key.strip()
        self.client = client

    def _get_client(self):
        if not self.api_key:
            raise VoiceServiceError("Voice service is not configured. Set SARVAM_API_KEY.", 503)
        if self.client is None:
            try:
                from sarvamai import SarvamAI

                self.client = SarvamAI(api_subscription_key=self.api_key, timeout=45.0)
            except Exception as exc:
                logger.exception("Could not initialize Sarvam SDK")
                raise VoiceServiceError("Sarvam voice service is unavailable.", 502) from exc
        return self.client

    def transcribe(
        self,
        content: bytes,
        filename: str = "audio.webm",
        content_type: str | None = None,
    ) -> dict:
        if not content:
            raise VoiceServiceError("Audio file is empty or invalid.", 400)
        if len(content) > self.MAX_AUDIO_BYTES:
            raise VoiceServiceError("Audio file exceeds the 20 MB limit.", 413)
        client = self._get_client()
        filename = Path(filename).name or "audio.webm"
        inferred_type, input_audio_codec = self._audio_metadata(filename, content_type)
        try:
            result = client.speech_to_text.transcribe(
                # The current SDK accepts (filename, bytes, content_type). A
                # bare BytesIO makes httpx infer WebM as video/webm, which
                # causes Sarvam to reject browser-recorded audio.
                file=(filename, content, inferred_type),
                model=self.STT_MODEL,
                mode="codemix",
                language_code="unknown",
                input_audio_codec=input_audio_codec,
                request_options={"timeout_in_seconds": 45, "max_retries": 1},
            )
        except Exception as exc:
            raise self._provider_error(exc, "transcription", self.api_key) from exc

        transcript = self._get(result, "transcript")
        if not isinstance(transcript, str) or not transcript.strip():
            raise VoiceServiceError("Sarvam could not recognize speech in this audio.", 400)
        return {
            "transcript": transcript.strip(),
            "language_code": self._get(result, "language_code"),
            "language_probability": self._get(result, "language_probability"),
        }

    def synthesize(self, text: str) -> dict:
        if not text or not text.strip():
            raise VoiceServiceError("Speech text cannot be empty.", 400)
        if len(text) > 2500:
            raise VoiceServiceError("Speech text exceeds Bulbul v3's 2500 character limit.", 400)
        client = self._get_client()
        try:
            result = client.text_to_speech.convert(
                text=text,
                model=self.TTS_MODEL,
                language_code="hi-IN",
                speaker="shubh",
                output_audio_codec="wav",
                request_options={"timeout_in_seconds": 45, "max_retries": 1},
            )
        except Exception as exc:
            raise self._provider_error(exc, "speech generation", self.api_key) from exc
        audios = self._get(result, "audios")
        if not isinstance(audios, (list, tuple)) or not audios or not audios[0]:
            raise VoiceServiceError("Sarvam returned no audio for the response.", 502)
        try:
            audio_bytes = base64.b64decode(audios[0], validate=True)
        except Exception as exc:
            raise VoiceServiceError("Sarvam returned invalid audio data.", 502) from exc
        return {"audio_base64": base64.b64encode(audio_bytes).decode("ascii"), "audio_mime_type": "audio/wav"}

    @staticmethod
    def _get(value, key):
        return value.get(key) if isinstance(value, dict) else getattr(value, key, None)

    @classmethod
    def _audio_metadata(cls, filename: str, content_type: str | None) -> tuple[str, str | None]:
        default_type, codec = cls.AUDIO_TYPES.get(Path(filename).suffix.casefold(), ("application/octet-stream", None))
        provided_type = (content_type or "").split(";", 1)[0].strip().casefold()
        # Browsers and multipart clients sometimes label an audio container
        # with a video MIME type (notably WebM and MP4). Prefer the audio MIME
        # for known audio extensions; keep a valid declared audio type when it
        # is more specific than the extension fallback.
        if provided_type.startswith("audio/"):
            default_type = provided_type
        return default_type, codec

    @staticmethod
    def _provider_error(exc: Exception, operation: str, api_key: str = "") -> VoiceServiceError:
        # Preserve the provider's status and response body for diagnosis while
        # ensuring credentials never enter API responses or logs.
        name = type(exc).__name__.casefold()
        if isinstance(exc, TimeoutError) or "timeout" in name:
            status_code = 504
        else:
            status_code = getattr(exc, "status_code", None)

        body = getattr(exc, "body", None)
        if body is None:
            body = getattr(exc, "message", None)
        if body is None or body == "":
            body = str(exc) or type(exc).__name__
        if isinstance(body, (dict, list)):
            detail = json.dumps(body, ensure_ascii=False, default=str)
        else:
            detail = str(body)
        if api_key:
            detail = detail.replace(api_key, "[REDACTED]")

        upstream_status = getattr(exc, "status_code", None)
        status_text = f" (HTTP {upstream_status})" if upstream_status is not None else f" ({type(exc).__name__})"
        message = f"Sarvam {operation} failed{status_text}: {detail}"
        if status_code == 504:
            message = f"Sarvam {operation} timed out{status_text}: {detail}"
            return VoiceServiceError(message, 504)

        # A rejected client payload remains a 400/422; other provider failures
        # are reported as upstream errors while their original status is in
        # detail for the caller.
        if upstream_status in {400, 422}:
            return VoiceServiceError(message, 400)
        if upstream_status == 403:
            return VoiceServiceError(message, 502)
        if upstream_status == 429:
            return VoiceServiceError(message, 503)
        return VoiceServiceError(message, 502)
