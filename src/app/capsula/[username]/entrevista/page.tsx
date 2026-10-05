import { notFound, redirect } from "next/navigation";
import Interview from "@/components/capsula/Interview";
import { access, canWrite } from "@/lib/capsula/auth";
import { ACTIVE } from "@/lib/capsula/questions";
import { getDraft, getPerson } from "@/lib/capsula/store";

export const dynamic = "force-dynamic";

/* This year's interview, picked up wherever it was left. */
export default async function InterviewPage({ params }: PageProps<"/capsula/[username]/entrevista">) {
  const { username } = await params;
  const person = await getPerson(username);
  if (!person) notFound();
  if (!canWrite(await access(person))) redirect("/capsula");
  const draft = await getDraft(person.username);
  if (!draft) redirect(`/capsula/${person.username}`);
  return (
    <Interview
      username={person.username}
      initial={draft.messages}
      round={draft.round}
      sections={ACTIVE.map((s) => s.title)}
      home={`/capsula/${person.username}`}
      voice={Boolean(process.env.ELEVENLABS_API_KEY)}
    />
  );
}
