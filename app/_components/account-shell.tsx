import type { ReactNode } from "react";

import { AccountNav } from "./account-nav";

// Shared frame for the customer account area (/account/**, /orders/**):
// one page container plus the account section navigation. Rendered by those
// routes' layouts, so each page keeps its own URL, guard and content.
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <AccountNav />
      {children}
    </main>
  );
}
