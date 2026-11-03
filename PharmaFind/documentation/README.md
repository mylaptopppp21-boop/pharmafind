# PharmaFind
Find Medicines. Discover Pharmacies. Stay Healthy.

## Phase 1 status
Project structure, Express API, Supabase connection, React (Vite) frontend and a health check.

## Run it (Windows, VS Code terminal)
1. Create a Supabase project and run `database/schema.sql` in the SQL Editor.
2. Backend:
   cd backend
   copy .env.example .env      (then fill in your Supabase values)
   npm install
   npm run dev
   Test: http://localhost:5000/api/health
3. Frontend (second terminal):
   cd frontend
   copy .env.example .env
   npm install
   npm run dev
   Open: http://localhost:5173

Never commit `.env` files or the Supabase service-role key.
