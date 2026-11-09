import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listBuyers } from '../db/queries/buyers.js';
import { listUnits } from '../db/queries/floors.js';
import { loadSummaries } from '../services/orderSummary.js';
import { LEVEL_ORDER } from '../services/orderStatus.js';

const router = Router();
router.use('/board', requireRole('merchandiser'));

const LEVELS = ['red', 'amber', 'green', 'grey'];

// Filters are plain GET parameters, so the board works without JavaScript.
router.get('/board', async (req, res) => {
  const [orders, buyers, units] = await Promise.all([loadSummaries(), listBuyers(), listUnits()]);
  const filters = {
    buyer: String(req.query.buyer ?? ''),
    unit: String(req.query.unit ?? ''),
    week: String(req.query.week ?? ''),
    status: LEVELS.includes(req.query.status) ? req.query.status : '',
  };
  const weeks = [...new Set(orders.map((o) => o.shipWeek))].sort();
  const counts = Object.fromEntries(LEVELS.map((level) => [level, orders.filter((o) => o.level === level).length]));

  const visible = orders
    .filter((o) => !filters.buyer || String(o.buyer_id) === filters.buyer)
    .filter((o) => !filters.unit || o.unitIds.map(String).includes(filters.unit))
    .filter((o) => !filters.week || o.shipWeek === filters.week)
    .filter((o) => !filters.status || o.level === filters.status)
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.ex_factory_date.localeCompare(b.ex_factory_date));

  const hasFilters = Object.values(filters).some(Boolean);
  res.render('office/board', {
    title: res.locals.t('board.title'), orders: visible, total: orders.length, buyers, units, weeks, counts, filters, hasFilters,
  });
});

export default router;
