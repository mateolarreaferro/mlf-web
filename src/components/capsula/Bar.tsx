import Link from "next/link";
import { LogoutButton } from "./ui";

/* The capsule's own header: its name (back to your own capsule), the circle, and the way out. */
export default function Bar({ home }: { home: string }) {
  return (
    <header className="flex items-baseline justify-between gap-6 pt-8 pb-14">
      <Link href={home} className="font-medium tracking-[-0.02em] transition-colors hover:text-accent">
        cápsula del tiempo
      </Link>
      <nav className="flex items-baseline gap-5">
        <Link href="/capsula/circulo" className="label transition-colors hover:text-accent">el círculo</Link>
        <LogoutButton />
      </nav>
    </header>
  );
}
