import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { entryUpload, pickUploads } from '../middleware/uploads.js';
import { parseInput, firstError } from '../middleware/validate.js';
import {
  newOrderSchema, dateChangeSchema, plannedDatesSchema, markDoneSchema, entrySchema, mediaShareSchema,
} from '../validation/schemas.js';
import { listBuyers } from '../db/queries/buyers.js';
import { listFloors } from '../db/queries/floors.js';
import { listTemplatesWithMilestones, findTemplate } from '../db/queries/templates.js';
import { createOrder, findOrder, findMilestone, poNumberExists } from '../db/queries/orders.js';
import { listNotesForOrder } from '../db/queries/notes.js';
import { listDateChangesForOrder } from '../db/queries/dateChanges.js';
import { listPhotosForOrders, setMediaShared } from '../db/queries/media.js';
import { loadSummary } from '../services/orderSummary.js';
import { milestonesFromTemplate } from '../services/tna.js';
import { saveEntry } from '../services/entries.js';
import { changeExFactory, changePlannedDates, markMilestoneDone } from '../services/dateChanges.js';
import { isStuck } from '../services/ai.js';
import { CATEGORIES } from '../services/categories.js';
import { today } from '../services/clock.js';
import { notFound, HttpError } from '../lib/errors.js';

const router = Router();
router.use('/orders', requireRole('merchandiser'));

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : Object.values(value));

async function renderNewOrder(res, { values, errors = {}, status = 200 }) {
  const [buyers, floors, templates] = await Promise.all([listBuyers(), listFloors(), listTemplatesWithMilestones()]);
  res.status(status).render('office/orderNew', {
    title: res.locals.t('order.new'), buyers, floors, templates, values, errors,
  });
}

router.get('/orders/new', async (req, res) => {
  await renderNewOrder(res, {
    values: { poNumber: '', buyerId: '', style: '', exFactoryDate: '', templateId: '', colours: [''], sizes: DEFAULT_SIZES, qty: [[]], floors: {} },
  });
});

// The grid arrives as colours[i], sizes[j] and qty[i][j]; floors as floors[stage name].
function linesFromBody(body) {
  const colours = asArray(body.colours).map((c) => String(c ?? '').trim());
  const sizes = asArray(body.sizes).map((s) => String(s ?? '').trim());
  const qty = asArray(body.qty).map(asArray);
  const lines = [];
  colours.forEach((colour, i) => {
    sizes.forEach((size, j) => {
      const value = String(qty[i]?.[j] ?? '').trim();
      if (value !== '' && value !== '0') lines.push({ colour, size, quantity: value });
    });
  });
  return { colours, sizes, qty, lines };
}

router.post('/orders', async (req, res) => {
  const { colours, sizes, qty, lines } = linesFromBody(req.body);
  const values = { ...req.body, colours, sizes: sizes.length ? sizes : DEFAULT_SIZES, qty, floors: req.body.floors ?? {} };
  const t = res.locals.t;
  const { data, errors: fieldErrors } = parseInput(newOrderSchema, { ...req.body, lines, floors: req.body.floors ?? {} });
  const errors = { ...(fieldErrors ?? {}) };
  if (errors.lines) errors.lines = t('order.needLine');
  const usedColours = colours.filter((c) => c);
  if (new Set(usedColours).size !== usedColours.length) errors.lines = t('order.coloursDup');
  if (new Set(sizes.filter((s) => s)).size !== sizes.filter((s) => s).length) errors.lines = t('order.sizesDup');

  const template = data ? await findTemplate(data.templateId) : null;
  if (data && !template) errors.templateId = t('common.required');
  if (template) {
    for (const m of template.milestones.filter((m) => m.kind === 'quantity')) {
      if (!data.floors[m.name]) errors[`floors.${m.name}`] = t('order.chooseFloor');
    }
  }
  if (data && await poNumberExists(data.poNumber)) errors.poNumber = t('order.poExists');

  if (Object.keys(errors).length > 0) return renderNewOrder(res, { values, errors, status: 422 });

  const totalQty = data.lines.reduce((sum, l) => sum + l.quantity, 0);
  const milestones = milestonesFromTemplate(template, data.exFactoryDate, { totalQty, floorByName: data.floors });
  const order = await createOrder({
    order: { poNumber: data.poNumber, buyerId: data.buyerId, style: data.style, exFactoryDate: data.exFactoryDate, templateName: template.name, createdBy: req.user.id },
    lines: data.lines,
    milestones,
  });
  req.flash('ok', t('order.created'));
  res.redirect(`/orders/${order.id}`);
});

router.get('/orders/:id', async (req, res) => {
  const summary = await loadSummary(req.params.id);
  if (!summary) throw notFound();
  const [notes, dateChanges, photos] = await Promise.all([
    listNotesForOrder(summary.id), listDateChangesForOrder(summary.id), listPhotosForOrders([summary.id]),
  ]);
  res.render('office/orderDetail', {
    title: summary.po_number, summary, notes, dateChanges, photos, categories: CATEGORIES, isStuck, today: today(),
  });
});

async function loadOrderOr404(id) {
  const order = await findOrder(id);
  if (!order) throw notFound();
  return order;
}

async function loadMilestoneOr404(orderId, milestoneId) {
  const milestone = await findMilestone(milestoneId);
  if (!milestone || String(milestone.order_id) !== String(orderId)) throw notFound();
  return milestone;
}

function failBack(req, res, errors, orderId, anchor = '') {
  req.flash('error', `${res.locals.t('errors.validation')} ${firstError(errors) ?? ''}`.trim());
  res.redirect(`/orders/${orderId}${anchor}`);
}

router.post('/orders/:id/ex-factory', async (req, res) => {
  const order = await loadOrderOr404(req.params.id);
  const { data, errors } = parseInput(dateChangeSchema, req.body);
  if (errors) return failBack(req, res, errors, order.id);
  await changeExFactory(order, { newDate: data.newDate, reason: data.reason, user: req.user });
  req.flash('ok', res.locals.t('order.dateChanged'));
  res.redirect(`/orders/${order.id}`);
});

router.post('/orders/:id/milestones/:mid/planned', async (req, res) => {
  const milestone = await loadMilestoneOr404(req.params.id, req.params.mid);
  const { data, errors } = parseInput(plannedDatesSchema, req.body);
  if (errors) return failBack(req, res, errors, milestone.order_id, '#timeline');
  if (milestone.kind === 'quantity' && data.plannedStart && data.plannedStart > data.plannedEnd) {
    return failBack(req, res, { plannedStart: 'Start must be on or before the end' }, milestone.order_id, '#timeline');
  }
  await changePlannedDates(milestone, {
    plannedStart: milestone.kind === 'quantity' ? data.plannedStart ?? null : null,
    plannedEnd: data.plannedEnd, reason: data.reason, user: req.user,
  });
  req.flash('ok', res.locals.t('order.plannedChanged'));
  res.redirect(`/orders/${milestone.order_id}#timeline`);
});

router.post('/orders/:id/milestones/:mid/done', async (req, res) => {
  const milestone = await loadMilestoneOr404(req.params.id, req.params.mid);
  if (milestone.kind !== 'date') throw new HttpError(400, 'Only date milestones can be marked done');
  const { data, errors } = parseInput(markDoneSchema, req.body);
  if (errors) return failBack(req, res, errors, milestone.order_id, '#timeline');
  await markMilestoneDone(milestone, { actualDate: data.actualDate, reason: data.reason, user: req.user });
  req.flash('ok', res.locals.t('order.milestoneDone'));
  res.redirect(`/orders/${milestone.order_id}#timeline`);
});

// Merchandisers enter progress for subcontractors (and can back-date, assumption A10).
router.post('/orders/:id/stages/:mid/entries', entryUpload, verifyCsrf, async (req, res) => {
  const milestone = await loadMilestoneOr404(req.params.id, req.params.mid);
  const { data, errors } = parseInput(entrySchema, { ...req.body, stageId: milestone.id });
  if (errors) return failBack(req, res, errors, milestone.order_id, '#stages');
  try {
    await saveEntry({ data, user: req.user, ...pickUploads(req) });
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) return failBack(req, res, { _: error.message }, milestone.order_id, '#stages');
    throw error;
  }
  req.flash('ok', res.locals.t('order.entrySaved'));
  res.redirect(`/orders/${milestone.order_id}#stages`);
});

router.post('/orders/:id/media/:mediaId/share', async (req, res) => {
  const order = await loadOrderOr404(req.params.id);
  const { data, errors } = parseInput(mediaShareSchema, req.body);
  if (errors) return failBack(req, res, errors, order.id, '#photos');
  await setMediaShared(req.params.mediaId, order.id, data.shared === '1');
  res.redirect(`/orders/${order.id}#photos`);
});

export default router;
