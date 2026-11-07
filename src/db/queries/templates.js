import { query, withTransaction } from '../pool.js';

export async function listTemplates() {
  const { rows } = await query(
    `SELECT t.*,
            (SELECT count(*) FROM template_milestones m WHERE m.template_id = t.id) AS milestone_count,
            (SELECT count(*) FROM orders o WHERE o.template_name = t.name) AS order_count
     FROM templates t ORDER BY t.name`,
  );
  return rows;
}

export async function findTemplate(id) {
  const { rows } = await query('SELECT * FROM templates WHERE id = $1', [id]);
  const template = rows[0];
  if (!template) return null;
  template.milestones = await listTemplateMilestones(id);
  return template;
}

async function listTemplateMilestones(templateId) {
  const { rows } = await query(
    'SELECT * FROM template_milestones WHERE template_id = $1 ORDER BY seq',
    [templateId],
  );
  return rows;
}

// Every template with its milestones, for the order form's TNA preview.
export async function listTemplatesWithMilestones() {
  const templates = await listTemplates();
  const { rows } = await query('SELECT * FROM template_milestones ORDER BY template_id, seq');
  for (const template of templates) {
    template.milestones = rows.filter((m) => m.template_id === template.id);
  }
  return templates;
}

async function replaceMilestones(client, templateId, milestones) {
  await client.query('DELETE FROM template_milestones WHERE template_id = $1', [templateId]);
  for (const [index, m] of milestones.entries()) {
    await client.query(
      `INSERT INTO template_milestones (template_id, seq, name, kind, start_offset_days, end_offset_days)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [templateId, index + 1, m.name, m.kind, m.kind === 'quantity' ? m.startOffsetDays : null, m.endOffsetDays],
    );
  }
}

export function createTemplate({ name, milestones }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('INSERT INTO templates (name) VALUES ($1) RETURNING *', [name]);
    await replaceMilestones(client, rows[0].id, milestones);
    return rows[0];
  });
}

export function updateTemplate(id, { name, milestones }) {
  return withTransaction(async (client) => {
    await client.query('UPDATE templates SET name = $2, updated_at = now() WHERE id = $1', [id, name]);
    await replaceMilestones(client, id, milestones);
  });
}

export async function deleteTemplate(id) {
  await query('DELETE FROM templates WHERE id = $1', [id]);
}
