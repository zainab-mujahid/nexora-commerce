import Link from "next/link";

import { logout } from "@/lib/auth/actions";
import { getProfile, getUser, type Profile } from "@/lib/auth/dal";
import { getCategories } from "@/lib/catalog/categories";

import { BrandMark } from "./brand-mark";
import { HeaderNavLink } from "./header-nav-link";
import { HeaderSearchSlot } from "./header-search-slot";
import { MobileMenuCloser } from "./mobile-menu-closer";
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

  // Layout by width (all presentation — every control is the same element
  // at every size):
  //   < 768px   brand · theme toggle · Menu (everything else in the menu)
  //   768–1151  brand · search · theme toggle · Menu
  //   ≥ 1152    brand · primary nav · search · account links · toggle
  // Always a single row (fixed height, never wraps): below 1152px the full
  // set of account links doesn't fit beside a usable search, so the Menu
  // carries them instead of squeezing the row. The search stays compact
  // (max-w-sm), centered in the space between its neighbours, and is left
  // out on /products, which has its own search form (see HeaderSearchSlot)
  // — the fixed height keeps the header from shifting when it is.
  return (
    <header className="site-header">
      <div className="relative mx-auto flex h-15 max-w-6xl items-center gap-4 px-4 sm:px-6 min-[72rem]:gap-5">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-md text-xl font-bold tracking-tight"
        >
          <BrandMark className="size-7 transition-transform duration-300 ease-[var(--ease-nexora)] group-hover:-rotate-6" />
          Nexora
        </Link>

        <nav className="hidden shrink-0 items-center gap-0.5 min-[72rem]:flex">
          <HeaderNavLink href="/" exact>
            Home
          </HeaderNavLink>
          <HeaderNavLink href="/products">
            Shop
          </HeaderNavLink>
          {categories.length > 0 && <CategoriesMenu categories={categories} />}
          <HeaderNavLink href="/about">About</HeaderNavLink>
        </nav>

        <HeaderSearchSlot className="hidden min-w-0 flex-1 justify-center md:flex">
          <SearchForm className="flex w-full max-w-sm" />
        </HeaderSearchSlot>

        <div className="ml-auto hidden shrink-0 items-center min-[72rem]:flex">
          <AuthLinks user={user} profile={profile} />
        </div>

        {/* One toggle for every breakpoint: right after the account links on
            desktop, and on smaller screens beside the Menu button (not
            inside it) so it stays one tap away. */}
        <ThemeToggle className="ml-auto shrink-0 min-[72rem]:ml-0" />

        <details className="group shrink-0 min-[72rem]:hidden">
          <summary className="btn btn-secondary h-8 list-none select-none gap-1.5 px-3">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
              <path d="M3.5 6h13M3.5 10h13M3.5 14h13" className="group-open:hidden" />
              <path d="m5 5 10 10M15 5 5 15" className="hidden group-open:inline" />
            </svg>
            Menu
          </summary>
          <div className="menu-drop absolute inset-x-0 top-full z-20 border-b border-border bg-surface shadow-[var(--shadow-float)]">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6">
              <HeaderSearchSlot className="md:hidden">
                <SearchForm className="flex" />
              </HeaderSearchSlot>
              <div className="flex flex-col">
                <HeaderNavLink href="/" exact variant="row">
                  Home
                </HeaderNavLink>
                <HeaderNavLink href="/products" variant="row">
                  Shop
                </HeaderNavLink>
                <HeaderNavLink href="/about" variant="row">
                  About
                </HeaderNavLink>
                <HeaderNavLink href="/faqs" variant="row">
                  Help
                </HeaderNavLink>
              </div>
              {categories.length > 0 && (
                <div className="flex flex-col border-t border-border pt-3">
                  <span className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-subtle">Categories</span>
                  {categories.map((category) => (
                    <HeaderNavLink key={category.slug} href={`/categories/${category.slug}`} variant="row">
                      {category.name}
                    </HeaderNavLink>
                  ))}
                </div>
              )}
              <div className="border-t border-border pt-3">
                <AuthLinks user={user} profile={profile} stacked />
              </div>
            </div>
          </div>
          <MobileMenuCloser />
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
      <span className="inline-flex h-8 cursor-default items-center gap-1 rounded-md px-2.5 text-sm font-medium text-muted transition-colors group-hover:bg-fill group-hover:text-foreground">
        Categories
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 transition-transform group-hover:rotate-180">
          <path d="m5.5 8 4.5 4.5L14.5 8" />
        </svg>
      </span>
      <div className="pointer-events-none absolute left-0 top-full z-20 translate-y-1 pt-2 opacity-0 transition-[opacity,translate] duration-200 ease-[var(--ease-nexora)] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:opacity-100">
        <ul
          aria-label="Categories"
          className="panel-float flex min-w-52 flex-col p-1.5"
        >
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/categories/${category.slug}`}
                className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-fill hover:text-foreground"
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
  const variant = stacked ? "row" : "bar";
  const groupClass = stacked ? "flex flex-col" : "flex items-center gap-0.5";

  if (!user) {
    return (
      <div className={stacked ? "flex flex-col gap-2" : "flex items-center gap-2"}>
        <HeaderNavLink href="/login" variant={variant}>
          Log in
        </HeaderNavLink>
        <Link
          href="/signup"
          className={stacked ? "btn btn-primary w-full" : "btn btn-primary h-8 px-3"}
        >
          Sign up
        </Link>
      </div>
    );
  }

  const name = profile?.full_name?.trim() || "Account";
  return (
    <div className={groupClass}>
      <HeaderNavLink href="/wishlist" variant={variant}>
        Wishlist
      </HeaderNavLink>
      <HeaderNavLink href="/cart" variant={variant}>
        Cart
      </HeaderNavLink>
      <HeaderNavLink href="/orders" variant={variant}>
        Orders
      </HeaderNavLink>
      {!stacked && <span aria-hidden="true" className="mx-2 h-5 w-px bg-border" />}
      {/* Long names are truncated in the bar; the full name stays in the
          link text (and title) for assistive tech and hover. */}
      <HeaderNavLink href="/account" variant={variant} title={stacked ? undefined : name}>
        <span className={stacked ? "" : "max-w-[9rem] truncate"}>{name}</span>
      </HeaderNavLink>
      {profile?.role === "admin" && (
        <HeaderNavLink href="/admin" variant={variant}>
          Admin
        </HeaderNavLink>
      )}
      <form action={logout} className={stacked ? "mt-1 border-t border-border pt-2" : ""}>
        <button
          type="submit"
          className={
            stacked
              ? "flex min-h-10 w-full items-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-fill hover:text-foreground"
              : "inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-fill hover:text-foreground"
          }
        >
          Log out
        </button>
      </form>
    </div>
  );
}
