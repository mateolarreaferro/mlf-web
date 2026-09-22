# Scene entrance

The `/agents` entrance follows the sparse title screen at
https://cognitive-agents.media.mit.edu/. The entire scene UI now uses its
`Helvetica Neue, Helvetica, Arial, sans-serif` stack, including the 3D room
labels and note textures. No Google font request is needed.

**Join as guest** selects the guest role without a code and clears a previous editor cookie.
**Join as editor** checks the existing weekly-note code on the server before
entering. It uses the same HttpOnly session and permissions as the notes API;
no second password or new credential is introduced. The code is cleared from
the input after entry and is never saved in browser storage.

A tab remembers its chosen view across reloads using sessionStorage. Editor
entry on reload is still verified with the server; an expired session requires
the code again. New tabs display the entrance. Guests can use the scene and
read notes, while only authenticated editors can change saved notes.

**Enter with sound** is an explicit opt-in shown after choosing a role, before loading the world. **Enter quietly** loads the world without audio. Reloads preserve the role but still offer this sound choice. Choosing a role, typing a code, and
exploring as a guest do not start sound. The entrance, navigation sound button and controls operate the same Satie engine. Loading shows sample progress; failed loads can be retried or skipped. See [the ecosystem implementation](living-ecosystem.md). Once requested, later gestures
can resume browser-suspended audio without undoing an intentional mute.

The existing silent `?embed=1` scene skips the entrance. Deep links such as
`#week01` still arrive at the requested room after entry. The WebGL fallback
retains guest access to the room pages.

The MIT and Media Lab SVG marks are the assets served by the reference course
website; their provenance is in `website/media/branding/README.md` in the
class repository. The author credit identifies this as Mateo's portfolio.

Run `node scripts/test-scene-entrance.mjs` against a local Next server on port
3001. Set `AGENTS_URL` for the deployed site. It checks guest/editor entry,
incorrect codes, editor-session validation, guest read-only access, explicit
quiet entry, no world loading before the sound choice, logo loading,
the typeface, desktop/mobile layouts, and the silent embed. It does not create
or modify notes. `scripts/test-weekly-notes.mjs` separately exercises note
creation and persistence through the new entrance and removes its own fixtures.
