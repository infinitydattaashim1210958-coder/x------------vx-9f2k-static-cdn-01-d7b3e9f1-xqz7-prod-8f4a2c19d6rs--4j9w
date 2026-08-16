/**
 * mahabharata.js — SQLite access layer for Mahabharata
 *
 * Architecture (mirrors db.js exactly):
 *   mahabharata.db  — core DB (always bundled in www/assets/databases/)
 *                     tables: parvas, mb_scholars, adhyayas, bishoys
 *   scholar_N.db    — pack DB (downloaded on demand, stored in PACK_DIR)
 *                     table: mb_anubad (ref_id → anubad + FTS)
 *
 * Scholar ID range: 301+ (safe: Veda uses 1–200, Ramayana 201–300)
 *
 * Pack file naming: same packFileName(scholarId) pattern as db.js
 *   → stored at  bhashya_packs/scholar_301.db
 *   → downloaded from bhashya_packs/scholar_301.db.gz (GitHub raw)
 *
 * Hierarchy:
 *   মহাভারত → পর্ব → Scholar list → অধ্যায় → [বিষয় list] → অনুবাদ
 *   (has_upa=0 → অধ্যায় tap = সরাসরি অনুবাদ, বিষয় স্তর skip)
 */

const MB_DB_NAME  = "mahabharata";
const MB_PACK_DIR = "bhashya_packs";   // same dir as VedaDB packs
const MB_PACK_RELEASE_BASE =
  "https://raw.githubusercontent.com/infinitydattaashim1210958-coder/-------------vx-9f2k-static-cdn-01-d7b3e9f1-xqz7-prod-8f4a2c19d6rs--4j9w/main/bhashya_packs/";

/* ── Capacitor helpers (mirrors db.js) ─────────────────────────────── */

function mbSqlite() {
  if (!window.Capacitor?.Plugins?.CapacitorSQLite) return null;
  return window.Capacitor.Plugins.CapacitorSQLite;
}

function mbFs() {
  const fs =
    window.Capacitor?.Plugins?.Filesystem ||
    window.Capacitor?.Filesystem ||
    window.Filesystem;
  if (!fs || typeof fs.writeFile !== "function") return null;
  return fs;
}

function mbDir() {
  const fs = mbFs();
  if (!fs) return "DATA";
  if (fs.Directory?.Data) return fs.Directory.Data;
  if (fs.Directory?.DATA) return fs.Directory.DATA;
  return "DATA";
}

function mbRowsOf(result) {
  return (result && result.values) ? result.values : [];
}

async function mbQuery(sql, params = []) {
  const sqlite = mbSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");
  const result = await sqlite.query({ database: MB_DB_NAME, statement: sql, values: params });
  return mbRowsOf(result);
}

/* ── Pack file helpers (same naming as db.js packFileName) ─────────── */

function mbPackDbName(scholarId) {
  return "pack_" + scholarId;   // alias used in ATTACH
}

function mbPackFileName(scholarId) {
  return `${MB_PACK_DIR}/scholar_${scholarId}.db`;
}

/* ── Init ─────────────────────────────────────────────────────────── */

let _mbInitDone = false;

async function mbInitDB() {
  if (_mbInitDone) return;
  const sqlite = mbSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite plugin not available");

  try { await sqlite.initWebStore(); } catch (e) { /* ok */ }

  const exists = await sqlite.isDatabase({ database: MB_DB_NAME });
  if (!exists.result) {
    await sqlite.copyFromAssets({ overwrite: false });
  }

  try {
    await sqlite.createConnection({
      database: MB_DB_NAME, encrypted: false,
      mode: "no-encryption", version: 1, readonly: false,
    });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  try {
    await sqlite.open({ database: MB_DB_NAME });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (msg.includes("already") || msg.includes("exist")) {
      // benign — already open
    } else if (msg.includes("no available connection")) {
      await sqlite.createConnection({
        database: MB_DB_NAME, encrypted: false,
        mode: "no-encryption", version: 1, readonly: false,
      });
      await sqlite.open({ database: MB_DB_NAME });
    } else {
      throw e;
    }
  }

  _mbInitDone = true;
}

/* ── Parvas ──────────────────────────────────────────────────────── */

async function mbGetParvas() {
  return mbQuery("SELECT * FROM parvas ORDER BY id");
}

async function mbGetParvaById(parvaId) {
  const rows = await mbQuery("SELECT * FROM parvas WHERE id=?", [parvaId]);
  return rows[0] || null;
}

/* ── Scholars ────────────────────────────────────────────────────── */

async function mbGetScholarsForParva(parvaId) {
  const scholars = await mbQuery(
    "SELECT * FROM mb_scholars WHERE parva_id=? ORDER BY display_order, id",
    [parvaId]
  );
  for (const s of scholars) {
    s.downloaded = await mbIsPackDownloaded(s.id);
  }
  return scholars;
}

/* ── Adhyayas ────────────────────────────────────────────────────── */

async function mbGetAdhyayasForParva(parvaId) {
  return mbQuery(
    `SELECT a.*, COUNT(b.id) AS bishoy_count
     FROM adhyayas a
     LEFT JOIN bishoys b ON b.adhyaya_id = a.id
     WHERE a.parva_id=?
     GROUP BY a.id
     ORDER BY a.adhyaya_no`,
    [parvaId]
  );
}

async function mbGetAdhyayaById(adhyayaId) {
  const rows = await mbQuery("SELECT * FROM adhyayas WHERE id=?", [adhyayaId]);
  return rows[0] || null;
}

/* ── Bishoys (metadata only — no anubad) ────────────────────────── */

async function mbGetBishoysByAdhyaya(adhyayaId) {
  return mbQuery(
    "SELECT * FROM bishoys WHERE adhyaya_id=? ORDER BY upa_no",
    [adhyayaId]
  );
}

async function mbGetBishoyByRef(refId) {
  const rows = await mbQuery("SELECT * FROM bishoys WHERE ref_id=?", [refId]);
  return rows[0] || null;
}

async function mbGetAdjacentBishoys(bishoyId, adhyayaId) {
  const prev = await mbQuery(
    "SELECT ref_id FROM bishoys WHERE adhyaya_id=? AND id<? ORDER BY id DESC LIMIT 1",
    [adhyayaId, bishoyId]
  );
  const next = await mbQuery(
    "SELECT ref_id FROM bishoys WHERE adhyaya_id=? AND id>? ORDER BY id ASC LIMIT 1",
    [adhyayaId, bishoyId]
  );
  return {
    prev: prev.length ? prev[0].ref_id : null,
    next: next.length ? next[0].ref_id : null,
  };
}

/* ── Pack: download state ────────────────────────────────────────── */

async function mbIsPackDownloaded(scholarId) {
  try {
    const fs  = mbFs();
    const dir = mbDir();
    if (!fs || !dir) return false;
    await fs.stat({ path: mbPackFileName(scholarId), directory: dir });
    return true;
  } catch (e) {
    return false;
  }
}

/* ── Pack: gzip decompress (mirrors db.js decompressGzip) ───────── */

async function mbDecompressGzip(arrayBuffer) {
  const ds     = new DecompressionStream("gzip");
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(ds);
  return await new Response(stream).blob();
}

function mbBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

/* ── Pack: download (mirrors db.js downloadPack exactly) ────────── */

async function mbDownloadPack(scholarId, packFile, onProgress) {
  if (onProgress) onProgress("ডাউনলোড হচ্ছে…");

  const url = MB_PACK_RELEASE_BASE + packFile;
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`নেটওয়ার্ক সমস্যা: ${err.message}`);
  }
  if (!response.ok) throw new Error(`Download failed HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();

  if (onProgress) onProgress("আনপ্যাক হচ্ছে…");
  const dbBlob = await mbDecompressGzip(buffer);
  const base64 = await mbBlobToBase64(dbBlob);

  if (onProgress) onProgress("সংরক্ষণ হচ্ছে…");

  const fs  = mbFs();
  const dir = mbDir();
  if (!fs || !dir) throw new Error("Filesystem plugin not available");

  await fs.writeFile({
    path:      mbPackFileName(scholarId),
    data:      base64,
    directory: dir,
    recursive: true,
  });

  return true;
}

/* ── Pack: attach & query anubad ────────────────────────────────── */

const mbAttachedPacks = new Set();

async function mbAttachPack(scholarId) {
  if (mbAttachedPacks.has(scholarId)) return;

  const sqlite = mbSqlite();
  const fs     = mbFs();
  const dir    = mbDir();
  if (!sqlite || !fs || !dir) throw new Error("Plugins unavailable");

  const uri    = await fs.getUri({ path: mbPackFileName(scholarId), directory: dir });
  let dbPath   = uri.uri;
  if (dbPath.startsWith("file://")) dbPath = dbPath.replace("file://", "");

  const alias  = mbPackDbName(scholarId);

  try {
    await sqlite.execute({ database: MB_DB_NAME, statements: `DETACH DATABASE ${alias};` });
  } catch (e) { /* not attached yet */ }

  try {
    await sqlite.execute({ database: MB_DB_NAME, statements: `ATTACH DATABASE '${dbPath}' AS ${alias};` });
  } catch (e) {
    const msg = (e?.message || String(e));
    if (!msg.includes("already in use")) throw e;
  }

  mbAttachedPacks.add(scholarId);
}

async function mbGetAnubadFromPack(scholarId, refId) {
  await mbAttachPack(scholarId);
  const alias  = mbPackDbName(scholarId);
  const sqlite = mbSqlite();
  const result = await sqlite.query({
    database:  MB_DB_NAME,
    statement: `SELECT anubad FROM ${alias}.mb_anubad WHERE ref_id=? LIMIT 1`,
    values:    [refId],
  });
  const rows = mbRowsOf(result);
  return rows.length ? rows[0].anubad : null;
}

/* ── Pack: delete ────────────────────────────────────────────────── */

async function mbDetachPack(scholarId) {
  const sqlite = mbSqlite();
  if (!sqlite) return;
  const alias  = mbPackDbName(scholarId);
  if (mbAttachedPacks.has(scholarId)) {
    try {
      await sqlite.execute({ database: MB_DB_NAME, statements: `DETACH DATABASE ${alias};` });
    } catch (e) { /* ignore */ }
    mbAttachedPacks.delete(scholarId);
  }
}

async function mbDeletePack(scholarId) {
  await mbDetachPack(scholarId);
  try {
    const fs  = mbFs();
    const dir = mbDir();
    if (!fs || !dir) return;
    await fs.deleteFile({ path: mbPackFileName(scholarId), directory: dir });
  } catch (e) {
    console.log("MB pack already removed");
  }
}

/* ── Search (pack must be downloaded) ───────────────────────────── */

async function mbSearch(scholarId, term, limit = 50) {
  await mbAttachPack(scholarId);
  const alias   = mbPackDbName(scholarId);
  const sqlite  = mbSqlite();
  const escaped = '"' + term.trim().replace(/"/g, '""') + '"';

  try {
    const result = await sqlite.query({
      database:  MB_DB_NAME,
      statement: `SELECT p.ref_id, p.bishoy, a.anubad, d.adhyaya_no
                  FROM ${alias}.mb_search s
                  JOIN ${alias}.mb_anubad a ON a.rowid = s.rowid
                  JOIN bishoys p ON p.ref_id = a.ref_id
                  JOIN adhyayas d ON d.id = p.adhyaya_id
                  WHERE ${alias}.mb_search MATCH ?
                  LIMIT ?`,
      values:    [escaped, limit],
    });
    return mbRowsOf(result);
  } catch (e) {
    // Fallback: LIKE on pack
    const esc    = "%" + term.trim().replace(/[%_]/g, "\\$&") + "%";
    const result = await sqlite.query({
      database:  MB_DB_NAME,
      statement: `SELECT p.ref_id, p.bishoy, a.anubad, d.adhyaya_no
                  FROM ${alias}.mb_anubad a
                  JOIN bishoys p ON p.ref_id = a.ref_id
                  JOIN adhyayas d ON d.id = p.adhyaya_id
                  WHERE a.anubad LIKE ? OR p.bishoy LIKE ?
                  LIMIT ?`,
      values:    [esc, esc, limit],
    });
    return mbRowsOf(result);
  }
}

/* ── Public API ──────────────────────────────────────────────────── */

window.MahabharataDB = {
  initDB: mbInitDB,

  getParvas:            mbGetParvas,
  getParvaById:         mbGetParvaById,

  getScholarsForParva:  mbGetScholarsForParva,

  getAdhyayasForParva:  mbGetAdhyayasForParva,
  getAdhyayaById:       mbGetAdhyayaById,

  getBishoysByAdhyaya:  mbGetBishoysByAdhyaya,
  getBishoyByRef:       mbGetBishoyByRef,
  getAdjacentBishoys:   mbGetAdjacentBishoys,

  isPackDownloaded:     mbIsPackDownloaded,
  downloadPack:         mbDownloadPack,
  getAnubadFromPack:    mbGetAnubadFromPack,
  deletePack:           mbDeletePack,

  search:               mbSearch,
};
