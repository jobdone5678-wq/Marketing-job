# Publishing to the Chrome Web Store

Last updated November 26, 2026.

Unreleased update to 0.1.19 adds NextKinHR autofill, dropdown selection, draft
answers, and application tracking for external job sites.
The NextKinHR build keeps the panel focused on autofill and application tracking.
Autofill also supports radio groups, checkbox groups, and more browser dropdowns.

Everything the dashboard asks for, kept next to the manifest it has to match.
Reviewers cross-check this copy against `extension/wxt.config.ts` and the code —
when one changes, change the other.

## Release checklist

1. **Bump the version** in `extension/package.json` (`version`). The store
   rejects a re-upload of a version it already has.
2. **Get the package** — either `cd extension && pnpm run zip`
   (`.output/freehire-extension-<version>-chrome.zip`) or download the
   `extension` artifact from the `build` workflow.
3. **Upload** to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time $5 registration + a verified contact email).
4. Fill the listing, privacy practices, and permission justifications below.
5. Submit. Expect an in-depth manual review — `<all_urls>` guarantees it.
6. **After the item exists**, copy its extension ID from the dashboard and add
   `https://<id>.chromiumapp.org/` to the Next.js deployment's comma-separated
   `EXTENSION_REDIRECT_ALLOWLIST`. Deploy that configuration before submitting
   for review. The pinned unpacked Chrome and Firefox builds already have
   allowlisted callbacks.

Still manual, not in the repo: the privacy-policy page on `freehire.me` and
1–5 screenshots at 1280×800 (side panel over a real job posting).

## Listing

**Name:** freehire

**Short description** (≤132 chars):

> Fill job applications from your verified NextKinHR profile and review AI-drafted answers in your browser.

**Single purpose** (the store requires exactly one):

> Assist the user with job applications on the page they are currently viewing.

**Detailed description:**

> freehire fills application fields from your verified NextKinHR profile. It can
> select answers from supported dropdowns and draft short answers to open-ended
> questions using the job description. You review the completed fields and submit
> the application yourself.
> The extension records your application in NextKinHR when it sees a
> submission confirmation or you confirm it in the side panel.
>
> Sign in to your NextKinHR account from the side panel to get started.

**Category:** Productivity. **Language:** English.

## Permission justifications

Paste one per field in the dashboard.

| Permission | Justification |
| --- | --- |
| `storage` | Stores the freehire session token issued by sign-in, plus nothing else. Local to the browser profile. |
| `tabs` | Identifies the application tab so autofill uses the form the candidate opened. |
| `sidePanel` | The entire UI is a side panel opened from the toolbar icon. |
| `scripting` | Injects the reader into the active tab's frames on demand, so the agent can read the application form and fill the fields the user asked it to. |
| `activeTab` | Scopes page access to the tab the user explicitly acted on from the panel. |
| `identity` | Opens the NextKinHR sign-in window and returns an extension session token after the candidate signs in. |
| `host_permissions: <all_urls>` | Application forms are hosted across employer sites and embedded frames. The panel reads the active form to show its checklist and fills fields when the candidate clicks Autofill. |

## Privacy practices

Data collected — declare all four:

- **Personally identifiable information** — name, email, phone and CV fields from
  the user's freehire profile, fetched to fill application forms.
- **Authentication information** — a NextKinHR extension session token is stored
  in the browser's local extension storage and sent to the portal API to
  authenticate requests. The server stores the token's hash for verification
  and revocation.
- **Website content** — when the candidate runs AI autofill, the extension sends
  unresolved question labels, offered options, and up to 5,000 characters of job
  posting context to the NextKinHR portal. The portal forwards relevant context
  and profile facts to the configured AI provider to draft or select answers.
- **Application activity** — after a detected receipt or manual confirmation,
  NextKinHR receives the posting, confirmation evidence, and eligible form
  answers to save the application and its answer snapshot.

- **User activity** — anonymous usage events (`extension/lib/analytics.ts`):
  the panel opened, a sign-in, an Autofill run, a plan limit
  shown and its upgrade link clicked. Sent to Google Analytics under a random
  per-install id, never the freehire account; no URL, page text, message or
  profile field is ever part of an event. This is the only request the
  extension makes to a host other than the configured portal.

Not collected: health, financial, location, personal communications, browsing
history, keystroke logging.

Certifications to tick: data is not sold to third parties, not used or
transferred for purposes unrelated to the extension's single purpose, and not
used for creditworthiness or lending.

The privacy policy at the URL you enter must say the same thing and state
compliance with the Chrome Web Store limited-use requirements. It has to be
reachable over HTTPS without a login — the review bot crawls it.

## Automated publishing (after the first manual release)

The Chrome Web Store API only updates an **existing** item — it cannot create the
first listing, so everything above stays a one-time manual pass. Once that first
release is live, `.github/workflows/extension.yml` uploads and submits every
subsequent version bump automatically (gated on the GitHub Release step actually
having created a new tag, so an unchanged version is never re-uploaded — the
store rejects that anyway).

It's a no-op until three secrets exist on the repo. One-time setup:

1. [Google Cloud Console](https://console.cloud.google.com/) → new (or existing)
   project → **APIs & Services → Library** → enable the **Chrome Web Store API**.
2. **APIs & Services → Credentials** → **Create credentials → OAuth client ID**
   → Application type **Desktop app** — NOT "Chrome Extension": that type has no
   client secret and cannot mint a refresh token. Download the JSON from the
   creation dialog; it is the only place the secret is shown in full.
3. Get a refresh token once, from a machine with a browser (this is the only
   interactive step). `chrome-webstore-upload-cli@3` no longer has a
   `refresh-token` command — run without one it exits 0 and prints nothing — so
   use the installed-app OAuth flow directly: open
   `https://accounts.google.com/o/oauth2/v2/auth` with the client id, a
   `http://127.0.0.1:<port>` redirect, `response_type=code`,
   `scope=https://www.googleapis.com/auth/chromewebstore`, `access_type=offline`
   and `prompt=consent`; sign in with the **same Google account that owns the
   Developer Dashboard item**; exchange the returned code at
   `https://oauth2.googleapis.com/token` (`grant_type=authorization_code`) and
   keep the `refresh_token` from the response. A refresh token stops working
   when it is revoked or the account's password changes, and the publish step
   then fails with `invalid_grant` — mint a new one the same way.
4. Add three repo secrets (Settings → Secrets and variables → Actions):
   `CHROME_WEBSTORE_CLIENT_ID`, `CHROME_WEBSTORE_CLIENT_SECRET`,
   `CHROME_WEBSTORE_REFRESH_TOKEN`.

`CHROME_WEBSTORE_EXTENSION_ID` is not a secret — it's hardcoded in the workflow
as the published item's id (`ijfaechijopdlikalojadpojmpilplnj`, from the
dashboard URL), which is **not** the same id `wxt.config.ts`'s pinned dev key
produces locally.

The store refuses to PUBLISH (the upload still lands as a draft) until the
item's **Privacy practices** tab in the dashboard is filled in — the publish
step fails with `Publish condition not met`. The answers are in the Privacy
practices section above.

Re-running a failed publish job does nothing on its own: the store step is
gated on the GitHub Release being newly created, and the re-run finds it
already there. Delete the release (`gh release delete extension-v<version>
--yes --cleanup-tag`) before re-running.

Submitting a build this way still enters Google's normal manual review queue —
`<all_urls>` guarantees that regardless of who uploads it. Automation removes
the manual dashboard upload step, not the wait.
