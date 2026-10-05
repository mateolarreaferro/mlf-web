import Link from "next/link";
import { redirect } from "next/navigation";
import { Reveal } from "@/components/motion";
import Bar from "@/components/capsula/Bar";
import { Unlock } from "@/components/capsula/controls";
import { isAdmin, me, openTo } from "@/lib/capsula/auth";
import { listPeople } from "@/lib/capsula/store";

export const dynamic = "force-dynamic";

/*
  Everyone who keeps a capsule here. Names only: every capsule is closed,
  and the only way into someone else's is the password they choose to give.
*/
export default async function Circle() {
  const [viewer, admin] = await Promise.all([me(), isAdmin()]);
  if (!viewer && !admin) redirect("/capsula");
  const people = (await listPeople()).filter((p) => p.username !== viewer?.username);
  const opened = await openTo(people);
  const home = viewer ? `/capsula/${viewer.username}` : "/capsula/admin";

  return (
    <>
      <Bar home={home} />
      <Reveal>
        <h1 className="text-[2.4rem] font-medium leading-tight tracking-[-0.03em]">el círculo</h1>
        <p className="mt-3 max-w-lg text-faint">
          {admin
            ? "Todos los que guardan su cápsula aquí."
            : "Todos los que guardan su cápsula aquí. Cada cápsula es privada: para leer la de alguien, pídele su contraseña."}
        </p>
      </Reveal>
      <ul className="mt-14 flex max-w-2xl flex-col gap-1">
        {viewer ? (
          <li className="flex items-baseline justify-between gap-4 rounded-2xl bg-white/60 px-5 py-4">
            <Link href={home} className="font-medium transition-colors hover:text-accent">{viewer.name}</Link>
            <span className="label">tú</span>
          </li>
        ) : null}
        {people.map((p) => (
          <li key={p.username} className="rounded-2xl px-5 py-4 transition-colors hover:bg-white/50">
            {admin || opened.has(p.username) ? (
              <div className="flex items-baseline justify-between gap-4">
                <Link href={`/capsula/${p.username}`} className="transition-colors hover:text-accent">{p.name}</Link>
                <span className="label">{admin ? "" : "abierta con su contraseña"}</span>
              </div>
            ) : (
              <Unlock username={p.username} name={p.name} inline />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
