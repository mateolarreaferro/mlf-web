# Weekly notes

Open `/agents`, choose **notes**, select a week, and use **edit** to sign in.
The editing key is in the ignored local `.env.weekly-notes-owner` file. It is
also configured as the sensitive production `WEEKLY_NOTES_EDIT_KEY` secret.
Never commit that file or put the key in a URL. Sign-in lasts 30 days on that
browser; sign out from the notes bar. Rotating the secret invalidates sessions.

Notes are public to read and owner-only to edit. Set
`WEEKLY_NOTES_VISIBILITY=private` on the server to require sign-in for reads too.
The default is public, following the course website's weekly documentation.

## Writing

- **+ note** creates a note in the selected week, including future weeks.
- Click a floating card (or its text in the bottom row) to write. Text saves
  after a short pause and when closing the card. The status says when it saved.
- Choose a color in the card; drag cards in the 3D overview to move them.
- Each week holds up to 24 notes, shown six at a time. Full text, up to 4,000
  characters, is available in the close-up even if the 3D preview is truncated.
- Removal asks for confirmation. A failed save preserves a browser draft and
  offers retry. Reloading restores that draft after sign-in. Conflicting edits
  show the draft and let the owner keep it or load the saved note explicitly.
- The course site served by Python or GitHub Pages has no cloud API. Shared
  notes and sign-in are hosted at `https://mateolarreaferro.com/agents`.

## Implementation

Edit the canonical static UI in `agents2026-mateo/website/js/notes*.js`, then
run `npm run sync:agents` to update `public/agents`. The scene uses curved
Three.js planes and canvas text; editing uses a native textarea in a dialog.
The camera stays still while editing. Reduced motion, touch input, keyboard
navigation, a screen-reader-accessible note index, and the existing audio
controls remain available.

`src/app/api/weekly-notes/route.ts` and `src/lib/weekly-notes.ts` implement the
API. A dedicated **private** Vercel Blob store, `mlf-weekly-notes`, holds
`weekly-notes/board-v1.json`; `BLOB_READ_WRITE_TOKEN` never reaches the browser.
This is durable storage, independent of deployment files or function memory.
No schema or data is shared with Satie or brain-ui.

The server validates every field and checks same-origin requests and a signed,
HttpOnly, SameSite=Strict session for writes. Notes are plain text. Each note
has its own revision, and the whole document uses conditional Blob writes to
merge independent changes without dropping another note. Both Next's fetch
cache and Blob's CDN cache are bypassed. Reads request `Accept-Encoding:
identity`, since compressed Blob responses use weak ETags that cannot satisfy
conditional writes. A failed/conflicting write never reports success.

Only unfinished drafts are backed up in this browser's localStorage. Clearing
site data removes these unsaved drafts; it does not remove saved cloud notes.
Private mode controls server access; it does not encrypt local drafts.

## Verification

`node scripts/test-weekly-notes.mjs` uses the local Next server on port 3001
and real Blob storage. It creates temporary fixture notes and cleans up only
those notes. Set `AGENTS_URL` to check the deployed website and `NOTES_OUTPUT`
to choose the report/screenshot directory.

Checks include writing, autosave, reload, dragging, dropped-connection recovery,
cross-browser reads, blocked visitor writes and cross-origin writes, conflict
resolution, independent weeks, mobile layout, typing without swimming, and
cancelled/confirmed removal. The production release also requires lint and
a production build. The existing scene-agent and audio code is unchanged.
