"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/*
  The site's header and footer, everywhere but the capsule: /capsula is a
  private place for friends with its own small header, not a page of the
  portfolio.
*/
export default function SiteChrome({ children }: { children: ReactNode }) {
  return usePathname().startsWith("/capsula") ? null : children;
}
