import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "cápsula del tiempo" },
  description: "Un lugar para ver cómo cambiamos con los años.",
  robots: { index: false, follow: false },
};

/* The capsule's room: no portfolio header or footer (SiteChrome), always the light paper (globals.css). */
export default function CapsulaLayout({ children }: { children: ReactNode }) {
  return (
    <div data-capsula className="mx-auto w-full max-w-5xl pb-24 text-[15px]">
      {children}
    </div>
  );
}
