# Assumptions

Everything here goes beyond the client brief. Each item has an ID so the Technical Design Document can refer to it.

| ID | Assumption |
|---|---|
| A1 | Sundays are non-working days. Other holidays are handled by the supervisor entering 0 machines and the number of closure days. |
| A2 | "Machines that can work today" is the single capacity input. Labour shortages are reflected by entering fewer machines. On cutting, finishing and packing floors "machines" means work tables; only the label differs. |
| A3 | The pieces-per-machine rate is derived from the last 3 entries with machines > 0. No planned rate is entered. |
| A4 | Thresholds: an expected finish 1–2 working days after the stage deadline is amber, more than 2 is red. No update for more than 2 working days turns a green or grey stage amber. An overdue date milestone follows the same 1–2 / more-than-2 rule. |
| A5 | Each order stage runs on one floor. One supervisor per floor. Each own unit has 2 floors; the two subcontractors have one floor each. |
| A6 | Subcontractor (printing, washing) progress is entered by a merchandiser from the order page; the entry records who entered it. |
| A7 | TNA offsets are calendar days before the ex-factory date. The three seed templates and their durations are illustrative. |
| A8 | Buyers see only confirmed warnings. Until a warning is confirmed they see progress and dates with no colour. Buyers never see floor notes, transcripts or voice notes. |
| A9 | Photos are shared with the buyer by default; a merchandiser can hide any photo. Voice notes are never shared. |
| A10 | Supervisors can only enter for today (the server sets the date). Merchandisers can back-date entries, for subcontractors. |
| A11 | The weekly export is Excel only; the brief allows PDF or Excel. |
| A12 | Company D, the ten extra orders, the units, floors, people, notes and photos are invented sample data. `DEMO_TODAY` freezes the demo date at 2026-11-04 so the seeded board always reads the same. |
| A13 | The keyword list used by the offline classifier and the Tamil interface strings need review by a native speaker before go-live. |
| A14 | The Managing Director has no login. |
| A15 | AI runs on Groq's free tier (Whisper for Tamil speech-to-text, a Llama model for translation and classification). Seeded notes carry pre-computed AI results; live notes call the API. |
| A16 | Media is stored in Postgres `bytea`, which is fine at demo scale; object storage is the next step. |
| A17 | Supervisors' phones run a recent Chrome for Android, so native ES modules and `MediaRecorder` work without a bundler. |
| A18 | The brief lists "Ai or automation" under Out of scope, directly above the paragraph that describes the AI feature. We read it as that paragraph's heading, not an exclusion, because the core build explicitly requires the AI reason category. |
| A19 | Each stage is judged against its own deadline. A stage that has not started is not projected from upstream progress. |
| A20 | Changing the ex-factory date does not move the milestone dates. The merchandiser edits those individually, and each change is logged. |
| A21 | Buyer links are valid for 90 days and can be revoked at any time. The two seeded demo links expire at the end of 2027 so the demo keeps working. |
| A22 | Office sessions last 12 hours; supervisor sessions last 30 days so the phone app survives long offline periods. Login is limited to 5 attempts per 15 minutes per IP and identifier. |
| A23 | A queued update that reaches the server after midnight is recorded under the day it arrives, because the server, not the phone, decides the entry date (see A10). |
| A24 | Marking a date milestone done writes an `actual_date` row to the date-change history with the reason "Marked done" unless another reason is given. |
| A25 | The same stage can receive several notes on one day (one per update). Each is reviewed separately. |
| A26 | The supervisor app opens in English. One tap on the header toggle switches every label to Tamil, and the choice is remembered on the phone and on the user. |
