import { query } from '../pool.js';

const NOTE_SELECT = `
  SELECT n.*, e.entry_date, e.pieces, e.machines, m.name AS stage_name, m.id AS milestone_id,
         o.po_number, o.style, f.name AS floor_name, u.name AS unit_name, r.name AS reviewed_by_name,
         eb.name AS entered_by_name
  FROM notes n
  JOIN daily_entries e ON e.id = n.entry_id
  JOIN order_milestones m ON m.id = e.order_milestone_id
  JOIN orders o ON o.id = n.order_id
  LEFT JOIN floors f ON f.id = m.floor_id
  LEFT JOIN units u ON u.id = f.unit_id
  LEFT JOIN users r ON r.id = n.reviewed_by
  LEFT JOIN users eb ON eb.id = e.entered_by`;

export async function insertNote(client, { entryId, orderId, originalText = null, audioMediaId = null }) {
  const { rows } = await client.query(
    `INSERT INTO notes (entry_id, order_id, original_text, audio_media_id, status, ai_source)
     VALUES ($1, $2, $3, $4, 'processing', 'none') RETURNING *`,
    [entryId, orderId, originalText, audioMediaId],
  );
  return rows[0];
}

export async function findNote(id) {
  const { rows } = await query(`${NOTE_SELECT} WHERE n.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listNotesForOrder(orderId) {
  const { rows } = await query(`${NOTE_SELECT} WHERE n.order_id = $1 ORDER BY e.entry_date DESC, n.id DESC`, [orderId]);
  return rows;
}

// Review inbox: needs_review first, then suggested, then anything still processing.
export async function listNotesForReview() {
  const { rows } = await query(
    `${NOTE_SELECT} WHERE n.status IN ('needs_review', 'suggested', 'processing')
     ORDER BY CASE n.status WHEN 'needs_review' THEN 0 WHEN 'suggested' THEN 1 ELSE 2 END, n.created_at DESC`,
  );
  return rows;
}

export async function countNotesForReview() {
  const { rows } = await query(`SELECT count(*) AS count FROM notes WHERE status IN ('needs_review', 'suggested')`);
  return rows[0].count;
}

export async function resetNoteForProcessing(id) {
  await query(
    `UPDATE notes SET status = 'processing', ai_error = NULL, ai_started_at = now() WHERE id = $1`,
    [id],
  );
}

export async function saveNoteAiResult(id, result) {
  await query(
    `UPDATE notes SET transcript_ta = coalesce($2, transcript_ta), translation_en = $3, ai_category = $4,
       ai_confidence = $5, ai_source = $6, status = $7, ai_error = $8
     WHERE id = $1 AND status <> 'confirmed'`,
    [id, result.transcriptTa ?? null, result.translationEn ?? null, result.category, result.confidence,
      result.source, result.status, result.error ?? null],
  );
}

export async function confirmNote(id, { category, userId }) {
  await query(
    `UPDATE notes SET final_category = $2, reviewed_by = $3, reviewed_at = now(), status = 'confirmed' WHERE id = $1`,
    [id, category, userId],
  );
}

// The best-known reason on an order: a note on the given stage first, confirmed
// before suggested, newest first.
export async function latestCategory({ orderId, milestoneId = null }) {
  const { rows } = await query(
    `SELECT coalesce(n.final_category, n.ai_category) AS category
     FROM notes n JOIN daily_entries e ON e.id = n.entry_id
     WHERE n.order_id = $1 AND coalesce(n.final_category, n.ai_category) IS NOT NULL
     ORDER BY coalesce(e.order_milestone_id = $2, false) DESC, (n.status = 'confirmed') DESC, n.created_at DESC
     LIMIT 1`,
    [orderId, milestoneId],
  );
  return rows[0]?.category ?? null;
}
