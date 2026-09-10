const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively sanitizes an object or array to prevent prototype pollution.
 * Strips dangerous property keys (__proto__, constructor, prototype).
 */
export function sanitizeKeys<T = any>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeKeys(item)) as unknown as T;
  }

  const clean: Record<string, any> = Object.create(null);
  for (const key of Object.keys(obj as Record<string, any>)) {
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }
    const val = (obj as Record<string, any>)[key];
    clean[key] = sanitizeKeys(val);
  }

  return { ...clean } as T;
}
