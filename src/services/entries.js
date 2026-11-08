// Saving a daily entry: validation that mirrors the client, floor ownership,
// idempotency for the offline queue, media and note storage, then the
// warning refresh and AI processing.
import { withTransaction } from '../db/pool.js';
import { findMilestone } from '../db/queries/orders.js';
import { findEntryByUuid, findEntryByDate, listEntriesForMilestone, machinesUsedOnFloor, upsertEntry } from '../db/queries/entries.js';
import { insertMedia } from '../db/queries/media.js';
import { insertNote } from '../db/queries/notes.js';
import { today as clockToday } from './clock.js';
import { addWorkingDays } from './workdays.js';
import { refreshWarning } from './warnings.js';
import { processNoteInBackground } from './ai.js';
import { HttpError } from '../lib/errors.js';

const invalid = (field, message) => new HttpError(400, message, { field });

export async function saveEntry({ data, user, floor = null, photo = null, audio = null }) {
  const stage = await findMilestone(data.stageId);
  if (!stage || stage.kind !== 'quantity') throw new HttpError(404, 'Stage not found');

  // Supervisors may only touch stages on their own floor, and only for today.
  let entryDate = clockToday();
  if (user.role === 'supervisor') {
    if (!floor || stage.floor_id !== floor.id) throw new HttpError(403, 'This stage is not on your floor');
  } else if (data.entryDate) {
    if (data.entryDate > entryDate) throw invalid('entryDate', 'The date cannot be in the future');
    entryDate = data.entryDate;
  }

  // Same client_uuid again: the offline queue retried a request that already landed.
  if (data.clientUuid) {
    const existing = await findEntryByUuid(data.clientUuid);
    if (existing) return { entry: existing, duplicate: true };
  }

  const totalMachines = stage.total_machines;
  const unit = stage.capacity_unit ?? 'machines';
  if (data.machines > totalMachines) throw invalid('machines', `More than the floor's ${totalMachines} ${unit}`);
  const usedElsewhere = await machinesUsedOnFloor(stage.floor_id, entryDate, stage.id);
  if (usedElsewhere + data.machines > totalMachines) {
    throw invalid('machines', `Only ${totalMachines - usedElsewhere} ${unit} are free on this floor today`);
  }

  const entries = await listEntriesForMilestone(stage.id);
  const existingToday = entries.find((e) => e.entry_date === entryDate) ?? null;
  const doneBefore = entries.reduce((sum, e) => sum + e.pieces, 0) - (existingToday?.pieces ?? 0);
  const remaining = stage.target_qty - doneBefore;
  if (data.pieces > remaining) throw invalid('pieces', `More than the remaining ${remaining} pieces`);

  const closedUntil = data.machines === 0 && data.closedDays ? addWorkingDays(entryDate, data.closedDays) : null;

  const saved = await withTransaction(async (client) => {
    const entry = await upsertEntry(client, {
      milestoneId: stage.id,
      entryDate,
      pieces: data.pieces,
      machines: data.machines,
      closedUntil,
      supervisorId: stage.supervisor_id ?? null,
      enteredBy: user.id,
      clientUuid: data.clientUuid ?? null,
    });
    let note = null;
    if (photo) await insertMedia(client, { kind: 'photo', mime: photo.mime, bytes: photo.bytes, orderId: stage.order_id, entryId: entry.id });
    let audioMedia = null;
    if (audio) audioMedia = await insertMedia(client, { kind: 'audio', mime: audio.mime, bytes: audio.bytes, orderId: stage.order_id, entryId: entry.id, sharedWithBuyer: false });
    if (data.noteText || audioMedia) {
      note = await insertNote(client, { entryId: entry.id, orderId: stage.order_id, originalText: data.noteText ?? null, audioMediaId: audioMedia?.id ?? null });
    }
    return { entry, note };
  });

  await refreshWarning(stage.order_id);
  if (saved.note) processNoteInBackground(saved.note.id);
  return { entry: saved.entry, note: saved.note, duplicate: false, replaced: Boolean(existingToday) };
}
