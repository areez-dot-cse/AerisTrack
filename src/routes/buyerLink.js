// Read-only buyer pages behind a secret link. Every query is filtered by the
// buyer that the token resolves to, never by anything in the URL. English only.
import { Router } from 'express';
import { buyerForToken } from '../services/buyerLinks.js';
import { loadSummaries, loadSummary } from '../services/orderSummary.js';
import { listPhotosForOrders, findMediaMeta, findMediaBytes } from '../db/queries/media.js';
import { listDateChangesForOrder } from '../db/queries/dateChanges.js';
import { sendWeeklyExcel } from '../services/exportExcel.js';
import { attachHelpers } from '../middleware/i18n.js';
import { sendMedia } from './media.js';
import { notFound } from '../lib/errors.js';

const router = Router();

// Unknown, expired and revoked tokens all get the same friendly 404.
async function resolveBuyer(req, res, next) {
  attachHelpers(res, 'en');
  res.locals.user = null;
  const buyer = await buyerForToken(req.params.token);
  if (!buyer) {
    return res.status(404).render('buyer/inactive', { title: res.locals.t('buyer.inactive') });
  }
  req.buyer = buyer;
  res.locals.buyer = buyer;
  res.locals.base = `/b/${encodeURIComponent(req.params.token)}`;
  next();
}

router.use('/b/:token', resolveBuyer);

router.get('/b/:token', async (req, res) => {
  const orders = await loadSummaries({ buyerId: req.buyer.id });
  res.render('buyer/list', { title: req.buyer.name, orders });
});

router.get('/b/:token/orders/:id', async (req, res) => {
  const order = await loadSummary(req.params.id);
  if (!order || order.buyer_id !== req.buyer.id) throw notFound();
  const [photos, dateChanges] = await Promise.all([
    listPhotosForOrders([order.id], { sharedOnly: true }),
    listDateChangesForOrder(order.id),
  ]);
  res.render('buyer/order', { title: order.po_number, order, photos, dateChanges });
});

router.get('/b/:token/media/:id', async (req, res) => {
  const meta = await findMediaMeta(req.params.id);
  if (!meta || meta.kind !== 'photo' || !meta.shared_with_buyer || meta.buyer_id !== req.buyer.id) throw notFound();
  sendMedia(res, await findMediaBytes(meta.id));
});

router.get('/b/:token/weekly.xlsx', async (req, res) => {
  await sendWeeklyExcel(res, req.buyer, { forBuyer: true });
});

export default router;
