from typing import Any, List, Literal, Optional
from pydantic import AliasChoices, BaseModel, Field


class CatalogCandidate(BaseModel):
    product_id: str
    product_name: str
    brand: Optional[str] = None
    pack_size: Optional[float] = None
    pack_unit: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[float] = None


class OrderItem(BaseModel):
    product_id: Optional[str] = None
    product_name: str
    canonical_product_name: Optional[str] = None
    original_extraction: Optional[dict[str, Any]] = None
    quantity: float = Field(gt=0)
    quantity_specified: Optional[bool] = None
    unit: Optional[str] = None
    brand: Optional[str] = None
    pack_size: Optional[float] = None
    pack_unit: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[float] = None
    candidates: List[CatalogCandidate] = Field(default_factory=list)
    issue_type: Optional[Literal[
        "ambiguous_product", "no_match", "out_of_stock", "insufficient_stock", "quantity_pack_mismatch"
        , "quantity_required"
    ]] = None
    clarification_required: bool = False


class ParseRequest(BaseModel):
    message: str = Field(min_length=1, validation_alias=AliasChoices("message", "text"))


class ParseResponse(BaseModel):
    message: str
    items: List[OrderItem]
    clarification_needed: bool = False
    clarification_question: Optional[str] = None


class ValidateRequest(BaseModel):
    items: List[OrderItem]


class ValidateResponse(BaseModel):
    items: List[OrderItem]
    clarification_needed: bool = False
    clarification_question: Optional[str] = None
    issues: List[str] = []


class ConfirmRequest(BaseModel):
    # Accept both parsed backend items and the current cart's {product, quantity} shape.
    items: List[dict[str, Any]]
    checkout_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None


class ConfirmResponse(BaseModel):
    order_id: str
    total: float
    subtotal: float = 0
    items: List[OrderItem]
    status: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    created_at: Optional[str] = None
    delivery_fee: float = 0


class ConversationCreateRequest(BaseModel):
    message: str = Field(min_length=1)
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    input_mode: Literal["text", "voice"] = "text"


class ConversationMessageRequest(BaseModel):
    message: str = Field(min_length=1)


class ConversationClarificationRequest(BaseModel):
    message: str = Field(min_length=1)


class ConversationResponse(BaseModel):
    conversation_id: str
    status: str
    items: List[OrderItem]
    clarification_needed: bool = False
    clarification_question: Optional[str] = None
    confirmation_message: Optional[str] = None
    order_id: Optional[str] = None
    total: Optional[float] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    input_mode: str = "text"
    original_message: Optional[str] = None
    owner_message: Optional[str] = None


class VoiceMessageResponse(BaseModel):
    transcript: str
    language_code: Optional[str] = None
    language_probability: Optional[float] = None
    conversation: ConversationResponse
    response_text: str
    audio_base64: str
    audio_mime_type: str = "audio/wav"


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)


class SpeechResponse(BaseModel):
    response_text: str
    audio_base64: str
    audio_mime_type: str = "audio/wav"


class ProductCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    brand: Optional[str] = None
    category: str = "Atta & Rice"
    price: float = Field(ge=0)
    unit: str = "kg"
    stock: float = Field(ge=0)
    keywords: List[str] = Field(default_factory=list)
    emoji: str = "📦"
    color: str = "sand"


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = Field(default=None, ge=0)
    unit: Optional[str] = None
    stock: Optional[float] = Field(default=None, ge=0)
    keywords: Optional[List[str]] = None
    emoji: Optional[str] = None
    color: Optional[str] = None


class StockUpdateRequest(BaseModel):
    stock: float = Field(ge=0)


class OrderStatusRequest(BaseModel):
    status: Literal["received", "preparing", "packed", "out_for_delivery", "delivered", "cancelled"]
