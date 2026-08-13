---
name: "Second Brain"
category: "llm-maintained company brain"
group: "agents"
tags: [agents, tools for creativity]
order: 4
year: "2026–"
role: "creator"
isActive: true
---

A company is mostly memory — what it learned, why it chose what it chose, what it already tried and abandoned. Almost none of that gets written down, and what does goes stale the moment it is filed. Second Brain is the company brain I built for Attractor: a wiki the model maintains rather than one people are supposed to remember to update.

The division of labor is the idea. Humans curate sources and ask questions; the model owns the bookkeeping — writing pages, updating cross-references, keeping the whole thing consistent with itself. Raw material stays immutable underneath, the wiki layer above it is continuously rewritten, and the schema governing both co-evolves with use. Drop in a paper and it gets integrated. Ask a question and the answer arrives with its provenance. Run a lint and the system reports its own contradictions, orphans, and stale claims. A knowledge base that can audit itself is a different kind of object from a folder of documents.

---

## notes

**PRIVACY CHECK NEEDED.** The source is `~/Desktop/Attractor Labs`, a private
company repo. The description above deliberately describes only the *system* —
no company specifics. The repo also contains `brain/data-room/`,
`brain/investment/`, `brain/finance/`, `brain/legal/`, and `brain/people/`.
None of that should ever reach this site, and no screenshot of the brain UI
should be published without checking what's on screen first.

**What it is.** An LLM-maintained wiki following the Karpathy LLM-wiki pattern —
the brain as a persistent, compounding artifact rather than a static archive.
Started 2026-05-05; ~205 commits and ~539 markdown pages as of August 2026.

Three layers:
- **Raw sources** — papers, meeting transcripts. Immutable.
- **The wiki** — every other markdown file under `brain/`. LLM-owned.
- **The schema** — a root `CLAUDE.md` plus per-section conventions, co-evolving
  with use.

Operations: `/ingest` (drop a source, the model integrates it), `/ask` (query
the wiki), `/lint` (health-check for contradictions, orphans, stale claims),
`/digest` (paper → summary), `/new-sim` (scaffold a project).

Sections span company (mission, vision, OKRs), engineering (standards, ADRs),
playbooks, projects, meetings, research, and synthesis. `index.md` is an
LLM-maintained catalog of every page; `log.md` is an append-only chronological
record of ingests, queries, and lints.

`apps/brain-ui/` is a Next.js front end over the wiki — graph view plus chat.
Which is the same shape as this site: markdown as the single source of truth,
rendered as a graph and answerable by an agent. This site is the personal case;
Attractor's brain is the company case.

Related: [[augtwins]] — a twin is a brain with a voice and a point of view.
[[attractor]] is the company this was built for.

Needs: an image (a sanitized brain-UI screenshot?), and a decision on whether
there is anything public to link to.
