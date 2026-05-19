
// Path prefix where the transformation feature is mounted in the host app.
// All internal router links use this as their base so the module remains
// portable: change this single constant to remount under a different URL.
export const TRANSFORMATION_BASE = 'transformation';

// $JOINER is the only pseudo-function whose URL slug doesn't fall out of the
// lowercase-and-underscore rule: we strip the leading `$` so the address bar
// shows /joiner instead of an ugly %24-encoded form. Other special entries
// like GLOBAL_VARIABLES and APEX_CLASS already produce the right slug
// (global_variables, apex_class) under the default rule, so they live in the
// route table as plain identifiers without an explicit override.
const SPECIAL_SLUGS: Record<string, string> = {
  '$JOINER': 'joiner',
};

export const buildRoute = (name: string): string => {
  const upper = name.toUpperCase();
  if (SPECIAL_SLUGS[upper]) return SPECIAL_SLUGS[upper];
  return name.toLowerCase().replace(/\s+/g, '_');
};

// All tag categories present in tags.json. Used to build the slug<->name map
// so route segments like /text/char can be parsed back into the display name
// "Text" for sidebar highlighting. Keep this list in sync if a new tag is
// added to tags.json.
const CATEGORY_NAMES = [
  'Text',
  'Logical',
  'Number',
  'Date & Time',
  'Operators',
  'Global Variables',
  'Apex Class',
  'Randomization',
  'Type Processing',
  'Trigger',
  'Advanced',
] as const;

// Snake-cased throughout the app so URL slugs read like the underlying code
// identifiers (TO_BLOB -> to_blob, DATE & TIME -> date_time) rather than
// mixing snake for functions and kebab for categories.
const slugifyCategory = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const SLUG_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  CATEGORY_NAMES.map((n) => [slugifyCategory(n), n])
);

export const categorySlug = (name: string): string => slugifyCategory(name);

export const categoryNameFromSlug = (slug: string): string | null =>
  SLUG_TO_CATEGORY[slug] ?? null;
