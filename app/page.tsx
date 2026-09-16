import Link from "next/link";

import { getProfile, getUser } from "@/lib/auth/dal";

export default async function Home() {
  // user is the authentication signal (matches proxy.ts); profile is display
  // enrichment only and must not decide whether we treat someone as a guest.
  const [user, profile] = await Promise.all([getUser(), getProfile()]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Nexora Commerce
        </h1>
        <p className="max-w-md text-lg text-foreground/70">
          {user
            ? `Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}. Your next favorite find is waiting.`
            : "Everyday products, thoughtfully curated. Sign up to start shopping."}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/products"
          className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          Shop now
        </Link>
        {!user && (
          <Link
            href="/signup"
            className="rounded-md border border-black/15 px-5 py-2.5 text-sm font-medium hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
          >
            Create an account
          </Link>
        )}
      </div>
    </main>
  );
}
