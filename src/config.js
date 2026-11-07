// All environment variables are read here and nowhere else.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

export const config = {
  env: env.NODE_ENV ?? 'development',
  isProd,
  isTest,
  port: Number(env.PORT ?? 3000),
  databaseUrl: isTest ? env.DATABASE_URL_TEST : env.DATABASE_URL,
  // Outside production a fixed fallback keeps `npm run dev` simple.
  sessionSecret: env.SESSION_SECRET || (isProd ? null : 'dev-only-session-secret-not-for-production'),
  groq: {
    apiKey: env.GROQ_API_KEY || null,
    sttModel: env.GROQ_STT_MODEL || 'whisper-large-v3',
    llmModel: env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile',
  },
  // When set, clock.today() returns this date so the demo never drifts.
  demoToday: env.DEMO_TODAY || null,
  session: {
    officeMs: 12 * 60 * 60 * 1000,           // office sessions last 12 hours
    supervisorMs: 30 * 24 * 60 * 60 * 1000,  // supervisor sessions last 30 days, to survive offline periods
  },
};

if (!config.databaseUrl) {
  throw new Error(isTest ? 'DATABASE_URL_TEST is not set' : 'DATABASE_URL is not set');
}
if (isProd && (!config.sessionSecret || config.sessionSecret.length < 32)) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters long in production');
}
