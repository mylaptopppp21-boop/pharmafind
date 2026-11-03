# PharmaFind — full-stack pharmacy discovery demo

A React + Vite frontend and Express API for customers to discover medicine listings and pharmacies, and for pharmacy owners to manage inventory and incoming orders.

## Included functionality
- Customer and pharmacy-owner registration/login with role-based access.
- Passwords hashed with Node.js `scrypt`; signed expiring bearer tokens.
- Medicine search by name, generic name, brand, category and city/area.
- Pharmacy directory and individual pharmacy inventory pages.
- Customer cart and demo checkout; orders are grouped by pharmacy and stock is decremented.
- Customer order history and owner order-status updates.
- Owner dashboard: product counts, low-stock count, incoming orders, add/edit stock and remove inventory.
- Responsive React interface with motion effects and iconography.
- Persistent local JSON database for immediate local running; PostgreSQL/Supabase relational schema supplied in `database/schema.sql` for hosted deployment.

## Requirements
- Node.js 18 or newer
- npm

## Run locally (Windows / VS Code)
Open two terminals.

**Terminal 1 — backend**
```powershell
cd PharmaFind\backend
npm install
copy .env.example .env
npm run dev
```
The API runs at `http://localhost:5000`. On first start it creates `backend/data/db.json` and seeds demo pharmacy/medicine records.

**Terminal 2 — frontend**
```powershell
cd PharmaFind\frontend
npm install
copy .env.example .env
npm run dev
```
Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## Demo owner accounts
| Pharmacy | Email | Password |
|---|---|---|
| CarePlus Pharmacy | `owner@careplus.demo` | `Demo@123` |
| HealthFirst Medicals | `owner@healthfirst.demo` | `Demo@123` |
| MediCare Pharmacy | `owner@medicare.demo` | `Demo@123` |

Create a customer account through **Create account** to test customer checkout and order history. Demo accounts and seeded listings are sample data only.

## Database modes
The app runs immediately using a local JSON file store at `backend/data/db.json`; this makes the project usable without creating cloud credentials. The PostgreSQL schema in `database/schema.sql` is provided for a hosted Supabase/PostgreSQL migration. The current API does not yet use Supabase; do not add a Supabase service-role key to the browser. A production deployment should replace the JSON repository with PostgreSQL queries and use Supabase Auth or another managed identity provider.

## Important safety and production notes
- This is an educational/demo marketplace, not a licensed pharmacy or medical advice service.
- Seed medicine catalogue entries and prices are illustrative and may be inaccurate; owners must verify product details, stock, pricing and legal requirements before publishing.
- Prescription products are marked and disabled for customer self-checkout in this demo. A real service must validate prescriptions and comply with applicable Indian drug, pharmacy, privacy, consumer-protection and e-commerce requirements.
- Demo checkout does not collect payment or guarantee delivery. It records an order request for the relevant pharmacy.
- Before internet deployment: set a long random `JWT_SECRET`, enforce HTTPS, configure exact `CLIENT_URL`, add email/phone verification, password reset, audit logging, backups, proper database migrations, payment-provider integration if needed, and rate limits/monitoring. Do not use demo accounts or local JSON storage in production.

## API summary
- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/medicines?q=&category=&city=&inStock=true`
- `GET /api/pharmacies`, `GET /api/pharmacies/:id`
- `GET /api/owner/overview`
- `POST /api/owner/inventory`, `PUT /api/owner/inventory/:id`, `DELETE /api/owner/inventory/:id`
- `POST /api/orders`, `GET /api/orders`, `PATCH /api/orders/:id/status`
