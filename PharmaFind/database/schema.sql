-- PharmaFind relational schema for Supabase/PostgreSQL.
-- Run in Supabase SQL Editor for a hosted database deployment.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('customer','owner','admin')) default 'customer',
  phone text,
  created_at timestamptz not null default now()
);
create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  address text not null,
  city text not null,
  phone text,
  description text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  category_name text not null unique,
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  generic_name text,
  brand text,
  category_id uuid references public.categories(id),
  dosage_form text,
  prescription_required boolean not null default false,
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id),
  price numeric(10,2) not null check(price >= 0),
  stock integer not null default 0 check(stock >= 0),
  updated_at timestamptz not null default now(),
  unique(pharmacy_id, medicine_id)
);
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  address text not null,
  city text not null,
  phone text,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  pharmacy_id uuid not null references public.pharmacies(id),
  status text not null default 'Pending' check(status in ('Pending','Confirmed','Ready for pickup','Completed','Cancelled')),
  delivery_address text not null,
  contact_phone text not null,
  subtotal numeric(10,2) not null check(subtotal >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id),
  medicine_name text not null,
  quantity integer not null check(quantity > 0),
  unit_price numeric(10,2) not null check(unit_price >= 0)
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  rating integer not null check(rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(customer_id, pharmacy_id)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inventory_pharmacy_idx on public.inventory(pharmacy_id);
create index if not exists inventory_medicine_idx on public.inventory(medicine_id);
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_pharmacy_idx on public.orders(pharmacy_id, created_at desc);
create index if not exists pharmacies_city_idx on public.pharmacies(city);

alter table public.profiles enable row level security;
alter table public.pharmacies enable row level security;
alter table public.categories enable row level security;
alter table public.medicines enable row level security;
alter table public.inventory enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;

-- Public discovery is read-only. Writes should be made through trusted server routes.
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select using (true);
drop policy if exists "public read medicines" on public.medicines;
create policy "public read medicines" on public.medicines for select using (true);
drop policy if exists "public read pharmacies" on public.pharmacies;
create policy "public read pharmacies" on public.pharmacies for select using (true);
drop policy if exists "public read inventory" on public.inventory;
create policy "public read inventory" on public.inventory for select using (true);
drop policy if exists "profile owner access" on public.profiles;
create policy "profile owner access" on public.profiles for select using (auth.uid() = id);
drop policy if exists "customer address owner access" on public.customer_addresses;
create policy "customer address owner access" on public.customer_addresses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "customer order access" on public.orders;
create policy "customer order access" on public.orders for select using (auth.uid() = customer_id);
drop policy if exists "customer order item access" on public.order_items;
create policy "customer order item access" on public.order_items for select using (exists(select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
drop policy if exists "customer review access" on public.reviews;
create policy "customer review access" on public.reviews for select using (true);
