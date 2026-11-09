# Testing

Two layers: automated tests that run with `npm test`, and a short manual checklist for the things only a real
browser or phone can prove (service worker, camera, microphone, airplane mode). Both were run before hand-over.

## Automated (76 tests, 17 files)

```bash
npm run test:unit   # 8 files, no database
npm test            # all 17 files; integration files use DATABASE_URL_TEST
```

Each integration file drops and recreates the test schema, migrates and seeds, so tests never depend on each
other's leftovers. Files run one at a time (`--test-concurrency=1`) because they share the test database.

### Unit (`tests/unit`)

| File | Proves |
|---|---|
| `workdays.test.js` | W1 (9 working days from 4 to 14 Nov), W2 (Saturday + 1 = Monday), Sunday is the only non-working day, ranges |
| `projection.test.js` | The spec's P1–P10: on track, capacity drop → amber with 39 machines needed, closure days → red, stopped with no finish date, not enough data, complete, overdue, zero output, stale → amber, not started; a never-started stage past its start; the three brief orders project exactly as seeded |
| `orderStatus.test.js` | Worst stage wins, "none" ignored, overdue milestones amber/red, the headline is the stage that set the colour |
| `format.test.js` | "14 Nov" dates with the year only when it differs, thousands separators, ISO week labels, percentages |
| `keywordClassifier.test.js` | Tamil and English keywords → category, most hits wins, no hits → OTHER, fixed 0.4 confidence |
| `tna.test.js` | Template offsets → dated milestones, floor per quantity stage, order total as target |
| `explain.test.js` | The one-line maths text in English and Tamil, stopped / stale / overdue wording, milestone headline |
| `i18n.test.js` | Tamil used when present, English fallback, placeholders, every office and supervisor key has a Tamil string, confidence bands |

### Integration (`tests/integration`)

| File | Proves |
|---|---|
| `auth.test.js` | No session → login redirect; supervisor on an office page → 403; merchandiser OK; POST without CSRF → 403; sixth wrong login → 429 |
| `templates.test.js` | Editing a template leaves an order's milestones untouched; no quantity stage → inline error; delete keeps the orders |
| `orders.test.js` | Order creation copies milestones with dates, floors and lines; duplicate PO and missing floor → inline errors; ex-factory change needs a reason and writes history; planned-date edit and mark done are logged; history cannot be edited or deleted |
| `board.test.js` | Seed sanity: 3 red, 2 amber, 6 green, 2 grey and the brief's figures; filters by buyer, unit, ship week and status; empty state |
| `supervisor.test.js` | Shell and API are supervisor-only and floor-scoped; another floor → 403; same `client_uuid` twice → one entry, new uuid overwrites; validation (remaining, floor total, 0 machines, negatives, CSRF); closure days vs stopped; keyword fallback without a key; photo access by role; bad file types rejected |
| `review.test.js` | Inbox order; change the AI category and confirm keeps both; Retry AI; dismiss needs a reason; no new warning at the same level |
| `buyer.test.js` | Company B's token lists only B; C's order, photo and export are 404; detected warning invisible, confirmed visible with its maths; no notes or hidden photos; unknown and revoked tokens → "no longer active" |
| `pages.test.js` | Every office page renders with its key content; friendly 404; the language toggle switches to Tamil and is saved; shell, service worker, manifest, locales and icons are served; the office Excel shows the live colour; merchandiser back-dating for a subcontractor, never into the future; a note stuck in processing shows Retry AI |
| `warnings.test.js` | Confirm freezes the maths and the buyer sees it; recovery resolves it and the buyer stops seeing it; after a dismissal the same level stays quiet but a worse level opens a new warning; the inbox prefills the reason from the headline stage's note |

## Manual checklist (browser and phone)

Run with `npm run dev`, the seeded database and `DEMO_TODAY=2026-11-04`. Each line was checked in Chrome at
375 px and 1280 px, in English and Tamil, before hand-over.

**Office**
- [ ] Login: wrong password shows an error; sixth attempt in 15 minutes is blocked; both tabs work.
- [ ] Board: summary counts read 3 · 2 · 6 · 2; each count filters; buyer / unit / ship week / status filters combine; Clear resets; rows become cards on a phone; the amber dot marks a warning awaiting confirmation.
- [ ] Order detail: the banner reads the maths in plain words; Change date needs a reason and appears in the history; Mark done and Edit planned date work; Add entry saves and refreshes the banner; photo Hide / Share toggles what the buyer link shows.
- [ ] New order: the grid adds colours and sizes with live totals; the TNA preview appears once template and ex-factory date are set; a past date shows the amber warning; a duplicate PO re-renders with the values kept.
- [ ] Templates: add, reorder (up/down) and remove rows; delete asks for confirmation.
- [ ] Review: Notes tab shows Tamil beside English with the confidence badge; changing the category and confirming updates the card; Warnings tab Confirm and Dismiss (reason required) work.
- [ ] Buyers: Create link shows the token once with Copy; Revoke kills the link; Excel downloads with four sheets.
- [ ] Menu → Language switches every office string to Tamil and back; the choice survives logout and login.

**Phone app (supervisor 9000000001 / 1234)**
- [ ] Opens in English; the header button switches everything to Tamil and is remembered after a reload.
- [ ] Today lists only this floor's open stages, sorted by deadline, with "Starts …" for future stages.
- [ ] Update: pieces above the remaining quantity, machines above the floor total, and 0 machines with pieces all show inline errors; pieces above 3× the recent average asks "Are you sure?".
- [ ] 0 machines reveals the closure-days field; sending with none turns the order red with "Unit stopped — no finish date" on the board.
- [ ] Photo: Take photo opens the camera (phone) or file picker (desktop); the preview shows; Remove clears it; the photo appears on the order page and the buyer link.
- [ ] Voice note (HTTPS or localhost): Record / Stop, the 60-second cap, playback before sending; the audio plays in the review inbox.
- [ ] Offline: airplane mode (or DevTools → Offline), send an update → "Saved — will send when online" and the "1 update waiting" strip; network back → "All sent" and the board reflects it. In DevTools → Application, the `tna-supervisor-v4` cache holds the shell and the IndexedDB `outbox` store empties after the flush.
- [ ] Expired session: log out in another tab, then send → the strip asks to log in again; the queued item is still there after logging in and is sent.
- [ ] Reload with the network off: the shell still opens from the service worker cache.

**Buyer link**
- [ ] The Company B link shows only Company B orders, no colours until a warning is confirmed, shared photos only, the date history, and the Excel download.
- [ ] A revoked or mistyped token shows "This link is no longer active".

**Accessibility and layout**
- [ ] Every status is colour plus text; tab order and focus rings work on every form; no horizontal scroll at 375 px; touch targets are 44 px or more on the phone app.
