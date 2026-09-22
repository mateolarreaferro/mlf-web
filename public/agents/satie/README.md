# Satie scene

Composed through Satie MCP; refined and integrated by Codex on 2026-09-21.

- Revision: `cb1de5ff8ae2ca647f6f327f8fc01a13a972bc519f65e719d865d4a3340a73c0`
- Script SHA-256: `8162e8e37184ae305fee9f8911652d8c5170141d27bc8d50580b6afb5e44a3f0`
- Runtime: vendored Satie Three.js adapter (provenance in `assets.lock.json`)
- Contract: 24 hosts, 5 signals, 19 events
- Assets: 112 clip entries, 108 unique local recordings

`scene.satie`, `scene.contract.json`, `samples.json`, `mix.json` and `assets.lock.json`
are installed together. The lockfile preserves each source URL, licence,
sample ID and byte hash. Playback uses only local samples; web fonts are the
page's optional external request.

The original extended composition was recovered from Satie run
`742dea28-428f-407d-a7a8-49971f238779`. Failed takes were regenerated through MCP;
where a variation still failed, an accepted variation of the same prompt was
retained. No rejected take was installed. Codex lowered the pressure and vocal
levels, fixed the bell's pitches to 1 / 1.2 / 1.5, and added the requested
half-speed rain, open-ocean recording and low drone using Satie assets.

The fixed `level_reference` and `mix.json` both use 60.

The September 22 mix adds three lower choir voices, soft midwater bubbles, a
slow current and a harmonic water bed, using the installed recordings. Existing
singers and selected ambience layers have wetter reverb. All seven singers share
the panel's voices control. New layers retain reading attenuation.

`ambience-review.json` records browser checks of the six added layers, reverb,
voice controls and output at three positions. It is signal/runtime verification,
not a claim of human listening approval. `review.json` is the earlier Satie review
and applies only to the script hash recorded in that file.

Global positional event voices intentionally omit `within`: that property
gates distance from the voice's *pre-event position*, not the listener. The
page already gates proximity and applies hysteresis before emitting events.
Listener height uses `ascent`, because the runtime owns and overwrites
`depth`. Vocal filters use real cutoff values and `occlusion follow distance`;
`cutoff follow` silently becomes a 20 Hz filter in runtime 0.4.2 and must not
be used. Browser checks assert actual filter frequencies and height-dependent
bed levels, in addition to modelled SPL.

Every continuous and occasional voice uses non-strict `zone water`; a reading
panel enters `reading`, which attenuates and filters those voices. The page-open
bell is scoped to `reading`. `world.swell` drives both membranes and audio.

To install another reviewed integration result, run from the class repo root:

```sh
node scripts/vendor-satie.mjs /path/to/integration-result.json
```

The installer checks hashes and completes downloads before changing the live
script and manifests. It keeps old sample files until a deliberate cleanup.

The runtime follows Satie's field-study integration: `mix.json` supplies the
fixed level anchor, the scene loads completely before the sound control enables,
and the first gesture resumes the context synchronously before calling
`scene.start()`.

Browser checks live in the enclosing MLF-Web repo's `scripts/test-agents.mjs`.
With this website served on port 4173, run from MLF-Web:

```sh
CHROMIUM_PATH=/path/to/chrome-headless-shell node scripts/test-agents.mjs
CHROMIUM_PATH=/path/to/chrome-headless-shell node scripts/test-agents-audio.mjs
```

The check exercises every event and verifies voice acceptance, reading state
while muted, mute persistence, touch gestures and the shared swell. It records
actual engine output for `satie_listen`, plus local runtime telemetry for
`satie_audit_playthrough`. Neither capture is contributed as a training episode.
Automated listening is agent evidence, not human approval. No human listening
review is claimed for this revision.

The audio startup regression check waits for the scene to finish loading, then
uses a synchronous context resume followed by `scene.start()` from a mouse or
touch gesture, matching Satie's field-study lifecycle. It measures 12 seconds
of uninterrupted output with a minimum RMS of 0.005. It also checks that Space
swims after a pointer click on sound, keyboard activation retains focus, and a
browser suspension can resume the same voices.

Earlier automated review: `review.json` records that revision’s script and audition
hashes. All 19 events were accepted by loaded voices; the playthrough audit
reported no issues or warnings, and Satie accepted the recorded vocal mix.
