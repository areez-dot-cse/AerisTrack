// Serves photos and voice notes with an access check per role.
// Buyers use /b/:token/media/:id instead (see buyerLink.js).
import { Router } from 'express';
import { findMediaMeta, findMediaBytes } from '../db/queries/media.js';
import { findFloorBySupervisor } from '../db/queries/floors.js';
import { notFound } from '../lib/errors.js';

const router = Router();

export function sendMedia(res, media) {
  res.set('Content-Type', media.mime);
  res.set('Cache-Control', 'private, max-age=3600');
  res.set('Content-Disposition', 'inline');
  res.send(media.bytes);
}

router.get('/media/:id', async (req, res) => {
  if (!req.user) throw notFound();
  const meta = await findMediaMeta(req.params.id);
  if (!meta) throw notFound();
  if (req.user.role === 'supervisor') {
    const floor = await findFloorBySupervisor(req.user.id);
    if (!floor || meta.floor_id !== floor.id) throw notFound();
  }
  const media = await findMediaBytes(meta.id);
  sendMedia(res, media);
});

export default router;
