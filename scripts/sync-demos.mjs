/*
  Projects that run on this site. Each one keeps its own repository, cloned
  into hosted/ (ignored by this repo), and

      npm run sync:demos

  builds it and mirrors the result here, where it IS committed:

      public/<slug>/        the built front end, served at /<slug>
      python/<slug>/src/    the backend source, run by api/<slug>-worker.py

  Edit the project's own repo, never these copies: the next sync replaces
  them whole. A project file opts in with `demo: "/<slug>"` in its frontmatter,
  which is the "interactive demo" pill on its card.

  Theo: the Studio front end is a Vite app that reads its API base from
  VITE_THEO_API, and the backend is the FastAPI module the desktop app spawns.
  Here its endpoint functions are called directly by python/theo/bridge.py.

  HeadWave: the front end is plain files with no build step. Its static/web.js
  stands in for the Python server inside the browser, so only the assistant
  service (prompt to p5 sketch) is copied as a backend.

  Sticky notes: Ansantuario's renderer built for the web as an open wall by
  its own npm run build:web (vite.web.config.ts swaps out every Firebase
  module, so the private wall is never reachable, and names neither the app
  nor its song). There is no Python here: notes go to src/app/api/sticky-notes.
  The 57 MB wav becomes a 128 kbps mp3 called music.mp3.
*/

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeRequirements } from "./requirements.mjs";

const root = path.resolve(import.meta.dirname, "..");
const junk = (src) => !/(^|\/)(\.DS_Store|__pycache__|\.gitkeep)$/.test(src);

function theo() {
  const repo = path.join(root, "hosted", "Theo");
  const studio = path.join(repo, "studio");
  if (!existsSync(path.join(studio, "package.json"))) {
    console.error(`sync-demos: nothing at ${repo}. Clone github.com/mateolarreaferro/Theo into hosted/ first.`);
    process.exit(1);
  }

  // Electron is a dev dependency of the Studio; skipping install scripts
  // avoids downloading its binary, which the web build never uses.
  if (!existsSync(path.join(studio, "node_modules"))) {
    execFileSync("npm", ["ci", "--ignore-scripts"], { cwd: studio, stdio: "inherit" });
  }
  execFileSync("npx", ["vite", "build", "--base=/theo/"], {
    cwd: studio,
    stdio: "inherit",
    env: { ...process.env, VITE_THEO_API: "/api/theo" },
  });

  const site = path.join(root, "public", "theo");
  rmSync(site, { recursive: true, force: true });
  cpSync(path.join(studio, "dist"), site, { recursive: true, filter: junk });
  // The password box past the free model calls (public/unlock.js) loads first.
  const index = path.join(site, "index.html");
  writeFileSync(index, readFileSync(index, "utf8").replace("<head>", '<head>\n    <script src="/unlock.js"></script>'));
  console.log("sync-demos: public/theo now matches hosted/Theo/studio");

  // Source only: never a venv, saved versions, or anything from .env.
  const src = path.join(root, "python", "theo", "src");
  rmSync(src, { recursive: true, force: true });
  mkdirSync(path.join(src, "backend"), { recursive: true });
  cpSync(path.join(repo, "theo"), path.join(src, "theo"), { recursive: true, filter: junk });
  for (const file of ["server.py", "version_store.py"]) {
    cpSync(path.join(studio, "backend", file), path.join(src, "backend", file));
  }
  console.log("sync-demos: python/theo/src now matches hosted/Theo");
}

function headwave() {
  const repo = path.join(root, "hosted", "HeadWave");
  if (!existsSync(path.join(repo, "static", "web.js"))) {
    console.error(`sync-demos: nothing at ${repo}. Clone github.com/mateolarreaferro/HeadWave into hosted/ first.`);
    process.exit(1);
  }

  const site = path.join(root, "public", "headwave");
  rmSync(site, { recursive: true, force: true });
  cpSync(path.join(repo, "static"), path.join(site, "static"), { recursive: true, filter: junk });

  // The page is written for the root of its own server. Here it lives under
  // /headwave, and loads the browser runtime before anything else.
  const first = '<script src="/static/sketch.js"></script>';
  const page = readFileSync(path.join(repo, "templates", "index.html"), "utf8");
  if (!page.includes(first)) {
    console.error("sync-demos: HeadWave's index.html no longer loads sketch.js first; update the web runtime injection.");
    process.exit(1);
  }
  const runtime = '<script src="/unlock.js"></script>\n  <script>window.HEADWAVE_API = "/api/headwave";</script>\n  <script src="/static/web.js"></script>\n  ';
  writeFileSync(
    path.join(site, "index.html"),
    page.replace(first, runtime + first).replaceAll('"/static/', '"/headwave/static/'),
  );
  console.log("sync-demos: public/headwave now matches hosted/HeadWave");

  const src = path.join(root, "python", "headwave", "src");
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  for (const file of ["__init__.py", "assistant_service.py", "taxonomy.py"]) {
    cpSync(path.join(repo, "src", file), path.join(src, file));
  }
  console.log("sync-demos: python/headwave/src now matches hosted/HeadWave");
}

function stickyNotes() {
  const repo = path.join(root, "hosted", "Ansantuario");
  if (!existsSync(path.join(repo, "vite.web.config.ts"))) {
    console.error(`sync-demos: nothing at ${repo}. Clone github.com/mateolarreaferro/Ansantuario into hosted/ first.`);
    process.exit(1);
  }
  // Electron's postinstall downloads native builds the web page never uses.
  if (!existsSync(path.join(repo, "node_modules"))) {
    execFileSync("npm", ["ci", "--ignore-scripts"], { cwd: repo, stdio: "inherit" });
  }
  execFileSync("npm", ["run", "build:web"], { cwd: repo, stdio: "inherit" });

  const site = path.join(root, "public", "sticky-notes");
  const music = path.join(site, "audio", "music.mp3");
  const keep = existsSync(music) ? readFileSync(music) : null;
  rmSync(site, { recursive: true, force: true });
  cpSync(path.join(repo, "dist-web"), site, { recursive: true, filter: junk });
  // The password box guards moderation (public/unlock.js); it loads first.
  const index = path.join(site, "index.html");
  writeFileSync(index, readFileSync(index, "utf8").replace("<head>", '<head>\n    <script src="/unlock.js"></script>'));

  mkdirSync(path.dirname(music), { recursive: true });
  if (keep) writeFileSync(music, keep);
  else {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(repo, "src", "renderer", "public", "audio", "bicho.wav"),
      "-codec:a", "libmp3lame", "-b:a", "128k", music], { stdio: "inherit" });
  }
  console.log("sync-demos: public/sticky-notes now matches hosted/Ansantuario");
}

theo();
headwave();
stickyNotes();
writeRequirements(root);
