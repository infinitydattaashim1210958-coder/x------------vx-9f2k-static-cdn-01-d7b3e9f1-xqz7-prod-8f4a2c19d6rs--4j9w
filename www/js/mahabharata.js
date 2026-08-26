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
  try {
    const fs = mbFs();
    const dir = mbDir();
    if (!fs || !dir) return false;
    await fs.stat({ path: mbPackFileName(parbaId), directory: dir });
    return true;
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

  if (onProgress) onProgress("সম্পন্ন!");
  return true;
}

async function mbDeletePack(parbaId) {
  await mbCloseConnection(parbaId);
  try {
    const fs = mbFs();
    const dir = mbDir();
    if (fs && dir) await fs.deleteFile({ path: mbPackFileName(parbaId), directory: dir });
  } catch (e) { /* already gone */ }
}

/* ── Connection management (LRU — max 3 open পর্ব packs at once) ─────── */

const MB_MAX_OPEN = 3;
const mbOpenConns = new Set();
const mbOpenOrder = [];

function mbMarkUsed(parbaId) {
  const idx = mbOpenOrder.indexOf(parbaId);
  if (idx !== -1) mbOpenOrder.splice(idx, 1);
  mbOpenOrder.push(parbaId);
}

async function mbCloseConnection(parbaId) {
  const sqlite = mbSqlite();
  if (!sqlite) return;
  if (!mbOpenConns.has(parbaId)) return;
  try {
    await sqlite.close({ database: mbDbName(parbaId) });
  } catch (e) { /* ignore */ }
  mbOpenConns.delete(parbaId);
  const idx = mbOpenOrder.indexOf(parbaId);
  if (idx !== -1) mbOpenOrder.splice(idx, 1);
}

async function mbEvictIfNeeded() {
  if (mbOpenConns.size < MB_MAX_OPEN) return;
  const oldest = mbOpenOrder.shift();
  if (oldest == null) return;
  mbOpenConns.delete(oldest);
  const sqlite = mbSqlite();
  if (!sqlite) return;
  try { await sqlite.close({ database: mbDbName(oldest) }); } catch (e) { /* already gone */ }
}

async function mbEnsureOpen(parbaId) {
  const sqlite = mbSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");

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

  const fs = mbFs();
  const dir = mbDir();
  const uri = await fs.getUri({ path: mbPackFileName(parbaId), directory: dir });
  let dbPath = uri.uri;
  if (dbPath.startsWith("file://")) dbPath = dbPath.replace("file://", "");

  const dbName = mbDbName(parbaId);

  try {
    await sqlite.createConnection({
      database: dbName, encrypted: false,
      mode: "no-encryption", version: 1, readonly: false,
    });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  try {
    await sqlite.open({ database: dbName });
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  mbOpenConns.add(parbaId);
  mbMarkUsed(parbaId);
}

async function mbQuery(parbaId, sql, params = []) {
  await mbEnsureOpen(parbaId);
  const sqlite = mbSqlite();
  const result = await sqlite.query({ database: mbDbName(parbaId), statement: sql, values: params });
  return mbRowsOf(result);
}

/* ── Content queries ───────────────────────────────────────────────── */

async function mbGetAdhyayasForParba(parbaId) {
  return mbQuery(parbaId, "SELECT * FROM adhyayas ORDER BY chapter_no");
}

async function mbGetAdhyayById(parbaId, adhyayId) {
  const rows = await mbQuery(parbaId, "SELECT * FROM adhyayas WHERE id=?", [adhyayId]);
  return rows[0] || null;
}

async function mbGetUpakhyanasForAdhyay(parbaId, adhyayId) {
  return mbQuery(parbaId, "SELECT * FROM upakhyanas WHERE adhyay_id=? ORDER BY seq", [adhyayId]);
}

async function mbGetAdjacentAdhyayas(parbaId, adhyayId) {
  const prev = await mbQuery(parbaId, "SELECT id FROM adhyayas WHERE id<? ORDER BY id DESC LIMIT 1", [adhyayId]);
  const next = await mbQuery(parbaId, "SELECT id FROM adhyayas WHERE id>? ORDER BY id ASC LIMIT 1", [adhyayId]);
  return {
    prev: prev.length ? prev[0].id : null,
    next: next.length ? next[0].id : null,
  };
}

/* ── Search (within one downloaded পর্ব) ─────────────────────────────── */

async function mbSearchInParba(parbaId, term, limit = 50) {
  const escaped = '"' + term.trim().replace(/"/g, '""') + '"';
  try {
    return mbQuery(
      parbaId,
      `SELECT u.id, u.adhyay_id, u.bishoy, a.title AS adhyay_title
       FROM upakhyanas_fts f
       JOIN upakhyanas u ON u.id = f.rowid
       JOIN adhyayas a ON a.id = u.adhyay_id
       WHERE upakhyanas_fts MATCH ?
       LIMIT ?`,
      [escaped, limit]
    );
  } catch (e) {
    const esc = "%" + term.trim().replace(/[%_]/g, "\\$&") + "%";
    return mbQuery(
      parbaId,
      `SELECT u.id, u.adhyay_id, u.bishoy, a.title AS adhyay_title
       FROM upakhyanas u JOIN adhyayas a ON a.id = u.adhyay_id
       WHERE u.content LIKE ? OR u.bishoy LIKE ? LIMIT ?`,
      [esc, esc, limit]
    );
  }
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
