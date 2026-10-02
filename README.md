# AI Order Desk

AI Order Desk is a React + Vite frontend application for **Sharma General Store**. The app has a shared mock login supporting two roles: **Customer** and **Store Owner**. Customers can browse groceries or place natural-language/voice orders. Store Owners manage catalog inventory, review AI orders, resolve customer clarifications, and track/update placed order statuses in real time.

## Run the app

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

Build for production:

```bash
npm run build
```

## Login and roles

Open `/login` (the `/` route redirects there when signed out). Choose **Customer** or **Store Owner**, then sign in or register. Demo authentication persists in `localStorage`; active roles are maintained per tab so Customer and Store views can be demonstrated side-by-side in separate browser tabs.

After login:
- **Customer** → `/customer/dashboard`
- **Store Owner** → `/store/dashboard`

## Routes

### Common

| Route | Page |
| --- | --- |
| `/` | Redirect to login or current role’s dashboard |
| `/login` | Shared login and registration form with role selector |

### Customer

| Route | Page |
| --- | --- |
| `/customer/dashboard` | Greeting, Sharma General Store, quick AI order, recent orders |
| `/customer/store` | Searchable product catalog, category filters, live stock state, cart controls |
| `/customer/ai-order` | Natural-language order, voice input, clarification, store-confirmation timeline |
| `/customer/cart` | Cart quantities, stock validation, subtotal, delivery fee, checkout |
| `/customer/orders` | Saved order list and live delivery statuses |
| `/customer/orders/:orderId` | Order items breakdown, totals, and delivery timeline |
| `/customer/order-success` | Confirmation, live store status stepper, order documents |

### Store Owner

| Route | Page |
| --- | --- |
| `/store/dashboard` | Time-based greeting, live stats (Today's Orders, Total Products, Low Stock, Today's Sales), pending AI request card, recent orders table |
| `/store/products` | Interactive product table/cards, search & category filters, inline stock edit (`−`/`+`/input), status badges, edit & delete buttons (with confirmation modal) |
| `/store/products/add` | Form to add new products (Name, Brand, Category, Price, Unit, Stock, AI Keywords) with validation and toast |
| `/store/products/:id/edit` | Form to edit existing product fields, prices, stock, and keywords |
| `/store/orders` | Tabbed desk for **AI Requests** (`?tab=requests`) and **Placed Orders** (`?tab=placed`) |
| `/store/orders/:orderId` | Detailed order page with customer info, line items, and interactive status stepper (`New` -> `Preparing` -> `Packed` -> `Out for delivery` -> `Delivered`) |
| `/store-desk` | Redirects directly to `/store/orders` |

## Data Model & Real-time Tab Synchronization

All store products and placed orders are persisted in `localStorage` and synchronized across browser tabs using a resilient `BroadcastChannel` helper (with `storage` event fallback).

### Product Catalog Schema
```json
{
  "id": "atta",
  "name": "Aashirvaad Atta",
  "brand": "Aashirvaad",
  "category": "Atta & Rice",
  "price": 55,
  "unit": "kg",
  "stock": 18,
  "keywords": ["aata", "flour", "wheat"],
  "emoji": "🌾",
  "color": "sand"
}
```

### Derived Stock Status Rules
- `stock === 0`: **Out of Stock** (badge: red `stock-out`). Cannot be added to cart; parser flags as unavailable.
- `stock > 0 && stock <= 5`: **Low Stock** (badge: yellow `stock-low`).
- `stock > 5`: **In Stock** (badge: green `stock-in`).

### Stock Decrement & Cart Rules
- **Single Decrement at Checkout**: Product stock decreases *only* when a customer confirms checkout in their cart. Execution is strictly guarded (React StrictMode safe) to prevent duplicate decrements. Receiving tabs sync state directly.
- **Stock Validation**: Checkout validates cart items against live catalog stock. If requested quantity exceeds available stock, checkout is blocked and a toast notice is shown.
- **Deleted Product Cart Sync**: If a store owner deletes a product from the catalog, it is automatically removed from active customer carts with a notification toast.
- **Catalog Versioning**: Local catalog schema versioning (`ai-order-catalog-version`) safely manages data migrations and reseeding.

## Backend and mock fallback

All HTTP calls live in `src/services/api.js`. The frontend uses `VITE_API_BASE_URL` or defaults to `http://localhost:8000`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/products` | Load catalog products |
| `POST` | `/orders/parse` | Parse a natural-language order |
| `POST` | `/orders/confirm` | Confirm customer checkout |
| `GET` | `/orders/{order_id}/bill` | Get bill document data |
| `GET` | `/orders/{order_id}/delivery-note` | Get delivery note data |

When the backend API is unavailable, local mock parsers evaluate customer requests against the live catalog (`name`, `brand`, `category`, and `keywords`). Missing quantities, stock limits, and ambiguous oils trigger customer clarification boxes before store confirmation.

## Project Structure

```text
src/
├── components/
│   ├── AIOrderBox.jsx
│   ├── CartSummary.jsx
│   ├── ClarificationBox.jsx
│   ├── EmptyState.jsx
│   ├── Navbar.jsx
│   ├── OrderCard.jsx
│   ├── ProductCard.jsx
│   ├── ProtectedRoute.jsx
│   ├── StatusBadge.jsx
│   ├── StatusTimeline.jsx
│   └── Toast.jsx
├── context/
│   ├── AuthContext.jsx
│   └── CartContext.jsx
├── pages/
│   ├── customer/
│   │   ├── AIOrder.jsx
│   │   ├── Cart.jsx
│   │   ├── CustomerDashboard.jsx
│   │   ├── OrderDetails.jsx
│   │   ├── OrderSuccess.jsx
│   │   ├── Orders.jsx
│   │   └── Store.jsx
│   ├── store/
│   │   ├── Dashboard.jsx
│   │   ├── OrderDetail.jsx
│   │   ├── Orders.jsx
│   │   ├── ProductForm.jsx
│   │   └── Products.jsx
│   └── Login.jsx
├── services/
│   └── api.js
├── App.jsx
├── index.css
└── main.jsx
```
