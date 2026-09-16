import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-foreground/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Nexora Commerce. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="/" className="hover:opacity-70">
            Home
          </Link>
          <Link href="/products" className="hover:opacity-70">
            Shop
          </Link>
        </div>
      </div>
    </footer>
  );
}
