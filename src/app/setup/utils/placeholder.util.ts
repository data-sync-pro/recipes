/**
 * Tokenize a string into literal and {placeholder} segments so callers can
 * render each part as a real template element (the brand-tinted placeholders
 * stay out of innerHTML, keeping their styles component-scoped + XSS-safe).
 *
 * "{org}/x/{id}" -> [
 *   { text: "{org}", isPlaceholder: true },
 *   { text: "/x/",   isPlaceholder: false },
 *   { text: "{id}",  isPlaceholder: true },
 * ]
 */
export interface PlaceholderToken {
  text: string;
  isPlaceholder: boolean;
}

export function splitPlaceholders(text: string | undefined): PlaceholderToken[] {
  if (!text) return [];
  const tokens: PlaceholderToken[] = [];
  const re = /\{[^}]+\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      tokens.push({ text: text.slice(last, match.index), isPlaceholder: false });
    }
    tokens.push({ text: match[0], isPlaceholder: true });
    last = re.lastIndex;
  }
  if (last < text.length) {
    tokens.push({ text: text.slice(last), isPlaceholder: false });
  }
  return tokens;
}
