// Review inbox: floor notes that need a human decision, and detected delay
// warnings waiting for a merchandiser to confirm (to the buyer) or dismiss.
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { parseInput } from '../middleware/validate.js';
import { noteConfirmSchema, warningConfirmSchema, warningDismissSchema } from '../validation/schemas.js';
import { listNotesForReview, countNotesForReview, findNote, confirmNote, resetNoteForProcessing, latestCategory } from '../db/queries/notes.js';
import { listDetectedWarnings, countDetectedWarnings, findWarning } from '../db/queries/warnings.js';
import { confirmWarning, dismissWarning } from '../services/warnings.js';
import { processNoteInBackground, isStuck } from '../services/ai.js';
import { CATEGORIES } from '../services/categories.js';
import { notFound } from '../lib/errors.js';

const router = Router();
router.use('/review', requireRole('merchandiser'));

// Only ever redirect to our own pages.
function safeReturn(value, fallback) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

router.get('/review', async (req, res) => {
  const tab = req.query.tab === 'warnings' ? 'warnings' : 'notes';
  const [noteCount, warningCount] = await Promise.all([countNotesForReview(), countDetectedWarnings()]);
  const notes = tab === 'notes' ? await listNotesForReview() : [];
  const warnings = tab === 'warnings' ? await listDetectedWarnings() : [];
  for (const w of warnings) {
    // Prefill from the latest note on the headline stage (else the order); an overdue approval suggests itself.
    const fromMilestone = w.snapshot.kind === 'milestone' && /approv/i.test(w.snapshot.milestone ?? '') ? 'BUYER_APPROVAL_PENDING' : null;
    w.suggestedCategory = (await latestCategory({ orderId: w.order_id, milestoneId: w.snapshot.milestoneId ?? null })) ?? fromMilestone ?? 'OTHER';
  }
  res.render('office/review', {
    title: res.locals.t('review.title'), tab, notes, warnings, noteCount, warningCount, categories: CATEGORIES, isStuck,
  });
});

router.post('/review/notes/:id/confirm', async (req, res) => {
  const note = await findNote(req.params.id);
  if (!note) throw notFound();
  const { data, errors } = parseInput(noteConfirmSchema, req.body);
  if (errors) req.flash('error', res.locals.t('errors.validation'));
  else {
    await confirmNote(note.id, { category: data.category, userId: req.user.id });
    req.flash('ok', res.locals.t('review.noteConfirmed'));
  }
  res.redirect(safeReturn(req.body.returnTo, '/review'));
});

router.post('/review/notes/:id/retry', async (req, res) => {
  const note = await findNote(req.params.id);
  if (!note) throw notFound();
  await resetNoteForProcessing(note.id);
  processNoteInBackground(note.id);
  req.flash('ok', res.locals.t('review.retryStarted'));
  res.redirect(safeReturn(req.body.returnTo, '/review'));
});

router.post('/review/warnings/:id/confirm', async (req, res) => {
  const warning = await findWarning(req.params.id);
  if (!warning) throw notFound();
  const { data, errors } = parseInput(warningConfirmSchema, req.body);
  if (errors) {
    req.flash('error', res.locals.t('errors.validation'));
    return res.redirect('/review?tab=warnings');
  }
  await confirmWarning(warning.id, { userId: req.user.id, reasonCategory: data.reasonCategory, noteForBuyer: data.noteForBuyer });
  req.flash('ok', res.locals.t('review.warningConfirmed'));
  res.redirect('/review?tab=warnings');
});

router.post('/review/warnings/:id/dismiss', async (req, res) => {
  const warning = await findWarning(req.params.id);
  if (!warning) throw notFound();
  const { data, errors } = parseInput(warningDismissSchema, req.body);
  if (errors) {
    req.flash('error', `${res.locals.t('errors.validation')} ${res.locals.t('review.dismissReason')}`);
    return res.redirect('/review?tab=warnings');
  }
  await dismissWarning(warning.id, { userId: req.user.id, reason: data.reason });
  req.flash('ok', res.locals.t('review.warningDismissed'));
  res.redirect('/review?tab=warnings');
});

export default router;
