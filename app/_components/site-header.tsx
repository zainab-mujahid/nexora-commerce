import Link from "next/link";

import { logout } from "@/lib/auth/actions";
import { getProfile, getUser, type Profile } from "@/lib/auth/dal";
import { getCategories } from "@/lib/catalog/categories";

import { ProductSearchInput } from "./product-search-input";
import { ThemeToggle } from "./theme-toggle";

type AuthUser = Awaited<ReturnType<typeof getUser>>;

type NavCategory = { name: string; slug: string };

// The header renders on every page from the root layout, so a failed
// categories query must never take the whole site down with it — it just
// hides the Categories menu (getCategories() already logs the error).
// Only name/slug are passed on: the nav needs nothing else.
async function getNavCategories(): Promise<NavCategory[]> {
  try {
    const categories = await getCategories();
    return categories.map(({ name, slug }) => ({ name, slug }));
  } catch {
    return [];
  }
}

export async function SiteHeader() {
  // Two independent calls, not one combined lookup: getUser() is the
  // authentication signal (matches what proxy.ts checks) and must never be
  // masked by a failure in the unrelated profiles-table enrichment query.
  const [user, profile, categories] = await Promise.all([
    getUser(),
    getProfile(),
    getNavCategories(),
  ]);

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Nexora
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
          <Link href="/" className="hover:opacity-70">
            Home
          </Link>
          <Link href="/products" className="hover:opacity-70">
            Shop
          </Link>
          {categories.length > 0 && <CategoriesMenu categories={categories} />}
        </nav>

        <SearchForm className="hidden max-w-sm flex-1 sm:flex" />

        <div className="ml-auto hidden items-center sm:flex">
          <AuthLinks user={user} profile={profile} />
        </div>

        {/* One toggle for every breakpoint: right after the account links on
            desktop, and on mobile pushed right beside the Menu button (not
            inside it) so it stays one tap away. */}
        <ThemeToggle className="ml-auto sm:ml-0" />

        <details className="group sm:hidden">
          <summary className="flex cursor-pointer list-none select-none items-center rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20">
            Menu
          </summary>
          <div className="absolute inset-x-0 top-full z-20 flex flex-col gap-4 border-b border-black/10 bg-surface px-4 py-4 text-sm font-medium dark:border-white/10">
            <Link href="/">Home</Link>
            <Link href="/products">Shop</Link>
            {categories.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-foreground/60">Categories</span>
                {categories.map((category) => (
                  <Link key={category.slug} href={`/categories/${category.slug}`} className="pl-3">
                    {category.name}
                  </Link>
                ))}
              </div>
            )}
            <SearchForm className="flex" />
            <AuthLinks user={user} profile={profile} stacked />
          </div>
        </details>
      </div>
    </header>
  );
}

// CSS-only dropdown, like the JS-free mobile <details> menu: opens on hover,
// or while keyboard focus (:focus-visible) is on one of its links. Closed,
// it's only transparent + pointer-events-none — not `invisible`/hidden — so
// the links stay in the tab order: Tab from "Shop" lands on the first
// category and reveals the menu (`invisible` would make them unfocusable,
// and focus would drop to <body>). focus-visible rather than focus-within
// keeps a mouse click from pinning it open after the pointer leaves. The
// menu is absolutely positioned (no layout shift) and starts at top-full
// with pt-2 padding instead of a margin, so there's no hover gap between
// the label and the menu.
function CategoriesMenu({ categories }: { categories: NavCategory[] }) {
  return (
    <div className="group relative">
      <span className="cursor-default group-hover:opacity-70">Categories</span>
      <div className="pointer-events-none absolute left-0 top-full z-20 pt-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100">
        <ul
          aria-label="Categories"
          className="flex min-w-44 flex-col rounded-md border border-black/10 bg-surface py-1 shadow-lg dark:border-white/10"
        >
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/categories/${category.slug}`}
                className="block px-3 py-1.5 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SearchForm({ className }: { className: string }) {
  return (
    <form action="/products" className={className}>
      <ProductSearchInput className="w-full" />
    </form>
  );
}

function AuthLinks({
  user,
  profile,
  stacked = false,
}: {
  user: AuthUser;
  profile: Profile | null;
  stacked?: boolean;
}) {
  const groupClass = stacked
    ? "flex flex-col gap-3"
    : "flex items-center gap-4 text-sm font-medium";

  if (!user) {
    return (
      <div className={groupClass}>
        <Link href="/login" className="hover:opacity-70">
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-foreground px-3 py-1.5 text-background hover:opacity-90"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className={groupClass}>
      <Link href="/wishlist" className="hover:opacity-70">
        Wishlist
      </Link>
      <Link href="/cart" className="hover:opacity-70">
        Cart
      </Link>
      <Link href="/orders" className="hover:opacity-70">
        Orders
      </Link>
      <Link href="/account" className="hover:opacity-70">
        {profile?.full_name?.trim() || "Account"}
      </Link>
      {profile?.role === "admin" && (
        <Link href="/admin" className="hover:opacity-70">
          Admin
        </Link>
      )}
      <form action={logout}>
        <button type="submit" className="hover:opacity-70">
          Log out
        </button>
      </form>
    </div>
  );
}
