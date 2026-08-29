/**
 * mahabharata.js — মহাভারত (কালীপ্রসন্ন সিংহ অনূদিত) SQLite access layer
 *
 * Architecture:
 *
 *   পর্ব metadata (18 পর্ব names, counts) — static, bundled in this file.
 *   No core DB needed: unlike Veda/Ramayana there is only one অনুবাদক
 *   (কালীপ্রসন্ন সিংহ), so there's nothing to attach/switch between —
 *   each পর্ব is simply downloaded as its own self-contained SQLite pack.
 *
 *   mahabharata_parba_N.db — one per পর্ব, downloaded on demand
 *     table adhyayas    (id, chapter_no, title)
 *     table upakhyanas  (id, adhyay_id, seq, upakhyan_key, bishoy, content)
 *     table upakhyanas_fts (FTS5: bishoy, content)
 *
 * DB repo (public asset repo):
 *   mahabharata_kaliprasanna/mahabharata_parba_1.db.gz … mahabharata_parba_18.db.gz
 *
 * Pack ID range: 301–318 (reserved for মহাভারত per ramayana.js header notes)
 *
 * Hierarchy:
 *   মহাভারত → পর্ব → কালীপ্রসন্ন সিংহ অনূদিত [download gate]
 *           → অধ্যায় তালিকা → অধ্যায় (সব উপাখ্যান, sectioned by বিষয়/টপিক)
 */

const MB_PACK_DIR = "mahabharata_packs";
const MB_ASSET_BASE =
  "https://raw.githubusercontent.com/infinitydattaashim1210958-coder/-------------vx-9f2k-static-cdn-01-d7b3e9f1-xqz7-prod-8f4a2c19d6rs--4j9w/main/mahabharata_kaliprasanna/";

// Static পর্ব metadata — generated from Mahabharat_Kaliprasanna_Singha.xlsx
const MAHABHARATA_PARBAS = [
  { id: 301, parba_no: 1, name: 'আদিপর্ব', pack_file: 'mahabharata_parba_1.db.gz', adhyay_count: 233, upakhyan_count: 321, pack_size_bytes: 1425682 },
  { id: 302, parba_no: 2, name: 'সভাপর্ব', pack_file: 'mahabharata_parba_2.db.gz', adhyay_count: 79, upakhyan_count: 140, pack_size_bytes: 464311 },
  { id: 303, parba_no: 3, name: 'বনপর্ব', pack_file: 'mahabharata_parba_3.db.gz', adhyay_count: 314, upakhyan_count: 560, pack_size_bytes: 2019095 },
  { id: 304, parba_no: 4, name: 'বিরাটপর্ব', pack_file: 'mahabharata_parba_4.db.gz', adhyay_count: 72, upakhyan_count: 105, pack_size_bytes: 382003 },
  { id: 305, parba_no: 5, name: 'উদ্যোগপর্ব', pack_file: 'mahabharata_parba_5.db.gz', adhyay_count: 194, upakhyan_count: 367, pack_size_bytes: 1218896 },
  { id: 306, parba_no: 6, name: 'ভীষ্মপর্ব', pack_file: 'mahabharata_parba_6.db.gz', adhyay_count: 124, upakhyan_count: 264, pack_size_bytes: 900992 },
  { id: 307, parba_no: 7, name: 'দ্রোণপর্ব', pack_file: 'mahabharata_parba_7.db.gz', adhyay_count: 203, upakhyan_count: 416, pack_size_bytes: 1463899 },
  { id: 308, parba_no: 8, name: 'কর্ণপর্ব', pack_file: 'mahabharata_parba_8.db.gz', adhyay_count: 97, upakhyan_count: 208, pack_size_bytes: 795091 },
  { id: 309, parba_no: 9, name: 'শল্যপর্ব', pack_file: 'mahabharata_parba_9.db.gz', adhyay_count: 45, upakhyan_count: 96, pack_size_bytes: 360586 },
  { id: 310, parba_no: 10, name: 'সৌপ্তিকপর্ব', pack_file: 'mahabharata_parba_10.db.gz', adhyay_count: 18, upakhyan_count: 33, pack_size_bytes: 130908 },
  { id: 311, parba_no: 11, name: 'স্ত্রীপর্ব', pack_file: 'mahabharata_parba_11.db.gz', adhyay_count: 27, upakhyan_count: 37, pack_size_bytes: 137168 },
  { id: 312, parba_no: 12, name: 'শান্তিপর্ব', pack_file: 'mahabharata_parba_12.db.gz', adhyay_count: 366, upakhyan_count: 624, pack_size_bytes: 2476325 },
  { id: 313, parba_no: 13, name: 'অনুশাসনপর্ব', pack_file: 'mahabharata_parba_13.db.gz', adhyay_count: 168, upakhyan_count: 332, pack_size_bytes: 1254484 },
  { id: 314, parba_no: 14, name: 'আশ্বমেধিকপর্ব', pack_file: 'mahabharata_parba_14.db.gz', adhyay_count: 92, upakhyan_count: 148, pack_size_bytes: 480184 },
  { id: 315, parba_no: 15, name: 'আশ্রমবাসিকপর্ব', pack_file: 'mahabharata_parba_15.db.gz', adhyay_count: 39, upakhyan_count: 57, pack_size_bytes: 176662 },
  { id: 316, parba_no: 16, name: 'মৌসলপর্ব', pack_file: 'mahabharata_parba_16.db.gz', adhyay_count: 8, upakhyan_count: 27, pack_size_bytes: 60956 },
  { id: 317, parba_no: 17, name: 'মহাপ্রস্থানিকপর্ব', pack_file: 'mahabharata_parba_17.db.gz', adhyay_count: 3, upakhyan_count: 12, pack_size_bytes: 25518 },
  { id: 318, parba_no: 18, name: 'স্বর্গারোহনপর্ব', pack_file: 'mahabharata_parba_18.db.gz', adhyay_count: 6, upakhyan_count: 19, pack_size_bytes: 60040 },
];

const MB_SCHOLAR_NAME = "কালীপ্রসন্ন সিংহ অনূদিত";

function mbParbaById(parbaId) {
  return MAHABHARATA_PARBAS.find(p => p.id === Number(parbaId)) || null;
}

/* ── Capacitor helpers (mb-prefixed to avoid clashing with db.js/lib.js) ── */

function mbSqlite() {
  return window.Capacitor?.Plugins?.CapacitorSQLite || null;
}

function mbFs() {
  const fs =
    window.Capacitor?.Plugins?.Filesystem ||
    window.Capacitor?.Filesystem ||
    window.Filesystem;
  return (fs && typeof fs.writeFile === "function") ? fs : null;
}

function mbDir() {
  const fs = mbFs();
  if (!fs) return "DATA";
  return fs.Directory?.Data || fs.Directory?.DATA || "DATA";
}

function mbRowsOf(result) {
  return (result && result.values) ? result.values : [];
}

function mbDbName(parbaId) {
  return `mb_parba_${parbaId}`;
}

function mbPackFileName(parbaId) {
  return `${MB_PACK_DIR}/mahabharata_parba_${parbaId}.db`;
}

async function mbDecompressGzip(arrayBuffer) {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(ds);
  return await new Response(stream).blob();
}

function mbBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ── Download / delete pack ─────────────────────────────────────────── */

async function mbIsPackDownloaded(parbaId) {
  // Post-Strategy-3: "downloaded" means "merged into the master DB" — see
  // the matching note in db.js's isPackDownloaded.
  try {
    return await window.SwadhyayMasterDB.isMahabharataInstalled(parbaId);
  } catch (e) {
    return false;
  }
}

async function mbDownloadPack(parbaId, onProgress) {
  const parba = mbParbaById(parbaId);
  if (!parba) throw new Error("অজানা পর্ব: " + parbaId);

  if (onProgress) onProgress("ডাউনলোড হচ্ছে…");
  const url = MB_ASSET_BASE + parba.pack_file;
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error("নেটওয়ার্ক সমস্যা: " + err.message);
  }
  if (!response.ok) throw new Error("Download failed HTTP " + response.status);

  const buffer = await response.arrayBuffer();
  if (onProgress) onProgress("আনপ্যাক হচ্ছে…");

  const dbBlob = await mbDecompressGzip(buffer);
  const base64 = await mbBlobToBase64(dbBlob);

  if (onProgress) onProgress("সংরক্ষণ হচ্ছে…");
  const fs = mbFs();
  const dir = mbDir();
  if (!fs || !dir) throw new Error("Filesystem plugin not available");

  await fs.writeFile({
    path: mbPackFileName(parbaId),
    data: base64,
    directory: dir,
    recursive: true,
  });

  if (onProgress) onProgress("একত্রিত হচ্ছে…");

  // Strategy 3 (master database) — merge into swadhyay_master.db and drop
  // the standalone pack file. Reading no longer ATTACHes per-পর্ব files
  // (that's what made an 11th-পর্ব read crash before); see master-db.js.
  const uri = await fs.getUri({ path: mbPackFileName(parbaId), directory: dir });
  const nativePath = uri.uri.startsWith("file://") ? uri.uri.replace("file://", "") : uri.uri;
  await window.SwadhyayMasterDB.mergeMahabharataPack(parbaId, parba.name, nativePath);
  try {
    await fs.deleteFile({ path: mbPackFileName(parbaId), directory: dir });
  } catch (e) { /* non-fatal */ }

  if (onProgress) onProgress("সম্পন্ন!");
  return true;
}

async function mbDeletePack(parbaId) {
  await mbCloseConnection(parbaId);
  try {
    await window.SwadhyayMasterDB.removeMahabharataPack(parbaId);
  } catch (e) {
    console.log("Master DB pack removal:", e.message || e);
  }
  try {
    const fs = mbFs();
    const dir = mbDir();
    if (fs && dir) await fs.deleteFile({ path: mbPackFileName(parbaId), directory: dir });
  } catch (e) { /* already gone */ }
}

/* ── Connection management ─────────────────────────────────────────────
 * IMPORTANT: mahabharata_parba_N.db is downloaded via fetch + Filesystem
 * .writeFile() into an arbitrary app-data path (mahabharata_packs/...).
 * CapacitorSQLite's createConnection()/open() only know how to find
 * files it manages itself (its own default folder + naming convention);
 * they do NOT accept a raw filesystem path. Passing just a `database`
 * name there silently opens/creates a *different*, empty database with
 * that name — which is why "no such table: adhyayas" happened even
 * though the download succeeded.
 *
 * Fix (mirrors ramayana.js's working bhashya-pack pattern): keep a
 * single lightweight "hub" connection open, and ATTACH each downloaded
 * pack file to it via raw SQL, which — unlike createConnection/open —
 * does accept an arbitrary file path. Packs are queried through their
 * attach alias, e.g. `mb_pack_301.adhyayas`.
 * ──────────────────────────────────────────────────────────────────── */

const MB_HUB_DB   = "mb_hub";
const MB_MAX_OPEN = 3;
const mbOpenConns = new Set();   // parbaIds currently ATTACHed
const mbOpenOrder = [];

let _mbHubReady = false;

function mbAlias(parbaId) { return `mb_pack_${parbaId}`; }

async function mbEnsureHub() {
  if (_mbHubReady) return;
  const sqlite = mbSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");

  try {
    await sqlite.createConnection({
      database: MB_HUB_DB, encrypted: false,
      mode: "no-encryption", version: 1, readonly: false,
    });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  try {
    await sqlite.open({ database: MB_HUB_DB });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  _mbHubReady = true;
}

function mbMarkUsed(parbaId) {
  const idx = mbOpenOrder.indexOf(parbaId);
  if (idx !== -1) mbOpenOrder.splice(idx, 1);
  mbOpenOrder.push(parbaId);
}

// Same fix as db.js/ramayana.js: DETACH reliably fails right after a
// SELECT against that pack (SQLite refuses to detach a database an open
// transaction has touched), so reset the transaction state and retry
// before giving up. Untracking on an unconfirmed DETACH (the previous
// bug here) let real attachments creep past SQLite's hard 10-per-
// connection ceiling while mbOpenConns.size looked capped at 3.
async function mbForceDetach(sqlite, alias) {
  try {
    await sqlite.execute({ database: MB_HUB_DB, statements: `DETACH DATABASE ${alias};` });
    return true;
  } catch (e1) {
    try { await sqlite.execute({ database: MB_HUB_DB, statements: `COMMIT;` }); } catch (e2) { /* fine */ }
    try { await sqlite.execute({ database: MB_HUB_DB, statements: `ROLLBACK;` }); } catch (e3) { /* fine */ }
    try {
      await sqlite.execute({ database: MB_HUB_DB, statements: `DETACH DATABASE ${alias};` });
      return true;
    } catch (e4) {
      console.warn("Mahabharata pack DETACH still failing after reset:", alias, e4.message || e4);
      return false;
    }
  }
}

async function mbCloseConnection(parbaId) {
  const sqlite = mbSqlite();
  if (!sqlite) return;
  if (!mbOpenConns.has(parbaId)) return;
  const detached = await mbForceDetach(sqlite, mbAlias(parbaId));
  if (detached) {
    mbOpenConns.delete(parbaId);
    const idx = mbOpenOrder.indexOf(parbaId);
    if (idx !== -1) mbOpenOrder.splice(idx, 1);
  } else {
    console.warn("mbCloseConnection: still attached after retry, keeping tracked:", parbaId);
  }
}

async function mbEvictIfNeeded() {
  if (mbOpenConns.size < MB_MAX_OPEN) return;
  const oldest = mbOpenOrder.shift();
  if (oldest == null) return;
  const sqlite = mbSqlite();
  if (!sqlite) return;
  const detached = await mbForceDetach(sqlite, mbAlias(oldest));
  if (detached) {
    mbOpenConns.delete(oldest);
  } else {
    mbOpenOrder.unshift(oldest); // retry it next time, it's still really attached
  }
}

const mbEverAttachedAliases = new Set();

async function mbEnsureOpen(parbaId) {
  await mbEnsureHub();

  if (mbOpenConns.has(parbaId)) {
    mbMarkUsed(parbaId);
    return;
  }

  if (!(await mbIsPackDownloaded(parbaId))) {
    const err = new Error("এই পর্ব ডাউনলোড করা হয়নি।");
    err.needsDownload = true;
    throw err;
  }

  await mbEvictIfNeeded();

  const fs  = mbFs();
  const dir = mbDir();
  const uri = await fs.getUri({ path: mbPackFileName(parbaId), directory: dir });
  let dbPath = uri.uri;
  if (dbPath.startsWith("file://")) dbPath = dbPath.replace("file://", "");

  const sqlite = mbSqlite();
  const alias  = mbAlias(parbaId);

  try {
    await sqlite.execute({ database: MB_HUB_DB, statements: `DETACH DATABASE ${alias};` });
  } catch (e) { /* not attached yet, fine */ }

  const doAttach = () => sqlite.execute({ database: MB_HUB_DB, statements: `ATTACH DATABASE '${dbPath}' AS ${alias};` });

  try {
    await doAttach();
  } catch (e) {
    const msg = (e?.message || String(e));
    if (msg.includes("already in use")) {
      // fine
    } else if (msg.toLowerCase().includes("too many attached databases")) {
      // Tracking believed there was room; reality disagreed (most likely
      // an earlier eviction whose DETACH silently failed before this
      // fix). Nuclear reset, then retry once.
      for (const a of mbEverAttachedAliases) {
        await mbForceDetach(sqlite, a);
      }
      mbOpenConns.clear();
      mbOpenOrder.length = 0;
      await doAttach();
    } else {
      throw e;
    }
  }

  mbEverAttachedAliases.add(alias);
  mbOpenConns.add(parbaId);
  mbMarkUsed(parbaId);
}

async function mbQuery(parbaId, sql, params = []) {
  await mbEnsureOpen(parbaId);
  const sqlite = mbSqlite();
  const result = await sqlite.query({ database: MB_HUB_DB, statement: sql, values: params });
  return mbRowsOf(result);
}

/* ── Content queries ────────────────────────────────────────────────────
 * Strategy 3: no ATTACH, no hub connection, no per-পর্ব eviction — every
 * পর্ব's data already lives in swadhyay_master.db (merged at download
 * time). This is what makes it possible to read all 18 পর্ব back-to-back
 * without ever approaching SQLite's attached-database ceiling.
 * The mbEnsureHub/mbEvictIfNeeded/mbQuery machinery above is left in
 * place but is no longer called from here — nothing else in the app
 * calls it either, so it's inert. Safe to delete in a later cleanup pass
 * once you're confident nothing external depends on it.
 * ──────────────────────────────────────────────────────────────────── */

async function mbGetAdhyayasForParba(parbaId) {
  return window.SwadhyayMasterDB.getMahabharataAdhyayas(parbaId);
}

async function mbGetAdhyayById(parbaId, adhyayId) {
  return window.SwadhyayMasterDB.getMahabharataAdhyay(parbaId, adhyayId);
}

async function mbGetUpakhyanasForAdhyay(parbaId, adhyayId) {
  return window.SwadhyayMasterDB.getMahabharataUpakhyanas(parbaId, adhyayId);
}

async function mbGetAdjacentAdhyayas(parbaId, adhyayId) {
  return window.SwadhyayMasterDB.getMahabharataAdjacentAdhyayas(parbaId, adhyayId);
}

/* ── Search (within one downloaded পর্ব) ─────────────────────────────── */

async function mbSearchInParba(parbaId, term, limit = 50) {
  return window.SwadhyayMasterDB.searchMahabharataParva(parbaId, term, limit);
}

/* ── Public API ─────────────────────────────────────────────────────── */

window.MahabharataDB = {
  PARBAS: MAHABHARATA_PARBAS,
  SCHOLAR_NAME: MB_SCHOLAR_NAME,
  getParbaById: mbParbaById,

  isPackDownloaded: mbIsPackDownloaded,
  downloadPack: mbDownloadPack,
  deletePack: mbDeletePack,

  getAdhyayasForParba: mbGetAdhyayasForParba,
  getAdhyayById: mbGetAdhyayById,
  getUpakhyanasForAdhyay: mbGetUpakhyanasForAdhyay,
  getAdjacentAdhyayas: mbGetAdjacentAdhyayas,

  searchInParba: mbSearchInParba,
};
