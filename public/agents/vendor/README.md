# Runtime provenance

`satie-three.js` is the existing vendored Satie Three.js runtime. The ecosystem
pass adds **one named export**, `It as SatieEngine`, to its final export list.
No parser, transport, mixer, DSP, asset-verification or loading logic changes.

This exposes the existing engine constructor so `js/sound.js` can use the
adapter's existing `{ engine }` option and the engine's `{ audioContext }`
option. The context is created inside the user's sound click at 24 kHz, with
browser-default rate as a compatibility fallback. This roughly halves the
~518 MiB decoded asset footprint at 44.1 kHz (108 unique stereo assets).
Stereo, checksum validation, routing and all composed Satie voices remain.
The wrapper owns and closes the injected context when retrying a failed load.
If replacing the vendor bundle, expose the engine constructor through its
supported package export and retain this injected-context setup.
