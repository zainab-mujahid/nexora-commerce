import type { ReactNode } from "react";

import { Reveal } from "@/app/_components/motion/reveal";

// Re-mounts on every navigation within /orders (unlike the layout), so each
// page's content eases in while the account navigation above stays put.
export default function OrdersTemplate({ children }: { children: ReactNode }) {
  return (
    <Reveal trigger="mount" rise={10} className="flex flex-col">
      {children}
    </Reveal>
  );
}
