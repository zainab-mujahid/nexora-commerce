import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      {error === "invalid_link" && (
        <p className="rounded-md border border-red-500/40 p-3 text-sm text-red-600 dark:text-red-400">
          That password reset link is invalid or has expired. Enter your email
          to get a new one.
        </p>
      )}
      <ForgotPasswordForm />
    </div>
  );
}
