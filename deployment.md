# AerisTrack — Deployment Guide

**GitHub:** <https://github.com/areez-dot-cse/AerisTrack>  
**Live application:** <https://aeristrack.onrender.com/>  
**Developed by:** Areez for Company A

This guide covers the local Docker setup, the optional native Node.js development setup.

---

## 1. Technology and prerequisites

AerisTrack uses Node.js 22, Express 5, EJS, vanilla JavaScript, PostgreSQL, `pg`, `express-session`, `connect-pg-simple` and optional Groq AI APIs.

For the recommended local setup, install:

- Git
- Docker Desktop with Docker Compose
- A browser

For native development without Docker, install Node.js 22 or newer and PostgreSQL.

## 2. Run locally with Docker Compose

Docker Compose is the simplest local run path. The repository contains a Dockerfile, `compose.yaml` and `docker/entrypoint.sh`.

### Step 1 — Get the repository

```bash
git clone https://github.com/areez-dot-cse/AerisTrack.git
cd AerisTrack
```

### Step 2 — Create the local environment file

In Git Bash:

```bash
cp .env.docker.example .env
```

Open `.env` and set the local database credentials and a strong session secret. The supplied example does not define `NODE_ENV`, while `compose.yaml` defaults it to production. For local access over `http://localhost:3000`, add `NODE_ENV` to `.env` and set it to development so the browser can use the local non-secure session cookie. Keep `NODE_ENV` in production on Render. Do not commit `.env`.

The local Compose configuration reads these variables:

| Variable name       | Purpose                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `POSTGRES_DB`       | PostgreSQL database created by the Compose database container.               |
| `POSTGRES_USER`     | PostgreSQL user created by the Compose database container.                   |
| `POSTGRES_PASSWORD` | Password for that PostgreSQL user.                                           |
| `SESSION_SECRET`    | Express session-signing secret. Use a strong random value.                   |
| `NODE_ENV`          | Controls development/production behaviour, including secure session cookies. |
| `PORT`              | Host port mapped to the application container's port.                        |
| `SEED_DEMO_DATA`    | Enables the initial demo seed check.                                         |
| `GROQ_API_KEY`      | Optional key for AI transcription, translation and classification.           |
| `GROQ_STT_MODEL`    | Optional override for the speech-to-text model.                              |
| `GROQ_LLM_MODEL`    | Optional override for the translation/classification model.                  |
| `DEMO_TODAY`        | Optional fixed date for the demonstration dataset.                           |

The Compose file constructs the app's `DATABASE_URL` from the PostgreSQL variables. The database port is not published to the host by default; the application reaches it over the private Compose network.

### Step 3 — Build and start the services

```bash
docker compose up --build -d
```

Compose starts PostgreSQL and waits for its health check before starting the app. The application entrypoint then:

1. Checks that `DATABASE_URL` is set.
2. Waits for PostgreSQL to accept connections.
3. Runs `npm run migrate`.
4. Checks whether the `users` table is empty.
5. Runs the demo seed only when seeding is enabled and the database has no users.
6. Starts the Node.js server.

### Step 4 — Verify the containers and logs

```bash
docker compose ps -a
docker compose logs --tail=100 app
```

The app container should be running and PostgreSQL should be healthy. The application log should finish with a message that the TNA tracker is listening on its configured port.

### Step 5 — Open the application

Open <http://localhost:3000> in a browser.

**Seed warning:** `npm run seed` is a demo-reset operation. The seed implementation truncates the application tables before loading sample data. The Docker entrypoint protects normal restarts by checking whether users already exist; running the seed command manually bypasses that protection.

## 3. Run locally with Node.js (optional)

1. Start a PostgreSQL server and create a development database and a separate test database.
2. Install Node.js 22 or newer.
3. Create the application environment file:

   ```bash
   cp .env.example .env
   ```

4. Configure the following names in `.env`:
   - `NODE_ENV`
   - `PORT`
   - `DATABASE_URL`
   - `DATABASE_URL_TEST`
   - `SESSION_SECRET`
   - `GROQ_API_KEY` (optional)
   - `GROQ_STT_MODEL` (optional)
   - `GROQ_LLM_MODEL` (optional)
   - `DEMO_TODAY` (optional)

5. Install dependencies:

   ```bash
   npm ci
   ```

6. Apply database migrations:

   ```bash
   npm run migrate
   ```

7. Load the fictional demo dataset when starting with an empty development database:

   ```bash
   npm run seed
   ```

   This command truncates and recreates demo data. Do not run it against a database containing work that must be retained.

8. Start the development server:

   ```bash
   npm run dev
   ```

   Or start without file watching:

   ```bash
   npm start
   ```

9. Open <http://localhost:3000> unless a different `PORT` is configured.

## 5. Demo reviewer accounts

The following accounts are defined in `src/db/seedData.js` and are created by the demo seed. They are fictional review accounts:

| Role                         | Login identifier      | Password / PIN  |
| ---------------------------- | --------------------- | --------------- |
| Merchandiser                 | `priya@example.com`   | `tna-demo-2026` |
| Merchandiser                 | `karthik@example.com` | `tna-demo-2026` |
| Supervisor — Unit 1, Floor 1 | `9000000001`          | `1234`          |
| Supervisor — Unit 1, Floor 2 | `9000000002`          | `1234`          |
| Supervisor — Unit 2, Floor 1 | `9000000003`          | `1234`          |
| Supervisor — Unit 2, Floor 2 | `9000000004`          | `1234`          |
| Supervisor — Unit 3, Floor 1 | `9000000005`          | `1234`          |
| Supervisor — Unit 3, Floor 2 | `9000000006`          | `1234`          |

Office users sign in through the **Office** tab with email and password. Floor supervisors sign in through the **Supervisor** tab with phone number and PIN.

**Reviewer/demo use only:** these credentials are fixed in the public source repository's seed data.

## 6. AI behaviour and optional Groq configuration

When `GROQ_API_KEY` is configured, the application can:

- Send audio-only notes to Groq Whisper for Tamil transcription.
- Send typed Tamil text or the transcript to the configured Groq LLM for English translation and one production-delay reason category.
- Validate the structured response and send the suggestion to the merchandiser review queue.

When the key is absent or an AI call fails, the application uses its Tamil/English keyword classifier. The fallback confidence is fixed at `0.40`, the note is marked `needs_review`, and no English translation is generated. Audio is retained in the database, but the fallback cannot transcribe it.

The default model identifiers are defined in `src/config.js`; the corresponding environment variables can override them. Confirm model availability and provider terms before operational use.

## 7. Testing

The project includes unit and integration tests:

```bash
npm run test:unit
npm test
```

`npm test` uses `DATABASE_URL_TEST`. The integration test setup drops and recreates the test database schema before seeding it. **Never point `DATABASE_URL_TEST` at the local, staging or production database whose data must be retained.**

The test files cover working-day calculations, TNA scheduling, progress projections, order status, authentication and CSRF, order/template workflows, supervisor floor scoping, offline idempotency, AI review, buyer access, exports and warning lifecycle.

The repository's `docs/TESTING.md` contains the browser/phone manual checklist for responsive layouts, English/Tamil, camera, microphone, service-worker caching and offline queue behaviour.

## 8. Operational notes and known boundaries

- The seed dataset is designed for `DEMO_TODAY = 2026-11-04`. If that date is not configured, the application uses the current date and the seed script emits a date-mismatch warning. Remove the override for normal live-date operation.
- `SEED_DEMO_DATA` is an initial-seed switch. The entrypoint checks whether the users table is empty before calling the seed script, so routine restarts do not reset a populated database. Disable the seed switch after the initial demo setup as an additional safeguard.
- Photos and audio are stored in PostgreSQL `bytea`. The repository's assumptions document identifies object storage as a future scaling step.
- The supervisor experience is designed for a recent Chrome browser on Android. HTTPS or localhost is required for browser media APIs such as microphone capture.
- Tamil locale strings and the fallback keyword list are identified as requiring native-speaker review before production use.
- The current seed users have known passwords/PINs, and the application source does not include a user-administration screen. Account provisioning and credential rotation need to be handled before using real company data.
- The weekly workbook is Excel (`.xlsx`). Buyer links are read-only, scoped to a buyer, expiring and revocable.

## 9. Source files relevant to deployment

- `Dockerfile` — production application image.
- `compose.yaml` — local PostgreSQL + app stack.
- `docker/entrypoint.sh` — database wait, migrations, conditional demo seed and process handoff.
- `.env.example` — native Node.js development variables.
- `.env.docker.example` — Docker Compose local variables.
- `src/config.js` — environment-variable loading and production checks.
- `src/server.js` — HTTP server startup and host binding.
- `src/db/migrate.js` — migration ledger and migration execution.
- `src/db/seed.js` and `src/db/seedData.js` — demo data generation.
