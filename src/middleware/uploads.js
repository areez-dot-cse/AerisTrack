// Photo and voice-note uploads: memory storage, checked by MIME type and size.
import multer from 'multer';
import { HttpError } from '../lib/errors.js';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'video/webm'];
const PHOTO_MAX = 2 * 1024 * 1024;
const AUDIO_MAX = 3 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX, files: 2, fields: 30 },
  fileFilter(req, file, cb) {
    const type = file.mimetype.split(';')[0];
    const ok = (file.fieldname === 'photo' && PHOTO_TYPES.includes(type))
      || (file.fieldname === 'audio' && AUDIO_TYPES.includes(type));
    cb(ok ? null : new HttpError(400, `Unsupported file type ${type}`), ok);
  },
});

export const entryUpload = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'audio', maxCount: 1 }]);

// multer has one size limit; photos get the tighter one here.
export function pickUploads(req) {
  const photoFile = req.files?.photo?.[0] ?? null;
  const audioFile = req.files?.audio?.[0] ?? null;
  if (photoFile && photoFile.size > PHOTO_MAX) throw new HttpError(400, 'Photo must be 2 MB or smaller');
  const toMedia = (file) => (file ? { bytes: file.buffer, mime: file.mimetype.split(';')[0].replace('video/webm', 'audio/webm') } : null);
  return { photo: toMedia(photoFile), audio: toMedia(audioFile) };
}
