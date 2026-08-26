/**
 * ramayana.js — Ramayana SQLite access layer (v2)
 *
 * Architecture (mirrors VedaDB exactly):
 *
 *   ramayana_core.db   — always bundled in APK
 *                         tables: kandas, sargas, shlokas (sanskrit only)
 *                         *** deletable + re-downloadable by user ***
 *
 *   ramayana_kanda_N.db — bhashya packs (downloaded on demand)
 *                         table: ramayana_bhashyas (shloka_id, field_key, value)
 *                         field_key: "pratipada" | "tat" | "comment"
 *
 * DB repo (public asset repo):
 *   ramayana-kanpur-iit/ramayana_core.db.gz
 *   ramayana-kanpur-iit/ramayana_kanda_1.db.gz  … ramayana_kanda_6.db.gz
 *
 * Pack ID range: 501–506  (safe: Veda 1–200, Ramayana scholars 201–300, MB 301+)
 * Pack file naming: ramayana_kanda_N.db.gz  (not scholar_N.db.gz)
 *
 * Hierarchy:
 *   রামায়ণ → কান্ড → সর্গ → শ্লোক → [ভাষ্য tabs]
 */

const RAM_CORE_DB  = "ramayana_core";
const RAM_PACK_DIR = "ramayana_packs";
const RAM_ASSET_BASE =
  "https://raw.githubusercontent.com/infinitydattaashim1210958-coder/-------------vx-9f2k-static-cdn-01-d7b3e9f1-xqz7-prod-8f4a2c19d6rs--4j9w/main/ramayana-kanpur-iit/";

const KANDA_NAMES = {
  1: "বালকাণ্ড",
  2: "অযোধ্যাকাণ্ড",
  3: "অরণ্যকাণ্ড",
  4: "কিষ্কিন্ধাকাণ্ড",
  5: "সুন্দরকাণ্ড",
  6: "যুদ্ধকাণ্ড",
};

// Scholar-style metadata for the 6 bhashya packs
const RAM_KANDA_PACKS = [
  { id: 501, kanda_id: 1, name: "বালকাণ্ড ভাষ্য",         pack_file: "ramayana_kanda_1.db.gz", pack_size_bytes: 1258291 },
  { id: 502, kanda_id: 2, name: "অযোধ্যাকাণ্ড ভাষ্য",     pack_file: "ramayana_kanda_2.db.gz", pack_size_bytes: 1572864 },
  { id: 503, kanda_id: 3, name: "অরণ্যকাণ্ড ভাষ্য",       pack_file: "ramayana_kanda_3.db.gz", pack_size_bytes: 1468006 },
  { id: 504, kanda_id: 4, name: "কিষ্কিন্ধাকাণ্ড ভাষ্য",  pack_file: "ramayana_kanda_4.db.gz", pack_size_bytes: 1363149 },
  { id: 505, kanda_id: 5, name: "সুন্দরকাণ্ড ভাষ্য",      pack_file: "ramayana_kanda_5.db.gz", pack_size_bytes:  972800 },
  { id: 506, kanda_id: 6, name: "যুদ্ধকাণ্ড ভাষ্য",       pack_file: "ramayana_kanda_6.db.gz", pack_size_bytes: 1887437 },
];

/* ── Capacitor helpers (same pattern as db.js) ─────────────────────── */

function ramSqlite() {
  return window.Capacitor?.Plugins?.CapacitorSQLite || null;
}

function ramFs() {
  const fs =
    window.Capacitor?.Plugins?.Filesystem ||
    window.Capacitor?.Filesystem ||
    window.Filesystem;
  return (fs && typeof fs.writeFile === "function") ? fs : null;
}

function ramDir() {
  const fs = ramFs();
  if (!fs) return "DATA";
  return fs.Directory?.Data || fs.Directory?.DATA || "DATA";
}

function ramRowsOf(result) {
  return (result && result.values) ? result.values : [];
}

async function ramQuery(sql, params = []) {
  const sqlite = ramSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");
  const result = await sqlite.query({ database: RAM_CORE_DB, statement: sql, values: params });
  return ramRowsOf(result);
}

/* ── LRU pack manager (max 9 attached, same as db.js) ──────────────── */

const MAX_RAM_ATTACHED = 9;
const ramAttachedPacks  = new Set();
const ramAttachedOrder  = [];

async function ramEvictOldestIfNeeded(sqlite) {
  if (ramAttachedPacks.size < MAX_RAM_ATTACHED) return;
  const oldest = ramAttachedOrder.shift();
  if (oldest == null) return;
  ramAttachedPacks.delete(oldest);
  try {
    await sqlite.execute({
      database:   RAM_CORE_DB,
      statements: `DETACH DATABASE ram_pack_${oldest};`,
    });
  } catch (e) { /* already gone */ }
}

function ramMarkPackUsed(packId) {
  const idx = ramAttachedOrder.indexOf(packId);
  if (idx !== -1) ramAttachedOrder.splice(idx, 1);
  ramAttachedOrder.push(packId);
}

/* ── Init core DB ───────────────────────────────────────────────────── */

let _ramInitDone = false;

async function ramInitDB() {
  if (_ramInitDone) return;
  const sqlite = ramSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");

  try { await sqlite.initWebStore(); } catch (e) { /* ok */ }

  const exists = await sqlite.isDatabase({ database: RAM_CORE_DB });
  if (!exists.result) {
    await sqlite.copyFromAssets({ overwrite: false });
  }

  try {
    await sqlite.createConnection({
      database: RAM_CORE_DB, encrypted: false,
      mode: "no-encryption", version: 1, readonly: false,
    });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  try {
    await sqlite.open({ database: RAM_CORE_DB });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (msg.includes("already") || msg.includes("exist")) {
      // benign
    } else if (msg.includes("no available connection")) {
      await sqlite.createConnection({
        database: RAM_CORE_DB, encrypted: false,
        mode: "no-encryption", version: 1, readonly: false,
      });
      await sqlite.open({ database: RAM_CORE_DB });
    } else {
      throw e;
    }
  }

  _ramInitDone = true;
}

/* ── Core text queries ──────────────────────────────────────────────── */

async function ramGetKandas() {
  return ramQuery("SELECT * FROM kandas ORDER BY id");
}

async function ramGetKandaById(kandaId) {
  const rows = await ramQuery("SELECT * FROM kandas WHERE id=?", [kandaId]);
  return rows[0] || null;
}

async function ramGetSargasForKanda(kandaId) {
  return ramQuery(
    "SELECT * FROM sargas WHERE kanda_id=? ORDER BY chapter",
    [kandaId]
  );
}

async function ramGetSargaById(sargaId) {
  const rows = await ramQuery("SELECT * FROM sargas WHERE id=?", [sargaId]);
  return rows[0] || null;
}

async function ramGetShlokasForSarga(sargaId) {
  return ramQuery(
    "SELECT * FROM shlokas WHERE sarga_id=? ORDER BY id",
    [sargaId]
  );
}

async function ramGetShlokaById(shlokaId) {
  const rows = await ramQuery("SELECT * FROM shlokas WHERE id=?", [shlokaId]);
  return rows[0] || null;
}

async function ramGetAdjacentShlokas(shlokaId, sargaId) {
  const prev = await ramQuery(
    "SELECT id FROM shlokas WHERE sarga_id=? AND id<? ORDER BY id DESC LIMIT 1",
    [sargaId, shlokaId]
  );
  const next = await ramQuery(
    "SELECT id FROM shlokas WHERE sarga_id=? AND id>? ORDER BY id ASC LIMIT 1",
    [sargaId, shlokaId]
  );
  return {
    prev: prev.length ? prev[0].id : null,
    next: next.length ? next[0].id : null,
  };
}

/* ── Core DB: download / delete (sanskrit text) ─────────────────────── */

async function ramIsCoreDownloaded() {
  try {
    const sqlite = ramSqlite();
    if (!sqlite) return false;
    const exists = await sqlite.isDatabase({ database: RAM_CORE_DB });
    return exists.result;
  } catch (e) {
    return false;
  }
}

async function ramDeleteCore() {
  // Close connection, delete DB file — user must re-download to read shlokas
  const sqlite = ramSqlite();
  if (!sqlite) return;
  try { await sqlite.close({ database: RAM_CORE_DB }); } catch (e) { /* ok */ }
  try { await sqlite.deleteDatabase({ database: RAM_CORE_DB }); } catch (e) { /* ok */ }
  _ramInitDone = false;
}

async function ramDownloadCore(onProgress) {
  if (onProgress) onProgress("ডাউনলোড হচ্ছে…");
  const url = RAM_ASSET_BASE + "ramayana_core.db.gz";
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error("নেটওয়ার্ক সমস্যা: " + err.message);
  }
  if (!response.ok) throw new Error("Download failed HTTP " + response.status);

  const buffer = await response.arrayBuffer();
  if (onProgress) onProgress("আনপ্যাক হচ্ছে…");

  const ds     = new DecompressionStream("gzip");
  const stream = new Blob([buffer]).stream().pipeThrough(ds);
  const dbBlob = await new Response(stream).blob();
  const base64 = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res(reader.result.split(",")[1]);
    reader.onerror   = rej;
    reader.readAsDataURL(dbBlob);
  });

  if (onProgress) onProgress("সংরক্ষণ হচ্ছে…");

  // Use CapacitorSQLite importFromJson or writeFile — write as DB via fs
  const sqlite = ramSqlite();
  const fs     = ramFs();
  const dir    = ramDir();
  if (!fs || !dir) throw new Error("Filesystem plugin not available");

  await fs.writeFile({
    path:      "CapacitorSQLite/" + RAM_CORE_DB + "SQLite.db",
    data:      base64,
    directory: dir,
    recursive: true,
  });

  // Re-init
  _ramInitDone = false;
  await ramInitDB();
  if (onProgress) onProgress("সম্পন্ন!");
}

/* ── Pack helpers (bhashya — one per kanda) ─────────────────────────── */

function ramPackAlias(packId) { return `ram_pack_${packId}`; }

function ramPackFileName(packId) {
  return `${RAM_PACK_DIR}/ramayana_kanda_${packId - 500}.db`;
}

async function ramIsPackDownloaded(packId) {
  try {
    const fs  = ramFs();
    const dir = ramDir();
    if (!fs || !dir) return false;
    await fs.stat({ path: ramPackFileName(packId), directory: dir });
    return true;
  } catch (e) {
    return false;
  }
}

async function ramDownloadPack(packId, packFile, onProgress) {
  if (onProgress) onProgress("ডাউনলোড হচ্ছে…");
  const url = RAM_ASSET_BASE + packFile;
  let response;
  try { response = await fetch(url); }
  catch (err) { throw new Error("নেটওয়ার্ক সমস্যা: " + err.message); }
  if (!response.ok) throw new Error("Download failed HTTP " + response.status);

  const buffer = await response.arrayBuffer();
  if (onProgress) onProgress("আনপ্যাক হচ্ছে…");

  const ds     = new DecompressionStream("gzip");
  const stream = new Blob([buffer]).stream().pipeThrough(ds);
  const dbBlob = await new Response(stream).blob();
  const base64 = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res(reader.result.split(",")[1]);
    reader.onerror   = rej;
    reader.readAsDataURL(dbBlob);
  });

  if (onProgress) onProgress("সংরক্ষণ হচ্ছে…");
  const fs  = ramFs();
  const dir = ramDir();
  if (!fs || !dir) throw new Error("Filesystem plugin not available");
  await fs.writeFile({
    path:      ramPackFileName(packId),
    data:      base64,
    directory: dir,
    recursive: true,
  });
  return true;
}

async function ramAttachPack(packId) {
  if (ramAttachedPacks.has(packId)) { ramMarkPackUsed(packId); return; }

  const sqlite = ramSqlite();
  const fs     = ramFs();
  const dir    = ramDir();
  if (!sqlite || !fs || !dir) throw new Error("Plugins unavailable");

  await ramEvictOldestIfNeeded(sqlite);

  const uri    = await fs.getUri({ path: ramPackFileName(packId), directory: dir });
  let dbPath   = uri.uri;
  if (dbPath.startsWith("file://")) dbPath = dbPath.replace("file://", "");
  const alias  = ramPackAlias(packId);

  try {
    await sqlite.execute({ database: RAM_CORE_DB, statements: `DETACH DATABASE ${alias};` });
  } catch (e) { /* not attached */ }

  try {
    await sqlite.execute({ database: RAM_CORE_DB, statements: `ATTACH DATABASE '${dbPath}' AS ${alias};` });
  } catch (e) {
    const msg = (e?.message || String(e));
    if (!msg.includes("already in use")) throw e;
  }

  ramAttachedPacks.add(packId);
  ramMarkPackUsed(packId);
}

async function ramDetachPack(packId) {
  const sqlite = ramSqlite();
  if (!sqlite) return;
  if (!ramAttachedPacks.has(packId)) return;
  try {
    await sqlite.execute({
      database:   RAM_CORE_DB,
      statements: `DETACH DATABASE ${ramPackAlias(packId)};`,
    });
  } catch (e) { /* ignore */ }
  ramAttachedPacks.delete(packId);
  const idx = ramAttachedOrder.indexOf(packId);
  if (idx !== -1) ramAttachedOrder.splice(idx, 1);
}

async function ramDeletePack(packId) {
  await ramDetachPack(packId);
  try {
    const fs  = ramFs();
    const dir = ramDir();
    if (fs && dir) await fs.deleteFile({ path: ramPackFileName(packId), directory: dir });
  } catch (e) { /* already gone */ }
}

/* ── Bhashya query (from pack) ─────────────────────────────────────── */

async function ramGetBhashyaForShloka(packId, shlokaId) {
  await ramAttachPack(packId);
  const alias   = ramPackAlias(packId);
  const sqlite  = ramSqlite();
  const result  = await sqlite.query({
    database:  RAM_CORE_DB,
    statement: `SELECT field_key, value FROM ${alias}.ramayana_bhashyas WHERE shloka_id=? ORDER BY id`,
    values:    [shlokaId],
  });
  return ramRowsOf(result);  // [{field_key, value}, ...]
}

/* ── Search ─────────────────────────────────────────────────────────── */

async function ramSearchSanskrit(term, limit = 50) {
  const escaped = '"' + term.trim().replace(/"/g, '""') + '"';
  try {
    return ramQuery(
      `SELECT s.id, s.kanda_id, s.sarga_id, s.sanskrit
       FROM shlokas_fts f
       JOIN shlokas s ON s.id = f.rowid
       WHERE shlokas_fts MATCH ?
       LIMIT ?`,
      [escaped, limit]
    );
  } catch (e) {
    const esc = "%" + term.trim().replace(/[%_]/g, "\\$&") + "%";
    return ramQuery(
      `SELECT id, kanda_id, sarga_id, sanskrit FROM shlokas
       WHERE sanskrit LIKE ? LIMIT ?`,
      [esc, limit]
    );
  }
}

async function ramSearchBhashya(packId, term, limit = 50) {
  await ramAttachPack(packId);
  const alias   = ramPackAlias(packId);
  const sqlite  = ramSqlite();
  const escaped = '"' + term.trim().replace(/"/g, '""') + '"';
  try {
    const result = await sqlite.query({
      database:  RAM_CORE_DB,
      statement: `SELECT b.shloka_id, b.field_key, b.value,
                         s.kanda_id, s.sarga_id
                  FROM ${alias}.rb_fts f
                  JOIN ${alias}.ramayana_bhashyas b ON b.id = f.rowid
                  JOIN shlokas s ON s.id = b.shloka_id
                  WHERE ${alias}.rb_fts MATCH ?
                  LIMIT ?`,
      values: [escaped, limit],
    });
    return ramRowsOf(result);
  } catch (e) {
    const esc = "%" + term.trim().replace(/[%_]/g, "\\$&") + "%";
    const result = await sqlite.query({
      database:  RAM_CORE_DB,
      statement: `SELECT b.shloka_id, b.field_key, b.value,
                         s.kanda_id, s.sarga_id
                  FROM ${alias}.ramayana_bhashyas b
                  JOIN shlokas s ON s.id = b.shloka_id
                  WHERE b.value LIKE ?
                  LIMIT ?`,
      values: [esc, limit],
    });
    return ramRowsOf(result);
  }
}

/* ── Public API ─────────────────────────────────────────────────────── */

window.RamayanaDB = {
  initDB: ramInitDB,

  // Core text
  getKandas:           ramGetKandas,
  getKandaById:        ramGetKandaById,
  getSargasForKanda:   ramGetSargasForKanda,
  getSargaById:        ramGetSargaById,
  getShlokasForSarga:  ramGetShlokasForSarga,
  getShlokaById:       ramGetShlokaById,
  getAdjacentShlokas:  ramGetAdjacentShlokas,

  // Core text DB lifecycle
  isCoreDownloaded:    ramIsCoreDownloaded,
  downloadCore:        ramDownloadCore,
  deleteCore:          ramDeleteCore,

  // Bhashya packs
  KANDA_PACKS:         RAM_KANDA_PACKS,
  KANDA_NAMES:         KANDA_NAMES,
  isPackDownloaded:    ramIsPackDownloaded,
  downloadPack:        ramDownloadPack,
  deletePack:          ramDeletePack,
  getBhashyaForShloka: ramGetBhashyaForShloka,

  // Search
  searchSanskrit:      ramSearchSanskrit,
  searchBhashya:       ramSearchBhashya,
};
