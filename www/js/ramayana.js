/**
 * ramayana.js — SQLite access layer for Valmiki Ramayana
 *
 * Database: ramayana.db
 *   Downloaded once on first use from the DB repo's /ramayana-kanpur-iit/ folder.
 *   Stored in CapacitorSQLite's managed databases/ directory so standard
 *   createConnection() can open it without any custom path parameter.
 *
 * Schema:
 *   kandas  — raw JSON: { id, name, english_name, sarga_count }
 *   sargas  — raw JSON: { id, name, chapter, kanda: { id } }
 *   shlokas — raw JSON: { id, sanskrit, pratipada, tat, comment,
 *                         sarga: { id }, kanda: { id } }
 *
 * Navigation: Kanda → Sarga → Shloka
 * Ref format: "K<kandaId>.S<sargaId>.<shlokaId>"  e.g. "K1.S1.42"
 */

const RAMAYANA_DB_NAME = "ramayana";

/**
 * CapacitorSQLite names DB files as: {dbName}SQLite.db
 * We write the downloaded DB there so createConnection finds it.
 */
const RAMAYANA_SQLITE_FILENAME = `${RAMAYANA_DB_NAME}SQLite.db`;

/**
 * Sentinel file: exists in files/ after a successful download.
 * Used by isRamayanaDownloaded() to answer quickly without touching SQLite.
 */
const RAMAYANA_SENTINEL_DIR  = "ramayana";
const RAMAYANA_SENTINEL_PATH = "ramayana/ramayana.db.sentinel";

/**
 * Release URL — DB repo, /ramayana-kanpur-iit/ folder (same raw.githubusercontent
 * pattern as PACK_RELEASE_BASE in db.js).
 */
const RAMAYANA_RELEASE_URL =
  "https://raw.githubusercontent.com/infinitydattaashim1210958-coder/" +
  "-------------vx-9f2k-static-cdn-01-d7b3e9f1-xqz7-prod-8f4a2c19d6rs--4j9w" +
  "/main/ramayana-kanpur-iit/ramayana.db.gz";

/* ── Capacitor helpers ───────────────────────────────────────────── */

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

/* ── Decompress / base64 helpers ─────────────────────────────────── */

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
 * Write a large Blob to an absolute native path in small chunks, using
 * writeFile for the first chunk and appendFile for the rest.
 *
 * WHY: Capacitor's JS<->native bridge has a payload-size ceiling (Android's
 * Binder transaction buffer is ~1MB). Converting a large DB (tens of MB) to
 * one giant base64 string and sending it in a single writeFile() call can
 * get truncated/corrupted in transit, which surfaces on the native side as
 * "The supplied data is not valid base64 content." Chunking keeps each
 * bridge call small and reliable.
 */
async function rWriteBlobChunked(fs, absPath, blob, onProgress) {
  const CHUNK_BYTES = 2 * 1024 * 1024; // 2MB raw per chunk (safely under bridge limits)
  const total = blob.size;
  let offset = 0;
  let first = true;

  while (offset < total) {
    const slice = blob.slice(offset, offset + CHUNK_BYTES);
    const base64Chunk = await rBlobToBase64(slice);

    if (first) {
      await fs.writeFile({ path: absPath, data: base64Chunk, recursive: true });
      first = false;
    } else {
      await fs.appendFile({ path: absPath, data: base64Chunk });
    }

    offset += CHUNK_BYTES;
    if (onProgress) {
      const pct = Math.min(100, Math.round((offset / total) * 100));
      onProgress(`ইনস্টল হচ্ছে… ${pct}%`);
    }
  }
}

/* ── Download & storage ──────────────────────────────────────────── */

/**
 * Returns true if ramayana.db was successfully downloaded in a prior session.
 * Uses a lightweight sentinel file stat — does NOT open any DB connection.
 */
async function isRamayanaDownloaded() {
  try {
    const fs = rFs();
    if (!fs) return false;
    await fs.stat({ path: RAMAYANA_SENTINEL_PATH, directory: rDir() });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Download, decompress, and install ramayana.db into CapacitorSQLite's
 * managed databases/ directory.
 *
 * KEY INSIGHT: CapacitorSQLite on Android stores databases at:
 *   /data/user/0/{package}/databases/{dbName}SQLite.db
 * Standard createConnection() looks there — no custom "path:" param needed.
 *
 * We derive the absolute databases/ path at runtime from any files/ URI
 * (path.replace('/files/', '/databases/')), then write directly there.
 * This avoids hardcoding the package name or user ID.
 *
 * @param {function(string):void} [onProgress]
 */
async function downloadRamayana(onProgress) {
  const fs  = rFs();
  const dir = rDir();
  if (!fs) throw new Error("Filesystem plugin unavailable");

  // ── 1. Download ──────────────────────────────────────────────────
  if (onProgress) onProgress("রামায়ণ ডাউনলোড হচ্ছে…");

  let response;
  try {
    response = await fetch(RAMAYANA_RELEASE_URL);
  } catch (err) {
    throw new Error("নেটওয়ার্ক সমস্যা: " + err.message);
  }
  if (!response.ok) throw new Error("Download failed HTTP " + response.status);

  const buffer = await response.arrayBuffer();

  // ── 2. Decompress ────────────────────────────────────────────────
  if (onProgress) onProgress("আনপ্যাক হচ্ছে…");
  const dbBlob = await rDecompressGzip(buffer);
  console.log("[ramayana] decompressed size:", dbBlob.size, "bytes");

  // ── 3. Discover CapacitorSQLite databases/ path ──────────────────
  if (onProgress) onProgress("ইনস্টল হচ্ছে…");

  // Write a tiny probe file to our accessible files/ directory just to
  // learn the absolute base path of the app's private storage.
  // e.g. URI → "file:///data/user/0/com.kyronix.chaturveda/files/__probe"
  const PROBE = "__ramayana_probe";
  await fs.writeFile({ path: PROBE, data: "1", directory: dir });
  const probeUri = await fs.getUri({ path: PROBE, directory: dir });
  try { await fs.deleteFile({ path: PROBE, directory: dir }); } catch (e) {}

  // probeAbsPath = "/data/user/0/com.kyronix.chaturveda/files/__ramayana_probe"
  const probeAbsPath = probeUri.uri.replace(/^file:\/\//, "");

  // filesIdx points to "/files/" in the path
  const filesIdx = probeAbsPath.lastIndexOf("/files/");
  if (filesIdx === -1) {
    throw new Error(
      "Unexpected Filesystem URI format — cannot derive SQLite databases path: " +
      probeUri.uri
    );
  }

  // appRoot = "/data/user/0/com.kyronix.chaturveda"
  const appRoot = probeAbsPath.substring(0, filesIdx);

  // CapacitorSQLite databases dir and file:
  // /data/user/0/com.kyronix.chaturveda/databases/ramayanaSQLite.db
  const sqliteDbPath = `${appRoot}/databases/${RAMAYANA_SQLITE_FILENAME}`;

  // ── 4. Write DB to CapacitorSQLite's databases/ directory ────────
  // Capacitor Filesystem supports absolute paths when no directory is given.
  // The app has full RW permission over its own /databases/ folder.
  // Written in small chunks (see rWriteBlobChunked) to avoid exceeding the
  // Capacitor JS<->native bridge payload limit, which was corrupting the
  // base64 payload for this large database and causing:
  // "The supplied data is not valid base64 content."
  await rWriteBlobChunked(fs, sqliteDbPath, dbBlob, onProgress);

  // ── 5. Write sentinel so isRamayanaDownloaded() returns true ─────
  try {
    await fs.mkdir({ path: RAMAYANA_SENTINEL_DIR, directory: dir, recursive: true });
  } catch (e) { /* already exists */ }
  await fs.writeFile({
    path:      RAMAYANA_SENTINEL_PATH,
    data:      "ok",
    directory: dir,
    recursive: true,
  });
}

/* ── Init ─────────────────────────────────────────────────────────── */

let _rInitDone = false;

/**
 * Open the ramayana DB connection.
 *
 * Throws { needsDownload: true } if the DB has not been downloaded yet.
 * This sentinel is caught in the app.js boot sequence and by the
 * ramayanaDownloadGate() helper — it means "show download UI", not "crash".
 */
async function rInitDB() {
  if (_rInitDone) return;

  const sqlite = rSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite plugin not available");

  try { await sqlite.initWebStore(); } catch (e) { /* web-only, ok */ }

  // isDatabase() returns true only if {dbName}SQLite.db exists in the
  // managed databases/ directory — i.e. downloadRamayana() completed.
  const exists = await sqlite.isDatabase({ database: RAMAYANA_DB_NAME });

  if (!exists.result) {
    // Quick sentinel check to distinguish "never downloaded" from a
    // partially-written DB (the latter would need a fresh download too).
    const downloaded = await isRamayanaDownloaded();
    if (!downloaded) {
      const err = new Error("RAMAYANA_NOT_DOWNLOADED");
      err.needsDownload = true;
      throw err;
    }
    // Sentinel says downloaded but isDatabase() says false →
    // the write to databases/ failed. Force a re-download.
    try {
      await rFs()?.deleteFile({ path: RAMAYANA_SENTINEL_PATH, directory: rDir() });
    } catch (e) {}
    const err = new Error("রামায়ণ ডেটাবেস সঠিকভাবে ইনস্টল হয়নি। পুনরায় ডাউনলোড করুন।");
    err.needsDownload = true;
    throw err;
  }

  // Standard connection open — NO custom "path:" parameter.
  // CapacitorSQLite already knows where ramayanaSQLite.db is.
  try {
    await sqlite.createConnection({
      database: RAMAYANA_DB_NAME,
      encrypted: false,
      mode:      "no-encryption",
      version:   1,
      readonly:  false,
    });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  try {
    await sqlite.open({ database: RAMAYANA_DB_NAME });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (msg.includes("already") || msg.includes("exist")) {
      // benign — already open
    } else if (msg.includes("no available connection")) {
      // createConnection silently failed; self-heal
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

/** Reset init flag after a fresh download so the next init re-opens the DB. */
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
