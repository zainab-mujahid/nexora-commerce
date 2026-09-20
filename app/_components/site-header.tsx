import Link from "next/link";

import { logout } from "@/lib/auth/actions";
import { getProfile, getUser, type Profile } from "@/lib/auth/dal";

type AuthUser = Awaited<ReturnType<typeof getUser>>;

export async function SiteHeader() {
  // Two independent calls, not one combined lookup: getUser() is the
  // authentication signal (matches what proxy.ts checks) and must never be
  // masked by a failure in the unrelated profiles-table enrichment query.
  const [user, profile] = await Promise.all([getUser(), getProfile()]);

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
        </nav>

        <SearchForm className="hidden max-w-sm flex-1 sm:flex" />

        <div className="ml-auto hidden items-center sm:flex">
          <AuthLinks user={user} profile={profile} />
        </div>

        <details className="group ml-auto sm:hidden">
          <summary className="flex cursor-pointer list-none select-none items-center rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20">
            Menu
          </summary>
          <div className="absolute inset-x-0 top-full z-20 flex flex-col gap-4 border-b border-black/10 bg-background px-4 py-4 text-sm font-medium dark:border-white/10">
            <Link href="/">Home</Link>
            <Link href="/products">Shop</Link>
            <SearchForm className="flex" />
            <AuthLinks user={user} profile={profile} stacked />
          </div>
        </details>
      </div>
    </header>
  );
}

function SearchForm({ className }: { className: string }) {
  return (
    <form action="/products" className={className}>
      <input
        type="search"
        name="q"
        placeholder="Search products…"
        aria-label="Search products"
        className="w-full rounded-md border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
      />
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
