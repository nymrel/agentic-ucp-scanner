/**
 * URL Utilities for agentic-ucp-scanner
 */

export function normalizeUrl(input: string): string {
  let trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function getOrigin(input: string): string {
  try {
    const url = new URL(normalizeUrl(input));
    return url.origin;
  } catch {
    return input;
  }
}

export function resolveUrl(baseUrl: string, relativeOrAbsolute: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).toString();
  } catch {
    return relativeOrAbsolute;
  }
}

export function isLocalPath(input: string): boolean {
  if (/^https?:\/\//i.test(input)) {
    return false;
  }
  // Windows drive letter or Unix absolute path or relative path
  return /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('/') || input.startsWith('./') || input.startsWith('../') || input.includes('\\') || !input.includes('.');
}
