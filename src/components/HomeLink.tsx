"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/*
  The wordmark is also "close whatever is open". An open project lives in the
  URL as /?project=<slug> (see HeroGraph), so a plain Link back to "/" is
  enough to close it: the search param goes, and the panel with it.
*/
export default function HomeLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href="/" className={className}>
      {children}
    </Link>
  );
}
