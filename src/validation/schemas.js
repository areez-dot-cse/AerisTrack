// Every input the server accepts, validated with zod before it touches the database.
import { z } from 'zod';
import { CATEGORIES } from '../services/categories.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD').refine(
  (s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s),
  'Enter a valid date',
);
const text = (max = 200) => z.string().trim().min(1, 'Required').max(max, `At most ${max} characters`);
const optionalText = (max = 2000) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const intFrom = (min, max, message) => z.coerce.number({ message: message ?? 'Enter a whole number' })
  .int('Enter a whole number').min(min, `At least ${min}`).max(max, `At most ${max}`);
const emptyToUndefined = (v) => (v === '' || v == null ? undefined : v);

export const officeLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Required').max(200),
});

export const supervisorLoginSchema = z.object({
  phone: z.string().trim().regex(/^\d{10}$/, 'Enter the 10-digit phone number'),
  pin: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit PIN'),
});

export const languageSchema = z.object({ lang: z.enum(['en', 'ta']) });

const templateMilestoneSchema = z.object({
  name: text(80),
  kind: z.enum(['date', 'quantity']),
  startOffsetDays: z.preprocess(emptyToUndefined, intFrom(0, 400).optional()),
  endOffsetDays: intFrom(0, 400),
}).superRefine((m, ctx) => {
  if (m.kind === 'quantity') {
    if (m.startOffsetDays == null) {
      ctx.addIssue({ code: 'custom', path: ['startOffsetDays'], message: 'Required for quantity stages' });
    } else if (m.startOffsetDays < m.endOffsetDays) {
      ctx.addIssue({ code: 'custom', path: ['startOffsetDays'], message: 'Start must be at least as many days before ex-factory as the end' });
    }
  }
});

export const templateSchema = z.object({
  name: text(80),
  milestones: z.array(templateMilestoneSchema).min(1, 'Add at least one milestone')
    .refine((ms) => ms.some((m) => m.kind === 'quantity'), { message: 'A template needs at least one quantity stage' }),
});

const orderLineSchema = z.object({
  colour: text(60),
  size: text(20),
  quantity: intFrom(0, 1000000),
});

export const newOrderSchema = z.object({
  poNumber: text(40),
  buyerId: intFrom(1, 1e9, 'Choose a buyer'),
  style: text(120),
  exFactoryDate: DATE,
  templateId: intFrom(1, 1e9, 'Choose a template'),
  lines: z.array(orderLineSchema).transform((lines) => lines.filter((l) => l.quantity > 0))
    .refine((lines) => lines.length > 0, { message: 'Enter at least one quantity' })
    .refine((lines) => new Set(lines.map((l) => `${l.colour}|${l.size}`)).size === lines.length, { message: 'Each colour and size can appear once' }),
  floors: z.record(z.string(), intFrom(1, 1e9, 'Choose a floor')),
});

export const dateChangeSchema = z.object({
  newDate: DATE,
  reason: text(300),
});

export const plannedDatesSchema = z.object({
  plannedStart: z.preprocess(emptyToUndefined, DATE.optional()),
  plannedEnd: DATE,
  reason: text(300),
});

export const markDoneSchema = z.object({
  actualDate: DATE,
  reason: z.string().trim().max(300).optional().transform((v) => v || 'Marked done'),
});

// Shared by the supervisor API and the merchandiser's entry form.
export const entrySchema = z.object({
  stageId: intFrom(1, 1e9),
  pieces: intFrom(0, 1000000),
  machines: intFrom(0, 10000),
  closedDays: z.preprocess(emptyToUndefined, intFrom(1, 30).optional()),
  noteText: optionalText(2000),
  clientUuid: z.preprocess(emptyToUndefined, z.uuid('Invalid client id').optional()),
  entryDate: z.preprocess(emptyToUndefined, DATE.optional()),
}).superRefine((e, ctx) => {
  if (e.machines === 0 && e.pieces > 0) {
    ctx.addIssue({ code: 'custom', path: ['pieces'], message: 'With 0 machines, pieces must be 0' });
  }
  if (e.machines > 0 && e.closedDays != null) {
    ctx.addIssue({ code: 'custom', path: ['closedDays'], message: 'Closure days only apply when machines are 0' });
  }
});

export const noteConfirmSchema = z.object({ category: z.enum(CATEGORIES) });

export const warningConfirmSchema = z.object({
  reasonCategory: z.enum(CATEGORIES),
  noteForBuyer: optionalText(1000),
});

export const warningDismissSchema = z.object({ reason: text(300) });

export const mediaShareSchema = z.object({ shared: z.enum(['1', '0']) });
