export interface SanitizeOptions {
  lowercase?: boolean;
  spaceReplacement?: string;
  maxLength?: number | null;
  fallback?: string;
}

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  lowercase: true,
  spaceReplacement: '-',
  maxLength: null,
  fallback: 'unnamed'
};

function sanitizeFileName(text: string, options: SanitizeOptions = {}): string {
  if (!text || typeof text !== 'string') {
    return options.fallback ?? DEFAULT_OPTIONS.fallback;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  let result = text.trim();

  if (opts.lowercase) {
    result = result.toLowerCase();
  }

  result = result.replace(/[/\\?<>\\:*|"]/g, '');

  result = result.replace(/[^\w\s-]/g, '');

  result = result.replace(/\s+/g, opts.spaceReplacement);

  if (opts.spaceReplacement === '-') {
    result = result.replace(/-+/g, '-');
    result = result.replace(/^-|-$/g, '');
  } else if (opts.spaceReplacement === '_') {
    result = result.replace(/_+/g, '_');
    result = result.replace(/^_|_$/g, '');
  }

  if (opts.maxLength && opts.maxLength > 0) {
    result = result.substring(0, opts.maxLength);
  }

  return result || opts.fallback;
}

export function createSafeString(text: string, maxLength: number = 30): string {
  return sanitizeFileName(text, {
    lowercase: true,
    spaceReplacement: '-',
    maxLength,
    fallback: 'unnamed'
  });
}

export function generateFolderName(
  title: string,
  existingFolders?: Set<string>,
  maxLength: number = 50
): string {
  const baseName = sanitizeFileName(title, {
    lowercase: true,
    spaceReplacement: '-',
    maxLength,
    fallback: 'unnamed-folder'
  });

  if (existingFolders) {
    let finalName = baseName;
    let counter = 2;

    while (existingFolders.has(finalName)) {
      finalName = `${baseName}-${counter}`;
      counter++;
    }

    return finalName;
  }

  return baseName;
}
