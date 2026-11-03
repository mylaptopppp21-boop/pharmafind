# Database notes

The app's local development database is `backend/data/db.json`, created on first backend start. It contains `users`, `pharmacies`, `inventory`, `orders`, and `reviews` collections. Passwords are stored as salted scrypt hashes, never plaintext.

For PostgreSQL/Supabase deployment, run `database/schema.sql`. It defines profiles, pharmacies, categories, medicines, inventory, customer addresses, orders, order items, reviews, notifications, indexes, and starter row-level security policies. The current API uses the local JSON repository; the SQL schema is the planned hosted relational model and is not automatically connected.
