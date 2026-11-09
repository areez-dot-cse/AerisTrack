// Runs a zod schema over form or JSON input and returns either the clean data
// or a { field: message } map that views can show inline.
export function parseInput(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data, errors: null };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

export function firstError(errors) {
  if (!errors) return null;
  return Object.values(errors)[0] ?? null;
}
