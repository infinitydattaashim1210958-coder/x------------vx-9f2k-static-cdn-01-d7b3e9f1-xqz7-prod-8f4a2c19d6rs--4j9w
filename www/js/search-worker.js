/**
 * search-worker.js — Search Web Worker for স্বাধ্যায়  (§29)
 *
 * Runs off the main thread so Sanskrit/Bengali corpus search
 * doesn't block rendering.
 *
 * Protocol:
 *   Main → Worker:  { type:'search', query:'...', records:[...] }
 *   Worker → Main:  { type:'results', results:[...] }
 *                   { type:'error', message:'...' }
 *
 * The main thread sends its pre-loaded record array with each query
 * (records are small: reference IDs + first-line preview only).
 * This avoids a separate indexing step while keeping search off-thread.
 */

/* §27 Unicode normalization — NFC without destroying Indic combining marks */
function normalizeQuery(str) {
  return (str || "").normalize("NFC").toLowerCase().trim();
}

function normalizeField(str) {
  return (str || "").normalize("NFC").toLowerCase();
}

/**
 * Score a single record against the query tokens.
 * Returns 0 (no match) or a positive score (higher = better).
 */
function scoreRecord(record, tokens) {
  // Build a single searchable string from all available text fields
  const haystack = [
    record.mantra_ref_id,
    record.ref,
    record.title,
    record.subtitle,
    record.content,
    record.sanskrit_text,
    record.sanskrit_swara,
    record.transliteration,    // null-safe: undefined/null → ""
    record.tat,                // Ramayana Bengali
    record.bishoy,             // Mahabharata topic
    record.adhyay_title,
    record.veda_code,
    record.veda_name,
  ].map(normalizeField).join(" ");

  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) return 0; // ALL tokens must match
    // Boost exact reference matches
    if (normalizeField(record.mantra_ref_id || record.ref || "") === token) score += 10;
    else score += 1;
  }
  return score;
}

self.addEventListener("message", (e) => {
  try {
    const { type, query, records } = e.data || {};
    if (type !== "search") return;

    const q = normalizeQuery(query);
    if (!q) {
      self.postMessage({ type: "results", results: [] });
      return;
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      self.postMessage({ type: "results", results: [] });
      return;
    }

    const scored = [];
    for (const record of (records || [])) {
      const s = scoreRecord(record, tokens);
      if (s > 0) scored.push({ record, score: s });
    }

    scored.sort((a, b) => b.score - a.score);
    self.postMessage({ type: "results", results: scored.slice(0, 60).map(x => x.record) });

  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
});
