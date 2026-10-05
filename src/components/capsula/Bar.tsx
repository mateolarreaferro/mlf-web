import Link from "next/link";
import { LogoutButton } from "./ui";

/* The capsule's own header: its name, who is in, and the way out. */
export default function Bar({ home, who }: { home: string; who?: string | null }) {
  return (
    <header className="flex items-baseline justify-between gap-6 pt-8 pb-14">
      <Link href={home} className="font-medium tracking-[-0.02em] transition-colors hover:text-accent">
        cápsula del tiempo
      </Link>
      <div className="flex items-baseline gap-4">
        {who ? <span className="label">{who}</span> : null}
        <LogoutButton />
      </div>
    </header>
  );
}
