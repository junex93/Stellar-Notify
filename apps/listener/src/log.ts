/** Structured JSON logs, one object per line. */
export function log(level: "info" | "warn" | "error", msg: string, fields: object = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
}
