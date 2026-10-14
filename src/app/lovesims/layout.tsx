import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "LoveSims" },
  description: "Two invented people on a first date. Read each line and guess how it landed.",
};

/* LoveSims' room: no portfolio header or footer (SiteChrome), always the light paper (globals.css). */
export default function LoveSimsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-lovesims className="mx-auto w-full pb-16 text-neutral-800">
      {children}
    </div>
  );
}
