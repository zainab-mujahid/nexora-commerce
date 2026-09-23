-- ============================================================================
-- E-Commerce AI Web — Initial schema
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).
-- Safe to re-run: every statement is idempotent (create-if-not-exists style).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
--
-- pgvector — Step 22 Phase 1B. Adds the `vector` type and its distance
-- operators (<=>, <->, <#>), used by products.embedding and match_products()
-- below. Installed into the dedicated `extensions` schema rather than
-- `public`, per Supabase's documented convention — this keeps the
-- PostgREST-exposed `public` schema free of extension objects. `extensions`
-- is already on this database's default search_path (the same reason
-- gen_random_uuid() above needs no explicit schema qualification or grant),
-- so `vector` still resolves unqualified in ordinary session/SQL-editor use;
-- functions below still schema-qualify it explicitly, matching this file's
-- existing habit of always schema-qualifying (public.categories,
-- public.is_admin(), etc.) rather than relying on implicit search_path.
-- ----------------------------------------------------------------------------
create extension if not exists vector with schema extensions;

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
-- products.embedding — Step 22 Phase 1B
--
-- Nullable pgvector column holding a semantic embedding of a product's
-- name + description + category only — never price, stock, is_active, or
-- other fast-changing business facts, which stay authoritative database
-- filters applied alongside similarity search, not embedding content (see
-- implementation-plan.txt Step 21). Must remain nullable: every existing
-- row gets NULL here, and no product is required to have an embedding —
-- AI-powered retrieval degrades gracefully around NULL rather than ever
-- being a hard dependency for core catalog functionality. Dimension is
-- fixed at 1536 to match the selected embedding model (gemini-embedding-2,
-- see Step 21) — the query embedding passed into match_products() below
-- must always be produced by that same model/dimension; changing either
-- requires regenerating every stored embedding and migrating this column,
-- not just an app-config change.
--
-- Generation/backfill is explicitly a later phase, not this one: this
-- column is added empty and stays empty until that phase runs.
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists embedding extensions.vector(1536);

-- No vector index (e.g. HNSW) yet, deliberately: this column is 100% NULL
-- until the backfill phase populates it, so there is nothing yet for an
-- index to speed up, and it's not required for correctness at any catalog
-- size — pgvector's exact-scan cosine distance over the is_active/stock>0/
-- embedding-not-null-filtered subset below is already fast against a small
-- catalog. Once real embeddings exist, an approximate index becomes a
-- performance optimization (not a correctness requirement) worth adding,
-- e.g.:
--   create index products_embedding_hnsw_idx on public.products
--     using hnsw (embedding extensions.vector_cosine_ops);
-- Left as a comment, not executed now, so it's tuned against real data
-- (HNSW build parameters are best chosen once there's something to build
-- against) rather than created against an empty column.

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

-- Step 23D: no customer INSERT policy. Orders are created only by
-- place_order() (SECURITY DEFINER), which never needed one; a direct-insert
-- path let a customer fabricate totals/prices/quantities/status. The drop
-- stays so re-running this file removes it from an existing database.
drop policy if exists "orders_insert_own" on public.orders;

-- Step 24B: `cancelled` is terminal and can only be entered through
-- admin_cancel_order(), which restores stock in the same transaction. USING
-- makes a cancelled row invisible as an UPDATE target (it can never be
-- revived and then cancelled again for a second stock restore); WITH CHECK
-- rejects any direct UPDATE that would produce `cancelled` (which would skip
-- the restore). Moves among pending/processing/shipped/delivered — including
-- corrections like shipped -> pending — stay allowed. admin_cancel_order()
-- is SECURITY DEFINER and runs as the table owner, which this (non-forced)
-- policy does not apply to.
drop policy if exists "orders_update_admin_only" on public.orders;
create policy "orders_update_admin_only" on public.orders
  for update
  using (public.is_admin() and status <> 'cancelled')
  with check (public.is_admin() and status <> 'cancelled');

-- ---- order_items ----
-- access follows the parent order: readable by its owner or an admin.
-- Never insertable by a customer directly — only place_order() writes rows
-- here (see the orders_insert_own note above).
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
-- orders are permanent, undeletable records. No insert grant (Step 23D):
-- place_order() is the only creation path; update stays for admin status
-- changes (RLS orders_update_admin_only). The explicit revoke is needed
-- because re-running a narrower grant never removes an earlier one.
grant select, update on public.orders to authenticated;
revoke insert on public.orders from authenticated;

-- order_items: authenticated only, select only. No insert/update/delete
-- grant — line items are written only by place_order() and are immutable
-- price/name snapshots once an order is placed.
grant select on public.order_items to authenticated;
revoke insert on public.order_items from authenticated;

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
  -- Step 23D: exactly the product ids validated/priced/locked below. Every
  -- later statement is restricted to this set: in READ COMMITTED each
  -- statement takes a fresh snapshot, and row locks can't block a brand-new
  -- cart_items row, so re-reading "the user's whole cart" would pick up an
  -- item added concurrently after validation (unvalidated, unpriced in the
  -- total, yet ordered, stock-decremented and deleted). With this set, such
  -- an item is simply left in the cart for a later checkout. Locked rows
  -- can't change their quantity/price meanwhile, and unique(user_id,
  -- product_id) makes a product id identify one cart row.
  v_product_ids uuid[] := '{}';
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
  --
  -- Step 24C: `order by p.id` makes the product row locks be taken in
  -- product-id order (the lock step runs above the sort). Without it the
  -- order followed the join plan — e.g. each customer's cart insertion
  -- order — so two checkouts (or a checkout and admin_cancel_order(), which
  -- locks in the same id order) sharing products could lock them in opposite
  -- orders and deadlock (40P01).
  for v_item in
    select c.product_id, c.quantity, p.price, p.stock, p.is_active
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id
    order by p.id
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
    v_product_ids := v_product_ids || v_item.product_id;
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
  where c.user_id = v_user_id
    and c.product_id = any(v_product_ids);

  update public.products p
  set stock = p.stock - c.quantity
  from public.cart_items c
  where c.product_id = p.id and c.user_id = v_user_id
    and c.product_id = any(v_product_ids);

  delete from public.cart_items
  where user_id = v_user_id
    and product_id = any(v_product_ids);

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

-- ============================================================================
-- Step 23C — get_own_wishlist_unavailable_product_names()
--
-- Same RLS interaction as get_own_cart_product_names() above, for
-- wishlist_items: once a wishlisted product is deactivated, the customer's
-- own wishlist_items -> products embed comes back null, leaving /wishlist
-- unable to say which product a line was.
--
-- Same narrow exception, deliberately narrower still: SECURITY DEFINER so
-- it can read the product regardless of is_active, but it returns only the
-- name, only for a product the caller's own wishlist_items references
-- (`w.user_id = auth.uid()` — no user id is ever accepted as input), and
-- only while that product is inactive (`not p.is_active`) — an active one
-- is already readable through the normal RLS-scoped query, so there's no
-- reason for this function to return it. No price/stock/description/
-- category/slug. Removing the wishlist row removes the only path to the
-- name. auth.uid() is null for an unauthenticated caller, so the join
-- matches nothing even if the call were allowed. Images need nothing from
-- here: product_images_select_all is already `using (true)` (see the
-- comment on get_own_cart_product_names() above).
-- ============================================================================
create or replace function public.get_own_wishlist_unavailable_product_names()
returns table (product_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name
  from public.wishlist_items w
  join public.products p on p.id = w.product_id
  where w.user_id = auth.uid()
    and not p.is_active;
$$;

-- Revoked from anon explicitly as well as from PUBLIC: Supabase's default
-- privileges can grant EXECUTE on new public-schema functions to anon
-- directly, which revoking from PUBLIC alone doesn't remove.
revoke all on function public.get_own_wishlist_unavailable_product_names() from public;
revoke all on function public.get_own_wishlist_unavailable_product_names() from anon;
grant execute on function public.get_own_wishlist_unavailable_product_names() to authenticated;

-- ============================================================================
-- Step 18 — Admin Order Management: admin_cancel_order()
--
-- Cancelling an order has to update orders.status AND restore the stock
-- place_order() decremented for each item — those two writes must succeed
-- or fail together, for the same reason place_order() itself is one atomic
-- function rather than several client calls (see the comment above it).
--
-- Step 24B: SECURITY DEFINER. orders_update_admin_only now refuses any
-- direct UPDATE that sets status to 'cancelled' (and any UPDATE of an
-- already-cancelled row), so this function is the ONLY way an order becomes
-- cancelled — which is what guarantees stock is restored exactly once.
-- Running as the table owner (not subject to that non-forced policy) is how
-- it performs the one write the policy deliberately forbids everyone else.
-- Callers cannot impersonate that context: API roles can't switch to the
-- owner role, and there is no session flag involved.
--
-- Because SECURITY DEFINER bypasses the caller's RLS on both orders and
-- products, the is_admin() check below is the function's ONLY authorization
-- gate and must stay the first statement. search_path is pinned, and
-- EXECUTE is limited to authenticated (revoked from PUBLIC and anon).
--
-- Cancellation is only allowed from 'pending' or 'processing'. Once an
-- order has shipped, the stock has physically left the building — silently
-- "restoring" it here would misrepresent real inventory. Reversing a
-- shipped/delivered order is a returns process, deliberately out of scope.
-- ============================================================================
create or replace function public.admin_cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status not in ('pending', 'processing') then
    raise exception 'ORDER_NOT_CANCELLABLE';
  end if;

  -- Step 24C: lock this order's product rows in product-id order — the same
  -- order place_order() uses — before restoring stock. The UPDATE below
  -- would otherwise lock them in join-plan order (the order's line order),
  -- which can deadlock (40P01) against a concurrent checkout of the same
  -- products taken in the opposite order.
  perform 1
  from public.products p
  where p.id in (
    select oi.product_id
    from public.order_items oi
    where oi.order_id = p_order_id
  )
  order by p.id
  for update;

  update public.products p
  set stock = p.stock + oi.quantity
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.product_id = p.id;

  update public.orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.admin_cancel_order(uuid) from public;
revoke all on function public.admin_cancel_order(uuid) from anon;
grant execute on function public.admin_cancel_order(uuid) to authenticated;

-- ============================================================================
-- Step 22 Phase 1B — match_products()
--
-- Controlled semantic-retrieval RPC for the planned AI shopping assistant
-- (Step 21). Takes a pre-computed query embedding (never raw text — text ->
-- embedding happens server-side in the app's AI layer, not in the database)
-- and returns bare product identifiers + a similarity score, nothing else:
-- the caller is expected to re-fetch full, current product facts afterward
-- through the existing getProductBySlug()/getActiveProducts()-style catalog
-- queries before showing anything to a customer, matching Step 21's explicit
-- "re-verify product IDs/current catalog facts" requirement and avoiding a
-- second, divergent shape for product data. Never executes any dynamic/
-- generated SQL — the query below is fixed at function-definition time.
--
-- NOT SECURITY DEFINER, unlike place_order()/admin_cancel_order() above:
-- those needed it because an ordinary customer session has no RLS-granted
-- UPDATE on products/orders. This function only ever SELECTs, and every row
-- it can return is a row products_select_active_or_admin already lets the
-- calling role see (is_active or is_admin()) — there is no privilege gap to
-- bridge, so it runs with the caller's own rights. It still re-applies
-- `is_active = true and stock > 0` explicitly rather than trusting RLS
-- alone, the same defense-in-depth already used by getActiveProducts() in
-- lib/catalog/products.ts (RLS additionally lets an admin's own session see
-- inactive rows — this function must never surface one of those to the
-- shopping assistant, admin session or not). `embedding is not null` skips
-- every product that hasn't been backfilled/generated yet.
--
-- p_category_id takes a categories.id uuid, not a slug or free-text name —
-- validated the same way searchProducts() in lib/catalog/products.ts already
-- resolves a slug to an id via getCategoryBySlug() before querying, so
-- there's no free-text category matching inside the database at all.
--
-- p_match_count is clamped to [1, 50] inside the function itself
-- (least(greatest(...))), regardless of what a caller passes — a bounded
-- result count enforced at the database layer, not left to app-layer
-- discipline alone.
--
-- Cosine similarity via pgvector's `<=>` operator, which returns cosine
-- *distance* (0 = identical direction); `1 - distance` is reported as
-- `similarity` so a higher number consistently means "more similar."
-- `order by embedding <=> p_query_embedding` (ascending distance) is
-- equivalent to descending similarity and is the form pgvector's planner
-- recognizes for index use once an ANN index exists on this column.
-- ============================================================================
create or replace function public.match_products(
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 10,
  p_min_price numeric(10, 2) default null,
  p_max_price numeric(10, 2) default null,
  p_category_id uuid default null
)
returns table (
  product_id uuid,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    p.id as product_id,
    1 - (p.embedding <=> p_query_embedding) as similarity
  from public.products p
  where p.is_active
    and p.stock > 0
    and p.embedding is not null
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_min_price is null or p.price >= p_min_price)
    and (p_max_price is null or p.price <= p_max_price)
  order by p.embedding <=> p_query_embedding
  limit least(greatest(coalesce(p_match_count, 10), 1), 50);
$$;

-- Granted to anon as well as authenticated: this returns nothing an
-- unauthenticated visitor couldn't already reconstruct by paginating
-- searchProducts() today (both already read only is_active products), and
-- an app-layer decision to require login before calling this (e.g. for
-- rate-limiting/cost-control reasons) is a Step 22 business choice
-- independent of — and enforceable on top of — this database-level grant.
revoke all on function public.match_products(extensions.vector(1536), integer, numeric, numeric, uuid) from public;
grant execute on function public.match_products(extensions.vector(1536), integer, numeric, numeric, uuid) to anon, authenticated;
