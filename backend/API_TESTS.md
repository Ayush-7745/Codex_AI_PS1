# Quick API tests

## Health
GET http://127.0.0.1:8000/health

## Product search
GET http://127.0.0.1:8000/products/search?q=amul%20butter

## Parse an order
POST http://127.0.0.1:8000/orders/parse
Content-Type: application/json

{
  "message": "bhaiya 2 kilo atta aur ek Amul butter de do"
}

## Confirm
POST http://127.0.0.1:8000/orders/confirm
Content-Type: application/json

{
  "items": [
    {
      "product_id": "P0419",
      "product_name": "Amul Butter 500g",
      "quantity": 1,
      "unit": "g",
      "brand": "Amul",
      "price": 285,
      "stock": 3
    }
  ]
}
