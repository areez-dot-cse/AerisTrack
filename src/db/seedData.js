// Realistic sample data, designed around DEMO_TODAY = 2026-11-04 so the
// board reads 3 Late · 2 At risk · 6 On track · 2 No data on first login.
// Everything here is fictional (assumption A12). Every figure for the three
// brief orders is exact (see the build spec, Section 18).
import { workingDaysInRange } from '../services/workdays.js';

export const SEED_TODAY = '2026-11-04';
export const DEMO_PASSWORD = 'tna-demo-2026';
export const DEMO_PIN = '1234';
export const DEMO_TOKENS = {
  'Company B': 'demo-company-b-5f3c9a1e7b2d4c6a8e0f1a3b5c7d9e2f',
  'Company C': 'demo-company-c-9a7e5c3b1d0f2a4c6e8b0d2f4a6c8e1b',
};

export const buyers = [
  { name: 'Company B', country: 'United Kingdom' },
  { name: 'Company C', country: 'Germany' },
  { name: 'Company D', country: 'Netherlands' },
];

export const units = [
  { key: 'u1', name: 'Unit 1', kind: 'own' },
  { key: 'u2', name: 'Unit 2', kind: 'own' },
  { key: 'u3', name: 'Unit 3', kind: 'own' },
  { key: 'print', name: 'Printing subcontractor', kind: 'subcontract' },
  { key: 'wash', name: 'Washing subcontractor', kind: 'subcontract' },
];

export const merchandisers = [
  { key: 'priya', name: 'Priya Raman', email: 'priya@example.com' },
  { key: 'karthik', name: 'Karthik Selvam', email: 'karthik@example.com' },
];

// Each own floor has exactly one supervisor. Phones are fake 9000000xxx numbers.
export const floors = [
  { key: 'f1', unit: 'u1', name: 'Floor 1', total: 40, capacityUnit: 'machines', supervisor: { name: 'Murugan', phone: '9000000001' } },
  { key: 'f2', unit: 'u1', name: 'Floor 2', total: 36, capacityUnit: 'machines', supervisor: { name: 'Selvi', phone: '9000000002' } },
  { key: 'f3', unit: 'u2', name: 'Floor 1', total: 40, capacityUnit: 'machines', supervisor: { name: 'Kumar', phone: '9000000003' } },
  { key: 'f4', unit: 'u2', name: 'Floor 2', total: 30, capacityUnit: 'tables', supervisor: { name: 'Lakshmi', phone: '9000000004' } },
  { key: 'f5', unit: 'u3', name: 'Floor 1', total: 24, capacityUnit: 'tables', supervisor: { name: 'Rajesh', phone: '9000000005' } },
  { key: 'f6', unit: 'u3', name: 'Floor 2', total: 20, capacityUnit: 'tables', supervisor: { name: 'Anitha', phone: '9000000006' } },
  { key: 'f7', unit: 'print', name: 'Print floor', total: 10, capacityUnit: 'tables', supervisor: null },
  { key: 'f8', unit: 'wash', name: 'Wash floor', total: 8, capacityUnit: 'machines', supervisor: null },
];

const d = (name, end) => ({ name, kind: 'date', endOffsetDays: end });
const q = (name, start, end) => ({ name, kind: 'quantity', startOffsetDays: start, endOffsetDays: end });

export const templates = [
  { name: 'Basic tee', milestones: [
    d('Order confirmation', 60), d('Lab dip approval', 50), d('Fabric in-house', 42), d('PP sample approval', 38),
    q('Cutting', 36, 22), q('Stitching', 30, 6), q('Finishing', 10, 3), q('Packing', 6, 2), d('Final inspection', 1),
  ] },
  { name: 'Polo', milestones: [
    d('Order confirmation', 60), d('Lab dip approval', 50), d('Fabric in-house', 44), d('PP sample approval', 40),
    q('Cutting', 38, 26), q('Stitching', 34, 16), q('Washing', 24, 14), q('Finishing', 18, 3), q('Packing', 6, 2), d('Final inspection', 1),
  ] },
  { name: 'Printed tee', milestones: [
    d('Order confirmation', 60), d('Lab dip approval', 55), d('Fabric in-house', 48), d('PP sample approval', 44),
    q('Cutting', 40, 28), q('Printing', 30, 18), q('Stitching', 20, 6), q('Finishing', 10, 3), q('Packing', 6, 2), d('Final inspection', 1),
  ] },
];

const ADULT = ['S', 'M', 'L', 'XL', 'XXL'];
const WOMEN = ['XS', 'S', 'M', 'L', 'XL'];
const KIDS = ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-11Y'];
const WEIGHTS = [0.15, 0.25, 0.3, 0.2, 0.1];

// Splits a colour's quantity across sizes with a realistic curve; the last size absorbs rounding.
function sizeLines(colour, total, sizes) {
  const lines = [];
  let allocated = 0;
  sizes.forEach((size, index) => {
    const quantity = index === sizes.length - 1 ? total - allocated : Math.round(total * WEIGHTS[index]);
    allocated += quantity;
    lines.push({ colour, size, quantity });
  });
  return lines;
}

// A finished stage: the target spread evenly over the working days in [from, to].
function complete(from, to, machines, target) {
  const days = workingDaysInRange(from, to);
  const perDay = Math.floor(target / days.length);
  let remainder = target - perDay * days.length;
  return days.map((date) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return [date, machines, perDay + extra];
  });
}

// A running stage with a steady daily rate.
function running(from, to, machines, perDay) {
  return workingDaysInRange(from, to).map((date) => [date, machines, perDay]);
}

const B = 'Company B';
const C = 'Company C';
const D = 'Company D';

// stages: { [stageName]: [[date, machines, pieces, closedUntil?], ...] }
// floors: which floor runs each quantity stage. actuals: overrides for date milestones.
export const orders = [
  {
    po: 'B-PO-88213', buyer: B, template: 'Basic tee', style: "Men's crew neck tee, navy", exFactory: '2026-11-20',
    lines: sizeLines('Navy', 12000, ADULT),
    floors: { Cutting: 'f4', Stitching: 'f1', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-10-15', '2026-10-28', 8, 12000),
      Stitching: [
        ['2026-10-21', 40, 300], ['2026-10-22', 40, 400], ['2026-10-23', 40, 450], ['2026-10-24', 40, 500],
        ['2026-10-26', 40, 520], ['2026-10-27', 40, 560], ['2026-10-28', 40, 580], ['2026-10-29', 40, 600],
        ['2026-10-30', 40, 600], ['2026-10-31', 40, 610], ['2026-11-02', 40, 600], ['2026-11-03', 40, 600],
        ['2026-11-04', 32, 480],
      ],
    },
    plannedOverrides: { 'Fabric in-house': { plannedEnd: '2026-10-12' } },
    actuals: { 'Fabric in-house': '2026-10-12' },
  },
  {
    po: 'B-PO-88240', buyer: B, template: 'Polo', style: "Men's polo, white", exFactory: '2026-11-12',
    lines: sizeLines('White', 8000, ADULT),
    floors: { Cutting: 'f4', Stitching: 'f3', Washing: 'f8', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-10-05', '2026-10-16', 10, 8000),
      Stitching: complete('2026-10-09', '2026-10-20', 40, 8000),
      Washing: complete('2026-10-19', '2026-10-29', 8, 8000),
      Finishing: [
        ['2026-10-26', 20, 450], ['2026-10-27', 20, 520], ['2026-10-28', 20, 580], ['2026-10-29', 20, 600],
        ['2026-10-30', 20, 620], ['2026-10-31', 20, 630], ['2026-11-02', 20, 600], ['2026-11-03', 20, 600],
        ['2026-11-04', 20, 600],
      ],
    },
    plannedOverrides: { 'PP sample approval': { plannedEnd: '2026-10-06' } },
    actuals: { 'PP sample approval': '2026-10-06' },
  },
  {
    po: 'C-PO-0488', buyer: C, template: 'Printed tee', style: 'Kids printed tee, yellow', exFactory: '2026-11-28',
    lines: sizeLines('Yellow', 10000, KIDS),
    floors: { Cutting: 'f4', Printing: 'f7', Stitching: 'f2', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-10-19', '2026-10-30', 8, 10000),
      Printing: [
        ['2026-10-29', 10, 350], ['2026-10-30', 10, 450], ['2026-10-31', 10, 500],
        ['2026-11-02', 10, 600], ['2026-11-03', 10, 600], ['2026-11-04', 10, 600],
      ],
    },
  },
  {
    po: 'B-PO-88251', buyer: B, template: 'Basic tee', style: "Women's scoop neck tee, black", exFactory: '2026-11-26',
    lines: sizeLines('Black', 4000, WOMEN),
    floors: { Cutting: 'f4', Stitching: 'f2', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-10-29', '2026-11-03', 4, 4000),
      Stitching: running('2026-10-27', '2026-11-04', 16, 240),
    },
  },
  {
    po: 'C-PO-0470', buyer: C, template: 'Polo', style: "Men's polo, navy stripe", exFactory: '2026-12-03',
    lines: sizeLines('Navy stripe', 4500, ADULT),
    floors: { Cutting: 'f4', Stitching: 'f2', Washing: 'f8', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-10-29', '2026-11-03', 4, 4500),
      Stitching: running('2026-10-30', '2026-11-04', 20, 300),
    },
  },
  {
    po: 'B-PO-88260', buyer: B, template: 'Basic tee', style: "Men's crew neck tee, heather grey", exFactory: '2026-12-08',
    lines: sizeLines('Heather grey', 7000, ADULT),
    floors: { Cutting: 'f4', Stitching: 'f1', Finishing: 'f5', Packing: 'f6' },
    stages: { Cutting: running('2026-11-02', '2026-11-04', 8, 1200) },
  },
  {
    po: 'D-PO-3295', buyer: D, template: 'Printed tee', style: 'Kids printed tee, coral', exFactory: '2026-12-10',
    lines: sizeLines('Coral', 6000, KIDS),
    floors: { Cutting: 'f4', Printing: 'f7', Stitching: 'f3', Finishing: 'f5', Packing: 'f6' },
    stages: { Cutting: running('2026-10-31', '2026-11-04', 6, 900) },
  },
  {
    po: 'D-PO-3301', buyer: D, template: 'Polo', style: "Women's polo, white", exFactory: '2026-11-24',
    lines: [...sizeLines('White', 3000, WOMEN), ...sizeLines('Sky blue', 2000, WOMEN)],
    floors: { Cutting: 'f4', Stitching: 'f3', Washing: 'f8', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-10-17', '2026-10-28', 6, 5000),
      Stitching: complete('2026-10-21', '2026-10-31', 40, 5000),
      Washing: running('2026-10-31', '2026-11-04', 8, 800),
    },
    plannedOverrides: { 'Lab dip approval': { plannedEnd: '2026-10-08' } },
    actuals: { 'Lab dip approval': '2026-10-08' },
  },
  {
    // STOPPED today: 0 machines, no closure days, power-cut note.
    po: 'D-PO-3310', buyer: D, template: 'Basic tee', style: "Men's crew neck tee, white", exFactory: '2026-12-01',
    lines: sizeLines('White', 12000, ADULT),
    floors: { Cutting: 'f4', Stitching: 'f3', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-10-26', '2026-11-03', 8, 12000),
      Stitching: [['2026-11-02', 40, 600], ['2026-11-03', 40, 600], ['2026-11-04', 0, 0, null]],
    },
  },
  {
    // Red from an overdue date milestone: PP sample approval was due 30 Oct.
    po: 'C-PO-0495', buyer: C, template: 'Basic tee', style: 'Kids crew neck tee, red', exFactory: '2026-12-07',
    lines: [...sizeLines('Red', 3000, KIDS), ...sizeLines('Blue', 2000, KIDS)],
    floors: { Cutting: 'f4', Stitching: 'f1', Finishing: 'f5', Packing: 'f6' },
    stages: {},
    actuals: { 'PP sample approval': null },
  },
  {
    // Grey: cutting has just started with a single entry.
    po: 'B-PO-88272', buyer: B, template: 'Polo', style: "Men's polo, bottle green", exFactory: '2026-12-11',
    lines: sizeLines('Bottle green', 6000, ADULT),
    floors: { Cutting: 'f4', Stitching: 'f1', Washing: 'f8', Finishing: 'f5', Packing: 'f6' },
    stages: { Cutting: [['2026-11-04', 6, 900]] },
  },
  {
    // Grey: nothing has started yet.
    po: 'D-PO-3320', buyer: D, template: 'Printed tee', style: 'Kids printed tee, sky blue', exFactory: '2026-12-29',
    lines: sizeLines('Sky blue', 8000, KIDS),
    floors: { Cutting: 'f4', Printing: 'f7', Stitching: 'f2', Finishing: 'f5', Packing: 'f6' },
    stages: {},
  },
  {
    // Complete and shipped.
    po: 'B-PO-88199', buyer: B, template: 'Basic tee', style: "Men's crew neck tee, olive", exFactory: '2026-10-29',
    lines: sizeLines('Olive', 4000, ADULT),
    floors: { Cutting: 'f4', Stitching: 'f1', Finishing: 'f5', Packing: 'f6' },
    stages: {
      Cutting: complete('2026-09-23', '2026-10-07', 8, 4000),
      Stitching: complete('2026-10-08', '2026-10-20', 24, 4000),
      Finishing: complete('2026-10-19', '2026-10-24', 24, 4000),
      Packing: complete('2026-10-23', '2026-10-27', 20, 4000),
    },
  },
];

// Pre-computed AI results (assumption A15). Live notes call the real API.
export const notes = [
  { po: 'B-PO-88240', stage: 'Finishing', date: '2026-11-02',
    text: 'இன்று காலை 3 மணி நேரம் கரண்ட் இல்லை, உற்பத்தி குறைந்தது.',
    translation: 'No power for 3 hours this morning; production dropped.',
    category: 'POWER_CUT', confidence: 0.93, status: 'confirmed', finalCategory: 'POWER_CUT', reviewedBy: 'priya' },
  { po: 'B-PO-88213', stage: 'Stitching', date: '2026-11-04',
    text: '8 மெஷின் பழுது, மெக்கானிக் நாளை வருவார்.',
    translation: '8 machines broken down; the mechanic will come tomorrow.',
    category: 'MACHINE_BREAKDOWN', confidence: 0.9, status: 'suggested' },
  { po: 'C-PO-0488', stage: 'Printing', date: '2026-11-04',
    text: 'பிரிண்டிங் யூனிட்டிலிருந்து பீஸ் இன்னும் வரவில்லை.',
    translation: 'Pieces have not yet come from the printing unit.',
    category: 'SUBCONTRACTOR_DELAY', confidence: 0.88, status: 'suggested' },
  { po: 'B-PO-88251', stage: 'Stitching', date: '2026-11-03',
    text: 'நிலைமை சரியில்லை, நாளை பார்க்கலாம்.',
    translation: "The situation is not good; let's see tomorrow.",
    category: 'OTHER', confidence: 0.35, status: 'needs_review' },
  { po: 'C-PO-0470', stage: 'Stitching', date: '2026-11-02',
    text: 'நூல் கலர் மேட்ச் ஆகவில்லை, மறுபடி செய்ய வேண்டும்.',
    translation: 'Thread colour did not match; must be redone.',
    category: 'TRIMS_DELAY', confidence: 0.62, status: 'confirmed', finalCategory: 'QUALITY_REWORK', reviewedBy: 'karthik' },
  { po: 'B-PO-88260', stage: 'Cutting', date: '2026-11-03',
    text: 'இரண்டு பேர் லீவு, 4 மெஷின் ஓடவில்லை.',
    translation: 'Two people on leave; 4 machines not running.',
    category: 'LABOUR_SHORTAGE', confidence: 0.85, status: 'suggested' },
  { po: 'D-PO-3310', stage: 'Stitching', date: '2026-11-04',
    text: 'மின்சாரம் இல்லை, யூனிட் முழுவதும் நிற்கிறது. எப்போது வரும் என்று தெரியவில்லை.',
    translation: "No electricity; the whole unit has stopped. We don't know when it will come back.",
    category: 'POWER_CUT', confidence: 0.91, status: 'suggested' },
];

export const dateChanges = [
  { po: 'B-PO-88213', milestone: 'Fabric in-house', field: 'planned_end', old: '2026-10-09', new: '2026-10-12',
    reason: 'Mill delayed the fabric dispatch by three days', by: 'priya', at: '2026-10-02T10:15:00+05:30' },
  { po: 'C-PO-0488', milestone: null, field: 'ex_factory', old: '2026-11-25', new: '2026-11-28',
    reason: 'Buyer agreed three extra days after the print strike-off was re-approved', by: 'karthik', at: '2026-10-14T16:40:00+05:30' },
  { po: 'B-PO-88240', milestone: 'PP sample approval', field: 'planned_end', old: '2026-10-03', new: '2026-10-06',
    reason: 'Buyer asked for a fit change on the PP sample', by: 'priya', at: '2026-10-01T11:05:00+05:30' },
  { po: 'D-PO-3301', milestone: 'Lab dip approval', field: 'planned_end', old: '2026-10-05', new: '2026-10-08',
    reason: 'Second lab dip submitted after the first was rejected', by: 'karthik', at: '2026-10-03T09:30:00+05:30' },
];

export const photos = [
  { po: 'B-PO-88213', stage: 'Stitching', date: '2026-11-04', label: 'STITCHING - FLOOR 1', colour: [52, 78, 110] },
  { po: 'B-PO-88213', stage: 'Stitching', date: '2026-10-30', label: 'STITCHING - FLOOR 1', colour: [44, 70, 100] },
  { po: 'B-PO-88240', stage: 'Finishing', date: '2026-11-04', label: 'FINISHING - UNIT 3', colour: [120, 118, 110] },
  { po: 'C-PO-0488', stage: 'Printing', date: '2026-11-03', label: 'PRINTING - SUBCON', colour: [196, 152, 32] },
  { po: 'B-PO-88260', stage: 'Cutting', date: '2026-11-04', label: 'CUTTING - UNIT 2', colour: [100, 100, 104] },
  { po: 'D-PO-3301', stage: 'Washing', date: '2026-11-02', label: 'WASHING - SUBCON', colour: [96, 140, 170] },
  { po: 'B-PO-88199', stage: 'Packing', date: '2026-10-27', label: 'PACKING - UNIT 3', colour: [88, 110, 70] },
];

export const confirmedWarning = {
  po: 'C-PO-0488',
  reasonCategory: 'SUBCONTRACTOR_DELAY',
  noteForBuyer: 'The printing subcontractor is running behind. We are adding a second printer from 6 Nov and will confirm a revised plan by 7 Nov.',
  by: 'karthik',
};
