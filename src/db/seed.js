// Drops all data and loads the sample data from seedData.js.
// Run with `npm run seed`. Safe to run again to reset the demo.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';
import { labelPng } from './seedImages.js';
import { today } from '../services/clock.js';
import { milestonesFromTemplate } from '../services/tna.js';
import { addWorkingDays } from '../services/workdays.js';
import { refreshWarning, confirmWarning } from '../services/warnings.js';
import { findLatestWarning } from './queries/warnings.js';
import * as data from './seedData.js';

const TABLES = ['date_changes', 'warnings', 'notes', 'media', 'daily_entries', 'order_milestones', 'order_lines',
  'orders', 'template_milestones', 'templates', 'floors', 'units', 'buyer_links', 'buyers', 'users', 'session'];

export async function seed() {
  if (today() !== data.SEED_TODAY) {
    console.warn(`warning: DEMO_TODAY is ${today()} but the seed is designed for ${data.SEED_TODAY}`);
  }
  const ids = await withTransaction(async (client) => {
    await client.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);

    const buyerId = {};
    for (const buyer of data.buyers) {
      const { rows } = await client.query('INSERT INTO buyers (name, country) VALUES ($1, $2) RETURNING id', [buyer.name, buyer.country]);
      buyerId[buyer.name] = rows[0].id;
    }

    const unitId = {};
    for (const unit of data.units) {
      const { rows } = await client.query('INSERT INTO units (name, kind) VALUES ($1, $2) RETURNING id', [unit.name, unit.kind]);
      unitId[unit.key] = rows[0].id;
    }

    const userId = {};
    const passwordHash = await bcrypt.hash(data.DEMO_PASSWORD, 10);
    for (const m of data.merchandisers) {
      const { rows } = await client.query(
        `INSERT INTO users (name, role, email, password_hash, language) VALUES ($1, 'merchandiser', $2, $3, 'en') RETURNING id`,
        [m.name, m.email, passwordHash],
      );
      userId[m.key] = rows[0].id;
    }

    const pinHash = await bcrypt.hash(data.DEMO_PIN, 10);
    const floorId = {};
    const floorInfo = {};
    for (const floor of data.floors) {
      let supervisorId = null;
      if (floor.supervisor) {
        const { rows } = await client.query(
          `INSERT INTO users (name, role, phone, password_hash, language) VALUES ($1, 'supervisor', $2, $3, 'en') RETURNING id`,
          [floor.supervisor.name, floor.supervisor.phone, pinHash],
        );
        supervisorId = rows[0].id;
      }
      const { rows } = await client.query(
        `INSERT INTO floors (unit_id, name, total_machines, capacity_unit, supervisor_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [unitId[floor.unit], floor.name, floor.total, floor.capacityUnit, supervisorId],
      );
      floorId[floor.key] = rows[0].id;
      floorInfo[floor.key] = { ...floor, id: rows[0].id, supervisorId, unitKind: data.units.find((u) => u.key === floor.unit).kind };
    }

    const templatesByName = {};
    for (const template of data.templates) {
      const { rows } = await client.query('INSERT INTO templates (name) VALUES ($1) RETURNING id', [template.name]);
      const milestones = [];
      for (const [index, m] of template.milestones.entries()) {
        const { rows: mrows } = await client.query(
          `INSERT INTO template_milestones (template_id, seq, name, kind, start_offset_days, end_offset_days)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [rows[0].id, index + 1, m.name, m.kind, m.startOffsetDays ?? null, m.endOffsetDays],
        );
        milestones.push(mrows[0]);
      }
      templatesByName[template.name] = { id: rows[0].id, name: template.name, milestones };
    }

    const orderId = {};
    const milestoneId = {}; // `${po}|${name}` -> id
    const entryId = {};     // `${po}|${stage}|${date}` -> id
    for (const order of data.orders) {
      const totalQty = order.lines.reduce((sum, l) => sum + l.quantity, 0);
      const { rows } = await client.query(
        `INSERT INTO orders (po_number, buyer_id, style, ex_factory_date, template_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [order.po, buyerId[order.buyer], order.style, order.exFactory, order.template, userId.priya],
      );
      orderId[order.po] = rows[0].id;
      for (const line of order.lines) {
        await client.query('INSERT INTO order_lines (order_id, colour, size, quantity) VALUES ($1, $2, $3, $4)',
          [rows[0].id, line.colour, line.size, line.quantity]);
      }

      const floorByName = Object.fromEntries(Object.entries(order.floors).map(([stage, key]) => [stage, floorId[key]]));
      const milestones = milestonesFromTemplate(templatesByName[order.template], order.exFactory, { totalQty, floorByName });
      for (const m of milestones) {
        const override = order.plannedOverrides?.[m.name] ?? {};
        const plannedEnd = override.plannedEnd ?? m.plannedEnd;
        // Date milestones already in the past are done on their planned date unless the seed says otherwise.
        let actual = null;
        if (m.kind === 'date') {
          const hasOverride = order.actuals && Object.hasOwn(order.actuals, m.name);
          actual = hasOverride ? order.actuals[m.name] : (plannedEnd < data.SEED_TODAY ? plannedEnd : null);
        }
        const { rows: mrows } = await client.query(
          `INSERT INTO order_milestones (order_id, seq, name, kind, planned_start, planned_end, actual_date, floor_id, target_qty)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [rows[0].id, m.seq, m.name, m.kind, m.plannedStart ?? null, plannedEnd, actual, m.floorId ?? null, m.targetQty ?? null],
        );
        milestoneId[`${order.po}|${m.name}`] = mrows[0].id;
      }

      for (const [stage, entries] of Object.entries(order.stages)) {
        const floor = floorInfo[order.floors[stage]];
        const enteredBy = floor.supervisorId ?? userId.karthik; // subcontractor progress is entered by a merchandiser (A6)
        for (const [date, machines, pieces, closedDays] of entries) {
          const closedUntil = machines === 0 && closedDays ? addWorkingDays(date, closedDays) : null;
          const { rows: erows } = await client.query(
            `INSERT INTO daily_entries (order_milestone_id, entry_date, pieces, machines, closed_until, supervisor_id, entered_by, client_uuid, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
            [milestoneId[`${order.po}|${stage}`], date, pieces, machines, closedUntil, floor.supervisorId, enteredBy,
              crypto.randomUUID(), `${date}T12:30:00+05:30`],
          );
          entryId[`${order.po}|${stage}|${date}`] = erows[0].id;
        }
      }
    }

    for (const photo of data.photos) {
      const bytes = labelPng({ colour: photo.colour, label: photo.label });
      await client.query(
        `INSERT INTO media (kind, mime, bytes, size_bytes, order_id, entry_id, shared_with_buyer, created_at)
         VALUES ('photo', 'image/png', $1, $2, $3, $4, true, $5)`,
        [bytes, bytes.length, orderId[photo.po], entryId[`${photo.po}|${photo.stage}|${photo.date}`], `${photo.date}T12:35:00+05:30`],
      );
    }

    for (const note of data.notes) {
      await client.query(
        `INSERT INTO notes (entry_id, order_id, original_text, translation_en, ai_category, ai_confidence, ai_source, status,
                            final_category, reviewed_by, reviewed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'groq', $7, $8, $9, $10, $11)`,
        [entryId[`${note.po}|${note.stage}|${note.date}`], orderId[note.po], note.text, note.translation, note.category,
          note.confidence, note.status, note.finalCategory ?? null, note.reviewedBy ? userId[note.reviewedBy] : null,
          note.reviewedBy ? `${note.date}T15:00:00+05:30` : null, `${note.date}T12:31:00+05:30`],
      );
    }

    for (const change of data.dateChanges) {
      await client.query(
        `INSERT INTO date_changes (order_id, order_milestone_id, field, old_value, new_value, reason, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orderId[change.po], change.milestone ? milestoneId[`${change.po}|${change.milestone}`] : null, change.field,
          change.old, change.new, change.reason, userId[change.by], change.at],
      );
    }

    for (const [buyerName, token] of Object.entries(data.DEMO_TOKENS)) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await client.query(
        `INSERT INTO buyer_links (buyer_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [buyerId[buyerName], tokenHash, '2027-12-31T23:59:59Z'],
      );
    }

    return { orderId, userId };
  });

  // Warnings come from the real engine, exactly as they would after each entry.
  for (const id of Object.values(ids.orderId)) await refreshWarning(id);
  const warning = await findLatestWarning(ids.orderId[data.confirmedWarning.po]);
  await confirmWarning(warning.id, {
    userId: ids.userId[data.confirmedWarning.by],
    reasonCategory: data.confirmedWarning.reasonCategory,
    noteForBuyer: data.confirmedWarning.noteForBuyer,
  });
  return ids;
}

const runDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (runDirectly) {
  seed()
    .then(() => {
      console.log(`seeded ${data.orders.length} orders, ${data.notes.length} notes, ${data.photos.length} photos`);
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
