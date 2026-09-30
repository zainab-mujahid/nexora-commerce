import type { ReactNode } from "react";

import { Reveal } from "@/app/_components/motion/reveal";

// Re-mounts on every navigation within /admin (unlike the layout, which
// keeps the requireAdmin() guard and section tabs), so each admin page's
// content eases in under the tabs.
export default function AdminTemplate({ children }: { children: ReactNode }) {
  return (
    <Reveal trigger="mount" rise={10} className="flex flex-col">
      {children}
    </Reveal>
  );
}
