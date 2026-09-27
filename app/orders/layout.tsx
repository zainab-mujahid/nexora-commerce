import { AccountShell } from "@/app/_components/account-shell";

// Presentation only: shared account container + section nav. Each page
// under /orders still verifies the session itself (requireUser()).
export default function OrdersLayout({ children }: LayoutProps<"/orders">) {
  return <AccountShell>{children}</AccountShell>;
}
