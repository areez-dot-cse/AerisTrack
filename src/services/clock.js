import { config } from '../config.js';

// Returns today's date as 'YYYY-MM-DD'. DEMO_TODAY freezes it for the demo.
export function today() {
  if (config.demoToday) return config.demoToday;
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
