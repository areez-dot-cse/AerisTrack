import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listBuyers, findBuyer, listActiveLinks, revokeLink } from '../db/queries/buyers.js';
import { createBuyerLink, LINK_DAYS } from '../services/buyerLinks.js';
import { sendWeeklyExcel } from '../services/exportExcel.js';
import { notFound } from '../lib/errors.js';

const router = Router();
router.use('/buyers', requireRole('merchandiser'));

router.get('/buyers', async (req, res) => {
  const buyers = await listBuyers();
  for (const buyer of buyers) buyer.links = await listActiveLinks(buyer.id);
  // A freshly created token is shown exactly once, straight after creation.
  const newLink = req.session.newLink ?? null;
  delete req.session.newLink;
  res.render('office/buyers', { title: res.locals.t('buyers.title'), buyers, newLink, linkDays: LINK_DAYS, baseUrl: `${req.protocol}://${req.get('host')}` });
});

router.post('/buyers/:id/links', async (req, res) => {
  const buyer = await findBuyer(req.params.id);
  if (!buyer) throw notFound();
  const { token } = await createBuyerLink(buyer.id);
  req.session.newLink = { buyerId: buyer.id, token };
  req.flash('ok', res.locals.t('buyers.linkCreated'));
  res.redirect(`/buyers#buyer-${buyer.id}`);
});

router.post('/buyers/:id/links/:linkId/revoke', async (req, res) => {
  const buyer = await findBuyer(req.params.id);
  if (!buyer) throw notFound();
  await revokeLink(buyer.id, req.params.linkId);
  req.flash('ok', res.locals.t('buyers.revoked'));
  res.redirect(`/buyers#buyer-${buyer.id}`);
});

router.get('/buyers/:id/weekly.xlsx', async (req, res) => {
  const buyer = await findBuyer(req.params.id);
  if (!buyer) throw notFound();
  await sendWeeklyExcel(res, buyer, { forBuyer: false });
});

export default router;
