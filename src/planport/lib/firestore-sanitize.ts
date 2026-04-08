/**
 * Firestore rejects `undefined` anywhere in document data. Use this before setDoc/updateDoc
 * when building objects from optional values (e.g. Google Meet URL only for online meetings).
 */
export function omitUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}
