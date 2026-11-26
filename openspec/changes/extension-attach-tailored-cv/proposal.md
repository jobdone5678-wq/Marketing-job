## Why

The extension contains dedicated attachment helpers and a background attachment flow. The Next.js app serves authorized resume files. Treat tailored-document routing as a separate contract from ordinary resume attachment.

## What Changes

- Resolve the tailored PDF by the current job and confirmed candidate. Enable the offered action only when the correct document and one reachable upload target are both present.
- Keep download and Chrome DevTools Protocol operations in the WXT background entry point. Target the selected frame and input, confirm the native change, release debugger state, and report exact failure reasons.
- Keep ordinary field fills independent of file attachment. A spontaneous file input on the page does not authorize upload.

Behavior requirements are in [extension autofill](specs/extension-autofill/spec.md).

Implementation references include [privileged extension execution](../../../extension/entrypoints/background.ts), [attachment helpers](../../../extension/lib/tools/attachCv.ts), [side-panel action](../../../extension/entrypoints/sidepanel/MatchCard.svelte), [authorized resume download](../../../src/app/api/extension/resume-file/route.ts).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## Why

`extension-autofill`'s own spec states the CV file "is downloaded by hand from the CV
surface" because "the extension has no upload primitive." That gap is real friction: a
candidate applying through the panel already sees their match and their tailored CV exists
server-side, but still has to leave the ATS tab, open freehire, download the PDF, come back,
and click through the OS file picker themselves.

`combobox-actuation`'s design explicitly named this exact case as the seam for
`chrome.debugger` / CDP: "File upload, and anything that submits a form" was carried as a
non-goal, and CDP was called "a seam, not a dependency... not paid until a widget is found
that demonstrably needs it." A live-form spike against production Greenhouse (Anthropic's
board) and Lever (1inch's board) confirms it is needed here: neither ATS's upload widget has
a script-reachable drop handler, both rely on the browser's native `input.files`, which no
script — page or content-script — can assign to (`HTMLInputElement.files` has no writable
IDL setter; this is a platform restriction, not a permission gap). The only script-driven
path onto that input is `DOM.setFileInputFiles` over CDP, which is what `chrome.debugger`
exposes to an extension.

## What Changes

- The panel gains an **"Attach tailored CV"** action, shown only when the job currently in
  view already has a tailored CV (an existing copy from `cv-tailoring`, matched by job slug)
  and the page shows a file upload field (`extractUploads` already detects this today).
- Clicking it: fetches the tailored CV's rendered PDF from hire, saves it to disk via
  `chrome.downloads`, attaches the debugger to the active tab via `chrome.debugger`, and
  calls CDP `DOM.setFileInputFiles` to place that file into the page's upload field, then
  detaches.
- **New manifest permissions: `debugger` and `downloads`.** Chrome shows a persistent
  "freehire is debugging this browser" banner for as long as the debugger stays attached —
  the attach/call/detach sequence is kept as short as possible to bound that window.
- No tailored CV for the job in view → no button; nothing about the existing manual
  download-and-upload path is removed.

## Capabilities

### New Capabilities
(none — this extends the extension's existing autofill surface rather than introducing a
new domain concept)

### Modified Capabilities
- `extension-autofill`: adds a file-attach primitive and a requirement governing when the
  panel offers it, replacing the spec's current "no upload primitive" statement for the
  tailored-CV case specifically (the manual path remains for every other case: no tailored
  CV, no debugger permission granted, or a base-CV-only application).

## Impact

- **freehire-extension**: new `lib/tools/attachCv.ts` (or similar) wrapping
  `chrome.debugger`/`chrome.downloads`; a new button in `MatchCard.svelte`; `wxt.config.ts`
  gains the two permissions; `lib/freehire.ts` gains a call to resolve the tailored CV for
  the viewed job slug and fetch its PDF.
- **hire**: no new endpoint expected — `GET /me/cvs` (filterable/scannable by `job_slug`)
  and `GET /me/cvs/:id/pdf` already exist and already authenticate the extension's Bearer
  token the same way every other `lib/freehire.ts` call does.
- **Dependencies**: none new on the hire side. On the extension side, no new npm
  dependency — `chrome.debugger`/`chrome.downloads` are built into the Chrome extension
  APIs already typed via `@wxt-dev/browser`.

</details>
