# Company A — Order & TNA tracker

Daily floor updates from supervisors' phones (in Tamil, offline-tolerant), green / amber / red status for every
order against its time-and-action plan, run-rate delay warnings two weeks early with the maths shown, Tamil notes
turned into English reason categories by AI with a human in the loop, and a read-only link per buyer.

- **Run it:** see [deployment.md](deployment.md) (local setup, environment variables, demo logins, a 5-minute walkthrough).
- **Assumptions:** every decision beyond the client brief is listed in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).
- **Design notes:** architecture, data model, flows, the AI part, UI decisions, brief coverage, cuts and next steps in [docs/TDD-NOTES.md](docs/TDD-NOTES.md).
- **Testing:** the 76 automated tests and the manual phone/browser checklist in [docs/TESTING.md](docs/TESTING.md).

## Stack

Node 22 · Express 5 · EJS · vanilla JS · hand-written CSS · PostgreSQL (plain SQL) · Groq (Whisper + Llama) over `fetch` · `node:test`.

## Layout

```
src/
  app.js, server.js, config.js
  db/        pool, migrate, migrations/, seed, queries/   (plain parameterised SQL, one file per area)
  services/  clock, workdays, projection (the delay engine), orderStatus, orderSummary, warnings, entries,
             dateChanges, ai, keywordClassifier, categories, explain, tna, buyerLinks, exportExcel
  middleware/ auth, csrf, i18n, flash, uploads, validate, errors
  routes/    auth, board, orders, templates, review, buyers, media, supervisor, supervisorApi, buyerLink
  views/     partials/ office/ supervisor/ buyer/ errors/
  locales/   en.json, ta.json
public/      css/ js/ sw.js manifest.webmanifest icons/
tests/       unit/ integration/
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | start with file watching |
| `npm start` | start |
| `npm run migrate` | apply pending SQL migrations |
| `npm run seed` | drop all data and load the sample data (demo only) |
| `npm run test:unit` | engine tests, no database |
| `npm test` | everything, against `DATABASE_URL_TEST` |
