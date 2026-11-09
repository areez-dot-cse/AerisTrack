import { Router } from 'express';
import { listTemplates, findTemplate, createTemplate, updateTemplate, deleteTemplate } from '../db/queries/templates.js';
import { templateSchema } from '../validation/schemas.js';
import { parseInput } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';

const router = Router();
router.use('/templates', requireRole('merchandiser'));

// Form rows arrive as milestones[0][name]… ; after a row is removed the keys may be an object.
function rowsFromBody(body) {
  const raw = body.milestones ?? [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function renderForm(res, { template, values, errors, status = 200 }) {
  res.status(status).render('office/templateEdit', {
    title: template ? template.name : res.locals.t('templates.new'),
    template,
    values,
    errors: errors ?? {},
  });
}

router.get('/templates', async (req, res) => {
  res.render('office/templates', { title: res.locals.t('templates.title'), templates: await listTemplates() });
});

router.get('/templates/new', (req, res) => {
  renderForm(res, { template: null, values: { name: '', milestones: [{ name: '', kind: 'date', endOffsetDays: '' }] } });
});

router.get('/templates/:id', async (req, res) => {
  const template = await findTemplate(req.params.id);
  if (!template) throw notFound();
  const values = {
    name: template.name,
    milestones: template.milestones.map((m) => ({
      name: m.name, kind: m.kind, startOffsetDays: m.start_offset_days ?? '', endOffsetDays: m.end_offset_days,
    })),
  };
  renderForm(res, { template, values });
});

async function saveTemplate(req, res, existing) {
  const values = { name: req.body.name ?? '', milestones: rowsFromBody(req.body) };
  const { data, errors } = parseInput(templateSchema, values);
  if (errors) return renderForm(res, { template: existing, values, errors, status: 422 });
  try {
    if (existing) {
      await updateTemplate(existing.id, data);
      req.flash('ok', res.locals.t('templates.saved'));
      return res.redirect(`/templates/${existing.id}`);
    }
    const created = await createTemplate(data);
    req.flash('ok', res.locals.t('templates.saved'));
    res.redirect(`/templates/${created.id}`);
  } catch (error) {
    if (error.code === '23505') { // unique violation on the name
      return renderForm(res, { template: existing, values, errors: { name: res.locals.t('templates.nameExists') }, status: 422 });
    }
    throw error;
  }
}

router.post('/templates', (req, res) => saveTemplate(req, res, null));

router.post('/templates/:id', async (req, res) => {
  const template = await findTemplate(req.params.id);
  if (!template) throw notFound();
  await saveTemplate(req, res, template);
});

// Always allowed: orders keep their own copy of the milestones.
router.post('/templates/:id/delete', async (req, res) => {
  await deleteTemplate(req.params.id);
  req.flash('ok', res.locals.t('templates.deleted'));
  res.redirect('/templates');
});

export default router;
