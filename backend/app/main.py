from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.schemas import (
    ParseRequest, ParseResponse,
    ValidateRequest, ValidateResponse,
    ConfirmRequest, ConfirmResponse,
    ConversationCreateRequest, ConversationMessageRequest, ConversationResponse,
    OrderItem, SpeechRequest, SpeechResponse, VoiceMessageResponse,
    ProductCreateRequest, ProductUpdateRequest, StockUpdateRequest,
    OrderStatusRequest, ConversationClarificationRequest,
)
from app.services.catalog import CatalogService
from app.services.order_engine import OrderEngine
from app.services.llm import LLMService
from app.services.conversations import ConversationService
from app.services.sarvam_voice import SarvamVoiceService, VoiceServiceError

app = FastAPI(
    title="AI Order Desk Backend",
    version="0.1.0",
    description="Voice-first Hinglish order processing backend for the hackathon.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

catalog = CatalogService()
engine = OrderEngine(catalog)
llm = LLMService()
conversations = ConversationService(catalog, engine, llm)
store_catalog = CatalogService(include_demo=True)
store_engine = OrderEngine(store_catalog, require_quantity=True)
store_conversations = ConversationService(store_catalog, store_engine, llm)
voice = SarvamVoiceService()


def conversation_store(conversation_id: str):
    return store_conversations if store_conversations.get(conversation_id) else conversations


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-order-desk-backend"}


@app.get("/products/search")
def product_search(q: str, limit: int = 10):
    return {"query": q, "results": store_catalog.search(q, limit=limit)}


@app.get("/products")
def list_products():
    return store_catalog.list_products()


@app.post("/products", status_code=201)
def add_product(req: ProductCreateRequest):
    return store_catalog.create_product(req.model_dump())


@app.put("/products/{product_id}")
@app.patch("/products/{product_id}")
def edit_product(product_id: str, req: ProductUpdateRequest):
    product = store_catalog.update_product(product_id, req.model_dump(exclude_unset=True))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


@app.delete("/products/{product_id}", status_code=204)
def remove_product(product_id: str):
    if not store_catalog.delete_product(product_id):
        raise HTTPException(status_code=404, detail="Product not found.")


@app.patch("/products/{product_id}/stock")
def set_product_stock(product_id: str, req: StockUpdateRequest):
    product = store_catalog.update_stock(product_id, req.stock)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


@app.post("/orders/parse", response_model=ParseResponse)
def parse_order(req: ParseRequest):
    message = llm.transliterate_to_hinglish(req.message)
    items = llm.parse_order(message)
    if not items:
        draft = OrderItem(
            product_name=message,
            quantity=1,
            issue_type="no_match",
            clarification_required=True,
        )
        return ParseResponse(
            message=message,
            items=[draft],
            clarification_needed=True,
            clarification_question="Product samajh nahi aaya. Aapko kya order karna hai?",
        )

    resolved, drafts, issues, clarification = store_engine.resolve_items_with_drafts(items)

    return ParseResponse(
        message=req.message,
        items=resolved + drafts,
        clarification_needed=bool(issues),
        clarification_question=llm.generate_clarification(clarification) if clarification else None,
    )


@app.post("/orders/validate", response_model=ValidateResponse)
def validate_order(req: ValidateRequest):
    resolved, drafts, issues, clarification = store_engine.resolve_items_with_drafts(req.items)
    return ValidateResponse(
        items=resolved + drafts,
        clarification_needed=bool(issues),
        clarification_question=clarification,
        issues=issues,
    )


@app.post("/orders/confirm", response_model=ConfirmResponse)
def confirm_order(req: ConfirmRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="Cannot confirm an empty order.")
    try:
        parsed_items = []
        for raw in req.items:
            if isinstance(raw.get("product"), dict):
                product = raw["product"]
                parsed_items.append(OrderItem(
                    product_id=str(product.get("id") or product.get("product_id") or "") or None,
                    product_name=str(product.get("name") or product.get("product_name") or "Unknown product"),
                    quantity=float(raw.get("quantity") or 0),
                    unit=product.get("unit"),
                    brand=product.get("brand"),
                    price=product.get("price"),
                ))
            else:
                parsed_items.append(OrderItem.model_validate(raw))
        return store_engine.confirm(
            parsed_items,
            checkout_id=req.checkout_id,
            customer_id=req.customer_id,
            customer_name=req.customer_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/orders")
def list_orders(customer_id: str | None = None):
    return store_engine.list_orders(customer_id)


@app.patch("/orders/{order_id}/status")
def update_order_status(order_id: str, req: OrderStatusRequest):
    order = store_engine.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    allowed = {
        "received": "preparing", "preparing": "packed", "packed": "out_for_delivery",
        "out_for_delivery": "delivered", "delivered": "delivered", "cancelled": "cancelled",
    }
    if allowed.get(order["status"]) != req.status and req.status != "cancelled":
        raise HTTPException(status_code=409, detail=f"Invalid order status transition from {order['status']} to {req.status}.")
    return store_engine.update_status(order_id, req.status)


@app.get("/orders/{order_id}")
def get_order(order_id: str):
    order = store_engine.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@app.get("/orders/{order_id}/bill")
def get_bill(order_id: str):
    order = store_engine.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    return {
        "order_id": order_id,
        "items": order["items"],
        "subtotal": order.get("subtotal", order["total"]),
        "delivery_fee": order.get("delivery_fee", 0),
        "total": order["total"],
        "status": order["status"],
    }


@app.get("/orders/{order_id}/delivery-note")
def get_delivery_note(order_id: str):
    order = store_engine.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    return {
        "order_id": order_id,
        "status": order["status"],
        "items": [
            {
                "product_name": item["product_name"],
                "quantity": item["quantity"],
                "unit": item["unit"],
            }
            for item in order["items"]
        ],
        "message": "Order ready for delivery.",
    }


@app.get("/conversations", response_model=list[ConversationResponse])
def list_conversations():
    return store_conversations.list() + conversations.list()


@app.post("/conversations", response_model=ConversationResponse)
def create_conversation(req: ConversationCreateRequest):
    target = store_conversations if req.customer_id else conversations
    return target.create(req.message, req.customer_id, req.customer_name, req.input_mode)


@app.get("/conversations/{conversation_id}", response_model=ConversationResponse)
def get_conversation(conversation_id: str):
    target = conversation_store(conversation_id)
    conversation = target.get(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


@app.post("/conversations/{conversation_id}/messages", response_model=ConversationResponse)
def reply_to_conversation(conversation_id: str, req: ConversationMessageRequest):
    conversation = conversation_store(conversation_id).reply(conversation_id, req.message)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


@app.post("/conversations/{conversation_id}/confirm", response_model=ConversationResponse)
def confirm_conversation(conversation_id: str):
    conversation = conversation_store(conversation_id).confirm(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if conversation.status == "CLARIFICATION":
        raise HTTPException(status_code=409, detail="Resolve order clarifications before confirming.")
    if conversation.status == "AWAITING_CONFIRMATION":
        raise HTTPException(status_code=409, detail="The order is not ready to confirm.")
    return conversation


@app.post("/conversations/{conversation_id}/clarify", response_model=ConversationResponse)
def clarify_conversation(conversation_id: str, req: ConversationClarificationRequest):
    conversation = conversation_store(conversation_id).clarify(conversation_id, req.message)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


@app.post("/voice/conversations", response_model=VoiceMessageResponse)
async def voice_conversation_message(
    audio: UploadFile = File(...),
    conversation_id: str | None = Form(default=None),
):
    """Transcribe an audio turn, run the existing conversation engine, and speak its reply."""
    allowed_suffixes = {".wav", ".mp3", ".aac", ".aiff", ".ogg", ".opus", ".flac", ".mp4", ".m4a", ".amr", ".wma", ".webm", ".pcm"}
    filename = Path(audio.filename or "audio.webm").name
    if Path(filename).suffix.casefold() not in allowed_suffixes:
        raise HTTPException(status_code=415, detail="Unsupported audio format. Use WAV, MP3, AAC, OGG, FLAC, MP4/M4A, or WebM.")
    try:
        data = await audio.read(SarvamVoiceService.MAX_AUDIO_BYTES + 1)
        transcription = await run_in_threadpool(voice.transcribe, data, filename, audio.content_type)
        transcript = llm.transliterate_to_hinglish(transcription["transcript"])
        transcription["transcript"] = transcript
        if conversation_id:
            conversation = await run_in_threadpool(conversations.reply, conversation_id, transcript)
            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found.")
        else:
            conversation = await run_in_threadpool(conversations.create, transcript)

        response_text = (
            conversation.clarification_question
            or conversation.confirmation_message
            or ("Aapka order confirm ho gaya hai." if conversation.status == "CONFIRMED" else "Aapko kya order karna hai?")
        )
        speech = await run_in_threadpool(voice.synthesize, response_text)
        return VoiceMessageResponse(
            **transcription,
            conversation=conversation,
            response_text=response_text,
            **speech,
        )
    except VoiceServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    finally:
        await audio.close()


@app.post("/voice/speech", response_model=SpeechResponse)
async def synthesize_speech(req: SpeechRequest):
    """Synthesize a backend response as playable WAV audio."""
    try:
        speech = await run_in_threadpool(voice.synthesize, req.text)
    except VoiceServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return SpeechResponse(response_text=req.text, **speech)
