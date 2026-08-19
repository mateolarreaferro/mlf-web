"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/*
  The wordmark is also "close whatever is open". Pressing it has to clear an
  open project panel even when we are already on "/" — in that case the Link
  has nothing to navigate to, so nothing would re-render and the panel would
  stay put. HeroGraph owns that state and lives in a different tree, so the
  two talk through one event rather than a shared store.
*/
export const HOME_EVENT = "mlf:home";

export default function HomeLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(HOME_EVENT))}
    >
      {children}
    </Link>
  );
}
