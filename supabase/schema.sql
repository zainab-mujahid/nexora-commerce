-- ============================================================================
-- E-Commerce AI Web — Initial schema
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).
-- Safe to re-run: every statement is idempotent (create-if-not-exists style).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles
-- One row per auth.users row. Created automatically by a trigger on signup
-- (see bottom of file) — never insert into this table from the app directly.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- products
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name        text not null,
  slug        text not null unique,
  description text,
  price       numeric(10, 2) not null check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products (category_id);

-- ----------------------------------------------------------------------------
-- product_images
-- Stores only the S3 object key + metadata. The binary lives in S3; this row
-- is what the app uses to build the public URL (S3_PUBLIC_BASE_URL + s3_key).
-- ----------------------------------------------------------------------------
create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  s3_key       text not null unique,
  content_type text not null,
  size_bytes   integer,
  alt_text     text,
  sort_order   integer not null default 0,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists product_images_product_id_idx on public.product_images (product_id);

-- Enforce at most one primary image per product at the database level.
create unique index if not exists product_images_one_primary_idx
  on public.product_images (product_id)
  where is_primary;

-- ----------------------------------------------------------------------------
-- cart_items / wishlist_items
-- ----------------------------------------------------------------------------
create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.wishlist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ----------------------------------------------------------------------------
-- addresses
-- ----------------------------------------------------------------------------
create table if not exists public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  full_name   text not null,
  phone       text not null,
  line1       text not null,
  line2       text,
  city        text not null,
  state       text,
  postal_code text not null,
  country     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists addresses_user_id_idx on public.addresses (user_id);

-- Enforce at most one default address per user at the database level (same
-- pattern as product_images_one_primary_idx above).
create unique index if not exists addresses_one_default_idx
  on public.addresses (user_id)
  where is_default;

-- ----------------------------------------------------------------------------
-- orders / order_items
-- shipping_address is a JSON snapshot (not a live FK) so an order stays
-- accurate even if the address row is later edited or deleted.
-- order_items snapshots product_name/unit_price for the same reason: the
-- product might change price or be deleted after the order is placed.
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal         numeric(10, 2) not null,
  total            numeric(10, 2) not null,
  shipping_address jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders (user_id);

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price   numeric(10, 2) not null,
  quantity     integer not null check (quantity > 0),
  subtotal     numeric(10, 2) not null
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.cart_items enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- security definer function: lets policies check "is the current user an
-- admin" without those policies needing direct select access to profiles
-- (which would otherwise create a circular RLS check on profiles itself).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---- profiles ----
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- Only the row's own owner may update it, and only for non-role fields.
-- There is deliberately no admin bypass here: promoting an account to admin
-- must never be reachable through any app-issued request, including one
-- made by the existing admin. The only way to change `role` is direct
-- database access (Supabase SQL Editor), which runs as the table owner and
-- is not subject to RLS at all.
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
  );

-- no insert/delete policy for profiles: rows are created only by the trigger
-- below (which runs as the table owner) and are never deleted by the app.

-- Hard backstop, independent of RLS or application code: the table itself
-- can never contain more than one row with role = 'admin'. The indexed
-- expression is a constant, so every 'admin' row collides on it, which is
-- exactly what makes a second one impossible — even a direct SQL UPDATE
-- run by mistake will be rejected by this constraint.
create unique index if not exists profiles_single_admin_idx
  on public.profiles ((true))
  where role = 'admin';

-- ---- categories ----
drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all" on public.categories
  for select using (true);

drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- products ----
drop policy if exists "products_select_active_or_admin" on public.products;
create policy "products_select_active_or_admin" on public.products
  for select using (is_active or public.is_admin());

drop policy if exists "products_write_admin" on public.products;
create policy "products_write_admin" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- product_images ----
drop policy if exists "product_images_select_all" on public.product_images;
create policy "product_images_select_all" on public.product_images
  for select using (true);

drop policy if exists "product_images_write_admin" on public.product_images;
create policy "product_images_write_admin" on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- cart_items ----
drop policy if exists "cart_items_owner_only" on public.cart_items;
create policy "cart_items_owner_only" on public.cart_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- wishlist_items ----
drop policy if exists "wishlist_items_owner_only" on public.wishlist_items;
create policy "wishlist_items_owner_only" on public.wishlist_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- addresses ----
drop policy if exists "addresses_owner_only" on public.addresses;
create policy "addresses_owner_only" on public.addresses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- orders ----
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (user_id = auth.uid());

drop policy if exists "orders_update_admin_only" on public.orders;
create policy "orders_update_admin_only" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

-- ---- order_items ----
-- access follows the parent order: readable by its owner or an admin,
-- and only insertable alongside an order the same user just created.
drop policy if exists "order_items_select_via_order" on public.order_items;
create policy "order_items_select_via_order" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "order_items_insert_via_own_order" on public.order_items;
create policy "order_items_insert_via_own_order" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Auto-create a profile row whenever a new auth user signs up.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Data API privileges for anon / authenticated (Supabase Data API / PostgREST)
--
-- RLS policies only filter ROWS; they do nothing without a base PostgreSQL
-- GRANT authorizing the operation on the table at all. GRANT is checked
-- first and is coarse ("can this role attempt a SELECT/INSERT/UPDATE/DELETE
-- on this table, full stop") — without it, Postgres rejects the statement
-- with `permission denied for table X` (42501) before any RLS policy is
-- ever evaluated. These statements were missing from this file (and never
-- issued any other way, since "Automatically expose new tables" was off),
-- which is why direct table reads failed even though the RLS policies above
-- were correct.
--
-- Grants below are intentionally broader than what RLS ultimately allows
-- for admin-only writes (e.g. every authenticated user gets INSERT on
-- products) — that's expected: GRANT only says "an authenticated request
-- may attempt this statement"; is_admin()'s using/with check clauses above
-- are what actually decide, per row, whether a non-admin's attempt
-- succeeds.
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- profiles: read/update only your own row. No insert/delete grant — rows
-- are created only by the handle_new_user trigger above (security definer,
-- runs as the table owner, unaffected by these grants).
grant select, update on public.profiles to authenticated;

-- categories / products / product_images: public catalog. Both anon (guest
-- browsing) and authenticated need read; write is admin-gated by RLS.
grant select
  on public.categories, public.products, public.product_images
  to anon, authenticated;

grant insert, update, delete
  on public.categories, public.products, public.product_images
  to authenticated;

-- cart_items: authenticated only, full CRUD (add / update quantity / remove / view).
grant select, insert, update, delete on public.cart_items to authenticated;

-- wishlist_items: authenticated only, add / remove / view. No update grant —
-- nothing on a wishlist row is ever updated in place.
grant select, insert, delete on public.wishlist_items to authenticated;

-- addresses: authenticated only, full CRUD (create / edit / delete / set default).
grant select, insert, update, delete on public.addresses to authenticated;

-- orders: authenticated only. No delete grant — matches the RLS design;
-- orders are permanent, undeletable records.
grant select, insert, update on public.orders to authenticated;

-- order_items: authenticated only, select + insert. No update/delete grant —
-- line items are immutable price/name snapshots once an order is placed.
grant select, insert on public.order_items to authenticated;

-- ============================================================================
-- Step 15 — Checkout: place_order()
--
-- Converting a cart into an order touches four tables (orders, order_items,
-- products.stock, cart_items) that must all succeed or all fail together.
-- PostgREST only ever executes one statement per request, so there is no way
-- to wrap "insert order -> insert order_items -> decrement stock -> clear
-- cart" in a single client-driven transaction — a partial failure between
-- separate requests could leave an order without its items, stock
-- decremented without an order behind it, or a cleared cart with no order at
-- all. A single SQL function called via `supabase.rpc()` runs as one
-- Postgres transaction, so any exception (bad address, empty cart,
-- unavailable product, insufficient stock) rolls back everything atomically.
--
-- SECURITY DEFINER is required (not just convenient) because decrementing
-- products.stock is gated by products_write_admin — an ordinary customer's
-- session has no UPDATE privilege on products, by design. Running as the
-- table owner bypasses that RLS check for this one, narrowly-scoped
-- operation, the same pattern already used by is_admin() above. Because
-- SECURITY DEFINER functions are not subject to RLS, this function performs
-- every authorization check itself: it takes no user_id parameter and
-- derives the caller exclusively from auth.uid(), verifies the address
-- belongs to that same user, and only ever reads/writes that user's own
-- cart_items.
--
-- `for update of c, p` locks each matching cart_items row together with its
-- product row for the rest of the transaction. That closes two race
-- windows at once: two concurrent checkouts can't both read the same stock
-- count and both succeed into an oversold state, and a concurrent
-- add-to-cart/update-quantity request against the very items being checked
-- out blocks until this transaction commits or rolls back, so the
-- order/stock/cart-clear below can never act on a cart that changed after
-- validation ran.
-- ============================================================================
create or replace function public.place_order(p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_address   jsonb;
  v_order_id  uuid;
  v_subtotal  numeric(10, 2) := 0;
  v_item      record;
  v_has_items boolean := false;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select jsonb_build_object(
    'full_name', a.full_name,
    'phone', a.phone,
    'line1', a.line1,
    'line2', a.line2,
    'city', a.city,
    'state', a.state,
    'postal_code', a.postal_code,
    'country', a.country
  )
  into v_address
  from public.addresses a
  where a.id = p_address_id and a.user_id = v_user_id;

  if v_address is null then
    raise exception 'ADDRESS_NOT_FOUND';
  end if;

  -- Validate availability/stock and compute the authoritative subtotal from
  -- current database prices in one pass, while locking every cart_items/
  -- products row involved (see comment above).
  for v_item in
    select c.product_id, c.quantity, p.price, p.stock, p.is_active
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id
    for update of c, p
  loop
    v_has_items := true;

    if not v_item.is_active then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_item.product_id;
    end if;
    if v_item.stock < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK:%', v_item.product_id;
    end if;

    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  end loop;

  if not v_has_items then
    raise exception 'CART_EMPTY';
  end if;

  -- No shipping/tax/discount model exists yet (see implementation plan) —
  -- total intentionally equals subtotal until that's introduced.
  insert into public.orders (user_id, status, subtotal, total, shipping_address)
  values (v_user_id, 'pending', v_subtotal, v_subtotal, v_address)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
  select v_order_id, p.id, p.name, p.price, c.quantity, p.price * c.quantity
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.user_id = v_user_id;

  update public.products p
  set stock = p.stock - c.quantity
  from public.cart_items c
  where c.product_id = p.id and c.user_id = v_user_id;

  delete from public.cart_items where user_id = v_user_id;

  return v_order_id;
end;
$$;

-- Functions grant EXECUTE to PUBLIC by default, which would let even the
-- unauthenticated `anon` role attempt to call this — revoke that and grant
-- only to authenticated, matching every other write path in this file.
revoke all on function public.place_order(uuid) from public;
grant execute on function public.place_order(uuid) to authenticated;

-- ============================================================================
-- Step 15 bug fix — get_own_cart_product_names()
--
-- products_select_active_or_admin (`is_active or is_admin()`) means a
-- customer's own cart_items -> products embed comes back null once a
-- product they'd already added is deactivated: the cart_items row is still
-- theirs, but the linked products row is no longer visible to their
-- session at all. That's the correct, intended behavior for RLS — a
-- deactivated product shouldn't be readable as if it were still an active
-- listing — but it left the cart with no way to show *which* line item
-- that was, which is confusing with more than one affected item.
--
-- This is a narrow, deliberate exception to that RLS check, not a
-- weakening of it: the function is SECURITY DEFINER so it can read a
-- product regardless of is_active, but it only ever returns the name of a
-- product the caller's own cart_items already references (`c.user_id =
-- auth.uid()`), and only that one column. It can't be used to look up an
-- arbitrary product, and a product's display name isn't sensitive — the
-- customer already committed to it by adding it while it was active, so
-- this reveals nothing they didn't already know. Product images are
-- unaffected by this whole issue: product_images_select_all already grants
-- select using (true), independent of the linked product's is_active, so
-- the app can already read a deactivated product's images without this
-- function.
-- ============================================================================
create or replace function public.get_own_cart_product_names()
returns table (product_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.user_id = auth.uid();
$$;

revoke all on function public.get_own_cart_product_names() from public;
grant execute on function public.get_own_cart_product_names() to authenticated;
