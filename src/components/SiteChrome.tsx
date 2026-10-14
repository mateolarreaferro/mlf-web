"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/*
  The site's header and footer, everywhere but the capsule and LoveSims:
  /capsula is a private place for friends with its own small header, and
  /lovesims is a hosted demo with its own, neither a page of the portfolio.
*/
export default function SiteChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path.startsWith("/capsula") || path.startsWith("/lovesims") ? null : children;
}
