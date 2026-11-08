// Delay warnings: detected by the engine, confirmed or dismissed by a
// merchandiser, resolved when the order recovers. Buyers only ever see
// confirmed ones.
import { loadSummary, buildSnapshot } from './orderSummary.js';
import { LEVEL_RANK } from './orderStatus.js';
import {
  findLatestWarning, findWarning, insertWarning, updateDetectedWarning, resolveWarning,
  confirmWarningRow, dismissWarningRow,
} from '../db/queries/warnings.js';

const isBad = (level) => level === 'amber' || level === 'red';

// Runs after every entry, date change and milestone update.
export async function refreshWarning(orderId) {
  const summary = await loadSummary(orderId);
  if (!summary) return null;
  const latest = await findLatestWarning(orderId);

  if (isBad(summary.level)) {
    const snapshot = buildSnapshot(summary);
    if (!latest || latest.status === 'resolved') {
      return insertWarning({ orderId, level: summary.level, snapshot });
    }
    if (latest.status === 'detected') {
      await updateDetectedWarning(latest.id, { level: summary.level, snapshot });
      return latest;
    }
    // Confirmed or dismissed: only a worse level opens a new warning. The old one stays as history.
    if (LEVEL_RANK[summary.level] > LEVEL_RANK[latest.level]) {
      return insertWarning({ orderId, level: summary.level, snapshot });
    }
    return latest;
  }

  if (latest && (latest.status === 'detected' || latest.status === 'confirmed')) {
    await resolveWarning(latest.id);
  }
  return null;
}

// Freezes the maths at the moment of confirmation.
export async function confirmWarning(id, { userId, reasonCategory, noteForBuyer }) {
  const warning = await findWarning(id);
  if (!warning || warning.status !== 'detected') return false;
  const summary = await loadSummary(warning.order_id);
  const snapshot = summary && isBad(summary.level) ? buildSnapshot(summary) : warning.snapshot;
  return confirmWarningRow(id, { userId, reasonCategory, noteForBuyer: noteForBuyer || null, snapshot });
}

export async function dismissWarning(id, { userId, reason }) {
  return dismissWarningRow(id, { userId, reason });
}
