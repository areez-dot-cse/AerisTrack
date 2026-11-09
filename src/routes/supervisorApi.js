// JSON API for the supervisor PWA. Every call checks the floor the supervisor owns.
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { verifyCsrf, csrfToken } from '../middleware/csrf.js';
import { entryUpload, pickUploads } from '../middleware/uploads.js';
import { parseInput } from '../middleware/validate.js';
import { entrySchema } from '../validation/schemas.js';
import { findFloorBySupervisor } from '../db/queries/floors.js';
import { listOpenStagesForFloor } from '../db/queries/orders.js';
import { listEntriesForMilestone } from '../db/queries/entries.js';
import { saveEntry } from '../services/entries.js';
import { today } from '../services/clock.js';
import { HttpError } from '../lib/errors.js';

const router = Router();
router.use('/api/s', requireRole('supervisor'));

async function loadFloor(req, res, next) {
  req.floor = await findFloorBySupervisor(req.user.id);
  if (!req.floor) return next(new HttpError(403, 'No floor is assigned to you'));
  next();
}
router.use('/api/s', loadFloor);

const floorJson = (floor) => ({
  id: floor.id, name: floor.name, unitName: floor.unit_name, totalMachines: floor.total_machines, capacityUnit: floor.capacity_unit,
});

router.get('/api/s/me', (req, res) => {
  res.json({
    user: { id: req.user.id, name: req.user.name, language: req.user.language },
    floor: floorJson(req.floor),
    csrfToken: csrfToken(req),
    today: today(),
  });
});

// Every incomplete quantity stage on this floor, sorted by deadline, with what
// the update screen needs to prefill and sanity-check the numbers.
router.get('/api/s/today', async (req, res) => {
  const stages = await listOpenStagesForFloor(req.floor.id);
  const result = [];
  for (const stage of stages) {
    const entries = await listEntriesForMilestone(stage.id);
    const working = entries.filter((e) => e.machines > 0).slice(-3);
    const last = entries[entries.length - 1] ?? null;
    const lastWorking = [...entries].reverse().find((e) => e.machines > 0) ?? null;
    result.push({
      id: stage.id,
      po: stage.po_number,
      style: stage.style,
      buyer: stage.buyer_name,
      stage: stage.name,
      target: stage.target_qty,
      done: stage.done,
      remaining: stage.target_qty - stage.done,
      plannedStart: stage.planned_start,
      plannedEnd: stage.planned_end,
      exFactory: stage.ex_factory_date,
      lastEntry: last ? { date: last.entry_date, pieces: last.pieces, machines: last.machines } : null,
      todayEntry: last && last.entry_date === today() ? { pieces: last.pieces, machines: last.machines } : null,
      lastMachines: lastWorking?.machines ?? req.floor.total_machines,
      recentAverage: working.length ? Math.round(working.reduce((sum, e) => sum + e.pieces, 0) / working.length) : null,
    });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ today: today(), floor: floorJson(req.floor), stages: result });
});

// One multipart POST per queued update. 200 = done (or already done), 4xx = fix it, 5xx = retry later.
router.post('/api/s/entries', entryUpload, verifyCsrf, async (req, res) => {
  const { data, errors } = parseInput(entrySchema, req.body);
  if (errors) {
    const [field, message] = Object.entries(errors)[0];
    throw new HttpError(400, message, { field });
  }
  const result = await saveEntry({ data, user: req.user, floor: req.floor, ...pickUploads(req) });
  res.json({
    ok: true,
    duplicate: result.duplicate,
    entry: { id: result.entry.id, date: result.entry.entry_date, pieces: result.entry.pieces, machines: result.entry.machines },
  });
});

export default router;
