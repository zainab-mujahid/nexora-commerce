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
-- products.embedding_source_hash / embedding_failed_at — embedding lifecycle
-- hardening, Phase A (schema only; nothing reads or writes these yet)
--
-- embedding_source_hash: fingerprint of exactly what the stored embedding
-- was generated from (embedding model, dimensions, and the product's
-- embedding text). Comparing it with the fingerprint of the product's
-- CURRENT name/description/category tells whether the embedding is current
-- or stale; NULL means "not known to be current" (no embedding yet, or one
-- written before this column existed). Written together with `embedding`,
-- never on its own.
--
-- embedding_failed_at: when the latest attempt to (re)generate this
-- product's embedding failed; NULL when there is no recorded failure.
-- Observability only.
--
-- Both nullable with no default: existing rows keep their embedding and get
-- NULL here, which correctly reads as "needs repair" without touching the
-- embedding that search and the assistant already use. Retrieval
-- (match_products, search_catalog_products) still depends only on
-- `embedding is not null` and never reads these columns. No index: repair
-- scans read the whole (small) catalog anyway. Covered by the existing
-- table grants and RLS (products_select_active_or_admin /
-- products_write_admin), like every other product column.
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists embedding_source_hash text;
alter table public.products add column if not exists embedding_failed_at timestamptz;

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
  line1       text not null,
  line2       text,
  city        text not null,
  state       text,
  postal_code text not null,
  country     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Nexora no longer collects a phone number. Dropped here too so re-running
-- this file on a database created before that change removes the column.
alter table public.addresses drop column if exists phone;

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

-- Step 23D: no customer INSERT policy. Orders are created only by a
-- SECURITY DEFINER function (finalize_paid_checkout() since Payments P4),
-- which never needed one; a direct-insert path let a customer fabricate
-- totals/prices/quantities/status. The drop stays so re-running this file
-- removes it from an existing database.
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
-- Never insertable by a customer directly — only finalize_paid_checkout()
-- writes rows here (see the orders_insert_own note above).
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
-- finalize_paid_checkout() is the only creation path. The explicit revokes
-- are needed because re-running a narrower grant never removes an earlier one.
--
-- UPDATE is column-level: only status/updated_at, the two columns the admin
-- status change (lib/admin/orders.ts) writes; RLS orders_update_admin_only
-- still decides who and which rows. user_id, totals, shipping_address and
-- created_at are fixed once the order is written. Revoking table-level
-- UPDATE also drops any column-level UPDATE grants, so the revoke has to
-- come before the column grant. finalize_paid_checkout() and
-- admin_cancel_order() are SECURITY DEFINER (run as the table owner), so this
-- doesn't restrict them.
grant select on public.orders to authenticated;
revoke insert on public.orders from authenticated;
revoke update on public.orders from authenticated;
revoke update on public.orders from anon;
grant update (status, updated_at) on public.orders to authenticated;

-- order_items: authenticated only, select only. No insert/update/delete
-- grant — line items are written only by finalize_paid_checkout() and are
-- immutable price/name snapshots once an order is placed.
grant select on public.order_items to authenticated;
revoke insert on public.order_items from authenticated;

-- ============================================================================
-- Legacy checkout: place_order() — REMOVED (final payment hardening)
--
-- Step 15's place_order() turned a cart into an order WITHOUT any payment. The
-- payment-first checkout (Payments P4) replaced it: begin_checkout() ->
-- verified provider payment -> finalize_paid_checkout() is now the only way an
-- order is created, and an orders row means "payment verified" (orders placed
-- before online payments keep payment_status = 'not_collected'). P4 revoked
-- EXECUTE from every role; nothing in the application or the database calls
-- it, so it is dropped rather than kept as dead, privileged code. Re-running
-- this file removes it from any database that still has it.
-- ============================================================================
drop function if exists public.place_order(uuid);

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
-- taken for each item when the order was placed (reserved by begin_checkout()
-- for paid orders; decremented by the legacy, since-dropped place_order() for
-- older ones) — those two writes must succeed or fail together, so this is
-- one atomic function rather than several client calls.
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
  -- order every checkout/payment function uses — before restoring stock. The UPDATE below
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
-- NOT SECURITY DEFINER, unlike admin_cancel_order() above: that needed it
-- because an ordinary session has no RLS-granted UPDATE on products/orders. This function only ever SELECTs, and every row
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

-- ============================================================================
-- Step 24D — persistent AI shopping-assistant rate limit
--
-- The limiter used to be an in-memory Map inside the Node process, so every
-- restart/redeploy reset it and each app instance counted separately. The
-- state now lives here, shared by every instance and surviving restarts.
--
-- One row per identity: 'user:<auth.uid()>' for a signed-in caller, or the
-- single shared 'anonymous' row for everyone else (there is no trustworthy
-- per-visitor identity for anonymous traffic — see lib/ai/rate-limit.ts).
--
-- The table is reachable ONLY through consume_ai_rate_limit() below: RLS is
-- on with no policies, and all table privileges are revoked from the API
-- roles (explicitly, since Supabase's default privileges can grant new
-- public tables to anon/authenticated directly), so no client can read,
-- reset or forge a counter.
--
-- Cleanup: nothing deletes rows yet. Stale rows are harmless (at most one
-- per user who has ever used the assistant, plus 'anonymous'); the
-- window_start index is there so a later maintenance job can delete rows
-- idle for a long time cheaply.
-- ============================================================================
create table if not exists public.ai_rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

create index if not exists ai_rate_limits_window_start_idx
  on public.ai_rate_limits (window_start);

alter table public.ai_rate_limits enable row level security;

revoke all on table public.ai_rate_limits from public;
revoke all on table public.ai_rate_limits from anon;
revoke all on table public.ai_rate_limits from authenticated;

-- Consumes one unit for the caller and reports whether the request may
-- proceed. Fixed window: 5 requests per 60 seconds, same as the old
-- in-memory limiter.
--
-- Takes NO parameters on purpose: the key comes from auth.uid() (the
-- verified JWT), and the limit/window are constants here. A key, limit or
-- window argument would let anyone calling this RPC directly reset or
-- sidestep their own counter.
--
-- The single INSERT ... ON CONFLICT DO UPDATE is the whole check-and-count:
-- concurrent calls for the same key serialize on that row, and each sees
-- the previous call's committed count, so parallel requests can't slip past
-- the limit. A rejected call leaves window_start alone (it doesn't extend
-- the window) and the count stops at limit + 1.
--
-- clock_timestamp(), not now(): now() is the transaction start time, which
-- for a call that waited on the row lock is earlier than the real time, and
-- would skew the window and retry_after_ms.
create or replace function public.consume_ai_rate_limit()
returns table (allowed boolean, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max    constant integer  := 5;
  c_window constant interval := interval '60 seconds';
  v_key    text := coalesce('user:' || auth.uid()::text, 'anonymous');
  v_now    timestamptz := clock_timestamp();
  v_count  integer;
  v_start  timestamptz;
begin
  insert into public.ai_rate_limits as r (key, window_start, request_count)
  values (v_key, v_now, 1)
  on conflict (key) do update
    set window_start  = case when r.window_start <= v_now - c_window
                             then v_now else r.window_start end,
        request_count = case when r.window_start <= v_now - c_window
                             then 1 else least(r.request_count + 1, c_max + 1) end
  returning r.request_count, r.window_start into v_count, v_start;

  allowed := v_count <= c_max;
  retry_after_ms := case
    when allowed then 0
    else least(
      greatest(1, ceil(extract(epoch from (v_start + c_window - v_now)) * 1000)),
      extract(epoch from c_window) * 1000
    )::integer
  end;
  return next;
end;
$$;

-- anon needs EXECUTE too: anonymous assistant requests are counted in the
-- shared 'anonymous' row.
revoke all on function public.consume_ai_rate_limit() from public;
grant execute on function public.consume_ai_rate_limit() to anon, authenticated;

-- ============================================================================
-- Catalog search, Phase 1 — search_catalog_products()
--
-- Database foundation for the storefront's hybrid product search. Separate
-- from match_products() (the AI shopping assistant's RPC), which is left
-- untouched: this one follows the CATALOG's visibility rules instead —
-- is_active only, out-of-stock products included (the storefront lists them
-- with a stock indicator), optional category filter.
--
-- Lexical evidence is ranked in ordinal tiers — no blended weights, no
-- similarity thresholds calibrated against today's catalog:
--   1 exact name (case-insensitive)
--   2 name starts with the query
--   3 query appears as whole word(s) in the name
--   4 name contains the query        (the storefront's existing search)
--   5 all query words appear in name + description + category name
--     (English full-text search; this is where category words like
--     "shoes" and descriptive words find evidence)
--
-- Semantic evidence needs a caller-supplied query embedding (generated
-- server-side by the app) and a query of at least 2 characters:
--   6 expansion — only when there IS lexical evidence: a product outside
--     the lexical matches is added only if it is at least as similar to the
--     query as the least similar lexical match (a per-query anchor, so no
--     global constant). No anchor (no lexical match has an embedding) -> no
--     expansion.
--   7 candidate — only when there is NO lexical evidence: the top
--     p_candidate_count products by similarity, returned for the
--     application's relevance check. They are NOT results: callers must
--     verify them before showing anything. They are returned all together
--     (limit/offset/sort don't apply), ordered by similarity, since the app
--     pages the verified subset itself.
--
-- Products without an embedding are still found through tiers 1-5; they
-- are simply never semantic candidates/expansions.
--
-- Ordering: p_sort null/'relevance' -> tier, similarity, name, id; or the
-- storefront's explicit sorts (newest / price_asc / price_desc / name_asc)
-- over the same result set. Every ordering ends in id, so it is total and
-- deterministic, and total_count/pagination come from the same query. A
-- page past the end returns no rows (callers clamp the page first, as the
-- storefront already does).
--
-- Security: SECURITY INVOKER (the default) — the caller's own RLS applies
-- (products_select_active_or_admin), plus the explicit is_active filter so
-- even an admin session only ever gets catalog-visible products. Returns
-- ids/tier/count only; the app fetches display data through its existing
-- queries. Inputs are bounded (query 1-200 characters, limit 1-48, offset
-- 0-10000, candidates 1-20).
--
-- Scale: substring/prefix/exact name matching uses the trigram index,
-- full-text matching uses the expression GIN index below (the WHERE
-- clauses repeat those exact expressions so the planner can use them).
-- The semantic pool (at most 100 nearest active products) is an exact scan
-- until an approximate (HNSW) index is added deliberately later — not
-- added here, because the same index would also change match_products()'
-- results for the assistant.
-- ============================================================================
create extension if not exists pg_trgm with schema extensions;

create index if not exists products_name_trgm_idx
  on public.products using gin (name extensions.gin_trgm_ops);

create index if not exists products_search_text_idx
  on public.products using gin (to_tsvector('english', name || ' ' || coalesce(description, '')));

create or replace function public.search_catalog_products(
  p_query text,
  p_query_embedding extensions.vector(1536) default null,
  p_category_id uuid default null,
  p_sort text default null,
  p_limit integer default 12,
  p_offset integer default 0,
  p_candidate_count integer default 8
)
returns table (product_id uuid, match_tier smallint, total_count bigint)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  c_max_query_length constant integer := 200;
  c_max_limit        constant integer := 48;
  c_max_offset       constant integer := 10000;
  c_semantic_pool    constant integer := 100;
  c_max_candidates   constant integer := 20;
  v_query      text := regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g');
  v_sort       text := coalesce(p_sort, 'relevance');
  v_limit      integer := least(greatest(coalesce(p_limit, 12), 1), c_max_limit);
  v_offset     integer := least(greatest(coalesce(p_offset, 0), 0), c_max_offset);
  v_candidates integer := least(greatest(coalesce(p_candidate_count, 8), 1), c_max_candidates);
  v_like       text;
  v_regex      text;
  v_all        tsquery;
  v_any        tsquery;
  v_semantic   boolean;
begin
  if char_length(v_query) = 0 then
    raise exception 'QUERY_REQUIRED';
  end if;
  if char_length(v_query) > c_max_query_length then
    raise exception 'QUERY_TOO_LONG';
  end if;
  if v_sort not in ('relevance', 'newest', 'price_asc', 'price_desc', 'name_asc') then
    raise exception 'INVALID_SORT';
  end if;

  -- The query as a LIKE literal (\, % and _ escaped) and as a regex
  -- literal (every non-alphanumeric character escaped), so customer text is
  -- never interpreted as a pattern.
  v_like  := replace(replace(replace(lower(v_query), '\', '\\'), '%', '\%'), '_', '\_');
  v_regex := regexp_replace(lower(v_query), '([^[:alnum:][:space:]])', '\\\1', 'g');

  -- All-words query for tier 5, and an any-word version used only to reach
  -- candidate rows through the index. A stop-word-only query ("a", "the")
  -- has no lexemes -> no full-text matching at all.
  v_all := plainto_tsquery('english', v_query);
  if numnode(v_all) > 0 then
    v_any := replace(v_all::text, ' & ', ' | ')::tsquery;
  else
    v_all := null;
  end if;

  v_semantic := p_query_embedding is not null and char_length(v_query) >= 2;

  return query
  with lexical as (
    select
      p.id,
      case
        when lower(p.name) = lower(v_query)            then 1
        when p.name ilike v_like || '%'                then 2
        when lower(p.name) ~ ('\m' || v_regex || '\M') then 3
        when p.name ilike '%' || v_like || '%'         then 4
        else 5
      end::smallint as tier,
      case
        when v_semantic and p.embedding is not null
          then 1 - (p.embedding <=> p_query_embedding)
      end as sim
    from public.products p
    left join public.categories c on c.id = p.category_id
    where p.is_active
      and (p_category_id is null or p.category_id = p_category_id)
      and (
        p.name ilike '%' || v_like || '%'
        or (
          v_all is not null
          and (
            to_tsvector('english', p.name || ' ' || coalesce(p.description, '')) @@ v_any
            -- category evidence through the (small) categories table, so the
            -- products side can still use its category_id index
            or p.category_id in (
              select c2.id
              from public.categories c2
              where to_tsvector('english', c2.name) @@ v_any
            )
          )
          and (to_tsvector('english', p.name || ' ' || coalesce(p.description, ''))
               || to_tsvector('english', coalesce(c.name, ''))) @@ v_all
        )
      )
  ),
  pool as (
    select p.id, 1 - (p.embedding <=> p_query_embedding) as sim
    from public.products p
    where v_semantic
      and p.is_active
      and p.embedding is not null
      and (p_category_id is null or p.category_id = p_category_id)
    order by p.embedding <=> p_query_embedding, p.id
    limit c_semantic_pool
  ),
  anchor as (
    select min(l.sim) as floor_sim from lexical l
  ),
  expansion as (
    select pl.id, 6::smallint as tier, pl.sim
    from pool pl
    cross join anchor a
    where a.floor_sim is not null
      and pl.sim >= a.floor_sim
      and not exists (select 1 from lexical l where l.id = pl.id)
  ),
  candidates as (
    select pl.id, 7::smallint as tier, pl.sim
    from pool pl
    where not exists (select 1 from lexical)
    order by pl.sim desc, pl.id
    limit v_candidates
  ),
  results as (
    select l.id, l.tier, l.sim from lexical l
    union all
    select e.id, e.tier, e.sim from expansion e
    union all
    select k.id, k.tier, k.sim from candidates k
  ),
  ranked as (
    select
      r.id,
      r.tier,
      count(*) over () as total,
      row_number() over (
        order by
          case when r.tier = 7 then r.sim end desc nulls last,
          case when v_sort = 'relevance' then r.tier end asc,
          case when v_sort = 'relevance' then r.sim end desc nulls last,
          case when v_sort = 'newest' then p.created_at end desc,
          case when v_sort = 'price_asc' then p.price end asc,
          case when v_sort = 'price_desc' then p.price end desc,
          case when v_sort in ('relevance', 'name_asc') then p.name end asc,
          r.id asc
      ) as rn
    from results r
    join public.products p on p.id = r.id
  )
  select rk.id, rk.tier, rk.total
  from ranked rk
  where rk.tier = 7
     or (rk.rn > v_offset and rk.rn <= v_offset + v_limit)
  order by rk.rn;
end;
$$;

-- Catalog data is public (guests browse and search too), so anon and
-- authenticated may execute; PUBLIC's default EXECUTE is revoked first.
-- SECURITY INVOKER + RLS + the explicit is_active filter decide which rows
-- any caller can reach.
revoke all on function public.search_catalog_products(text, extensions.vector, uuid, text, integer, integer, integer) from public;
revoke all on function public.search_catalog_products(text, extensions.vector, uuid, text, integer, integer, integer) from anon, authenticated;
grant execute on function public.search_catalog_products(text, extensions.vector, uuid, text, integer, integer, integer) to anon, authenticated;

-- ============================================================================
-- Payments P1 — provider-neutral payment database architecture
--
-- Lifecycle this section supports (the application wiring arrives in later
-- phases; nothing here is called by the app yet):
--
--   cart -> begin_checkout()          checkout_session + stock reserved,
--                                     cart untouched, NO order
--        -> create_payment_attempt()  payments row, amount/currency copied
--                                     from the session, never from a caller
--        -> attach_provider_payment() binds the provider's payment id
--        -> record_payment_status()   controlled status transitions from the
--                                     provider adapter's verified result
--        -> finalize_paid_checkout()  the ONLY path that creates an order
--                                     for an online payment
--   or   -> release_checkout_session() reservation returned exactly once
--
-- An orders row created through this flow means "payment was verified and
-- the order is confirmed". (The legacy place_order() was revoked at the
-- checkout switch, P4, and has since been dropped.)
--
-- Provider-neutral by design: no provider-specific columns or states. A
-- provider adapter maps its own statuses onto the generic ones before
-- calling record_payment_status().
--
-- Locking rules shared by every function below (deadlock avoidance):
--   1. a per-user transaction advisory lock is taken FIRST, so all checkout
--      and payment mutations for one customer run one at a time;
--   2. then row locks in a fixed order: checkout session -> payment(s) ->
--      products (always in product-id order, the same order
--      admin_cancel_order() uses) -> cart_items (product-id order).
--
-- Every function here is SECURITY DEFINER with an empty search_path and
-- fully schema-qualified references. begin_checkout() is callable by
-- signed-in customers (it acts only on auth.uid()); every other function is
-- executable ONLY by service_role, the role the server-side Supabase secret
-- key maps to. service_role bypasses RLS but not GRANTs, and it is granted
-- SELECT only on the new tables — so even the secret key can change payment
-- state solely through these functions.
-- ============================================================================

-- ---- Allow-list validators -------------------------------------------------
-- IMMUTABLE so they can back CHECK constraints. They make it structurally
-- impossible to store raw provider payloads, headers or card data: only
-- known top-level keys with short scalar values are accepted.

-- payments.display_summary: what the UI may later show about a payment.
create or replace function public.payment_display_summary_is_valid(p_summary jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_summary) = 'object'
    and octet_length(p_summary::text) <= 1024
    and not exists (
      select 1
      from pg_catalog.jsonb_each(p_summary) e
      where e.key <> all (array['brand', 'last4', 'method', 'environment'])
         or jsonb_typeof(e.value) <> 'string'
         or char_length(e.value #>> '{}') > 64
         or (e.key = 'last4' and (e.value #>> '{}') !~ '^[0-9]{4}$')
    );
$$;

-- payment_events.details: safe audit metadata (identifiers, codes, expected
-- vs received values for verification failures). No nested objects/arrays.
create or replace function public.payment_event_details_is_valid(p_details jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_details) = 'object'
    and octet_length(p_details::text) <= 4096
    and not exists (
      select 1
      from pg_catalog.jsonb_each(p_details) e
      where e.key <> all (array[
              'reason', 'code', 'category', 'message', 'environment',
              'provider_state', 'provider_event_type', 'http_status', 'attempt',
              'reference', 'amount_minor', 'currency', 'account_matches',
              'expected_reference', 'received_reference',
              'expected_amount_minor', 'received_amount_minor',
              'expected_currency', 'received_currency',
              'expected_provider_payment_id', 'received_provider_payment_id',
              -- Payments P5: the provider payment id an AUTHENTIC event named,
              -- kept so a recorded-but-unprocessed event can be recovered
              -- later without re-reading any raw request input.
              'provider_payment_id'
            ])
         or jsonb_typeof(e.value) not in ('string', 'number', 'boolean', 'null')
         or (jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') > 500)
    );
$$;

revoke all on function public.payment_display_summary_is_valid(jsonb) from public, anon, authenticated;
revoke all on function public.payment_event_details_is_valid(jsonb) from public, anon, authenticated;

-- ---- checkout_sessions -----------------------------------------------------
-- A payment-in-progress checkout. NOT an order. Holds the stock reservation,
-- the immutable address snapshot and the authoritative totals the payment
-- must match.
--
-- amount_minor is the provider-facing amount in USD cents. The CHECK ties it
-- exactly to total (numeric(10,2) * 100 is always integral), so the two can
-- never disagree. total equals subtotal until a shipping/tax model exists.
create table if not exists public.checkout_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'awaiting_payment'
                     check (status in ('awaiting_payment', 'completed', 'expired', 'cancelled', 'payment_conflict')),
  currency         text not null default 'USD' check (currency = 'USD'),
  subtotal         numeric(10, 2) not null check (subtotal >= 0),
  total            numeric(10, 2) not null check (total > 0),
  amount_minor     bigint not null check (amount_minor > 0),
  shipping_address jsonb not null check (jsonb_typeof(shipping_address) = 'object'),
  idempotency_key  uuid not null,
  order_id         uuid unique,
  reserved_until   timestamptz not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint checkout_sessions_amount_minor_matches_total
    check (amount_minor::numeric = total * 100),
  -- A session is completed exactly when it produced an order.
  constraint checkout_sessions_completed_iff_order
    check ((status = 'completed') = (order_id is not null)),
  -- Idempotent creation: one session per (customer, idempotency key).
  constraint checkout_sessions_user_idempotency_key_key
    unique (user_id, idempotency_key),
  -- Targets for the composite foreign keys on payments and orders below:
  -- they make it impossible for a payment or an order to disagree with its
  -- session about the customer, the amount or the currency.
  constraint checkout_sessions_payment_identity_key
    unique (id, user_id, amount_minor, currency),
  constraint checkout_sessions_order_identity_key
    unique (id, user_id, total, currency)
);

-- At most one payment-in-progress checkout per customer — the database
-- backstop against double reservation (concurrent "Pay" clicks with
-- different idempotency keys, two tabs, retries).
create unique index if not exists checkout_sessions_one_awaiting_per_user_idx
  on public.checkout_sessions (user_id)
  where status = 'awaiting_payment';

-- Expiry sweeps scan only live reservations.
create index if not exists checkout_sessions_awaiting_reserved_until_idx
  on public.checkout_sessions (reserved_until)
  where status = 'awaiting_payment';

-- ---- checkout_session_items ------------------------------------------------
-- Exactly what was reserved and what the payment is for. The order is built
-- from these snapshots, never from product prices at finalize time.
-- product_id is nullable (set null if the product is later deleted) so the
-- snapshot survives, like order_items.
create table if not exists public.checkout_session_items (
  id                  uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null references public.checkout_sessions (id) on delete cascade,
  product_id          uuid references public.products (id) on delete set null,
  product_name        text not null,
  unit_price          numeric(10, 2) not null check (unit_price >= 0),
  quantity            integer not null check (quantity > 0),
  subtotal            numeric(10, 2) not null,
  constraint checkout_session_items_subtotal_matches
    check (subtotal = unit_price * quantity),
  -- unique(user_id, product_id) on cart_items means one line per product.
  constraint checkout_session_items_session_product_key
    unique (checkout_session_id, product_id)
);

create index if not exists checkout_session_items_product_id_idx
  on public.checkout_session_items (product_id);

-- ---- payments --------------------------------------------------------------
-- One row per provider payment attempt (a retry may create another attempt
-- for the same session). Provider-neutral: `provider` is a short slug
-- ('safepay', later e.g. 'stripe'), provider_payment_id is the provider's
-- own identifier, and this row's id is Nexora's reference sent to the
-- provider. History stays readable after a provider switch.
--
-- The composite foreign key copies the session's user/amount/currency into
-- the payment and keeps them equal: a payment cannot exist for an amount or
-- currency other than its session's.
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null,
  order_id            uuid references public.orders (id) on delete set null,
  user_id             uuid not null references auth.users (id) on delete cascade,
  provider            text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_payment_id text check (char_length(provider_payment_id) between 1 and 255),
  amount_minor        bigint not null check (amount_minor > 0),
  currency            text not null default 'USD' check (currency = 'USD'),
  status              text not null default 'pending'
                        check (status in ('pending', 'processing', 'paid', 'failed', 'cancelled',
                                          'expired', 'refunded', 'partially_refunded', 'requires_review')),
  failure_code        text check (char_length(failure_code) <= 64),
  failure_message     text check (char_length(failure_message) <= 500),
  display_summary     jsonb not null default '{}'::jsonb
                        check (public.payment_display_summary_is_valid(display_summary)),
  last_checked_at     timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_session_identity_fkey
    foreign key (checkout_session_id, user_id, amount_minor, currency)
    references public.checkout_sessions (id, user_id, amount_minor, currency)
    on delete cascade,
  -- A provider id identifies at most one Nexora payment (NULLs allowed).
  constraint payments_provider_payment_id_key
    unique (provider, provider_payment_id),
  -- Money-received states always carry the provider id and a paid time.
  constraint payments_settled_has_provider_id_and_paid_at
    check (status not in ('paid', 'partially_refunded', 'refunded')
           or (provider_payment_id is not null and paid_at is not null))
);

create index if not exists payments_checkout_session_id_idx on public.payments (checkout_session_id);
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_order_id_idx on public.payments (order_id);

-- At most one successfully paid payment per checkout session. A second
-- verified success (customer paid twice) is recorded as requires_review by
-- record_payment_status() instead, for a refund.
create unique index if not exists payments_one_settled_per_session_idx
  on public.payments (checkout_session_id)
  where status in ('paid', 'partially_refunded', 'refunded');

-- At most one unsettled attempt per session. 'failed' counts as unsettled:
-- hosted checkouts generally let the customer retry the same provider
-- payment, so a new attempt is only opened after the previous one is
-- explicitly closed (cancelled/expired) — which limits how many provider
-- payments for one checkout can be live at once.
create unique index if not exists payments_one_unsettled_per_session_idx
  on public.payments (checkout_session_id)
  where status in ('pending', 'processing', 'failed');

-- ---- payment_events --------------------------------------------------------
-- Webhook/verification audit log and webhook idempotency. details is limited
-- to allow-listed scalar metadata (see payment_event_details_is_valid); raw
-- bodies, headers, secrets and card data cannot be stored.
--
-- Deduplication applies only to signature-verified events: an unverified
-- request could otherwise claim a genuine future event id and get the real
-- event treated as a duplicate. Unverified requests are still logged
-- (signature_valid = false) but never block anything. Internally generated
-- events (e.g. a failed verification lookup) use an id the application
-- makes unique, such as 'internal:<uuid>'.
create table if not exists public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 255),
  payment_id        uuid references public.payments (id) on delete set null,
  event_type        text not null check (char_length(event_type) between 1 and 100),
  signature_valid   boolean not null,
  outcome           text not null default 'received'
                      check (outcome in ('received', 'processed', 'ignored', 'verification_failed',
                                         'rejected_signature', 'error')),
  details           jsonb not null default '{}'::jsonb
                      check (public.payment_event_details_is_valid(details)),
  received_at       timestamptz not null default now(),
  processed_at      timestamptz
);

create unique index if not exists payment_events_verified_provider_event_idx
  on public.payment_events (provider, provider_event_id)
  where signature_valid;

create index if not exists payment_events_payment_id_idx on public.payment_events (payment_id);
create index if not exists payment_events_unprocessed_idx
  on public.payment_events (received_at)
  where processed_at is null;

-- ---- orders: generic payment relationship ----------------------------------
-- payment_status is the order's payment summary, separate from the
-- fulfilment `status`:
--   not_collected       — no online payment recorded by this system: every
--                         order placed before online payments (backfilled by
--                         the default below) and any order still created by
--                         the legacy place_order() before the checkout
--                         switch (P4).
--   paid / partially_refunded / refunded — orders created by
--                         finalize_paid_checkout() after a verified payment.
-- Adding the columns with defaults backfills existing rows; re-running is a
-- no-op. No customer UPDATE grant covers these columns (orders UPDATE is
-- column-level: status/updated_at only).
alter table public.orders add column if not exists currency text not null default 'USD';
alter table public.orders add column if not exists payment_status text not null default 'not_collected';
alter table public.orders add column if not exists checkout_session_id uuid;

-- One checkout can produce at most one order.
create unique index if not exists orders_checkout_session_id_key
  on public.orders (checkout_session_id);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass and conname = 'orders_currency_check') then
    alter table public.orders
      add constraint orders_currency_check check (currency = 'USD');
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass and conname = 'orders_payment_status_check') then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in ('paid', 'partially_refunded', 'refunded', 'not_collected'));
  end if;

  -- Legacy/not-collected orders never have a checkout session; every
  -- session-backed order carries a collected-payment status.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass and conname = 'orders_payment_session_consistency') then
    alter table public.orders
      add constraint orders_payment_session_consistency
      check ((payment_status = 'not_collected') = (checkout_session_id is null));
  end if;

  -- A session-backed order must match its session's customer, total and
  -- currency (MATCH SIMPLE: rows with a NULL checkout_session_id — legacy
  -- orders — are not checked).
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass and conname = 'orders_checkout_session_identity_fkey') then
    alter table public.orders
      add constraint orders_checkout_session_identity_fkey
      foreign key (checkout_session_id, user_id, total, currency)
      references public.checkout_sessions (id, user_id, total, currency);
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.checkout_sessions'::regclass and conname = 'checkout_sessions_order_id_fkey') then
    alter table public.checkout_sessions
      add constraint checkout_sessions_order_id_fkey
      foreign key (order_id) references public.orders (id);
  end if;
end;
$$;

-- ---- Row Level Security ----------------------------------------------------
alter table public.checkout_sessions enable row level security;
alter table public.checkout_session_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- Customers read only their own sessions/items/payments; the admin reads all.
-- There are no INSERT/UPDATE/DELETE policies: nobody writes these tables
-- except the SECURITY DEFINER functions below.
drop policy if exists "checkout_sessions_select_own_or_admin" on public.checkout_sessions;
create policy "checkout_sessions_select_own_or_admin" on public.checkout_sessions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "checkout_session_items_select_via_session" on public.checkout_session_items;
create policy "checkout_session_items_select_via_session" on public.checkout_session_items
  for select using (
    exists (
      select 1 from public.checkout_sessions s
      where s.id = checkout_session_items.checkout_session_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin" on public.payments
  for select using (user_id = auth.uid() or public.is_admin());

-- Audit data: admin only, never customers.
drop policy if exists "payment_events_select_admin" on public.payment_events;
create policy "payment_events_select_admin" on public.payment_events
  for select using (public.is_admin());

-- ---- Table privileges ------------------------------------------------------
-- Revoke everything first (Supabase's default privileges can grant new
-- public tables to anon/authenticated/service_role directly), then grant
-- SELECT only. No role gets INSERT/UPDATE/DELETE — including service_role.
revoke all on table public.checkout_sessions      from public, anon, authenticated, service_role;
revoke all on table public.checkout_session_items from public, anon, authenticated, service_role;
revoke all on table public.payments               from public, anon, authenticated, service_role;
revoke all on table public.payment_events         from public, anon, authenticated, service_role;

grant select on public.checkout_sessions, public.checkout_session_items, public.payments, public.payment_events
  to authenticated, service_role;

-- ============================================================================
-- begin_checkout(): reserve stock into a checkout session (customer RPC)
--
-- Took over the FIRST half of the legacy place_order() (since dropped) for
-- the online-payment flow, with the same validation and the same locking
-- (cart_items + products locked together, products in id order). Differences: it creates a
-- checkout_session instead of an order, does NOT clear the cart, and is
-- idempotent on (customer, p_idempotency_key).
--
-- Concurrency: the per-user advisory lock serializes a customer's checkout
-- calls, so "same key returns the same session" and "one awaiting session
-- per customer" are decided without races; the partial unique index is the
-- backstop. Stock is decremented under the product row locks, so two
-- customers can never both reserve the last unit.
--
-- Errors (raised, transaction rolled back, nothing reserved):
--   AUTH_REQUIRED, IDEMPOTENCY_KEY_REQUIRED, ADDRESS_NOT_FOUND, CART_EMPTY,
--   PRODUCT_UNAVAILABLE:<product_id>, INSUFFICIENT_STOCK:<product_id>,
--   INVALID_TOTAL (a zero-value cart cannot be paid online),
--   CHECKOUT_IN_PROGRESS:<checkout_session_id> (another payment-in-progress
--   checkout exists; the app offers resume/cancel).
-- ============================================================================
create or replace function public.begin_checkout(p_address_id uuid, p_idempotency_key uuid)
returns table (
  checkout_session_id uuid,
  session_status      text,
  amount_minor        bigint,
  currency            text,
  reserved_until      timestamptz,
  reused              boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- Reservation window approved for the first Safepay sandbox phase.
  c_hold constant interval := interval '60 minutes';
  v_user_id     uuid := auth.uid();
  v_session     public.checkout_sessions%rowtype;
  v_address     jsonb;
  v_subtotal    numeric(10, 2) := 0;
  v_item        record;
  v_has_items   boolean := false;
  -- Later statements touch exactly the validated/locked products, never
  -- cart rows added concurrently.
  v_product_ids uuid[] := '{}';
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));

  -- Idempotent replay: same customer + key returns the existing session
  -- (whatever its state) and reserves nothing.
  select s.* into v_session
  from public.checkout_sessions s
  where s.user_id = v_user_id and s.idempotency_key = p_idempotency_key;

  if found then
    return query select v_session.id, v_session.status, v_session.amount_minor,
                        v_session.currency, v_session.reserved_until, true;
    return;
  end if;

  select s.* into v_session
  from public.checkout_sessions s
  where s.user_id = v_user_id and s.status = 'awaiting_payment';

  if found then
    raise exception 'CHECKOUT_IN_PROGRESS:%', v_session.id;
  end if;

  select jsonb_build_object(
    'full_name', a.full_name,
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
  if v_subtotal <= 0 then
    raise exception 'INVALID_TOTAL';
  end if;

  -- total = subtotal until a shipping/tax model exists; amount_minor is
  -- derived here from the database total, never accepted from a caller.
  insert into public.checkout_sessions
    (user_id, status, currency, subtotal, total, amount_minor, shipping_address,
     idempotency_key, reserved_until)
  values
    (v_user_id, 'awaiting_payment', 'USD', v_subtotal, v_subtotal, (v_subtotal * 100)::bigint,
     v_address, p_idempotency_key, now() + c_hold)
  returning * into v_session;

  insert into public.checkout_session_items
    (checkout_session_id, product_id, product_name, unit_price, quantity, subtotal)
  select v_session.id, p.id, p.name, p.price, c.quantity, p.price * c.quantity
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.user_id = v_user_id
    and c.product_id = any(v_product_ids);

  -- The reservation: the only stock decrement in this flow.
  update public.products p
  set stock = p.stock - c.quantity
  from public.cart_items c
  where c.product_id = p.id and c.user_id = v_user_id
    and c.product_id = any(v_product_ids);

  return query select v_session.id, v_session.status, v_session.amount_minor,
                      v_session.currency, v_session.reserved_until, false;
end;
$$;

revoke all on function public.begin_checkout(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.begin_checkout(uuid, uuid) to authenticated;

-- ============================================================================
-- create_payment_attempt(): open (or reuse) a payment attempt — server only
--
-- Amount and currency are copied from the session (and the composite
-- foreign key keeps them equal); the caller supplies only the session id
-- and the provider slug. If an unsettled attempt already exists for the same
-- provider it is returned (reused = true) so a retried/duplicated request
-- never opens a second live provider payment.
--
-- Errors: INVALID_PROVIDER, CHECKOUT_SESSION_NOT_FOUND,
--   CHECKOUT_SESSION_NOT_PAYABLE:<status>, RESERVATION_EXPIRED,
--   OPEN_ATTEMPT_OTHER_PROVIDER:<payment_id>.
-- ============================================================================
create or replace function public.create_payment_attempt(p_checkout_session_id uuid, p_provider text)
returns table (
  payment_id          uuid,
  amount_minor        bigint,
  currency            text,
  payment_status      text,
  provider_payment_id text,
  reused              boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_session public.checkout_sessions%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_provider is null or p_provider !~ '^[a-z][a-z0-9_]{1,31}$' then
    raise exception 'INVALID_PROVIDER';
  end if;

  select s.user_id into v_user_id
  from public.checkout_sessions s where s.id = p_checkout_session_id;
  if v_user_id is null then
    raise exception 'CHECKOUT_SESSION_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));

  select s.* into v_session
  from public.checkout_sessions s where s.id = p_checkout_session_id
  for update;

  if v_session.status <> 'awaiting_payment' then
    raise exception 'CHECKOUT_SESSION_NOT_PAYABLE:%', v_session.status;
  end if;
  if v_session.reserved_until <= now() then
    raise exception 'RESERVATION_EXPIRED';
  end if;

  select p.* into v_payment
  from public.payments p
  where p.checkout_session_id = v_session.id
    and p.status in ('pending', 'processing', 'failed')
  for update;

  if found then
    if v_payment.provider <> p_provider then
      raise exception 'OPEN_ATTEMPT_OTHER_PROVIDER:%', v_payment.id;
    end if;
    return query select v_payment.id, v_payment.amount_minor, v_payment.currency,
                        v_payment.status, v_payment.provider_payment_id, true;
    return;
  end if;

  insert into public.payments
    (checkout_session_id, user_id, provider, amount_minor, currency, status)
  values
    (v_session.id, v_session.user_id, p_provider, v_session.amount_minor, v_session.currency, 'pending')
  returning * into v_payment;

  return query select v_payment.id, v_payment.amount_minor, v_payment.currency,
                      v_payment.status, v_payment.provider_payment_id, false;
end;
$$;

revoke all on function public.create_payment_attempt(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.create_payment_attempt(uuid, text) to service_role;

-- ============================================================================
-- attach_provider_payment(): bind the provider's payment id — server only
--
-- Idempotent for the same id; refuses a different provider, a different id
-- for an already-bound payment, an id already used by another payment, and
-- binding anything but a pending attempt.
--
-- Errors: INVALID_PROVIDER_PAYMENT_ID, PAYMENT_NOT_FOUND, PROVIDER_MISMATCH,
--   PROVIDER_PAYMENT_ALREADY_BOUND, PAYMENT_NOT_BINDABLE:<status>,
--   PROVIDER_PAYMENT_ID_IN_USE.
-- ============================================================================
create or replace function public.attach_provider_payment(
  p_payment_id uuid,
  p_provider text,
  p_provider_payment_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_payment public.payments%rowtype;
begin
  if p_provider_payment_id is null or char_length(p_provider_payment_id) not between 1 and 255 then
    raise exception 'INVALID_PROVIDER_PAYMENT_ID';
  end if;

  select p.user_id into v_user_id from public.payments p where p.id = p_payment_id;
  if v_user_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));

  select p.* into v_payment from public.payments p where p.id = p_payment_id for update;

  if v_payment.provider is distinct from p_provider then
    raise exception 'PROVIDER_MISMATCH';
  end if;
  if v_payment.provider_payment_id is not null then
    if v_payment.provider_payment_id = p_provider_payment_id then
      return;
    end if;
    raise exception 'PROVIDER_PAYMENT_ALREADY_BOUND';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'PAYMENT_NOT_BINDABLE:%', v_payment.status;
  end if;

  begin
    update public.payments
    set provider_payment_id = p_provider_payment_id, updated_at = now()
    where id = v_payment.id;
  exception when unique_violation then
    raise exception 'PROVIDER_PAYMENT_ID_IN_USE';
  end;
end;
$$;

revoke all on function public.attach_provider_payment(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.attach_provider_payment(uuid, text, text) to service_role;

-- ============================================================================
-- record_payment_status(): controlled status transition — server only
--
-- Called with a GENERIC status the provider adapter derived from an
-- authoritative server-to-server lookup. Allowed transitions:
--
--   pending/processing/failed -> any of pending, processing, failed,
--                                cancelled, expired, paid, requires_review
--   cancelled/expired         -> paid (late success), requires_review
--   paid                      -> partially_refunded, refunded, requires_review
--   partially_refunded        -> partially_refunded, refunded, requires_review
--   refunded                  -> requires_review
--   requires_review           -> partially_refunded, refunded; paid only for
--                                the payment that owns an order (P6)
--
-- Anything else (e.g. paid -> failed) raises ILLEGAL_PAYMENT_TRANSITION, so a
-- confirmed payment can never silently become failed or cancelled. A
-- same-status call only refreshes last_checked_at and the optional fields.
--
-- Moving to 'paid' additionally requires the provider id to be bound and the
-- caller's verified amount/currency. If those do not EXACTLY match this
-- payment, or another payment of the same session is already settled, the
-- payment becomes requires_review instead (stored, not raised, so the
-- evidence survives) and the resulting status is returned.
--
-- Payments P6 (post-payment lifecycle), all from authoritative lookups only:
--   * A refund reported for a payment that never settled (pending/processing/
--     failed) is ILLEGAL (it used to hit the settled-needs-paid_at CHECK
--     instead); the application sends it to review.
--   * A refund reported for a payment under review that cannot be a settled
--     payment of its checkout (never captured, or another payment of the
--     checkout is the settled one, e.g. a refunded duplicate charge) keeps it
--     in requires_review and returns 'requires_review'; the observed refund
--     is visible in payments.provider_state.
--   * requires_review -> paid only for the payment whose order already exists
--     (e.g. a dispute the provider resolved back to paid), with the same
--     exact amount/currency checks. It never creates a second order.
-- The order's payment_status mirrors its own payment's paid / refund /
-- review state. The fulfilment status (orders.status) and stock are never
-- touched here.
-- ============================================================================
create or replace function public.record_payment_status(
  p_payment_id            uuid,
  p_status                text,
  p_verified_amount_minor bigint default null,
  p_verified_currency     text default null,
  p_failure_code          text default null,
  p_failure_message       text default null,
  p_display_summary       jsonb default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_payment public.payments%rowtype;
  v_from    text;
  v_allowed boolean;
begin
  if p_status is null or p_status not in ('pending', 'processing', 'paid', 'failed', 'cancelled',
                                          'expired', 'refunded', 'partially_refunded', 'requires_review') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  select p.user_id into v_user_id from public.payments p where p.id = p_payment_id;
  if v_user_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));

  select p.* into v_payment from public.payments p where p.id = p_payment_id for update;
  v_from := v_payment.status;

  if p_status = v_from then
    update public.payments
    set last_checked_at = now(),
        updated_at      = now(),
        failure_code    = coalesce(p_failure_code, failure_code),
        failure_message = coalesce(p_failure_message, failure_message),
        display_summary = coalesce(p_display_summary, display_summary)
    where id = v_payment.id;
    return v_from;
  end if;

  v_allowed := case
    when v_from in ('pending', 'processing', 'failed') then p_status not in ('partially_refunded', 'refunded')
    when v_from in ('cancelled', 'expired') then p_status in ('paid', 'requires_review')
    when v_from = 'paid' then p_status in ('partially_refunded', 'refunded', 'requires_review')
    when v_from = 'partially_refunded' then p_status in ('refunded', 'requires_review')
    when v_from = 'refunded' then p_status = 'requires_review'
    when v_from = 'requires_review' then p_status in ('partially_refunded', 'refunded')
                                          or (p_status = 'paid' and v_payment.order_id is not null)
    else false
  end;

  if not v_allowed then
    raise exception 'ILLEGAL_PAYMENT_TRANSITION:%->%', v_from, p_status;
  end if;

  if v_from = 'requires_review' and p_status in ('partially_refunded', 'refunded')
     and (v_payment.paid_at is null or exists (
       select 1 from public.payments o
       where o.checkout_session_id = v_payment.checkout_session_id
         and o.id <> v_payment.id
         and o.status in ('paid', 'partially_refunded', 'refunded'))) then
    update public.payments
    set last_checked_at = now(), updated_at = now()
    where id = v_payment.id;
    return 'requires_review';
  end if;

  if p_status = 'paid' then
    if v_payment.provider_payment_id is null then
      raise exception 'PAYMENT_NOT_BOUND';
    end if;
    if p_verified_amount_minor is null or p_verified_currency is null then
      raise exception 'VERIFICATION_REQUIRED';
    end if;

    if p_verified_amount_minor <> v_payment.amount_minor
       or p_verified_currency <> v_payment.currency then
      update public.payments
      set status          = 'requires_review',
          failure_code    = case when p_verified_currency <> v_payment.currency
                                 then 'CURRENCY_MISMATCH' else 'AMOUNT_MISMATCH' end,
          failure_message = 'Verified provider amount or currency does not match the expected payment.',
          last_checked_at = now(),
          updated_at      = now()
      where id = v_payment.id;
      return 'requires_review';
    end if;

    if exists (
      select 1 from public.payments o
      where o.checkout_session_id = v_payment.checkout_session_id
        and o.id <> v_payment.id
        and o.status in ('paid', 'partially_refunded', 'refunded')
    ) then
      update public.payments
      set status          = 'requires_review',
          failure_code    = 'DUPLICATE_PAYMENT',
          failure_message = 'Another payment for this checkout was already completed.',
          paid_at         = coalesce(paid_at, now()),
          last_checked_at = now(),
          updated_at      = now()
      where id = v_payment.id;
      return 'requires_review';
    end if;

    update public.payments
    set status          = 'paid',
        paid_at         = coalesce(paid_at, now()),
        failure_code    = null,
        failure_message = null,
        display_summary = coalesce(p_display_summary, display_summary),
        last_checked_at = now(),
        updated_at      = now()
    where id = v_payment.id;

    if v_payment.order_id is not null then
      update public.orders
      set payment_status = 'paid', updated_at = now()
      where id = v_payment.order_id and payment_status <> 'paid';
    end if;
    return 'paid';
  end if;

  update public.payments
  set status          = p_status,
      failure_code    = coalesce(p_failure_code, failure_code),
      failure_message = coalesce(p_failure_message, failure_message),
      display_summary = coalesce(p_display_summary, display_summary),
      last_checked_at = now(),
      updated_at      = now()
  where id = v_payment.id;

  if p_status in ('partially_refunded', 'refunded', 'requires_review') and v_payment.order_id is not null then
    update public.orders
    set payment_status = p_status, updated_at = now()
    where id = v_payment.order_id;
  end if;

  return p_status;
end;
$$;

revoke all on function public.record_payment_status(uuid, text, bigint, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_payment_status(uuid, text, bigint, text, text, text, jsonb) to service_role;

-- ============================================================================
-- finalize_paid_checkout(): create the real order — server only
--
-- The ONLY way an order is created for an online payment. Called after the
-- application verified the payment with the provider (record_payment_status
-- -> 'paid'); this function re-checks every database-side invariant itself.
-- One transaction; idempotent:
--
--   outcome 'created'           order created now
--   outcome 'already_finalized' this payment's order already exists — the
--                               same order id is returned (redirect +
--                               webhook racing, retries)
--   outcome 'duplicate_payment' the session was already completed by a
--                               different payment; this one is moved to
--                               requires_review for a refund, no order
--   outcome 'rejected'          amount/currency/customer/items disagree;
--                               payment -> requires_review, no order
--   outcome 'payment_conflict'  late payment after the reservation was
--                               released and the stock is gone; session ->
--                               payment_conflict, payment -> requires_review,
--                               no order
--
-- Stock: normally untouched (begin_checkout already reserved it). Only for
-- a late payment on a released session does it try to reserve the same
-- items again — atomically, under product row locks in id order, inside
-- this same transaction, so there is no window where the order exists
-- without its stock (that is why late re-reservation lives here rather than
-- in a separate function).
--
-- Cart: subtracts exactly the paid quantities from the customer's CURRENT
-- cart (rows locked in product-id order); quantities added after payment
-- started, and unrelated items, stay.
--
-- Raises (no state change): PAYMENT_NOT_FOUND, PAYMENT_NOT_PAID:<status>.
-- ============================================================================
create or replace function public.finalize_paid_checkout(p_payment_id uuid)
returns table (order_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id    uuid;
  v_session_id uuid;
  v_session    public.checkout_sessions%rowtype;
  v_payment    public.payments%rowtype;
  v_order_id   uuid;
  v_items_sum  numeric(10, 2);
  v_blocked    boolean;
begin
  select p.user_id, p.checkout_session_id into v_user_id, v_session_id
  from public.payments p where p.id = p_payment_id;
  if v_user_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));

  select s.* into v_session from public.checkout_sessions s where s.id = v_session_id for update;
  select p.* into v_payment from public.payments p where p.id = p_payment_id for update;

  -- Already finalized: return the same order for this payment; any other
  -- settled payment for a completed session is a duplicate charge.
  if v_session.order_id is not null then
    if v_payment.order_id = v_session.order_id then
      return query select v_session.order_id, 'already_finalized'::text;
      return;
    end if;
    if v_payment.status = 'paid' then
      update public.payments
      set status          = 'requires_review',
          failure_code    = 'DUPLICATE_PAYMENT',
          failure_message = 'Another payment for this checkout was already completed.',
          updated_at      = now()
      where id = v_payment.id;
    end if;
    return query select null::uuid, 'duplicate_payment'::text;
    return;
  end if;

  if v_payment.status <> 'paid' then
    raise exception 'PAYMENT_NOT_PAID:%', v_payment.status;
  end if;

  if v_session.status = 'payment_conflict' then
    return query select null::uuid, 'payment_conflict'::text;
    return;
  end if;

  -- Database-side re-verification. The composite foreign key already ties
  -- payment amount/currency/customer to the session; these checks also
  -- cover the session's own totals and its item snapshots.
  select coalesce(sum(i.subtotal), 0) into v_items_sum
  from public.checkout_session_items i where i.checkout_session_id = v_session.id;

  if v_payment.user_id <> v_session.user_id
     or v_payment.currency <> v_session.currency
     or v_payment.amount_minor <> v_session.amount_minor
     or v_session.amount_minor::numeric <> v_session.total * 100
     or v_items_sum <> v_session.subtotal
     or v_session.total <> v_session.subtotal then
    update public.payments
    set status          = 'requires_review',
        failure_code    = 'FINALIZE_INTEGRITY_MISMATCH',
        failure_message = 'Payment does not match the checkout it was made for.',
        updated_at      = now()
    where id = v_payment.id;
    return query select null::uuid, 'rejected'::text;
    return;
  end if;

  if v_session.status in ('expired', 'cancelled') then
    -- Late payment: the reservation was released. Re-reserve atomically or
    -- record the conflict.
    perform 1
    from public.products p
    where p.id in (
      select i.product_id from public.checkout_session_items i
      where i.checkout_session_id = v_session.id and i.product_id is not null
    )
    order by p.id
    for update;

    select exists (
      select 1
      from public.checkout_session_items i
      left join public.products p on p.id = i.product_id
      where i.checkout_session_id = v_session.id
        and (p.id is null or not p.is_active or p.stock < i.quantity)
    ) into v_blocked;

    if v_blocked then
      update public.checkout_sessions
      set status = 'payment_conflict', updated_at = now()
      where id = v_session.id;
      update public.payments
      set status          = 'requires_review',
          failure_code    = 'STOCK_UNAVAILABLE_AFTER_RELEASE',
          failure_message = 'Payment arrived after the reservation was released and the items are no longer available.',
          updated_at      = now()
      where id = v_payment.id;
      return query select null::uuid, 'payment_conflict'::text;
      return;
    end if;

    update public.products p
    set stock = p.stock - i.quantity
    from public.checkout_session_items i
    where i.checkout_session_id = v_session.id and i.product_id = p.id;
  elsif v_session.status <> 'awaiting_payment' then
    raise exception 'CHECKOUT_SESSION_NOT_FINALIZABLE:%', v_session.status;
  end if;

  insert into public.orders
    (user_id, status, subtotal, total, shipping_address, currency, payment_status, checkout_session_id)
  values
    (v_session.user_id, 'pending', v_session.subtotal, v_session.total, v_session.shipping_address,
     v_session.currency, 'paid', v_session.id)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
  select v_order_id, i.product_id, i.product_name, i.unit_price, i.quantity, i.subtotal
  from public.checkout_session_items i
  where i.checkout_session_id = v_session.id;

  -- Cart delta. Lock the affected cart rows in product-id order, delete
  -- rows fully covered by the paid quantity FIRST, then reduce the rest
  -- (the other order would let a just-reduced row match the delete).
  perform 1
  from public.cart_items c
  where c.user_id = v_session.user_id
    and c.product_id in (
      select i.product_id from public.checkout_session_items i
      where i.checkout_session_id = v_session.id and i.product_id is not null
    )
  order by c.product_id
  for update;

  delete from public.cart_items c
  using public.checkout_session_items i
  where i.checkout_session_id = v_session.id
    and c.user_id = v_session.user_id
    and c.product_id = i.product_id
    and c.quantity <= i.quantity;

  update public.cart_items c
  set quantity = c.quantity - i.quantity, updated_at = now()
  from public.checkout_session_items i
  where i.checkout_session_id = v_session.id
    and c.user_id = v_session.user_id
    and c.product_id = i.product_id
    and c.quantity > i.quantity;

  update public.checkout_sessions
  set status = 'completed', order_id = v_order_id, updated_at = now()
  where id = v_session.id;

  update public.payments
  set order_id = v_order_id, updated_at = now()
  where id = v_payment.id;

  return query select v_order_id, 'created'::text;
end;
$$;

revoke all on function public.finalize_paid_checkout(uuid) from public, anon, authenticated, service_role;
grant execute on function public.finalize_paid_checkout(uuid) to service_role;

-- ============================================================================
-- release_checkout_session(): return a reservation — server only
--
-- Called only after the application has confirmed with the provider that
-- no payment succeeded. Restores exactly the reserved quantities once,
-- closes any unsettled attempts with the same reason, leaves the cart
-- untouched. Returns the new status, or 'noop:<status>' if the session was
-- no longer awaiting payment (already released, completed or in conflict)
-- — releasing twice never restores stock twice.
--
-- Errors: INVALID_RELEASE_REASON, CHECKOUT_SESSION_NOT_FOUND,
--   RESERVATION_NOT_EXPIRED ('expired' before reserved_until),
--   PAYMENT_ALREADY_SETTLED (a settled payment exists: finalize instead).
-- ============================================================================
create or replace function public.release_checkout_session(p_checkout_session_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session public.checkout_sessions%rowtype;
begin
  if p_reason is null or p_reason not in ('expired', 'cancelled') then
    raise exception 'INVALID_RELEASE_REASON';
  end if;

  select s.user_id into v_user_id from public.checkout_sessions s where s.id = p_checkout_session_id;
  if v_user_id is null then
    raise exception 'CHECKOUT_SESSION_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));

  select s.* into v_session from public.checkout_sessions s where s.id = p_checkout_session_id for update;

  if v_session.status <> 'awaiting_payment' then
    return 'noop:' || v_session.status;
  end if;
  if p_reason = 'expired' and v_session.reserved_until > now() then
    raise exception 'RESERVATION_NOT_EXPIRED';
  end if;

  perform 1 from public.payments p
  where p.checkout_session_id = v_session.id
  order by p.id
  for update;

  if exists (
    select 1 from public.payments p
    where p.checkout_session_id = v_session.id
      and p.status in ('paid', 'partially_refunded', 'refunded')
  ) then
    raise exception 'PAYMENT_ALREADY_SETTLED';
  end if;

  perform 1
  from public.products p
  where p.id in (
    select i.product_id from public.checkout_session_items i
    where i.checkout_session_id = v_session.id and i.product_id is not null
  )
  order by p.id
  for update;

  update public.products p
  set stock = p.stock + i.quantity
  from public.checkout_session_items i
  where i.checkout_session_id = v_session.id and i.product_id = p.id;

  update public.checkout_sessions
  set status = p_reason, updated_at = now()
  where id = v_session.id;

  update public.payments
  set status = p_reason, updated_at = now()
  where checkout_session_id = v_session.id
    and status in ('pending', 'processing', 'failed');

  return p_reason;
end;
$$;

revoke all on function public.release_checkout_session(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.release_checkout_session(uuid, text) to service_role;

-- ============================================================================
-- record_payment_event() / mark_payment_event_processed() — server only
--
-- record_payment_event() stores an incoming webhook/verification event and
-- reports whether a signature-verified event with the same provider event id
-- was already recorded (duplicate = true -> the caller acknowledges and does
-- nothing else). Unverified events are always stored as new rows with
-- outcome 'rejected_signature' and never deduplicate anything.
-- ============================================================================
create or replace function public.record_payment_event(
  p_provider          text,
  p_provider_event_id text,
  p_event_type        text,
  p_signature_valid   boolean,
  p_payment_id        uuid default null,
  p_details           jsonb default '{}'::jsonb
)
returns table (event_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if p_signature_valid is null then
    raise exception 'SIGNATURE_RESULT_REQUIRED';
  end if;

  if not p_signature_valid then
    insert into public.payment_events
      (provider, provider_event_id, payment_id, event_type, signature_valid, outcome, details, processed_at)
    values
      (p_provider, p_provider_event_id, p_payment_id, p_event_type, false, 'rejected_signature',
       coalesce(p_details, '{}'::jsonb), now())
    returning id into v_id;
    return query select v_id, false;
    return;
  end if;

  insert into public.payment_events
    (provider, provider_event_id, payment_id, event_type, signature_valid, details)
  values
    (p_provider, p_provider_event_id, p_payment_id, p_event_type, true, coalesce(p_details, '{}'::jsonb))
  on conflict (provider, provider_event_id) where signature_valid do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  select e.id into v_id
  from public.payment_events e
  where e.provider = p_provider and e.provider_event_id = p_provider_event_id and e.signature_valid;
  return query select v_id, true;
end;
$$;

create or replace function public.mark_payment_event_processed(
  p_event_id   uuid,
  p_outcome    text,
  p_payment_id uuid default null,
  p_details    jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome is null or p_outcome not in ('processed', 'ignored', 'verification_failed', 'error') then
    raise exception 'INVALID_EVENT_OUTCOME';
  end if;

  update public.payment_events
  set outcome      = p_outcome,
      processed_at = now(),
      payment_id   = coalesce(p_payment_id, payment_id),
      details      = coalesce(p_details, details)
  where id = p_event_id;

  if not found then
    raise exception 'PAYMENT_EVENT_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.record_payment_event(text, text, text, boolean, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_payment_event(text, text, text, boolean, uuid, jsonb) to service_role;
revoke all on function public.mark_payment_event_processed(uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.mark_payment_event_processed(uuid, text, uuid, jsonb) to service_role;

-- ============================================================================
-- Payments P5 — reconciliation of expired checkouts and unprocessed events
--
-- Two operational gaps closed here, without changing any P1 invariant:
--   1. an abandoned checkout keeps its 60-minute stock reservation until
--      something acts on it;
--   2. a webhook event is recorded before it is processed (the webhook route
--      acknowledges first), so a crash/downstream failure can leave it
--      unprocessed or errored.
--
-- These functions only CLAIM work. Deciding what to do — always after an
-- authoritative provider lookup — stays in the application's payment service,
-- which then uses the existing P1 functions (finalize_paid_checkout,
-- release_checkout_session, record_payment_status, mark_payment_event_
-- processed). Reaching reserved_until never releases stock by itself.
--
-- Claiming: `for update skip locked` + a lease. Each claim sets a retry time
-- (exponential backoff, capped) on the claimed rows in the same statement, so
-- overlapping workers never pick the same row, and a worker that dies simply
-- lets its lease lapse. Everything downstream is idempotent anyway; the claim
-- prevents duplicate provider calls, it is not what keeps money/stock safe.
-- ============================================================================

alter table public.checkout_sessions add column if not exists reconcile_after timestamptz;
alter table public.checkout_sessions add column if not exists reconcile_attempts integer not null default 0;
alter table public.payment_events add column if not exists process_attempts integer not null default 0;
alter table public.payment_events add column if not exists next_attempt_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.checkout_sessions'::regclass and conname = 'checkout_sessions_reconcile_attempts_check') then
    alter table public.checkout_sessions
      add constraint checkout_sessions_reconcile_attempts_check check (reconcile_attempts >= 0);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.payment_events'::regclass and conname = 'payment_events_process_attempts_check') then
    alter table public.payment_events
      add constraint payment_events_process_attempts_check check (process_attempts >= 0);
  end if;
end;
$$;

-- Authentic events still waiting for (successful) processing.
create index if not exists payment_events_recoverable_idx
  on public.payment_events (received_at, id)
  where signature_valid and outcome in ('received', 'error');

-- ---- claim_expired_checkouts() ---------------------------------------------
-- Up to p_limit checkouts whose reservation deadline has passed and that are
-- due for (another) reconciliation attempt, oldest deadline first. Checkouts
-- with a payment under manual review are left alone (stock stays reserved for
-- the reviewer). Each claimed row's next attempt is pushed out by
-- min(1 min * 2^attempts, 30 min).
create or replace function public.claim_expired_checkouts(p_limit integer)
returns table (checkout_session_id uuid, reconcile_attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_LIMIT';
  end if;

  return query
  with due as (
    select s.id
    from public.checkout_sessions s
    where s.status = 'awaiting_payment'
      and s.reserved_until <= now()
      and (s.reconcile_after is null or s.reconcile_after <= now())
      and not exists (
        select 1 from public.payments p
        where p.checkout_session_id = s.id and p.status = 'requires_review'
      )
    order by s.reserved_until, s.id
    limit p_limit
    for update of s skip locked
  )
  update public.checkout_sessions s
  set reconcile_attempts = s.reconcile_attempts + 1,
      reconcile_after = now() + least(interval '30 minutes', interval '1 minute' * power(2, least(s.reconcile_attempts, 5)))
  from due
  where s.id = due.id
  returning s.id, s.reconcile_attempts;
end;
$$;

-- ---- claim_recoverable_payment_events() ------------------------------------
-- Up to p_limit AUTHENTIC events that were recorded but never processed
-- (outcome 'received', older than p_min_age so the webhook's own after-
-- response processing has had its chance) or whose processing failed
-- (outcome 'error'), with fewer than p_max_attempts recovery attempts and due
-- for retry. Unauthenticated (signature_valid = false) rows are never
-- returned. Only identifiers recorded at receipt are returned — never raw
-- request data.
create or replace function public.claim_recoverable_payment_events(
  p_limit        integer,
  p_min_age      interval,
  p_max_attempts integer
)
returns table (
  event_id          uuid,
  provider          text,
  provider_event_id text,
  event_type        text,
  payment_id        uuid,
  details           jsonb,
  process_attempts  integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_LIMIT';
  end if;
  if p_min_age is null or p_min_age < interval '0' or p_max_attempts is null or p_max_attempts < 1 then
    raise exception 'INVALID_ARGUMENT';
  end if;

  return query
  with due as (
    select e.id
    from public.payment_events e
    where e.signature_valid
      and e.outcome in ('received', 'error')
      and e.received_at <= now() - p_min_age
      and e.process_attempts < p_max_attempts
      and (e.next_attempt_at is null or e.next_attempt_at <= now())
    order by e.received_at, e.id
    limit p_limit
    for update of e skip locked
  )
  update public.payment_events e
  set process_attempts = e.process_attempts + 1,
      next_attempt_at = now() + least(interval '30 minutes', interval '1 minute' * power(2, least(e.process_attempts, 5))),
      last_claimed_at = now()
  from due
  where e.id = due.id
  returning e.id, e.provider, e.provider_event_id, e.event_type, e.payment_id, e.details, e.process_attempts;
end;
$$;

revoke all on function public.claim_expired_checkouts(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_expired_checkouts(integer) to service_role;
revoke all on function public.claim_recoverable_payment_events(integer, interval, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_recoverable_payment_events(integer, interval, integer) to service_role;

-- ============================================================================
-- Payments P6 — payment operations: provider state, review notes, manual retry
--
-- Operational support for exceptional payments, without any new way to move
-- money or to set a payment status by hand:
--   * payments.provider_state — what the provider itself last reported in an
--     AUTHORITATIVE lookup (finer than the generic status: reversed / voided /
--     disputed all mean status 'requires_review'). Written only by
--     record_provider_state(), server only. An observation, never a decision.
--   * orders.payment_status may also be 'requires_review': the order's own
--     payment is under review (dispute, reversal, mismatch...). Kept in sync by
--     record_payment_status(). The fulfilment status is separate and never
--     changed by payment events.
--   * payment_review_notes — append-only admin acknowledgements/notes on a
--     payment or an event. Written only through admin_record_payment_review(),
--     which checks is_admin() and snapshots the CURRENT state from the
--     database (never from the caller). It never changes a payment, an order
--     or stock.
--   * claim_payment_event_for_retry() — an admin-requested retry of ONE
--     recorded authentic event, with the same lease semantics as the P5 claim.
--     Processing then re-runs the normal path (authoritative lookup).
-- ============================================================================

alter table public.payments add column if not exists provider_state text;
alter table public.payments add column if not exists provider_state_at timestamptz;
alter table public.payment_events add column if not exists last_claimed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.payments'::regclass and conname = 'payments_provider_state_check') then
    alter table public.payments
      add constraint payments_provider_state_check
      check (provider_state is null or provider_state in (
        'pending', 'processing', 'paid', 'failed', 'cancelled', 'expired',
        'refunded', 'partially_refunded', 'reversed', 'voided', 'disputed', 'review'));
  end if;

  -- Widen orders.payment_status (P1) by one value. Re-runnable: only
  -- replaced while the old definition is still in place.
  if exists (select 1 from pg_constraint
             where conrelid = 'public.orders'::regclass and conname = 'orders_payment_status_check'
               and pg_get_constraintdef(oid) not like '%requires_review%') then
    alter table public.orders drop constraint orders_payment_status_check;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass and conname = 'orders_payment_status_check') then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in ('paid', 'partially_refunded', 'refunded', 'requires_review', 'not_collected'));
  end if;
end;
$$;

-- Admin payment lists: newest first within a status.
create index if not exists payments_status_created_idx on public.payments (status, created_at desc, id);

-- ---- record_provider_state() ------------------------------------------------
-- Stores the provider's reported state from an authoritative lookup. Never
-- changes payments.status (record_payment_status() owns transitions).
create or replace function public.record_provider_state(p_payment_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state is null or p_state not in ('pending', 'processing', 'paid', 'failed', 'cancelled', 'expired',
                                        'refunded', 'partially_refunded', 'reversed', 'voided', 'disputed', 'review') then
    raise exception 'INVALID_PROVIDER_STATE';
  end if;

  update public.payments
  set provider_state = p_state, provider_state_at = now()
  where id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.record_provider_state(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.record_provider_state(uuid, text) to service_role;

-- ---- payment_review_notes ---------------------------------------------------
-- One row per admin acknowledgement/note, about exactly one payment or one
-- event. snapshot_* is the subject's state when the note was written (taken
-- by the function, not supplied by the admin): an item counts as handled only
-- while its current state still equals the latest note's snapshot, so a new
-- provider development re-opens it.
create table if not exists public.payment_review_notes (
  id                      uuid primary key default gen_random_uuid(),
  payment_id              uuid references public.payments (id) on delete cascade,
  payment_event_id        uuid references public.payment_events (id) on delete cascade,
  reviewed_by             uuid references auth.users (id) on delete set null,
  resolution              text not null
                            check (resolution in ('acknowledged', 'customer_contacted', 'refund_handled_at_provider',
                                                  'fulfilled_manually', 'no_action_needed')),
  note                    text check (note is null or char_length(note) between 1 and 1000),
  snapshot_status         text not null check (char_length(snapshot_status) between 1 and 32),
  snapshot_code           text check (char_length(snapshot_code) <= 64),
  snapshot_provider_state text check (char_length(snapshot_provider_state) <= 32),
  created_at              timestamptz not null default now(),
  constraint payment_review_notes_one_subject
    check ((payment_id is null) <> (payment_event_id is null))
);

create index if not exists payment_review_notes_payment_idx
  on public.payment_review_notes (payment_id, created_at desc) where payment_id is not null;
create index if not exists payment_review_notes_event_idx
  on public.payment_review_notes (payment_event_id, created_at desc) where payment_event_id is not null;

alter table public.payment_review_notes enable row level security;

-- Internal operations data: admin only, never customers.
drop policy if exists "payment_review_notes_select_admin" on public.payment_review_notes;
create policy "payment_review_notes_select_admin" on public.payment_review_notes
  for select using (public.is_admin());

revoke all on table public.payment_review_notes from public, anon, authenticated, service_role;
grant select on public.payment_review_notes to authenticated, service_role;

-- ---- admin_record_payment_review() ------------------------------------------
-- Called with the ADMIN's own session (like admin_cancel_order()): is_admin()
-- is the authorization gate and must stay the first statement. Appends a note;
-- touches nothing else.
create or replace function public.admin_record_payment_review(
  p_payment_id uuid,
  p_event_id   uuid,
  p_resolution text,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_status text;
  v_code   text;
  v_state  text;
  v_note   text;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if (p_payment_id is null) = (p_event_id is null) then
    raise exception 'INVALID_REVIEW_SUBJECT';
  end if;
  if p_resolution is null or p_resolution not in ('acknowledged', 'customer_contacted', 'refund_handled_at_provider',
                                                  'fulfilled_manually', 'no_action_needed') then
    raise exception 'INVALID_RESOLUTION';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and (char_length(v_note) > 1000 or v_note ~ E'[\\x01-\\x09\\x0b-\\x1f\\x7f]') then
    raise exception 'INVALID_NOTE';
  end if;

  if p_payment_id is not null then
    select p.status, p.failure_code, p.provider_state into v_status, v_code, v_state
    from public.payments p where p.id = p_payment_id;
    if v_status is null then
      raise exception 'PAYMENT_NOT_FOUND';
    end if;
  else
    select e.outcome, e.process_attempts::text into v_status, v_code
    from public.payment_events e where e.id = p_event_id and e.signature_valid;
    if v_status is null then
      raise exception 'PAYMENT_EVENT_NOT_FOUND';
    end if;
  end if;

  insert into public.payment_review_notes
    (payment_id, payment_event_id, reviewed_by, resolution, note, snapshot_status, snapshot_code, snapshot_provider_state)
  values
    (p_payment_id, p_event_id, auth.uid(), p_resolution, v_note, v_status, v_code, v_state)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_record_payment_review(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_record_payment_review(uuid, uuid, text, text) to authenticated;

-- ---- claim_payment_event_for_retry() ----------------------------------------
-- Claims ONE authentic, not-yet-successfully-processed event for an
-- admin-requested retry — including events that exhausted automatic
-- recovery. Not claimable (returns no row): unauthenticated, already
-- processed/ignored/verification_failed, received under 2 minutes ago (the
-- webhook's own processing may still be running), claimed within the last
-- minute (a retry is in flight), or locked by a concurrent claim. The attempt
-- counter still increases, so a manual retry never re-enables automatic ones.
create or replace function public.claim_payment_event_for_retry(p_event_id uuid)
returns table (
  event_id          uuid,
  provider          text,
  provider_event_id text,
  event_type        text,
  payment_id        uuid,
  details           jsonb,
  process_attempts  integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select e.id
    from public.payment_events e
    where e.id = p_event_id
      and e.signature_valid
      and e.outcome in ('received', 'error')
      and e.received_at <= now() - interval '2 minutes'
      and (e.last_claimed_at is null or e.last_claimed_at <= now() - interval '1 minute')
    for update of e skip locked
  )
  update public.payment_events e
  set process_attempts = e.process_attempts + 1,
      last_claimed_at = now(),
      next_attempt_at = greatest(coalesce(e.next_attempt_at, now()), now() + interval '1 minute')
  from due
  where e.id = due.id
  returning e.id, e.provider, e.provider_event_id, e.event_type, e.payment_id, e.details, e.process_attempts;
end;
$$;

revoke all on function public.claim_payment_event_for_retry(uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_payment_event_for_retry(uuid) to service_role;

-- ============================================================================
-- Payments P7 — merchant refunds, refund ledger, privilege hardening
--
-- Refund contract this section is built on (verified against the Safepay
-- sandbox, see lib/payments/providers/safepay): a refund is one synchronous
-- provider call for an exact amount in minor units; partial refunds are
-- allowed and repeatable up to the captured amount; each successful refund
-- has its own provider id; the authoritative lookup lists every refund (with
-- a voided flag) and the remaining balance. There is NO provider idempotency
-- key, and the provider does NOT serialize concurrent refunds (two parallel
-- requests both succeeded past the remaining balance in the sandbox) — so
-- Nexora itself guarantees "one money-moving refund request per payment at a
-- time" and never repeats a request whose outcome is unknown.
--
--   admin_begin_payment_refund()  admin session: durable refund intent
--                                 ('requested'), all amount/eligibility checks,
--                                 idempotent on the form's key
--   record_refund_attempt()       server: what the provider ANSWERED (accepted
--                                 + its refund id / rejected / no answer) —
--                                 never a final state on its own
--   reconcile_payment_refunds()   server: the ONE place that confirms refunds,
--                                 from an AUTHORITATIVE provider lookup, and
--                                 derives the payment/order refund status from
--                                 the ledger
--   claim_open_refunds()          server: scheduled recovery of refunds whose
--                                 outcome is still open
--   get_own_order_refund_summary() customer: verified refunded total of their
--                                 own order, nothing else
--
-- Refund states:
--   requested               intent recorded; the provider may or may not have
--                           received the request yet
--   requires_reconciliation the request may have reached the provider but its
--                           outcome is unknown (timeout, lost response, crash)
--   succeeded               confirmed by an authoritative lookup (terminal,
--                           except that the provider can later void it)
--   voided                  a confirmed refund the provider reports as voided
--   failed                  the provider refused it, or an authoritative lookup
--                           long after the request shows no such refund
-- A succeeded refund never becomes failed. Refund history is never edited or
-- deleted (trigger below), and refunds never touch fulfilment status or stock.
-- ============================================================================

-- ---- payments: identity target for refunds ---------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.payments'::regclass and conname = 'payments_refund_identity_key') then
    alter table public.payments
      add constraint payments_refund_identity_key unique (id, provider, currency);
  end if;
end;
$$;

-- ---- payment_refunds ---------------------------------------------------------
-- One row per refund: Nexora-initiated (origin 'nexora', with the admin's
-- intent) or found at the provider without a Nexora request (origin
-- 'provider', e.g. issued from the provider's dashboard — recorded from the
-- authoritative lookup so totals are never understated). The composite
-- foreign key keeps provider and currency equal to the payment's.
create table if not exists public.payment_refunds (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null,
  order_id           uuid references public.orders (id),
  provider           text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_refund_id text check (provider_refund_id ~ '^[\x21-\x7e]{1,255}$'),
  amount_minor       bigint not null check (amount_minor > 0),
  currency           text not null check (currency = 'USD'),
  status             text not null default 'requested'
                       check (status in ('requested', 'requires_reconciliation', 'succeeded', 'voided', 'failed')),
  origin             text not null default 'nexora' check (origin in ('nexora', 'provider')),
  reason             text check (reason in ('customer_request', 'order_cancelled', 'duplicate_payment',
                                            'inventory_issue', 'other')),
  note               text check (char_length(note) between 1 and 500),
  requested_by       uuid references auth.users (id) on delete set null,
  idempotency_key    uuid,
  -- What the provider answered to the request (not a confirmation).
  provider_accepted  boolean not null default false,
  provider_rejected  boolean not null default false,
  failure_code       text check (char_length(failure_code) <= 64),
  submitted_at       timestamptz,
  completed_at       timestamptz,
  last_checked_at    timestamptz,
  reconcile_after    timestamptz,
  reconcile_attempts integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint payment_refunds_payment_identity_fkey
    foreign key (payment_id, provider, currency)
    references public.payments (id, provider, currency)
    on delete restrict,
  constraint payment_refunds_provider_refund_id_key unique (provider, provider_refund_id),
  constraint payment_refunds_idempotency_key_key unique (idempotency_key),
  -- Confirmed refunds always carry the provider's refund id and a time.
  constraint payment_refunds_confirmed_has_provider_id
    check (status not in ('succeeded', 'voided') or (provider_refund_id is not null and completed_at is not null)),
  -- Nexora refunds carry the admin's intent; provider-found ones are only
  -- ever recorded already confirmed.
  constraint payment_refunds_origin_shape
    check ((origin = 'nexora' and idempotency_key is not null and reason is not null and submitted_at is not null)
        or (origin = 'provider' and idempotency_key is null and reason is null and note is null
            and requested_by is null and status in ('succeeded', 'voided')))
);

-- At most one refund per payment whose outcome is still open: the guard
-- against double refunds (double clicks, two tabs, retries) given that the
-- provider neither deduplicates nor serializes refund requests.
create unique index if not exists payment_refunds_one_open_per_payment_idx
  on public.payment_refunds (payment_id)
  where status in ('requested', 'requires_reconciliation');

create index if not exists payment_refunds_payment_idx on public.payment_refunds (payment_id, created_at);
create index if not exists payment_refunds_order_idx on public.payment_refunds (order_id) where order_id is not null;
create index if not exists payment_refunds_open_idx
  on public.payment_refunds (reconcile_after)
  where status in ('requested', 'requires_reconciliation');

-- Refund history is append-only: identity, amount and intent never change,
-- terminal states stay terminal, a confirmed refund can only become voided,
-- and rows are never deleted. Applies to every role, including the
-- SECURITY DEFINER functions below.
create or replace function public.payment_refunds_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'REFUND_HISTORY_IMMUTABLE';
  end if;
  if new.id <> old.id or new.payment_id <> old.payment_id or new.provider <> old.provider
     or new.amount_minor <> old.amount_minor or new.currency <> old.currency or new.origin <> old.origin
     or new.order_id is distinct from old.order_id
     or new.reason is distinct from old.reason or new.note is distinct from old.note
     or new.requested_by is distinct from old.requested_by
     or new.idempotency_key is distinct from old.idempotency_key
     or new.submitted_at is distinct from old.submitted_at or new.created_at <> old.created_at
     or (old.provider_refund_id is not null and new.provider_refund_id is distinct from old.provider_refund_id)
     or (old.completed_at is not null and new.completed_at is distinct from old.completed_at) then
    raise exception 'REFUND_HISTORY_IMMUTABLE';
  end if;
  if new.status <> old.status and not (
       (old.status = 'requested' and new.status in ('requires_reconciliation', 'succeeded', 'voided', 'failed'))
    or (old.status = 'requires_reconciliation' and new.status in ('succeeded', 'voided', 'failed'))
    or (old.status = 'succeeded' and new.status = 'voided')) then
    raise exception 'ILLEGAL_REFUND_TRANSITION:%->%', old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.payment_refunds_guard() from public, anon, authenticated, service_role;

drop trigger if exists payment_refunds_guard on public.payment_refunds;
create trigger payment_refunds_guard
  before update or delete on public.payment_refunds
  for each row execute function public.payment_refunds_guard();

-- The ledger's confirmed total can never exceed the payment's paid amount,
-- whatever writes it (final hardening). Callers hold the payment row lock, so
-- the sum is stable while it is checked.
create or replace function public.payment_refunds_total_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_paid  bigint;
  v_other bigint;
begin
  if new.status = 'succeeded' and (tg_op = 'INSERT' or old.status <> 'succeeded') then
    select p.amount_minor into v_paid from public.payments p where p.id = new.payment_id;
    select coalesce(sum(r.amount_minor), 0) into v_other
    from public.payment_refunds r
    where r.payment_id = new.payment_id and r.status = 'succeeded' and r.id <> new.id;
    if v_other + new.amount_minor > v_paid then
      raise exception 'REFUND_TOTAL_EXCEEDS_PAYMENT';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.payment_refunds_total_guard() from public, anon, authenticated, service_role;

drop trigger if exists payment_refunds_total_guard on public.payment_refunds;
create trigger payment_refunds_total_guard
  before insert or update on public.payment_refunds
  for each row execute function public.payment_refunds_total_guard();

alter table public.payment_refunds enable row level security;

-- Internal operations data (admin identity, notes, provider ids): admin only.
-- Customers see refunds only as a verified total of their own order, through
-- get_own_order_refund_summary().
drop policy if exists "payment_refunds_select_admin" on public.payment_refunds;
create policy "payment_refunds_select_admin" on public.payment_refunds
  for select using (public.is_admin());

revoke all on table public.payment_refunds from public, anon, authenticated, service_role;
grant select on public.payment_refunds to authenticated, service_role;

-- ---- admin_begin_payment_refund() -------------------------------------------
-- Called with the ADMIN's own session: is_admin() is the authorization gate
-- and stays the first statement; requested_by is auth.uid(), never a
-- parameter. Records the refund intent BEFORE any money moves and returns
-- what the server needs to call the provider. Nothing here trusts the
-- browser beyond intent: the payment's amount, currency, status and provider
-- reference come from the database.
--
-- Idempotent on p_idempotency_key (one per rendered refund form): the same
-- key returns the same refund (reused = true) and only the original caller
-- ever sends it to the provider. p_expected_refunded_minor is the refunded
-- total the admin was looking at; if the ledger moved since (another tab,
-- a provider-side refund), the request is refused instead of stacking.
--
-- Raises: ADMIN_REQUIRED, INVALID_REFUND_AMOUNT, INVALID_REFUND_REASON,
-- INVALID_NOTE, IDEMPOTENCY_KEY_REQUIRED, PAYMENT_NOT_FOUND,
-- IDEMPOTENCY_KEY_REUSED, REFUND_NOT_ALLOWED:<status>, REFUND_CURRENCY_MISMATCH,
-- REFUND_IN_PROGRESS, REFUND_STATE_CHANGED, REFUND_EXCEEDS_REMAINING.
create or replace function public.admin_begin_payment_refund(
  p_payment_id              uuid,
  p_amount_minor            bigint,
  p_currency                text,
  p_reason                  text,
  p_note                    text,
  p_idempotency_key         uuid,
  p_expected_refunded_minor bigint
)
returns table (
  refund_id           uuid,
  refund_status       text,
  reused              boolean,
  provider            text,
  provider_payment_id text,
  amount_minor        bigint,
  currency            text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id  uuid;
  v_payment  public.payments%rowtype;
  v_existing public.payment_refunds%rowtype;
  v_note     text;
  v_refunded bigint;
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;
  if p_reason is null or p_reason not in ('customer_request', 'order_cancelled', 'duplicate_payment',
                                          'inventory_issue', 'other') then
    raise exception 'INVALID_REFUND_REASON';
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and (char_length(v_note) > 500 or v_note ~ E'[\\x01-\\x09\\x0b-\\x1f\\x7f]') then
    raise exception 'INVALID_NOTE';
  end if;
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select p.user_id into v_user_id from public.payments p where p.id = p_payment_id;
  if v_user_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  -- Same lock order as every payment function: customer lock, then rows.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));
  select p.* into v_payment from public.payments p where p.id = p_payment_id for update;

  select r.* into v_existing from public.payment_refunds r where r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payment_id <> p_payment_id or v_existing.amount_minor <> p_amount_minor then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return query select v_existing.id, v_existing.status, true, v_payment.provider,
                        v_payment.provider_payment_id, v_existing.amount_minor, v_existing.currency;
    return;
  end if;

  -- Only money that was verifiably received can be returned: a settled
  -- payment, or a verified duplicate charge held for review. Payments under
  -- any other review (dispute, reversal, mismatch...) are not refundable here.
  if v_payment.provider_payment_id is null or v_payment.paid_at is null
     or not (v_payment.status in ('paid', 'partially_refunded')
             or (v_payment.status = 'requires_review' and v_payment.failure_code = 'DUPLICATE_PAYMENT'))
     or v_payment.provider_state in ('reversed', 'voided', 'disputed') then
    raise exception 'REFUND_NOT_ALLOWED:%', v_payment.status;
  end if;
  if p_currency is null or p_currency <> v_payment.currency then
    raise exception 'REFUND_CURRENCY_MISMATCH';
  end if;

  perform 1 from public.payment_refunds r
  where r.payment_id = v_payment.id for update;
  if exists (select 1 from public.payment_refunds r
             where r.payment_id = v_payment.id and r.status in ('requested', 'requires_reconciliation')) then
    raise exception 'REFUND_IN_PROGRESS';
  end if;

  select coalesce(sum(r.amount_minor), 0) into v_refunded
  from public.payment_refunds r
  where r.payment_id = v_payment.id and r.status = 'succeeded';

  if p_expected_refunded_minor is null or p_expected_refunded_minor <> v_refunded then
    raise exception 'REFUND_STATE_CHANGED';
  end if;
  if v_refunded >= v_payment.amount_minor then
    raise exception 'REFUND_NOT_ALLOWED:refunded';
  end if;
  if p_amount_minor > v_payment.amount_minor - v_refunded then
    raise exception 'REFUND_EXCEEDS_REMAINING';
  end if;

  insert into public.payment_refunds
    (payment_id, order_id, provider, amount_minor, currency, status, origin, reason, note, requested_by,
     idempotency_key, submitted_at, reconcile_after)
  values
    (v_payment.id, v_payment.order_id, v_payment.provider, p_amount_minor, v_payment.currency, 'requested',
     'nexora', p_reason, v_note, auth.uid(), p_idempotency_key, now(), now() + interval '2 minutes')
  returning id into v_id;

  return query select v_id, 'requested'::text, false, v_payment.provider, v_payment.provider_payment_id,
                      p_amount_minor, v_payment.currency;
end;
$$;

revoke all on function public.admin_begin_payment_refund(uuid, bigint, text, text, text, uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.admin_begin_payment_refund(uuid, bigint, text, text, text, uuid, bigint) to authenticated;

-- ---- record_refund_attempt() --------------------------------------------------
-- Records what the provider answered to the refund request. Never confirms
-- or fails a refund by itself — confirmation needs an authoritative lookup
-- (reconcile_payment_refunds):
--   accepted  : binds the provider's refund id (status stays open)
--   rejected  : the provider refused; becomes 'failed' only once a lookup
--               shows no matching refund
--   uncertain : no usable answer -> requires_reconciliation; never retried
-- Late/duplicate calls on a refund that is no longer open change nothing.
-- Raises: REFUND_NOT_FOUND, INVALID_ARGUMENT, PROVIDER_REFUND_ID_IN_USE.
create or replace function public.record_refund_attempt(
  p_refund_id          uuid,
  p_result             text,
  p_provider_refund_id text default null,
  p_amount_minor       bigint default null,
  p_currency           text default null,
  p_code               text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_refund  public.payment_refunds%rowtype;
begin
  if p_result is null or p_result not in ('accepted', 'rejected', 'uncertain')
     or (p_code is not null and (char_length(p_code) > 64 or p_code !~ '^[A-Za-z0-9_.:-]+$')) then
    raise exception 'INVALID_ARGUMENT';
  end if;
  if p_result = 'accepted' and (p_provider_refund_id is null or p_provider_refund_id !~ '^[\x21-\x7e]{1,255}$'
                                or p_amount_minor is null or p_currency is null) then
    raise exception 'INVALID_ARGUMENT';
  end if;

  select p.user_id into v_user_id
  from public.payment_refunds r join public.payments p on p.id = r.payment_id
  where r.id = p_refund_id;
  if v_user_id is null then
    raise exception 'REFUND_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));
  select r.* into v_refund from public.payment_refunds r where r.id = p_refund_id for update;

  if v_refund.status not in ('requested', 'requires_reconciliation') then
    return v_refund.status;
  end if;

  if p_result = 'accepted' then
    if v_refund.provider_refund_id is not null and v_refund.provider_refund_id <> p_provider_refund_id then
      raise exception 'PROVIDER_REFUND_ID_IN_USE';
    end if;
    if exists (select 1 from public.payment_refunds o
               where o.provider = v_refund.provider and o.provider_refund_id = p_provider_refund_id
                 and o.id <> v_refund.id) then
      raise exception 'PROVIDER_REFUND_ID_IN_USE';
    end if;
    update public.payment_refunds
    set provider_refund_id = p_provider_refund_id,
        provider_accepted  = true,
        -- The provider answered for a different amount than requested: the
        -- lookup decides, but this can never be confirmed silently.
        status       = case when p_amount_minor <> amount_minor or p_currency <> currency
                            then 'requires_reconciliation' else status end,
        failure_code = case when p_amount_minor <> amount_minor or p_currency <> currency
                            then 'REFUND_AMOUNT_MISMATCH' else failure_code end
    where id = v_refund.id;
  elsif p_result = 'rejected' then
    update public.payment_refunds
    set provider_rejected = true,
        failure_code      = coalesce(p_code, 'PROVIDER_REJECTED')
    where id = v_refund.id;
  else
    update public.payment_refunds
    set status          = 'requires_reconciliation',
        failure_code    = coalesce(p_code, 'PROVIDER_NO_ANSWER'),
        reconcile_after = now() + interval '1 minute'
    where id = v_refund.id;
  end if;

  return (select r.status from public.payment_refunds r where r.id = v_refund.id);
end;
$$;

revoke all on function public.record_refund_attempt(uuid, text, text, bigint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_refund_attempt(uuid, text, text, bigint, text, text) to service_role;

-- ---- reconcile_payment_refunds() ---------------------------------------------
-- Applies ONE authoritative provider lookup of a payment's refunds to the
-- ledger, atomically (customer lock + payment + refund rows locked), and
-- derives the payment's refund status from the ledger:
--
--   p_refunds  the provider's complete refund list for the payment:
--              [{"id": text, "amount_minor": int, "currency": text,
--                "voided": bool}, ...]
--   p_provider_status  the provider's generic status for the payment
--   p_captured_minor / p_remaining_minor  captured amount and remaining
--              refundable balance as the provider reports them (null when
--              the provider has none)
--
-- Matching, in order:
--   1. ledger refunds with a provider id: listed -> succeeded (or voided if
--      the provider voided it); a confirmed refund missing from the list or
--      a disagreeing amount is a contradiction (review, never downgraded);
--   2. the (single) open refund without a provider id — its response was
--      lost: exactly one unmatched provider refund of the same amount and
--      currency -> it is that refund; several -> ambiguous (review, nothing
--      guessed); none -> failed if the provider rejected it, or if the
--      request is over 10 minutes old (a synchronous refund that would
--      exist by now), otherwise still open;
--   3. remaining unmatched provider refunds are recorded as origin
--      'provider' (real money movements Nexora did not request).
-- A refund is never confirmed (or recorded) if that would put the ledger's
-- confirmed total above the paid amount — that is an issue instead (and the
-- payment_refunds_total_guard trigger enforces it regardless).
-- Then the ledger total must agree with the provider: paid - total =
-- provider balance, and the provider's status must match (no refunds ->
-- paid, some -> partially_refunded, all -> refunded).
-- Any disagreement moves the payment to requires_review with the reason; a
-- payment already under review keeps its original reason. Otherwise the
-- payment (and its order's payment_status) follows the ledger.
-- Under review for a refund-ledger reason: stays there, except a possible
-- provider timing gap (REFUND_MISSING_AT_PROVIDER / REFUND_BALANCE_MISMATCH /
-- REFUND_STATE_MISMATCH) that a fresh lookup now fully resolves (see step 5);
-- that automatic lift is recorded as an internal payment event.
-- Under review for another reason (dispute, duplicate...): a payment whose
-- money is verifiably this checkout's settled payment moves to its refund
-- status (same rule as record_payment_status); a duplicate charge stays under
-- review. Fulfilment and stock are never touched.
--
-- Returns the payment's status afterwards, the issue code (or null) and how
-- many ledger rows changed.
-- Raises: PAYMENT_NOT_FOUND, INVALID_ARGUMENT, PAYMENT_NOT_SETTLED.
create or replace function public.reconcile_payment_refunds(
  p_payment_id      uuid,
  p_provider_status text,
  p_captured_minor  bigint,
  p_remaining_minor bigint,
  p_refunds         jsonb
)
returns table (payment_status text, issue text, changed integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id   uuid;
  v_payment   public.payments%rowtype;
  v_row       public.payment_refunds%rowtype;
  v_item      jsonb;
  v_items     jsonb := '[]'::jsonb;
  v_claimed   text[] := array[]::text[];
  v_cands     jsonb;
  v_issue     text;
  v_ambiguous boolean := false;
  v_changed   integer := 0;
  v_total     bigint;
  v_expected  text;
  v_new       text;
  v_grace     interval := interval '10 minutes';
  v_settled_other boolean;
  v_open      boolean;
  v_ledger_review boolean;
begin
  if p_provider_status is null or p_provider_status not in ('pending', 'processing', 'paid', 'failed', 'cancelled',
       'expired', 'refunded', 'partially_refunded', 'requires_review')
     or p_refunds is null or jsonb_typeof(p_refunds) <> 'array' or jsonb_array_length(p_refunds) > 500
     or (p_captured_minor is not null and p_captured_minor < 0) then
    raise exception 'INVALID_ARGUMENT';
  end if;
  -- p_remaining_minor may be NEGATIVE: an over-refund at the provider (seen in
  -- the Safepay sandbox under a refund race) is evidence, not bad input — it
  -- fails the balance check below and sends the payment to review.

  -- Strict shape: exactly these keys, sane values, no duplicate ids.
  for v_item in select e from jsonb_array_elements(p_refunds) e loop
    if jsonb_typeof(v_item) <> 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 4
       or not (v_item ? 'id' and v_item ? 'amount_minor' and v_item ? 'currency' and v_item ? 'voided')
       or jsonb_typeof(v_item -> 'id') <> 'string' or (v_item ->> 'id') !~ '^[\x21-\x7e]{1,255}$'
       or jsonb_typeof(v_item -> 'amount_minor') <> 'number' or (v_item ->> 'amount_minor') !~ '^[1-9][0-9]{0,17}$'
       or jsonb_typeof(v_item -> 'currency') <> 'string' or (v_item ->> 'currency') !~ '^[A-Z]{3}$'
       or jsonb_typeof(v_item -> 'voided') <> 'boolean' then
      raise exception 'INVALID_ARGUMENT';
    end if;
  end loop;
  if (select count(distinct e ->> 'id') from jsonb_array_elements(p_refunds) e) <> jsonb_array_length(p_refunds) then
    raise exception 'INVALID_ARGUMENT';
  end if;

  select p.user_id into v_user_id from public.payments p where p.id = p_payment_id;
  if v_user_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexora.checkout:' || v_user_id::text, 0));
  select p.* into v_payment from public.payments p where p.id = p_payment_id for update;
  perform 1 from public.payment_refunds r where r.payment_id = v_payment.id order by r.id for update;

  -- Refunds can only be reconciled for money that was received.
  if v_payment.paid_at is null
     or v_payment.status not in ('paid', 'partially_refunded', 'refunded', 'requires_review') then
    raise exception 'PAYMENT_NOT_SETTLED';
  end if;

  -- Confirmed refunds so far; a refund is only ever confirmed while the
  -- ledger total stays within the paid amount (also enforced by the
  -- payment_refunds_total_guard trigger).
  select coalesce(sum(r.amount_minor), 0) into v_total
  from public.payment_refunds r
  where r.payment_id = v_payment.id and r.status = 'succeeded';

  -- 1. Ledger refunds that carry a provider id.
  for v_row in
    select r.* from public.payment_refunds r
    where r.payment_id = v_payment.id and r.provider_refund_id is not null
    order by r.created_at, r.id
  loop
    v_claimed := v_claimed || v_row.provider_refund_id;
    select e into v_item from jsonb_array_elements(p_refunds) e where e ->> 'id' = v_row.provider_refund_id;

    if v_item is null then
      if v_row.status = 'succeeded' then
        v_issue := coalesce(v_issue, 'REFUND_MISSING_AT_PROVIDER');
      elsif v_row.status in ('requested', 'requires_reconciliation') and v_row.submitted_at < now() - v_grace then
        -- Accepted by the provider long ago but not in its own ledger.
        if v_row.status = 'requested' then
          update public.payment_refunds set status = 'requires_reconciliation', failure_code = 'REFUND_MISSING_AT_PROVIDER'
          where id = v_row.id;
          v_changed := v_changed + 1;
        end if;
        v_issue := coalesce(v_issue, 'REFUND_MISSING_AT_PROVIDER');
      end if;
    elsif (v_item ->> 'amount_minor')::bigint <> v_row.amount_minor or (v_item ->> 'currency') <> v_row.currency then
      if v_row.status = 'requested' then
        update public.payment_refunds set status = 'requires_reconciliation', failure_code = 'REFUND_AMOUNT_MISMATCH'
        where id = v_row.id;
        v_changed := v_changed + 1;
      end if;
      v_issue := coalesce(v_issue, 'REFUND_AMOUNT_MISMATCH');
    elsif (v_item ->> 'voided')::boolean then
      -- Newly voided at the provider: money that was returned is back with
      -- the merchant. Review it once; a known void is not a new finding.
      if v_row.status <> 'voided' then
        if v_row.status = 'succeeded' then
          v_total := v_total - v_row.amount_minor;
        end if;
        update public.payment_refunds
        set status = 'voided', completed_at = coalesce(completed_at, now()), last_checked_at = now()
        where id = v_row.id;
        v_changed := v_changed + 1;
        v_issue := coalesce(v_issue, 'PROVIDER_REFUND_VOIDED');
      end if;
    elsif v_row.status in ('requested', 'requires_reconciliation') then
      if v_total + v_row.amount_minor > v_payment.amount_minor then
        -- Confirming it would put the ledger above what was paid.
        if v_row.status = 'requested' then
          update public.payment_refunds set status = 'requires_reconciliation', failure_code = 'REFUND_TOTAL_EXCEEDS_PAYMENT'
          where id = v_row.id;
          v_changed := v_changed + 1;
        end if;
        v_issue := coalesce(v_issue, 'REFUND_TOTAL_EXCEEDS_PAYMENT');
      else
        update public.payment_refunds
        set status = 'succeeded', completed_at = now(), failure_code = null, last_checked_at = now()
        where id = v_row.id;
        v_total := v_total + v_row.amount_minor;
        v_changed := v_changed + 1;
      end if;
    else
      update public.payment_refunds set last_checked_at = now() where id = v_row.id;
    end if;
  end loop;

  -- Provider refunds not yet tied to a ledger row.
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_items
  from jsonb_array_elements(p_refunds) e
  where not ((e ->> 'id') = any (v_claimed));

  -- 2. The open refund whose provider answer was lost (at most one exists).
  for v_row in
    select r.* from public.payment_refunds r
    where r.payment_id = v_payment.id and r.provider_refund_id is null
      and r.status in ('requested', 'requires_reconciliation')
    order by r.created_at, r.id
  loop
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_cands
    from jsonb_array_elements(v_items) e
    where not (e ->> 'voided')::boolean
      and (e ->> 'amount_minor')::bigint = v_row.amount_minor
      and (e ->> 'currency') = v_row.currency;

    if jsonb_array_length(v_cands) = 1 and v_total + v_row.amount_minor > v_payment.amount_minor then
      v_issue := coalesce(v_issue, 'REFUND_TOTAL_EXCEEDS_PAYMENT');
      if v_row.status = 'requested' then
        update public.payment_refunds set status = 'requires_reconciliation', failure_code = 'REFUND_TOTAL_EXCEEDS_PAYMENT'
        where id = v_row.id;
        v_changed := v_changed + 1;
      end if;
      -- Keep the candidate out of the import below: it may be this refund.
      v_ambiguous := true;
    elsif jsonb_array_length(v_cands) = 1 then
      update public.payment_refunds
      set provider_refund_id = v_cands -> 0 ->> 'id', status = 'succeeded', completed_at = now(),
          failure_code = null, last_checked_at = now()
      where id = v_row.id;
      v_total := v_total + v_row.amount_minor;
      v_changed := v_changed + 1;
      select coalesce(jsonb_agg(e), '[]'::jsonb) into v_items
      from jsonb_array_elements(v_items) e where (e ->> 'id') <> (v_cands -> 0 ->> 'id');
    elsif jsonb_array_length(v_cands) > 1 then
      v_ambiguous := true;
      v_issue := coalesce(v_issue, 'REFUND_MATCH_AMBIGUOUS');
      if v_row.status = 'requested' then
        update public.payment_refunds set status = 'requires_reconciliation', failure_code = 'REFUND_MATCH_AMBIGUOUS'
        where id = v_row.id;
        v_changed := v_changed + 1;
      end if;
    elsif v_row.provider_rejected then
      update public.payment_refunds set status = 'failed', completed_at = now(), last_checked_at = now()
      where id = v_row.id;
      v_changed := v_changed + 1;
    elsif v_row.submitted_at < now() - v_grace then
      update public.payment_refunds
      set status = 'failed', completed_at = now(), failure_code = 'NOT_FOUND_AT_PROVIDER', last_checked_at = now()
      where id = v_row.id;
      v_changed := v_changed + 1;
    else
      update public.payment_refunds set last_checked_at = now() where id = v_row.id;
    end if;
  end loop;

  -- 3. Refunds that exist only at the provider. Not while a lost answer is
  -- ambiguous: one of them may be Nexora's own request. A refund that would
  -- put the ledger above the paid amount is not recorded as confirmed; the
  -- payment goes to review instead.
  if not v_ambiguous then
    for v_item in select e from jsonb_array_elements(v_items) e loop
      if (v_item ->> 'currency') <> v_payment.currency then
        v_issue := coalesce(v_issue, 'REFUND_CURRENCY_MISMATCH');
        continue;
      end if;
      if not (v_item ->> 'voided')::boolean
         and v_total + (v_item ->> 'amount_minor')::bigint > v_payment.amount_minor then
        v_issue := coalesce(v_issue, 'REFUND_TOTAL_EXCEEDS_PAYMENT');
        continue;
      end if;
      insert into public.payment_refunds
        (payment_id, order_id, provider, provider_refund_id, amount_minor, currency, status, origin,
         completed_at, last_checked_at)
      values
        (v_payment.id, v_payment.order_id, v_payment.provider, v_item ->> 'id', (v_item ->> 'amount_minor')::bigint,
         v_payment.currency, case when (v_item ->> 'voided')::boolean then 'voided' else 'succeeded' end, 'provider',
         now(), now());
      if not (v_item ->> 'voided')::boolean then
        v_total := v_total + (v_item ->> 'amount_minor')::bigint;
      end if;
      v_changed := v_changed + 1;
    end loop;
  end if;

  -- 4. Totals must agree with the provider.
  if p_captured_minor is not null and p_captured_minor <> v_payment.amount_minor then
    v_issue := coalesce(v_issue, 'REFUND_BALANCE_MISMATCH');
  end if;
  if p_provider_status in ('paid', 'partially_refunded', 'refunded') and not v_ambiguous then
    if p_remaining_minor is not null and p_remaining_minor <> v_payment.amount_minor - v_total then
      v_issue := coalesce(v_issue, 'REFUND_BALANCE_MISMATCH');
    end if;
    v_expected := case when v_total = 0 then 'paid'
                       when v_total < v_payment.amount_minor then 'partially_refunded'
                       else 'refunded' end;
    if p_provider_status <> v_expected then
      v_issue := coalesce(v_issue, 'REFUND_STATE_MISMATCH');
    end if;
  end if;

  select exists (select 1 from public.payment_refunds r
                 where r.payment_id = v_payment.id and r.status in ('requested', 'requires_reconciliation'))
    into v_open;
  v_ledger_review := v_payment.status = 'requires_review'
    and (v_payment.failure_code like 'REFUND\_%' or v_payment.failure_code = 'PROVIDER_REFUND_VOIDED');

  -- 5. The payment (and its order) follow the ledger.
  if v_issue is not null then
    if v_payment.status <> 'requires_review' then
      update public.payments
      set status = 'requires_review', failure_code = v_issue,
          failure_message = 'The provider''s refund records do not match Nexora''s refund ledger.',
          last_checked_at = now(), updated_at = now()
      where id = v_payment.id;
      if v_payment.order_id is not null then
        update public.orders set payment_status = 'requires_review', updated_at = now()
        where id = v_payment.order_id;
      end if;
      v_new := 'requires_review';
    else
      update public.payments set last_checked_at = now(), updated_at = now() where id = v_payment.id;
      v_new := v_payment.status;
    end if;
  elsif v_ledger_review then
    -- Held in review for a refund-ledger reason. Only a mismatch that could
    -- have been a timing gap at the provider (a refund not listed yet, a
    -- balance or status not updated yet) is lifted automatically — and only
    -- when this fresh, authoritative lookup agrees with the ledger on every
    -- point, no refund is still open, and this is the checkout's own settled
    -- payment. Voids, amount/currency differences, ambiguity and over-refunds
    -- always stay for the admin. Never touches fulfilment or stock.
    select exists (select 1 from public.payments o
                   where o.checkout_session_id = v_payment.checkout_session_id and o.id <> v_payment.id
                     and o.status in ('paid', 'partially_refunded', 'refunded'))
      into v_settled_other;
    v_new := case when v_total = 0 then 'paid'
                  when v_total < v_payment.amount_minor then 'partially_refunded'
                  else 'refunded' end;
    if v_payment.failure_code in ('REFUND_MISSING_AT_PROVIDER', 'REFUND_BALANCE_MISMATCH', 'REFUND_STATE_MISMATCH')
       and p_provider_status in ('paid', 'partially_refunded', 'refunded')
       and not v_open and not v_settled_other
       and (v_new <> 'paid' or v_payment.order_id is not null) then
      update public.payments
      set status = v_new, failure_code = null, failure_message = null, last_checked_at = now(), updated_at = now()
      where id = v_payment.id;
      if v_payment.order_id is not null then
        update public.orders set payment_status = v_new, updated_at = now()
        where id = v_payment.order_id;
      end if;
      -- Audit: the automatic lift is visible in the payment's timeline.
      insert into public.payment_events (provider, provider_event_id, payment_id, event_type, signature_valid, outcome,
                                         details, processed_at)
      values (v_payment.provider, 'internal:' || gen_random_uuid()::text, v_payment.id, 'internal.refund_review_cleared',
              true, 'processed', jsonb_build_object('reason', v_payment.failure_code, 'provider_state', p_provider_status),
              now());
    else
      update public.payments set last_checked_at = now(), updated_at = now() where id = v_payment.id;
      -- Report the standing reason, so a later "paid" lookup is not taken as
      -- a resolution of a contradiction nobody looked at.
      v_new := 'requires_review';
      v_issue := v_payment.failure_code;
    end if;
  elsif p_provider_status in ('paid', 'partially_refunded', 'refunded') then
    v_new := case when v_total = 0 then 'paid'
                  when v_total < v_payment.amount_minor then 'partially_refunded'
                  else 'refunded' end;
    if v_payment.status = 'requires_review' then
      -- Same rule as record_payment_status(): only the checkout's own settled
      -- payment leaves review through a refund; a duplicate charge stays.
      select exists (select 1 from public.payments o
                     where o.checkout_session_id = v_payment.checkout_session_id and o.id <> v_payment.id
                       and o.status in ('paid', 'partially_refunded', 'refunded'))
        into v_settled_other;
      if v_total = 0 or v_settled_other then
        v_new := 'requires_review';
      end if;
    elsif v_payment.status = 'refunded' and v_new <> 'refunded'
          or v_payment.status = 'partially_refunded' and v_new = 'paid' then
      -- Cannot happen without a void (already an issue); never step back.
      v_new := v_payment.status;
    end if;

    update public.payments
    set status = v_new, last_checked_at = now(), updated_at = now()
    where id = v_payment.id;
    if v_new <> v_payment.status and v_payment.order_id is not null then
      update public.orders set payment_status = v_new, updated_at = now()
      where id = v_payment.order_id;
    end if;
  else
    update public.payments set last_checked_at = now(), updated_at = now() where id = v_payment.id;
    v_new := v_payment.status;
  end if;

  return query select v_new, v_issue, v_changed;
end;
$$;

revoke all on function public.reconcile_payment_refunds(uuid, text, bigint, bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_payment_refunds(uuid, text, bigint, bigint, jsonb) to service_role;

-- ---- claim_open_refunds() ------------------------------------------------------
-- Scheduled recovery: claims refunds whose outcome is still open and due for
-- an authoritative re-check (bounded batch, skip-locked, leased with
-- exponential backoff capped at an hour). The re-check itself is the normal
-- payment verification, which ends in reconcile_payment_refunds().
create or replace function public.claim_open_refunds(p_limit integer, p_max_attempts integer)
returns table (refund_id uuid, payment_id uuid, provider text, reconcile_attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_max_attempts is null or p_max_attempts < 1 then
    raise exception 'INVALID_LIMIT';
  end if;
  return query
  with due as (
    select r.id
    from public.payment_refunds r
    where r.status in ('requested', 'requires_reconciliation')
      and coalesce(r.reconcile_after, r.submitted_at) <= now()
      and r.reconcile_attempts < p_max_attempts
    order by coalesce(r.reconcile_after, r.submitted_at), r.id
    limit p_limit
    for update of r skip locked
  )
  update public.payment_refunds r
  set reconcile_attempts = r.reconcile_attempts + 1,
      reconcile_after = now() + least(interval '1 minute' * power(2, r.reconcile_attempts), interval '1 hour')
  from due
  where r.id = due.id
  returning r.id, r.payment_id, r.provider, r.reconcile_attempts;
end;
$$;

revoke all on function public.claim_open_refunds(integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_open_refunds(integer, integer) to service_role;

-- ---- get_own_order_refund_summary() ------------------------------------------
-- The signed-in customer's verified refunded total for one of their own
-- orders (confirmed refunds of the order's own payment only). No refund ids,
-- notes, admin identity or provider details. Returns no row for someone
-- else's order.
create or replace function public.get_own_order_refund_summary(p_order_id uuid)
returns table (refunded_minor bigint, paid_minor bigint, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(r.amount_minor) filter (where r.status = 'succeeded'), 0)::bigint,
         p.amount_minor,
         p.currency
  from public.orders o
  join public.payments p on p.order_id = o.id
  left join public.payment_refunds r on r.payment_id = p.id
  where o.id = p_order_id
    and o.user_id = auth.uid()
    and p.paid_at is not null
  group by p.id, p.amount_minor, p.currency
  limit 1;
$$;

revoke all on function public.get_own_order_refund_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_own_order_refund_summary(uuid) to authenticated;

-- ---- Privilege hardening (payment area) ----------------------------------------
-- Customers keep reading their own payments/checkouts (RLS unchanged), but only
-- the columns the storefront needs. Internal operational columns — failure
-- codes/messages, the provider's raw state, verification and reconciliation
-- bookkeeping — are no longer directly readable by the customer role; the
-- admin reads them through admin_payments (below). service_role (server) keeps
-- full SELECT. RLS is not weakened anywhere.
revoke select on table public.payments from authenticated;
grant select (id, checkout_session_id, order_id, user_id, provider, provider_payment_id, amount_minor, currency,
              status, display_summary, paid_at, created_at, updated_at)
  on public.payments to authenticated;

revoke select on table public.checkout_sessions from authenticated;
grant select (id, user_id, status, currency, subtotal, total, amount_minor, shipping_address, order_id,
              reserved_until, created_at, updated_at)
  on public.checkout_sessions to authenticated;

-- Admin-only window onto every payment column. Runs with the owner's rights
-- (column grants and RLS bypassed), so the is_admin() filter in the view IS
-- the access rule; security_barrier keeps caller-supplied filters from being
-- evaluated before it.
create or replace view public.admin_payments
with (security_barrier = true)
as
  select p.id, p.checkout_session_id, p.order_id, p.user_id, p.provider, p.provider_payment_id, p.amount_minor,
         p.currency, p.status, p.failure_code, p.failure_message, p.display_summary, p.last_checked_at, p.paid_at,
         p.created_at, p.updated_at, p.provider_state, p.provider_state_at
  from public.payments p
  where public.is_admin();

revoke all on table public.admin_payments from public, anon, authenticated, service_role;
grant select on public.admin_payments to authenticated;

-- Pre-existing order tables still carry Supabase's default TRUNCATE /
-- REFERENCES / TRIGGER (and, on PostgreSQL 17, MAINTAIN) privileges for the
-- API roles. Nothing uses them; remove them. Existing SELECT/UPDATE grants
-- (above) are unchanged.
revoke truncate, references, trigger on public.orders, public.order_items from anon, authenticated, service_role;
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on public.orders, public.order_items from anon, authenticated, service_role';
  end if;
end;
$$;
