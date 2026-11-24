// Reading fields out of parsed JSON. What JSON.parse gives back is whatever the file holds: a
// field may be missing, null, or a different type after a format change. These keep only a
// value of the type we expect, so the snapshot code can trust its interfaces.

export type Raw = Record<string, unknown>;

/** A plain object, or undefined (arrays and null are not). */
export const obj = (v: unknown): Raw | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : undefined);
/** A non-empty string, or undefined. */
export const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
/** A finite number, or undefined. */
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** A finite count of zero or more, or 0. */
export const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** `{ [key]: value }`, or `{}` when the value is missing: for spreading optional fields. */
export const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
