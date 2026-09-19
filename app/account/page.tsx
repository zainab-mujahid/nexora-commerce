import Link from "next/link";
import type { Metadata } from "next";

import { getProfile, requireUser } from "@/lib/auth/dal";

import { AccountForm } from "./account-form";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  // proxy.ts already redirects unauthenticated visits to /login, but that is
  // only an optimistic, cookie-based check — this page must not depend on it
  // being the only gate, so the session is re-verified here at the DAL layer.
  const user = await requireUser();
  const profile = await getProfile();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-foreground/60">
          Manage your profile details.
        </p>
      </div>

      {!profile ? (
        <p className="rounded-md border border-red-500/40 p-4 text-sm text-red-600">
          We couldn&apos;t load your profile right now. Try refreshing the
          page.
        </p>
      ) : (
        <>
          <dl className="flex flex-col gap-3 rounded-md border border-black/10 p-4 text-sm dark:border-white/10">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">Email</dt>
              <dd>{user.email ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">Role</dt>
              <dd className="capitalize">{profile.role}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">Member since</dt>
              <dd>{new Date(profile.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>

          <AccountForm defaultFullName={profile.full_name ?? ""} />

          <Link
            href="/account/addresses"
            className="self-start text-sm underline hover:no-underline"
          >
            Manage addresses
          </Link>
        </>
      )}
    </main>
  );
}
