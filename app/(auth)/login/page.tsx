import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      {error === "invalid_link" && (
        <p className="rounded-md border border-red-500/40 p-3 text-sm text-red-600">
          That confirmation link is invalid or has expired. Sign in to request a
          new one.
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
