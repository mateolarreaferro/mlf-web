import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Mateo Larrea Ferro",
    template: "%s — Mateo Larrea Ferro",
  },
  description:
    "CEO of Attractor, building generative agent simulations for modeling complex social systems. Technological tools for creativity and decision-making.",
};

const nav = [
  { href: "/", label: "me" },
  { href: "/#thoughts", label: "thoughts" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="mx-auto w-full max-w-6xl px-6 pt-8 sm:px-10 pb-4 flex items-baseline justify-between gap-6">
          <Link
            href="/"
            className="text-2xl font-light tracking-tight transition-colors hover:text-accent sm:text-3xl"
          >
            mateo larrea ferro
          </Link>
          <nav className="flex gap-5">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="label hover:text-accent">
                {item.label}
              </Link>
            ))}
            <a
              href="https://docs.google.com/document/d/1b-f1pVV5eOFlXD-wXVX5LjfEP8ezsoAGyZuNp1BaCu0/edit?tab=t.0"
              className="label hover:text-accent"
              target="_blank"
              rel="noreferrer"
            >
              cv
            </a>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 sm:px-10 flex-1">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-6 sm:px-10 mt-28 pb-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="flex gap-5">
              <a href="https://github.com/mateolarreaferro" className="label hover:text-accent" target="_blank" rel="noreferrer">github</a>
              <a href="https://soundcloud.com/mateo-larrea-ferro" className="label hover:text-accent" target="_blank" rel="noreferrer">soundcloud</a>
              <a href="https://www.linkedin.com/in/mateo-larrea-636967164/" className="label hover:text-accent" target="_blank" rel="noreferrer">linkedin</a>
              <a href="https://www.instagram.com/larreaferro/" className="label hover:text-accent" target="_blank" rel="noreferrer">instagram</a>
              <a href="mailto:mlarreaf99@gmail.com" className="label hover:text-accent">email</a>
            </div>
            <p className="label">Palo Alto, CA</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
