/**
 * C-3 — usage_event 内存追加。
 */
/** @type {Array<{ user_id: string, product: string, action: string, amount: number, timestamp: string }>} */
const events = [];

function append(event) {
  events.push(event);
}

function listSince(max) {
  const n = max == null ? events.length : Math.min(max, events.length);
  return events.slice(-n);
}

module.exports = { append, listSince };
