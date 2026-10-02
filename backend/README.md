# AI Order Desk backend

FastAPI backend for the voice-first Hinglish grocery-ordering prototype. Text and transcribed voice use the same stateful conversation and order pipeline.

## Run on Windows

From `backend`:

```powershell
python -m venv .venv
.venv\Scripts\activate
Copy-Item .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Set `GEMINI_API_KEY` and `SARVAM_API_KEY` in `.env` to enable both providers. `GEMINI_MODEL` defaults to `gemini-3.8-flash`.

Open `http://127.0.0.1:8000/docs` for interactive API docs or `http://127.0.0.1:8000/health` for the health check.

## Test

From `backend`:

```powershell
python -m unittest discover -s tests -v
```

The tests read `datasets/order_test_cases.csv` and exercise parsing, alias ranking, multi-item clarification, pack selection, and confirmation.

## Order conversation flow

1. `POST /conversations` with `{"message":"Amul butter chahiye"}` to create a stateful order conversation.
2. If the response has `status: "CLARIFICATION"`, send the customer's reply to `POST /conversations/{conversation_id}/messages`.
3. When the response has `status: "AWAITING_CONFIRMATION"`, confirm with `POST /conversations/{conversation_id}/confirm`.
4. Use the returned `order_id` with the order, bill, and delivery-note endpoints.

Conversation states and orders currently live in memory and reset when the server restarts.

## Endpoints

- `GET /health` — health check.
- `GET /products/search?q=...` — ranked catalog search.
- `POST /orders/parse` — parse and resolve one text message.
- `POST /orders/validate` — validate structured items against the catalog and stock.
- `POST /orders/confirm` — revalidate items against catalog prices and stock, then create an order.
- `GET /orders/{order_id}` — get an order.
- `GET /orders/{order_id}/bill` — itemized bill and total.
- `GET /orders/{order_id}/delivery-note` — delivery note.
- `POST /conversations` — start a stateful order conversation from text.
- `GET /conversations/{conversation_id}` — read conversation state.
- `POST /conversations/{conversation_id}/messages` — submit a clarification reply.
- `POST /conversations/{conversation_id}/confirm` — confirm a ready conversation.
- `POST /voice/conversations` — upload audio, transcribe it, send the transcript to the same conversation service, then return response text and WAV audio as base64. Send multipart `audio`; optionally send `conversation_id` to continue a voice conversation.
- `POST /voice/speech` — convert a JSON `{"text":"..."}` response into base64 WAV audio.

For example, from PowerShell, start a voice conversation with:

```powershell
curl.exe -X POST http://127.0.0.1:8000/voice/conversations -F "audio=@customer.webm;type=audio/webm"
```

To continue it, include the returned `conversation.conversation_id`:

```powershell
curl.exe -X POST http://127.0.0.1:8000/voice/conversations -F "audio=@reply.webm;type=audio/webm" -F "conversation_id=CONV-..."
```

The `audio_base64` field can be played in a browser using `audio/wav` as its MIME type. Uploaded audio is kept in memory only. Saaras REST transcription supports requests under 30 seconds and common formats including WAV, MP3, AAC, OGG, FLAC, MP4/M4A, and WebM; use short voice turns. Voice endpoints return a clear 503 when `SARVAM_API_KEY` is missing. Text endpoints remain available.

## Language and provider boundary

`LLMService` uses the official Google GenAI Python SDK for Pydantic structured order extraction when `GEMINI_API_KEY` is configured. `GEMINI_MODEL` selects the model and defaults to `gemini-3.8-flash`. Missing keys, SDK initialization errors, Gemini request failures, and invalid structured responses fall back to the deterministic Hinglish parser. Product identity, stock, and price always come from the CSV catalog and order engine.

The current parser handles common Hinglish terms and supplied examples, but it is not a general language model. CSV rows requiring prior context are conversational replies, not standalone parse inputs. The supplied catalog does not contain plain cashews even though one dataset case expects them, so the backend correctly reports no catalog match for that product.

## Voice providers

Voice uses the official `sarvamai` Python SDK. STT is Saaras v4 in `codemix` mode with automatic language detection (`language_code="unknown"`). TTS is Bulbul v3 with `hi-IN`, speaker `shubh`, and WAV output. The voice route returns the Sarvam transcript and detected language, the existing conversation response, the response text, and playable base64 audio. Missing keys, malformed uploads, timeouts, and provider failures return HTTP errors without taking down the FastAPI app. No uploaded audio is persisted.

Required environment variables:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
SARVAM_API_KEY=
```

Order item `quantity` and `unit` describe what the customer requested. `pack_size` and `pack_unit` describe the catalog SKU. For example, `2 packets Amul butter 500g` is quantity `2 pack` with SKU size `500 g`. A weight request is matched only when catalog packs can fulfill it as a whole number of packs; `0.5 kg sugar` remains unresolved with the current 1 kg and 5 kg catalog variants. Unresolved draft items include `candidates`, `issue_type`, and `clarification_required` in parse and conversation responses.
