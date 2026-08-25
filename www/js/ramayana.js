/**
 * ramayana.js — SQLite access layer for Valmiki Ramayana
 *
 * Database: ramayana.db
 *   Previously bundled in www/assets/databases/ — now downloaded on first launch
 *   from the GitHub release at /ramayana-kanpur-iit/ramayana.db.gz
 *
 * Schema:
 *   kandas  — raw JSON: { id, name, english_name, sarga_count }
 *   sargas  — raw JSON: { id, name, chapter, kanda: { id } }
 *   shlokas — raw JSON: { id, sanskrit, pratipada, tat, comment,
 *                         sarga: { id }, kanda: { id } }
 *
 * Navigation hierarchy: Kanda → Sarga → Shloka
 * Ref format: "K<kanda_id>.S<sarga_id>.<shloka_id>"  e.g. "K1.S1.42"
 */

const RAMAYANA_DB_NAME = "ramayana";

/**
 * Release URL for ramayana.db.gz
 * Hosted in the /ramayana-kanpur-iit/ folder of the DB repo (same repo
 * that serves bhashya_packs via PACK_RELEASE_BASE in db.js).
 */
const RAMAYANA_RELEASE_URL =
  "https://raw.githubusercontent.com/infinitydattaashim1210958-coder/" +
  "-------------vx-9f2k-static-cdn-01-d7b3e9f1-xqz7-prod-8f4a2c19d6rs--4j9w" +
  "/main/ramayana-kanpur-iit/ramayana.db.gz";

/**
 * Local storage path for the downloaded ramayana.db
 * Stored alongside bhashya_packs in app DATA directory.
 */
const RAMAYANA_LOCAL_PATH = "ramayana/ramayana.db";
const RAMAYANA_LOCAL_DIR  = "ramayana";

function rSqlite() {
  if (!window.Capacitor?.Plugins?.CapacitorSQLite) return null;
  return window.Capacitor.Plugins.CapacitorSQLite;
}

function rFs() {
  const fs =
    window.Capacitor?.Plugins?.Filesystem ||
    window.Capacitor?.Filesystem ||
    window.Filesystem;
  if (!fs || typeof fs.writeFile !== "function") return null;
  return fs;
}

function rDir() {
  const fs = rFs();
  if (!fs) return "DATA";
  return fs.Directory?.Data || fs.Directory?.DATA || "DATA";
}

async function rQuery(sql, params = []) {
  const sqlite = rSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");
  const result = await sqlite.query({
    database: RAMAYANA_DB_NAME,
    statement: sql,
    values: params,
  });
  return (result && result.values) ? result.values : [];
}

/* ── Download helpers ────────────────────────────────────────────── */

/**
 * Decompress a gzip ArrayBuffer → Blob via browser DecompressionStream.
 */
async function rDecompressGzip(arrayBuffer) {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(ds);
  return await new Response(stream).blob();
}

function rBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror  = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check whether ramayana.db has already been downloaded to local storage.
 */
async function isRamayanaDownloaded() {
  try {
    const fs = rFs();
    if (!fs) return false;
    await fs.stat({ path: RAMAYANA_LOCAL_PATH, directory: rDir() });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Download ramayana.db.gz from releases, decompress, and save.
 * @param {function(string):void} [onProgress]  Progress message callback.
 */
async function downloadRamayana(onProgress) {
  const fs  = rFs();
  const dir = rDir();
  if (!fs) throw new Error("Filesystem plugin unavailable — cannot save ramayana.db");

  // Ensure directory exists
  try {
    await fs.mkdir({ path: RAMAYANA_LOCAL_DIR, directory: dir, recursive: true });
  } catch (e) { /* already exists */ }

  if (onProgress) onProgress("রামায়ণ ডাউনলোড হচ্ছে…");

  let response;
  try {
    response = await fetch(RAMAYANA_RELEASE_URL);
  } catch (err) {
    throw new Error("নেটওয়ার্ক সমস্যা: " + err.message);
  }
  if (!response.ok) throw new Error("Download failed HTTP " + response.status);

  const buffer = await response.arrayBuffer();

  if (onProgress) onProgress("আনপ্যাক হচ্ছে…");
  const dbBlob = await rDecompressGzip(buffer);
  const base64 = await rBlobToBase64(dbBlob);

  if (onProgress) onProgress("সংরক্ষণ হচ্ছে…");
  await fs.writeFile({
    path:      RAMAYANA_LOCAL_PATH,
    data:      base64,
    directory: dir,
    recursive: true,
  });
}

/* ── Init ─────────────────────────────────────────────────────────── */

let _rInitDone = false;

/**
 * Open (or re-open) the ramayana DB connection.
 * Does NOT trigger download — call isRamayanaDownloaded() / downloadRamayana()
 * from the UI layer first if the DB might not exist yet.
 */
async function rInitDB() {
  if (_rInitDone) return;
  const sqlite = rSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite plugin not available");

  try { await sqlite.initWebStore(); } catch (e) { /* ok */ }

  const exists = await sqlite.isDatabase({ database: RAMAYANA_DB_NAME });

  if (!exists.result) {
    // DB not yet registered. Try to import it from the downloaded file.
    const fs  = rFs();
    const dir = rDir();
    if (!fs) throw new Error("ramayana.db not found and Filesystem unavailable");

    // Verify the downloaded file actually exists before trying to load it
    let fileExists = false;
    try {
      await fs.stat({ path: RAMAYANA_LOCAL_PATH, directory: dir });
      fileExists = true;
    } catch (e) { /* not downloaded */ }

    if (!fileExists) {
      // Signal to the caller that a download is needed, not an internal error
      const err = new Error("RAMAYANA_NOT_DOWNLOADED");
      err.needsDownload = true;
      throw err;
    }

    // Get the native URI and load as a read-only connection from the file path
    const uri = await fs.getUri({ path: RAMAYANA_LOCAL_PATH, directory: dir });
    let dbPath = uri.uri;
    if (dbPath.startsWith("file://")) dbPath = dbPath.slice(7);

    // CapacitorSQLite: create connection pointing at the downloaded file
    await sqlite.createConnection({
      database: RAMAYANA_DB_NAME,
      encrypted: false,
      mode:      "no-encryption",
      version:   1,
      readonly:  false,
      path:      dbPath,
    });
    await sqlite.open({ database: RAMAYANA_DB_NAME });
    _rInitDone = true;
    return;
  }

  // DB already registered — open connection (treat "already" as benign)
  try {
    await sqlite.createConnection({
      database: RAMAYANA_DB_NAME,
      encrypted: false,
      mode:      "no-encryption",
      version:   1,
      readonly:  false,
    });
  } catch (e) {
    const msg = (e && e.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  try {
    await sqlite.open({ database: RAMAYANA_DB_NAME });
  } catch (e) {
    const msg = (e && e.message || String(e)).toLowerCase();
    if (msg.includes("already") || msg.includes("exist")) {
      // benign
    } else if (msg.includes("no available connection")) {
      await sqlite.createConnection({
        database: RAMAYANA_DB_NAME,
        encrypted: false,
        mode:      "no-encryption",
        version:   1,
        readonly:  false,
      });
      await sqlite.open({ database: RAMAYANA_DB_NAME });
    } else {
      throw e;
    }
  }

  _rInitDone = true;
}

/**
 * Reset init flag — call this after a fresh download so the next
 * navigation attempt re-opens the DB from the new file.
 */
function rResetInit() {
  _rInitDone = false;
}

/* ── Kandas ──────────────────────────────────────────────────────── */

async function getKandas() {
  const rows = await rQuery(
    "SELECT json_extract(raw,'$.id') AS id, raw FROM kandas ORDER BY CAST(json_extract(raw,'$.id') AS INTEGER)"
  );
  return rows.map(r => JSON.parse(r.raw));
}

async function getKandaById(kandaId) {
  const rows = await rQuery(
    "SELECT raw FROM kandas WHERE json_extract(raw,'$.id') = ?",
    [kandaId]
  );
  return rows.length ? JSON.parse(rows[0].raw) : null;
}

/* ── Sargas ──────────────────────────────────────────────────────── */

async function getSargasForKanda(kandaId) {
  const rows = await rQuery(
    `SELECT raw FROM sargas
     WHERE json_extract(raw,'$.kanda.id') = ?
     ORDER BY CAST(json_extract(raw,'$.id') AS INTEGER)`,
    [kandaId]
  );
  return rows.map(r => JSON.parse(r.raw));
}

async function getSargaById(sargaId) {
  const rows = await rQuery(
    "SELECT raw FROM sargas WHERE json_extract(raw,'$.id') = ?",
    [sargaId]
  );
  return rows.length ? JSON.parse(rows[0].raw) : null;
}

/* ── Shlokas ─────────────────────────────────────────────────────── */

async function getShlokasForSarga(sargaId) {
  const rows = await rQuery(
    `SELECT raw FROM shlokas
     WHERE json_extract(raw,'$.sarga.id') = ?
     ORDER BY ROWID`,
    [sargaId]
  );
  return rows.map(r => JSON.parse(r.raw));
}

async function getShlokaByRef(ref) {
  const m = ref.match(/^K(\d+)\.S(\d+)\.(\d+)$/);
  if (!m) return null;
  const [, kandaId, sargaId, shlokaId] = m.map(Number);
  const rows = await rQuery(
    `SELECT ROWID AS rowid_val, raw FROM shlokas
     WHERE json_extract(raw,'$.kanda.id') = ?
       AND json_extract(raw,'$.sarga.id') = ?
       AND json_extract(raw,'$.id') = ?
     LIMIT 1`,
    [kandaId, sargaId, shlokaId]
  );
  if (!rows.length) return null;
  const d = JSON.parse(rows[0].raw);
  d._rowid = rows[0].rowid_val ?? rows[0].ROWID_VAL ?? rows[0].ROWID ?? rows[0].rowid;
  return d;
}

async function getAdjacentShlokas(rowid, sargaId) {
  const prevRows = await rQuery(
    `SELECT ROWID AS rowid_val, raw FROM shlokas
     WHERE json_extract(raw,'$.sarga.id') = ? AND ROWID < ?
     ORDER BY ROWID DESC LIMIT 1`,
    [sargaId, rowid]
  );
  const nextRows = await rQuery(
    `SELECT ROWID AS rowid_val, raw FROM shlokas
     WHERE json_extract(raw,'$.sarga.id') = ? AND ROWID > ?
     ORDER BY ROWID ASC LIMIT 1`,
    [sargaId, rowid]
  );
  function toRef(row) {
    if (!row) return null;
    const d = JSON.parse(row.raw);
    return `K${d.kanda.id}.S${d.sarga.id}.${d.id}`;
  }
  return {
    prev: prevRows.length ? toRef(prevRows[0]) : null,
    next: nextRows.length ? toRef(nextRows[0]) : null,
  };
}

async function getShlokaCount(sargaId) {
  const rows = await rQuery(
    "SELECT COUNT(*) AS c FROM shlokas WHERE json_extract(raw,'$.sarga.id') = ?",
    [sargaId]
  );
  return rows[0]?.c || 0;
}

/* ── Search ──────────────────────────────────────────────────────── */

async function searchRamayana(term, limit = 50) {
  const escaped = "%" + term.trim().replace(/[%_]/g, "\\$&") + "%";
  const rows = await rQuery(
    `SELECT raw FROM shlokas
     WHERE json_extract(raw,'$.sanskrit') LIKE ?
        OR json_extract(raw,'$.tat') LIKE ?
        OR json_extract(raw,'$.pratipada') LIKE ?
     LIMIT ?`,
    [escaped, escaped, escaped, limit]
  );
  return rows.map(r => {
    const d = JSON.parse(r.raw);
    return {
      ref:      `K${d.kanda.id}.S${d.sarga.id}.${d.id}`,
      kandaId:  d.kanda.id,
      sargaId:  d.sarga.id,
      shlokaId: d.id,
      sanskrit: d.sanskrit,
      tat:      d.tat,
    };
  });
}

/* ── Public API ─────────────────────────────────────────────────── */

// Expose the internal init flag as a getter so ramayanaDownloadGate
// can fast-path without calling into CapacitorSQLite.
Object.defineProperty(window, "RamayanaDB", { configurable: true, writable: true, value: {} });

window.RamayanaDB = {
  get _initDone() { return _rInitDone; },
  initDB:              rInitDB,
  resetInit:           rResetInit,
  isRamayanaDownloaded,
  downloadRamayana,
  getKandas,
  getKandaById,
  getSargasForKanda,
  getSargaById,
  getShlokasForSarga,
  getShlokaByRef,
  getAdjacentShlokas,
  getShlokaCount,
  searchRamayana,
};
