-- Company A order & TNA tracker: initial schema.
-- Ids are serial, enums are CHECK constraints, and every date is a DATE column
-- read back as a 'YYYY-MM-DD' string (see src/db/pool.js).

CREATE TABLE users (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('merchandiser', 'supervisor')),
  email         text UNIQUE,                  -- merchandisers sign in with email
  phone         text UNIQUE,                  -- supervisors sign in with phone
  password_hash text NOT NULL,                -- bcrypt of the password or the 4-digit PIN
  language      text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ta')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'merchandiser' AND email IS NOT NULL) OR (role = 'supervisor' AND phone IS NOT NULL))
);

CREATE TABLE buyers (
  id      serial PRIMARY KEY,
  name    text NOT NULL UNIQUE,
  country text NOT NULL
);

-- Read-only buyer access. The raw token is shown once; only its SHA-256 is stored.
CREATE TABLE buyer_links (
  id         serial PRIMARY KEY,
  buyer_id   int NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buyer_links_buyer_idx ON buyer_links (buyer_id);

CREATE TABLE units (
  id   serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('own', 'subcontract'))
);

CREATE TABLE floors (
  id             serial PRIMARY KEY,
  unit_id        int NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name           text NOT NULL,
  total_machines int NOT NULL CHECK (total_machines > 0),
  -- Finishing and packing floors count tables, not machines. Only the label differs.
  capacity_unit  text NOT NULL DEFAULT 'machines' CHECK (capacity_unit IN ('machines', 'tables')),
  supervisor_id  int UNIQUE REFERENCES users(id) ON DELETE SET NULL, -- one supervisor per floor
  UNIQUE (unit_id, name)
);

CREATE TABLE templates (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Offsets are calendar days BEFORE the ex-factory date.
CREATE TABLE template_milestones (
  id                serial PRIMARY KEY,
  template_id       int NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  seq               int NOT NULL,
  name              text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('date', 'quantity')),
  start_offset_days int,                                   -- quantity stages only
  end_offset_days   int NOT NULL CHECK (end_offset_days >= 0),
  CHECK (kind = 'date' OR (start_offset_days IS NOT NULL AND start_offset_days >= end_offset_days)),
  UNIQUE (template_id, seq)
);

CREATE TABLE orders (
  id              serial PRIMARY KEY,
  po_number       text NOT NULL UNIQUE,
  buyer_id        int NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  style           text NOT NULL,
  ex_factory_date date NOT NULL,
  template_name   text NOT NULL,          -- copied for reference; the order owns its milestones
  created_by      int NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_lines (
  id       serial PRIMARY KEY,
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  colour   text NOT NULL,
  size     text NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  UNIQUE (order_id, colour, size)
);

-- A copy of the template milestones, with real dates, owned by the order.
CREATE TABLE order_milestones (
  id            serial PRIMARY KEY,
  order_id      int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seq           int NOT NULL,
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('date', 'quantity')),
  planned_start date,                                       -- quantity stages
  planned_end   date NOT NULL,
  actual_date   date,                                       -- date milestones: when completed
  floor_id      int REFERENCES floors(id) ON DELETE RESTRICT, -- quantity stages: where it runs
  target_qty    int CHECK (target_qty > 0),                 -- quantity stages: = order total
  CHECK (kind = 'date' OR (planned_start IS NOT NULL AND floor_id IS NOT NULL AND target_qty IS NOT NULL)),
  UNIQUE (order_id, seq)
);
CREATE INDEX order_milestones_floor_idx ON order_milestones (floor_id);

CREATE TABLE daily_entries (
  id                 serial PRIMARY KEY,
  order_milestone_id int NOT NULL REFERENCES order_milestones(id) ON DELETE CASCADE,
  entry_date         date NOT NULL,
  pieces             int NOT NULL CHECK (pieces >= 0),
  machines           int NOT NULL CHECK (machines >= 0),
  closed_until       date,                                  -- set when machines = 0 and closure days given
  supervisor_id      int REFERENCES users(id) ON DELETE SET NULL, -- floor supervisor at the time
  entered_by         int NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- who actually submitted
  client_uuid        uuid UNIQUE,                           -- idempotency key for the offline queue
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (machines > 0 OR pieces = 0),
  UNIQUE (order_milestone_id, entry_date)
);

CREATE TABLE media (
  id                serial PRIMARY KEY,
  kind              text NOT NULL CHECK (kind IN ('photo', 'audio')),
  mime              text NOT NULL,
  bytes             bytea NOT NULL,
  size_bytes        int NOT NULL,
  order_id          int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  entry_id          int REFERENCES daily_entries(id) ON DELETE SET NULL,
  shared_with_buyer boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_order_idx ON media (order_id);

CREATE TABLE notes (
  id             serial PRIMARY KEY,
  entry_id       int NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
  order_id       int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_text  text,                                      -- what the supervisor typed
  audio_media_id int REFERENCES media(id) ON DELETE SET NULL, -- the voice note
  transcript_ta  text,                                      -- speech-to-text result
  translation_en text,
  ai_category    text,
  ai_confidence  numeric(4, 3),
  ai_source      text NOT NULL DEFAULT 'none' CHECK (ai_source IN ('groq', 'keywords', 'none')),
  status         text NOT NULL DEFAULT 'processing'
                 CHECK (status IN ('processing', 'suggested', 'needs_review', 'confirmed')),
  final_category text,
  reviewed_by    int REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  ai_error       text,
  ai_started_at  timestamptz NOT NULL DEFAULT now(),       -- to spot notes stuck in "processing"
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_status_idx ON notes (status);
CREATE INDEX notes_order_idx ON notes (order_id);

CREATE TABLE warnings (
  id              serial PRIMARY KEY,
  order_id        int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  level           text NOT NULL CHECK (level IN ('amber', 'red')),
  status          text NOT NULL CHECK (status IN ('detected', 'confirmed', 'dismissed', 'resolved')),
  snapshot        jsonb NOT NULL,                           -- the maths at the time
  reason_category text,
  note_for_buyer  text,
  dismiss_reason  text,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  decided_by      int REFERENCES users(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  resolved_at     timestamptz
);
CREATE INDEX warnings_order_status_idx ON warnings (order_id, status);

-- APPEND-ONLY history of every date change, for the buyers' compliance teams.
CREATE TABLE date_changes (
  id                 serial PRIMARY KEY,
  order_id           int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_milestone_id int REFERENCES order_milestones(id) ON DELETE CASCADE,
  field              text NOT NULL CHECK (field IN ('ex_factory', 'planned_start', 'planned_end', 'actual_date')),
  old_value          date,
  new_value          date,
  reason             text NOT NULL,
  changed_by         int NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX date_changes_order_idx ON date_changes (order_id);

CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'date_changes is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER date_changes_append_only
  BEFORE UPDATE OR DELETE ON date_changes
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Session store for connect-pg-simple.
CREATE TABLE "session" (
  sid    varchar NOT NULL COLLATE "default" PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX session_expire_idx ON "session" (expire);
