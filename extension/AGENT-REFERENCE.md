# AGENTS.md

Guidance for AI agents working in this directory.

## What this is

The side panel opens in guest mode and shows the current application form's
fields and required-question progress. Connect NextKinHR opens the candidate
sign-in page and unlocks profile autofill, resume scoring and job tracking.

The extension uses WXT, React, and Tailwind v4. Chrome MV3 and Firefox MV2
build from the same source using pnpm.

## Layout

```
extension/            WXT + React extension
  entrypoints/
    background.ts     service worker: opens the panel, relays panel <-> content
    content.ts        injected everywhere; reads the page into a PageSnapshot
    sidepanel/        active React side panel and legacy assistant components
      App.tsx         local application form checklist and NextKinHR actions
      app.css         Tailwind and local panel theme
      main.tsx        React mount
  lib/
    assistant/        the chat: SSE reader, wire types, chat + deck reducers,
                      tool formatters, the session store, and the API and turn
                      clients (+ tests). Ported from the freehire web assistant.
    tools/            browser-tool executor: the wire contract, the executeTool
                      dispatch (+ tests), the ToolChannel socket to hire's relay,
                      and the PageBridge that reaches the tab's frames.
    auth.ts           stored token reads for the legacy API clients
    nextkinhr.ts      NextKinHR candidate APIs and session storage
    nextkinConnection.ts  pairs the candidate account from the extension's sign-in tab
    applicationSync.ts  watches for a submission and matching confirmation
    analytics.ts      anonymous usage events to GA4 via the Measurement Protocol
                      (gtag.js is remote code MV3 forbids); inert without the
                      WXT_GA_* build vars (+ test)
    freehire.ts       hire API reads (job, match, autofill profile)
    protocol.ts       in-extension RuntimeMessage contract (+ test)
    scraper.ts        DOM -> PageSnapshot + JobPosting JSON-LD check, pure over
                      its Document arg (+ test)
    addJob.ts         whether the empty match state offers "Add this job" (+ test)
    form.ts           form observe/map/act/reveal for Autofill (+ test)
    applyPlan.ts      form fields -> the panel's checklist + required counter (+ test)
    walk.ts           the order an autofill works through the form, as a value (+ test)
    debounce.ts       one call after a burst goes quiet (+ test)
    combobox.ts       drives custom-widget comboboxes (open/options/select/verify);
                      pure over its Document like form.ts, but async (+ test)
  wxt.config.ts       manifest, WXT React module and Tailwind Vite plugin
```

## Architecture

- **Side panel** reads the active application's form and enables candidate
  actions once the NextKinHR credential is verified.
- **Content script** reads and fills the live form on request, and reports
  submissions and confirmation pages.
- **Background** forwards form requests, verifies the credential delivered by
  the NextKinHR sign-in tab, and syncs confirmed applications.

### Legacy assistant

The remaining Svelte UI and assistant code record an earlier side-panel flow.
The WXT entrypoint renders `App.tsx` and leaves the legacy UI unmounted. The
earlier side panel owned the relay WebSocket while open, and transmitted its
session JWT with the `freehire-jwt` WebSocket subprotocol.

A turn is **one POST whose response body streams SSE** (`lib/assistant/`): create
a conversation once (`POST /assistant/sessions?preset=browse`), then post each
message and fold the streamed `TurnEvent`s into the message list. Nothing is held
open between turns. Cancelling sends a Bearer-authenticated
`POST /assistant/sessions/:id/cancel` with `credentials: 'omit'`, then aborts the
local reader. A reader disconnect alone leaves the server turn running so a
temporary connection loss does not discard its work.

The conversation id lives in `storage.local`, so closing the panel and reopening
it resumes; the transcript is replayed from the server through the same reducer a
live turn folds through. A conversation deleted from the web starts a fresh one
silently.

Read-a-page flow — note that the panel is not the one deciding:

```
hire's agent --read_page--> relay --> panel
panel --GET_PAGE_SNAPSHOT--> background --(active tab)--> content
content --PAGE_SNAPSHOT--> background --> panel --> relay --> the agent, mid-turn
```

## Conventions

- **`protocol.ts` is the in-extension contract** — `RuntimeMessage`
  (panel <-> background <-> content, discriminated by `kind`). Neither the chat's
  wire nor the browser-tool wire is here: they are `lib/assistant/wire.ts` and
  `lib/tools/wire.ts`, each mirroring a contract hire owns.
- **Autofill scopes writes to one application form.** The panel reads framed
  fields, fills empty fields that match the candidate profile, and registers a
  watch so a later confirmed submission can sync to the tracker. The legacy
  assistant flow used `lib/walk.ts` for a paced audit of each written value.
- **The plan is the panel's standing account of the form**, computed by
  `buildPlan` from what the page reported and rebuilt on every page change, after
  a walk, on `FORM_CHANGED`, on returning to the Match tab and on the panel
  regaining focus. It counts REQUIRED questions only (they are what gates
  submission) and is null for a page showing no application form.
- **Two different tests for "this is an application".** `looksLikeApplication`
  (a CV upload) gates the FILLER — it is what stops a job-alert signup being
  written into. `showsApplicationForm` gates the CHECKLIST and is deliberately
  looser: an upload, OR four labelled questions, OR a form the panel has already
  written into. The upload sits on step ONE of a multi-step ATS form, and every
  step after it — the screening questions — has none, which is why the strict
  test showed no checklist where it was most wanted. Nothing is written on the
  strength of the looser one.
- **`PlanItem.key` is `frame:index`, never the label.** Two questions on one form
  can carry the same label, and a keyed `{#each}` over a duplicate throws
  `each_key_duplicate` — which takes the whole card down and looks, from the
  panel, like the feature simply not existing. That was the real reason the
  checklist never appeared on a live ATS form.
- **A fill names the scope it was read from, and refuses what it cannot resolve.**
  `read_form` reports `frame` and `form` on every field, and `fill_simple` carries
  both back: `frame` picks one of the tab's documents, `form` one `<form>` inside
  it. Where a label matches more than one question and the fill names no `form`,
  `fillByLabel` writes NOTHING and reports `ambiguous` — a careers page routinely
  carries its application beside a job-alert signup, both asking for an email
  address, and taking the first match writes the candidate's details into a form
  they did not choose and calls it `filled`. The three refusals are kept apart
  because each implies a different next step: `ambiguous` means re-send naming a
  form, `wrong_form` means the index is wrong, `not_fillable` means no re-send helps
  until the page changes. **This is also why `readFills` must not drop a field it is
  sent** — hire tagged every fill with its frame for months while this reader
  destructured only `{label, value}`, so the tag never arrived and every agent fill
  was broadcast to every frame and matched by label alone. Both sides' tests were
  green: one checked the sender, the other checked this reader against arguments
  written by hand beside it. What catches that now is one fixture written from
  hire's live struct (`lib/tools/testdata/fill-simple-call.json`, regenerated by
  `UPDATE_WIRE_FIXTURE=1 go test ./internal/ai/autofillagent/`) and read back by
  this side's own test.
- **Form reads are serialised, not raced.** A request-id guard (the
  `matchRequestId` pattern) starves here: an ATS page announces DOM changes
  continuously, so every read finds its id already superseded and returns before
  assigning. One read at a time with a re-read queued behind it cannot starve and
  cannot land stale. For the same reason the page announces a mutation only when
  the NUMBER of controls changes — typing is covered by the input/change
  listeners, where it does not.
- **"Add this job" is offered only on a plausible vacancy** (`offersAddJob`): a URL
  `/jobs/find` reports as a recognised ATS board (`meta.ats_board`, from the
  server's `atsboard.Recognize` — never copy its host list here), or a page carrying
  schema.org `JobPosting` JSON-LD. Offered everywhere, it filled the triage queue
  with LinkedIn feeds, chat apps and localhost (63 submissions, nearly all junk).
- **`revealField` borrows the page's style and gives it back.** The outline is
  inline style, restored after ~600ms: the extension runs on pages freehire does
  not own, where an injected class can collide with the ATS's own and a stylesheet
  outlives our interest in the element.
- **The agent's reading is bounded, and visible.** `read_page` refuses any tab that
  is not `http(s)` (`lib/tools/readable.ts`), decided from the url before the page
  is read — this extension is the only side that sees a url before scraping it. The
  panel then names the page each read touched, minus query and fragment, which is
  where session tokens live. That display lives in `lib/assistant/pageRead.ts`
  rather than in `tool-formatters.ts`, precisely because the latter is a verbatim
  port and `read_current_page` cannot occur in the web app.
- **`lib/assistant/` mirrors the freehire web assistant** (`web/src/lib/assistant`
  in this repo). `sse`, `wire`, `chat`, `deck` and `tool-formatters` are
  verbatim ports — keep them aligned. Three files diverge, and they say so
  at the top: `api.ts`/`client.ts` (absolute origin + Bearer, since extension code
  has no cookie) and `jobCache.ts` (reads the token the web's cookie made
  implicit).
- **Test the logic, not the transport.** `scraper`, `form`, `protocol`, the
  assistant's reducers and its API clients are tested (vitest); the chrome message
  plumbing, the live socket and `storage.local` helpers are thin glue.
- **Panel styling lives in `entrypoints/sidepanel/app.css`** and uses Tailwind.

## Commands

```bash
cd extension
pnpm install --frozen-lockfile       # runs `wxt prepare` (generates .wxt/)
pnpm run dev                         # dev build with HMR
pnpm run build                       # production build -> .output/chrome-mv3
pnpm test                            # vitest: lib/**/*.test.ts
pnpm run check                       # TypeScript, including the React panel
```

Load unpacked in Chrome: `chrome://extensions` → Developer mode → **Load
unpacked** → `extension/.output/chrome-mv3`. Click the toolbar icon to open the
panel.

### Firefox

`pnpm run dev:firefox` / `pnpm run build:firefox` (-> `.output/firefox-mv2`) /
`pnpm run zip:firefox` (the add-on plus the sources ZIP addons.mozilla.org reviews;
publishing is in [docs/firefox-addons.md](docs/firefox-addons.md)). Load it at
`about:debugging` → This Firefox → **Load Temporary Add-on** → the build's
`manifest.json`. The `sidepanel` entrypoint becomes Firefox's `sidebar_action`,
and the toolbar click toggles it (`background.ts`).

The Firefox add-on ID in `wxt.config.ts` stays fixed for upgrades.
