# Living underwater ecosystem

The world now has three timescales: moving particles and swimming life over
seconds, evolving currents and plankton over minutes, and Boston weather and
a modelled tide over hours. This is an artistic dynamical system, not an ocean
forecast or a learned world model.

`website/js/ecosystem.js` in the class repository owns bounded state: current,
energy, turbulence, light, nutrients and plankton. Wind direction and speed
steer circulation; gusts and precipitation increase turbulence; daylight and
cloud cover alter light; temperature changes metabolism. Mixing replenishes
nutrients, plankton consumes them, and plankton affects bioluminescence.
Responses ease over 24–180 seconds, so a fresh weather reading never produces
a sudden scene change. Solar/tidal phases use wall-clock time; the nutrient
and plankton simulation runs while the scene is open, without server-side
persistence. The 12.42-hour tide is modelled, not observed Boston tide data.

`GET /api/agents-weather` fetches only Boston (42.36, −71.06), shared across
visitors with a 15-minute server cache. It uses current conditions from
[Open-Meteo](https://open-meteo.com/en/docs): temperature in °C, wind/gusts in
km/h, direction in degrees, precipitation in mm, cloud cover in percent and
day/night. It validates the reading and time, limits the request to eight
seconds, and returns 503 when unavailable. No visitor geolocation is used.
The browser polls every 15 minutes and when returning to the tab. A last
reading may be reused for six hours, labelled “last weather”; otherwise the
label says “simulated tide”. Weather never blocks entry. The weather label
links to the data provider and its tooltip includes the observation time.

`world.js` feeds the shared current and ecological state into the shader.
The old current uniform was always zero, and the default animation multiplier
was 0.05; the defaults are now a working current and 0.8 speed. Existing
manual/agent controls still work. A manual view-distance change takes priority
over weather-driven visibility. User mixer trims retain their original gain
stages; the world’s weather-influenced swell still drives the Satie swell signal.

Attractors are populations travelling through RK4-integrated chaotic paths,
with fading tails, slow deformations and moving centres. They use a 4096-point
floating-point path texture, rather than rotating fixed points. Surrounding
vortices and Satie hosts follow their moving centres. Streamlines carry pulses
of light; membranes breathe, plankton drifts, and schools follow the current.
`flow-ribbons.js` adds persistent advected histories with fixed simulation steps
and preallocated buffers in one draw call. Phones use fewer particles and
ribbons. Reduced-motion mode freezes the world’s animation and simulated
state; it does not prevent guest navigation or reading notes.

## Entrance and audio

The role screen appears before creating the WebGL world or an AudioContext.
After guest/editor selection, “enter with sound” synchronously creates and
resumes the actual Satie AudioContext inside the click, then starts loading
the scene. A progress bar reports decoded samples (not a fabricated percent).
“Enter quietly” creates the world without fetching or decoding audio samples.
Both modes retain **notes**, **sound**, **controls** and **rooms** in the nav;
guest notes are read-only.

The 108 unique stereo assets would occupy about 518 MiB decoded at 44.1 kHz.
The wrapper injects a 24 kHz AudioContext, roughly halving that footprint,
with browser-default sample rate as a compatibility fallback. Original sample
files and SHA-256 verification are unchanged. The vendor change only exposes
the existing engine constructor; see `website/vendor/README.md`.

A failed sound load disposes the incomplete engine and offers retry or quiet
entry. Retrying creates a fresh context, verifies the same asset checksums,
and reloads the scene. There is a 90-second overall audio-load timeout plus
15-second metadata timeouts. Sound can also be enabled/retried from the nav
or controls. Intentional mute is respected; incidental clicks never unmute.
Back/forward navigation suspends the existing context instead of destroying
it, avoiding restored pages that hold a disposed engine. The silent homepage
embed still starts automatically without audio.

## Verification

- `node scripts/test-ecosystem.mjs`: gradual transitions, different weather
  causes different circulation, long-run finite state, zero-delta freeze,
  invalid weather rejection and stale-data fallback.
- `node scripts/review-living-world.mjs`: desktop/mobile entry, actual audio
  waveform output, guest notes, motion, screenshots, mute, and loading-error
  recovery through the retry button.
- `node scripts/test-scene-entrance.mjs`: code rejection, real editor access,
  guest read-only notes, session validation, mobile and silent embed.
- `AGENTS_URL=http://127.0.0.1:3001/agents/ node scripts/test-scene-agent.mjs`:
  manual/agent control validation and actual mixer amplitude/routing.
- `node scripts/test-weekly-notes.mjs`: saved-note and draft persistence through
  the updated entrance, removing only the test run’s own note IDs afterward.

Browser scripts default to the local Next server on port 3001 unless stated
otherwise; `AGENTS_URL` can target the deployment. No model inference or extra
paid audio generation is used to animate this environment.
