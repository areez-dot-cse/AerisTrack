// Builds the Express app: middleware, views and routes. server.js starts it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { i18n } from './middleware/i18n.js';
import { loadUser } from './middleware/auth.js';
import { csrf } from './middleware/csrf.js';
import { flash } from './middleware/flash.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import boardRoutes from './routes/board.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'blob:', 'data:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/locales', express.static(path.join(__dirname, 'locales')));
  app.use(express.urlencoded({ extended: true, limit: '200kb' }));
  app.use(express.json({ limit: '200kb' }));

  app.use(session({
    store: new PgSession({ pool, tableName: 'session' }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'tna.sid',
    cookie: { httpOnly: true, secure: config.isProd, sameSite: 'lax', maxAge: config.session.officeMs },
  }));

  app.use(loadUser);
  app.use(i18n);
  app.use(csrf);
  app.use(flash);

  app.get('/', (req, res) => {
    if (!req.user) return res.redirect('/login');
    res.redirect(req.user.role === 'supervisor' ? '/s/' : '/board');
  });
  app.use(authRoutes);
  app.use(boardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
