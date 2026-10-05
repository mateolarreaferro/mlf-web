import Link from "next/link";
import { redirect } from "next/navigation";
import { Reveal, Typewriter } from "@/components/motion";
import LoginForm from "@/components/capsula/LoginForm";
import { isAdmin, me } from "@/lib/capsula/auth";

export const dynamic = "force-dynamic";

/* The door: a friend signs in with what Mateo gave them. */
export default async function Capsula() {
  const person = await me();
  if (person) redirect(`/capsula/${person.username}`);
  if (await isAdmin()) redirect("/capsula/admin");

  return (
    <div className="flex min-h-[86dvh] flex-col justify-center gap-10 px-1 pt-16">
      <div>
        <h1 className="text-[2.4rem] font-medium leading-tight tracking-[-0.03em]">
          <Typewriter text="cápsula del tiempo" perChar={55} delay={200} />
        </h1>
        <Reveal delay={0.9}>
          <p className="mt-3 max-w-sm text-faint">
            Una vez al año, las mismas preguntas. Un lugar para ver cómo cambiamos con el tiempo.
          </p>
        </Reveal>
      </div>
      <Reveal delay={1.1}>
        <LoginForm />
      </Reveal>
      <Link href="/capsula/admin" className="label self-start transition-colors hover:text-accent">admin</Link>
    </div>
  );
}
