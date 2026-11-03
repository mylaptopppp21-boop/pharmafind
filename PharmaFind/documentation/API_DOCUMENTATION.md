# PharmaFind API documentation
Base URL: `http://localhost:5000/api`. JSON request and response bodies. Protected endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | API health check |
| POST | `/auth/register` | Public | Create customer or owner account |
| POST | `/auth/login` | Public | Authenticate and return token |
| GET | `/auth/me` | Authenticated | Current account |
| GET | `/medicines` | Public | Search/filter medicine inventory |
| GET | `/pharmacies` | Public | Search pharmacy directory |
| GET | `/pharmacies/:id` | Public | Pharmacy profile and inventory |
| GET | `/owner/overview` | Owner | Owner dashboard data |
| POST | `/owner/inventory` | Owner | Add medicine listing |
| PUT | `/owner/inventory/:id` | Owner | Update owned listing |
| DELETE | `/owner/inventory/:id` | Owner | Delete owned listing |
| POST | `/orders` | Customer | Create order request; grouped by pharmacy |
| GET | `/orders` | Customer/Owner | List own orders or pharmacy orders |
| PATCH | `/orders/:id/status` | Owner | Update an order for owned pharmacy |

Registration body (customer): `{ "name":"Asha", "email":"asha@example.com", "password":"at-least-8-chars", "role":"customer" }`.
Registration body (owner): same fields plus `role:"owner"`, `pharmacyName`, and `address`.

Inventory body: `name`, `category`, `price`, `stock`; optional `genericName`, `form`, `brand`, `prescription`, `description`.

Order body: `items:[{ "inventoryId":"...", "quantity":1 }]`, `address`, `phone`, optional `customerName`.
