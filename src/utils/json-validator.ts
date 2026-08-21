export function safeJsonParse<T>(jsonStr: string, fallback: T): T {
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

export function isValidJson(jsonStr: string): boolean {
  if (!jsonStr || typeof jsonStr !== 'string') return false;
  try {
    JSON.parse(jsonStr);
    return true;
  } catch {
    return false;
  }
}
