// The PWA shell: one static page, cached by the service worker, with views
// switched by the URL hash so it opens offline from any screen.
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/s', requireRole('supervisor'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('supervisor/shell');
});

export default router;
