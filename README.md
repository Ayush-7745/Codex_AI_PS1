# AI Order Desk

AI Order Desk is a grocery ordering prototype with a React customer and store interface and a FastAPI backend for catalog search, Hinglish order parsing, order confirmation, and voice conversations.

## Project layout

- `frontend/` — React + Vite app, npm manifests, and Vite configuration
- `backend/` — FastAPI service, product catalog, datasets, and tests

## Frontend

Requirements: Node.js and npm.

`ash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). To create a production build, run `npm run build` from `frontend/`.

The frontend supports customer shopping, cart checkout, natural-language/voice ordering, and a store-owner dashboard for products and order status. Demo authentication and browser-side store data use `localStorage`.

The API client in `frontend/src/services/api.js` reads `VITE_API_BASE_URL` and defaults to `http://localhost:8000`. When the API is unavailable, customer order parsing can use the frontend mock fallback.

## Backend

Requirements: Python 3.10 or newer. From the repository root, run:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
Copy-Item .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`; interactive docs are at `/docs` and the health check is at `/health`.

Set `GEMINI_API_KEY` in `backend/.env` to enable Gemini structured order extraction and `SARVAM_API_KEY` to enable voice transcription and speech. Both are optional; text ordering falls back to the deterministic parser when Gemini is unavailable. Never commit `.env` or API keys.

## Main backend endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/products` and `/products/search` | Browse or search the catalog |
| `POST` | `/orders/parse` | Parse a text order |
| `POST` | `/orders/validate` | Validate requested items against catalog and stock |
| `POST` | `/orders/confirm` | Confirm a validated order |
| `POST` | `/conversations` | Start a stateful text order conversation |
| `POST` | `/conversations/{conversation_id}/messages` | Reply to a clarification |
| `POST` | `/voice/conversations` | Transcribe and process a voice turn |
| `POST` | `/voice/speech` | Generate spoken audio from text |

See [backend/README.md](backend/README.md) for the full API flow, voice details, and configuration.

## Backend tests

From the `backend` directory:

```powershell
python -m unittest discover -s tests -v
```

The tests cover parsing, product matching, clarification, order validation, and voice behavior.
