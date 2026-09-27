import { AccountShell } from "@/app/_components/account-shell";

// Presentation only: shared account container + section nav. Each page
// under /account still verifies the session itself (requireUser()).
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return <AccountShell>{children}</AccountShell>;
}
