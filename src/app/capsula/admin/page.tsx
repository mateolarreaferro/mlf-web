import Bar from "@/components/capsula/Bar";
import AdminPanel from "@/components/capsula/AdminPanel";
import LoginForm from "@/components/capsula/LoginForm";
import { isAdmin } from "@/lib/capsula/auth";
import { ENV, getDraft, listEntries, listPeople } from "@/lib/capsula/store";

export const dynamic = "force-dynamic";

export default async function Admin() {
  if (!(await isAdmin())) {
    return (
      <div className="flex min-h-[86dvh] flex-col justify-center gap-8 px-1 pt-16">
        <h1 className="text-[2.4rem] font-medium leading-tight tracking-[-0.03em]">admin</h1>
        <LoginForm admin />
      </div>
    );
  }
  const people = await listPeople();
  const rows = await Promise.all(people.map(async (p) => {
    const [entries, draft] = await Promise.all([listEntries(p.username), getDraft(p.username)]);
    return { username: p.username, name: p.name, public: p.public, rounds: [...new Set(entries.map((e) => e.round))], draft: Boolean(draft) };
  }));
  return (
    <>
      <Bar home="/capsula/admin" who="admin" />
      <AdminPanel rows={rows} root={`capsula/${ENV}/`} />
    </>
  );
}
