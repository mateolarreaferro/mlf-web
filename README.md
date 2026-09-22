# mateolarreaferro.com

Personal site of [Mateo Larrea Ferro](https://www.mateolarreaferro.com) — a
personal brain portfolio. All of the work hangs off a living knowledge graph
with me at the center: press a node to open a project, press the photo to
talk to an AI agent that knows the work.

Built with Next.js (App Router), Tailwind, `motion`, and the AI SDK. All
portfolio content lives as markdown files:

- `content/projects/*.md` — one file per project (frontmatter: name,
  category, group, image, video, repo, link). Drop a file and it appears in
  the graph, gets a card, and enters the agent's knowledge.
- `content/thoughts/*.mdx` — blog posts in English and Spanish; MDX, so
  posts can embed live React components (SoundCloud, Vimeo, WebAudio demos).

The underwater `/agents` site also has editable 3D weekly notes backed by
private cloud storage. See [weekly notes](docs/weekly-notes.md) for writing,
owner access, storage, and verification.

## Develop

```bash
npm install
echo "OPENAI_API_KEY=sk-..." > .env.local   # powers the agent chat
npm run dev
```
