// Working-day helpers. Every input and output is a 'YYYY-MM-DD' string.
// Working days are every day except Sunday (assumption A1).

const DAY_MS = 86400000;

function parse(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function format(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  return format(new Date(parse(dateStr).getTime() + n * DAY_MS));
}

export function isWorkingDay(dateStr) {
  return parse(dateStr).getUTCDay() !== 0;
}

// Number of working days d with a < d <= b. Zero when b <= a.
export function workingDaysBetween(a, b) {
  if (b <= a) return 0;
  let count = 0;
  let cursor = parse(a);
  const end = parse(b);
  while (cursor < end) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (cursor.getUTCDay() !== 0) count += 1;
  }
  return count;
}

// The date reached after stepping forward n working days from a.
export function addWorkingDays(a, n) {
  let cursor = parse(a);
  let stepped = 0;
  while (stepped < n) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (cursor.getUTCDay() !== 0) stepped += 1;
  }
  return format(cursor);
}

// Every working day d with a <= d <= b, ascending.
export function workingDaysInRange(a, b) {
  const days = [];
  for (let d = a; d <= b; d = addDays(d, 1)) {
    if (isWorkingDay(d)) days.push(d);
  }
  return days;
}
