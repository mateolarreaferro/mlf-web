# Satie scene

Composed through Satie MCP; refined and integrated by Codex on 2026-09-21.

- Revision: `6f76d835e655616c62bf9e8b40e9a1093b2e029ea8b59e6c7082cc27e5553606`
- Script SHA-256: `687c5a1558e4d8c81b9145730aad3352b66fba0c8690327281b8b8236ca8f1f1`
- Runtime: vendored Satie Three.js adapter 0.4.2
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

The fixed `level_reference` is now 52. The previous value of 70 left the
entrance around -50 dBFS RMS in browser capture. The revised reference raises
playback by 18 dB while preserving spatial contrast and reading attenuation;
the same comparison route measured approximately -32 dBFS at its entrance.
These are digital output measurements, not calibrated speaker loudness.

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

Final automated review: `review.json` records the exact script and audition
hashes. All 19 events were accepted by loaded voices; the playthrough audit
reported no issues or warnings, and Satie accepted the recorded vocal mix.
