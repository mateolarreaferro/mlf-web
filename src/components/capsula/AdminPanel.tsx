"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LuFilePlus, LuKeyRound, LuPencil, LuRefreshCw, LuTrash2 } from "react-icons/lu";
import { Act, Button, IconAct, call, field } from "./ui";

/*
  Mateo's view: everyone in the capsule, their passwords to hand out, and a
  place to drop what he recorded (audio, a spreadsheet, a transcript, or
  pasted text) as an entry on a given date.
*/

export type Row = { username: string; name: string; rounds: number[]; draft: boolean };

const slug = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".");

/** What Mateo sends a friend: where to go and how to get in. */
function invitation(username: string, password: string) {
  return `Tu cápsula del tiempo: ${window.location.origin}/capsula\nusuario: ${username}\ncontraseña: ${password}`;
}

function Credentials({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white/80 px-4 py-3">
      <span className="text-sm">usuario <b className="font-medium">{username}</b></span>
      <span className="text-sm">contraseña <b className="font-medium tabular-nums">{password}</b></span>
      <Act onAct={async () => { await navigator.clipboard.writeText(invitation(username, password)); setCopied(true); }}>
        {copied ? "copiado" : "copiar invitación"}
      </Act>
    </div>
  );
}

function NewPerson() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [made, setMade] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2 className="label">nueva persona</h2>
      <form
        className="mt-3 flex flex-wrap gap-2"
        action={async () => {
          setBusy(true);
          setError("");
          const { data, error } = await call<{ username: string; password: string }>("people", { name, username: username || slug(name) });
          setBusy(false);
          if (error || !data) return setError(error ?? "");
          setMade(data);
          setName("");
          setUsername("");
          router.refresh();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="nombre y apellido…" aria-label="nombre" className={`${field} sm:w-56`} />
        <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder={slug(name) || "usuario…"}
          aria-label="usuario" autoCapitalize="none" spellCheck={false} className={`${field} sm:w-44`} />
        <Button type="submit" disabled={busy || !name.trim()}>crear</Button>
      </form>
      <p className="label mt-2" aria-live="polite">{error}</p>
      {made ? <Credentials {...made} /> : null}
    </section>
  );
}

function AddEntry({ username, root, onDone }: { username: string; root: string; onDone: () => void }) {
  const year = new Date().getFullYear();
  const [round, setRound] = useState(year);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function submit() {
    setBusy(true);
    const uploaded: { pathname: string; name: string }[] = [];
    try {
      for (const [i, file] of files.entries()) {
        const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "-");
        const blob = await upload(`${root}${username}/${safe}`, file, {
          access: "private",
          handleUploadUrl: "/api/capsula/upload",
          multipart: file.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setStatus(`subiendo ${i + 1} de ${files.length}: ${Math.round(percentage)}%`),
        });
        uploaded.push({ pathname: blob.pathname, name: file.name });
      }
    } catch {
      setBusy(false);
      return setStatus("La subida falló. Intenta otra vez.");
    }
    const audio = files.some((f) => f.type.startsWith("audio/") || /\.(m4a|mp3|wav|ogg|aac)$/i.test(f.name));
    setStatus(audio ? "Transcribiendo y ordenando las respuestas. Una grabación larga tarda unos minutos." : "Ordenando las respuestas…");
    const { data, error } = await call<{ answers: number }>("ingest", { username, round, date, text, files: uploaded });
    setBusy(false);
    if (error || !data) return setStatus(error ?? "");
    setStatus(`Registrada: ${data.answers} respuestas.`);
    setFiles([]);
    setText("");
    onDone();
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white/60 p-5">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="label">año de la cápsula</span>
          <input type="number" value={round} min={2000} max={2100} onChange={(e) => setRound(Number(e.target.value))} className={`${field} w-28 tabular-nums`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">fecha</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-44`} />
        </label>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); setFiles([...files, ...Array.from(e.dataTransfer.files)]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-4 py-8 text-center transition-colors ${over ? "bg-white" : "bg-white/70 hover:bg-white"}`}
      >
        <input type="file" multiple className="sr-only" accept="audio/*,.m4a,.mp3,.wav,.xlsx,.csv,.docx,.txt,.md"
          onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        <span className="text-sm">{files.length ? files.map((f) => f.name).join(", ") : "Suelta aquí un audio, una hoja, un .docx o un .txt"}</span>
        <span className="label">{files.length ? "toca para añadir más" : "o toca para elegir"}</span>
      </label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="o pega texto: notas, una transcripción…" className={`${field} resize-y`} />
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={submit} disabled={busy || (!files.length && !text.trim())}>{busy ? "registrando…" : "registrar"}</Button>
        {files.length && !busy ? <Act onAct={() => setFiles([])}>quitar archivos</Act> : null}
        <span className="label" aria-live="polite">{status}</span>
      </div>
    </div>
  );
}

/* A new name, and if needed a new username (the password stays the same). */
function Edit({ row, onDone }: { row: Row; onDone: () => void }) {
  const [name, setName] = useState(row.name);
  const [username, setUsername] = useState(row.username);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      action={async () => {
        setBusy(true);
        const { error } = await call("rename", { username: row.username, name, newUsername: username });
        setBusy(false);
        if (error) return setError(error);
        onDone();
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} required aria-label="nombre" className={`${field} sm:w-56`} />
      <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required aria-label="usuario"
        autoCapitalize="none" spellCheck={false} className={`${field} sm:w-44`} />
      <Button type="submit" disabled={busy}>{busy ? "guardando…" : "guardar"}</Button>
      <span className="label" aria-live="polite">
        {error || (username !== row.username ? "Con otro usuario, su sesión se cierra; la contraseña sigue igual." : "")}
      </span>
    </form>
  );
}

function Person({ row, root }: { row: Row; root: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>
          <Link href={`/capsula/${row.username}`} className="font-medium transition-colors hover:text-accent">{row.name}</Link>
          <p className="label">
            {row.username} · {row.rounds.length ? row.rounds.join(", ") : "sin entradas"}
            {row.draft ? " · entrevista a medias" : ""}
          </p>
        </div>
        <div className="-mr-2 flex items-center gap-0.5">
          <IconAct icon={LuFilePlus} label="añadir entrada" pressed={adding} onAct={() => setAdding(!adding)} />
          <IconAct icon={LuPencil} label="editar nombre" pressed={editing} onAct={() => setEditing(!editing)} />
          <IconAct icon={LuKeyRound} label={password ? "ocultar contraseña" : "ver contraseña"} pressed={Boolean(password)} onAct={async () => {
            if (password) return setPassword("");
            const { data } = await call<{ password: string }>("password", { username: row.username });
            if (data) setPassword(data.password);
          }} />
          <IconAct icon={LuRefreshCw} label="nueva contraseña" confirm="¿nueva? la anterior deja de servir" onAct={async () => {
            const { data } = await call<{ password: string }>("password", { username: row.username, reset: true });
            if (data) setPassword(data.password);
          }} />
          <IconAct icon={LuTrash2} label="borrar" confirm={`¿borrar a ${row.name.split(" ")[0]} y todo lo suyo?`} onAct={async () => {
            await call("remove", { username: row.username, confirm: row.username });
            router.refresh();
          }} />
        </div>
      </div>
      {editing ? <Edit row={row} onDone={() => { setEditing(false); router.refresh(); }} /> : null}
      {password ? <Credentials username={row.username} password={password} /> : null}
      {adding ? <AddEntry username={row.username} root={root} onDone={() => router.refresh()} /> : null}
    </li>
  );
}

export default function AdminPanel({ rows, root }: { rows: Row[]; root: string }) {
  return (
    <div className="flex flex-col gap-16">
      <NewPerson />
      <section>
        <h2 className="label">{rows.length} {rows.length === 1 ? "persona" : "personas"}</h2>
        <ul className="mt-2 flex flex-col">
          {rows.map((row) => <Person key={row.username} row={row} root={root} />)}
        </ul>
      </section>
    </div>
  );
}
