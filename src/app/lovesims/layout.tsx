import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Press_Start_2P, VT323 } from "next/font/google";

export const metadata: Metadata = {
  title: { absolute: "LoveSims" },
  description: "Two invented people on a first date. Read each line and guess how it landed.",
};

/* The terminal's two faces: VT323 for everything that is read, Press Start 2P for titles. */
const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323" });
const press = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press" });

/* LoveSims' room: no portfolio header or footer (SiteChrome), always the dark phosphor screen (globals.css). */
export default function LoveSimsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-lovesims className={`${vt323.variable} ${press.variable} mx-auto w-full pb-16 text-ink`}>
      {children}
    </div>
  );
}
