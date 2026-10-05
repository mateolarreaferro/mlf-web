# Periphery, the browser extension

A breathing reminder in the corner of every page you browse, to prevent
screen apnea: the circle from Mateo Larrea Ferro's piece *Periphery*
(mateolarreaferro.com/?project=periphery). In as it grows, out as it shrinks.
It takes no clicks and every tab breathes in step. The toolbar button turns
it on and off and sets the corner, size, breaths per minute (6 by default)
and opacity.

Install it in Chrome, Edge, Arc or Brave without the store:

1. Download `periphery-extension.zip` from mateolarreaferro.com and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on
   Developer mode.
3. Press "Load unpacked" and choose the unzipped folder.

Files: `manifest.json` (Manifest V3), `content.js` (the corner, in a shadow
root), `breath.js` (the breath, shared with the settings), `popup.html` /
`popup.js` (the settings, saved in `chrome.storage.sync`). No sound, no
network, no data leaves the browser; the only permission is `storage`.

The site serves the zip built from this folder:
`cd extensions/periphery && zip -r ../../public/periphery/periphery-extension.zip . -x README.md`
