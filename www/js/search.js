/**
 * search.js — Search interface for স্বাধ্যায়  (§29)
 *
 * The SQLite Capacitor plugin cannot be called from a Web Worker
 * (all plugin calls must go through the main thread). Therefore the
 * architecture is:
 *
 *   Main thread → SQLite queries (existing, async)
 *       ↓ raw results
 *   Worker → rank / score / deduplicate
 *       ↓ ranked results
 *   Main thread → render
 *
 * This keeps heavy ranking logic off the main thread while preserving
 * the working SQLite search. If the worker cannot be created, ranking
 * runs synchronously on the main thread as a fallback (§31).
 */

let _worker = null;
let _workerReady = false;
let _pendingCallbacks = new Map(); // queryId → { resolve, reject, timer }
let _queryId = 0;

function _tryInitWorker() {
  if (_worker) return;
  try {
    _worker = new Worker("js/search-worker.js");
    _worker.addEventListener("message", (e) => {
      const { type, results, message, queryId } = e.data;
      const cb = _pendingCallbacks.get(queryId);
      if (!cb) return;
      clearTimeout(cb.timer);
      _pendingCallbacks.delete(queryId);
      if (type === "results") cb.resolve(results);
      else cb.reject(new Error(message || "Worker error"));
    });
    _worker.addEventListener("error", () => {
      // Worker crashed — reject all pending, disable worker
      for (const cb of _pendingCallbacks.values()) {
        clearTimeout(cb.timer);
        cb.reject(new Error("Worker unavailable"));
      }
      _pendingCallbacks.clear();
      _worker = null;
    });
    _workerReady = true;
  } catch (e) {
    _worker = null;
    _workerReady = false;
    console.warn("Search worker unavailable, using synchronous fallback:", e);
  }
}

/** Fallback synchronous rank (same logic as worker, runs on main thread) */
function _syncRank(records, query) {
  const q = (query || "").normalize("NFC").toLowerCase().trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored = [];
  for (const r of records) {
    const haystack = [
      r.mantra_ref_id, r.ref, r.title, r.subtitle, r.content,
      r.sanskrit_text, r.sanskrit_swara, r.transliteration,
      r.tat, r.bishoy, r.adhyay_title, r.veda_code, r.veda_name,
    ].map(s => (s || "").normalize("NFC").toLowerCase()).join(" ");

    let score = 0;
    let allMatch = true;
    for (const token of tokens) {
      if (!haystack.includes(token)) { allMatch = false; break; }
      score += ((r.mantra_ref_id || r.ref || "").toLowerCase() === token) ? 10 : 1;
    }
    if (allMatch) scored.push({ record: r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 60).map(x => x.record);
}

/**
 * Rank an array of raw DB records against a query string.
 * Uses the worker if available, falls back to synchronous ranking.
 */
function rankResults(records, query) {
  if (!_workerReady || !_worker) {
    return Promise.resolve(_syncRank(records, query));
  }

  return new Promise((resolve, reject) => {
    const id = ++_queryId;
    const timer = setTimeout(() => {
      _pendingCallbacks.delete(id);
      // Timeout — fall back to sync
      resolve(_syncRank(records, query));
    }, 800);
    _pendingCallbacks.set(id, { resolve, reject, timer });
    _worker.postMessage({ type: "search", query, records, queryId: id });
  });
}

/** Terminate the worker cleanly (call on app teardown if needed). */
function terminateWorker() {
  if (_worker) { _worker.terminate(); _worker = null; _workerReady = false; }
}

// Initialise immediately
_tryInitWorker();

window.SwadhyaySearch = { rankResults, terminateWorker };
