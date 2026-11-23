# Chrome Web Store Listing — NextKinHR Recruiting Copilot

> Last Updated: 2026-11-23

## Store Listing

**Extension Name** [REQUIRED]
NextKinHR Recruiting Copilot

**Short Description** [REQUIRED]
Sync your NextKinHR resume, capture job details, and automatically fill job application forms across leading career sites.

**Detailed Description** [REQUIRED]
NextKinHR Recruiting Copilot streamlines your job search by connecting your verified candidate profile directly to employer application forms. Save hours of repetitive typing and focus on landing your next role.

KEY FEATURES
• One-Click Autofill: Fill application forms instantly across leading applicant tracking systems (Greenhouse, Lever, Workday, Ashby, SmartRecruiters, and more).
• Smart Resume Sync: Automatically imports your verified resume facts, work history, education, and portfolio links from your NextKinHR account.
• Context-Aware Answer Bank: Remembers your preferred answers to common screening questions (e.g. work authorization, notice period, language proficiency).
• Automatic Application Tracking: Detects confirmed job submissions and automatically updates your NextKinHR dashboard so you never lose track of where you applied.
• Side Panel Review: Review and verify every field before submitting, keeping you in complete control of your application data.

HOW TO USE
1. Install NextKinHR Recruiting Copilot and sign in with your NextKinHR account.
2. Navigate to any supported job application page.
3. Open the NextKinHR side panel to review your profile and match score.
4. Click "Autofill" to automatically populate form fields, custom dropdowns, and attach your resume.
5. Review the filled application on the page and submit when ready. Your submission will automatically be logged in your NextKinHR dashboard.

PRIVACY & CONTROL
Your data privacy and security are our top priorities. NextKinHR Recruiting Copilot only populates application fields with information you have explicitly verified in your profile. Your information is never sold to third parties or used for advertising.

SUPPORT & FEEDBACK
For assistance, bug reports, or feature requests, contact support@nextkinhr.com or visit https://nextkinhr.com/support.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Autofills verified candidate resume facts into job application forms and tracks submitted job applications.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `jobright_extension/icon128.plasmo.3c1ed2d2.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ✅ Ready | `docs/assets/screenshot-autofill.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ✅ Ready | `docs/assets/screenshot-sidepanel.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ✅ Ready | `docs/assets/screenshot-answer-bank.png` |
| Screenshot 4 | 1280×800 or 640×400 | ✅ Ready | `docs/assets/screenshot-tracking.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | `docs/assets/promo-small.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | `docs/assets/promo-marquee.png` |

### Screenshot Notes
- Screenshot 1: Shows a job application (e.g. Greenhouse or Workday) with the side panel open, demonstrating one-click autofill in action.
- Screenshot 2: Close-up of the Side Panel showing verified candidate resume data and job match insights.
- Screenshot 3: The Answer Bank interface showing reusable screening questions.
- Screenshot 4: NextKinHR dashboard showing tracked job applications synced seamlessly from the extension.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `sidePanel` | permissions | Displays candidate profile details, job matching scores, and autofill controls alongside the active application page without obscuring form fields. |
| `storage` | permissions | Persists candidate preferences, caches confirmed resume facts, and queues offline application receipts until network delivery succeeds. |
| `tabs` | permissions | Reads the active job application URL and title to detect the employer's applicant tracking system and associate submitted applications with the correct posting. |
| `scripting` | permissions | Executes form detection and autofill routines in job application pages and embedded third-party application iframes (e.g. embedded Greenhouse/Ashby boards). |
| `alarms` | permissions | Periodically checks and retries pending application submission receipts using exponential backoff without requiring persistent background processes. |
| `https://*/*` | host_permissions | Allows autofill and application tracking across arbitrary employer career portals and ATS platforms hosted on custom domains and subdomains. |
| `http://localhost/*` | host_permissions | Supports local development testing and career portals hosted on HTTP during staging evaluations. |
| `http://127.0.0.1/*` | host_permissions | Supports local development testing and career portals hosted on loopback IP during staging evaluations. |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes | Yes | Populates user-authorized job applications with candidate contact details, work history, and education. | No |
| Health info | No | No | N/A | No |
| Financial info | No | No | N/A | No |
| Authentication info | Yes | Yes | Authenticates user with the NextKinHR API to sync candidate profiles and applications. | No |
| Personal communications | No | No | N/A | No |
| Location | Yes | Yes | Fills candidate location/address into job application forms. | No |
| Web history | No | No | N/A | No |
| User activity | Yes | Yes | Tracks user-initiated autofill and job submission events to update application logs. | No |
| Website content | Yes | Yes | Analyzes job posting fields and employer application forms to correctly match candidate resume attributes. | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
`https://nextkinhr.com/privacy`

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
Nextkinlife LLC

**Contact Email** [REQUIRED]
`support@nextkinhr.com`

**Support URL / Email** [RECOMMENDED]
`https://nextkinhr.com/support`

**Homepage URL** [RECOMMENDED]
`https://nextkinhr.com`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.3.19 | 2026-11-23 | Prepared store listing documentation, verified Manifest V3 icons, solidified two-tier background queue, and hardened custom combobox form autofill. |
