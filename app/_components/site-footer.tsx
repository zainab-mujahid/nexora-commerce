import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Nexora Commerce. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="/" className="nav-link">
            Home
          </Link>
          <Link href="/products" className="nav-link">
            Shop
          </Link>
        </div>
      </div>
    </footer>
  );
}
