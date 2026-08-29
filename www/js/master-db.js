/**
 * master-db.js — Swadhyay Master Database (Strategy 3)
 *
 * Replaces the "one SQLite file per bhāṣya pack / parva, ATTACHed on
 * demand" architecture with a single always-open master database
 * (swadhyay_master.db). Downloaded packs are merged into it once via
 * a short-lived ATTACH → INSERT SELECT → DETACH pipeline, then the
 * original pack file is deleted. Reads never ATTACH anything, so the
 * "too many attached databases - max 10" ceiling can no longer be hit
 * by this content path — the merge step attaches at most ONE extra
 * file at a time, and only while merging.
 *
 * Content types merged here:
 *   1. Veda scholar bhāṣya packs   (db.js         → getBhashyaForMantraFromPack)
 *   2. Ramayana kanda bhāṣya packs (ramayana.js    → ramGetBhashyaForShloka)
 *   3. Mahabharata parva packs     (mahabharata.js → mbGetAdhyayasForParba etc.)
 *
 * NOT migrated: db.js's getScholarsForShloka / getBhashyaForShlokaFromPack
 * (the ramayana_scholars / ramayana_bhashya_presence path). app.js has a
 * comment confirming that path's core.db tables are unpopulated and it is
 * not called anywhere — it looks like an earlier, superseded attempt at
 * Ramayana bhāṣya support that ramayana.js's kanda-pack system replaced.
 * Left untouched rather than migrated on guesswork; safe to delete later
 * once you've confirmed nothing depends on it.
 */

const MASTER_DB_NAME = "swadhyay_master";

let _masterReady = false;
let _masterInitPromise = null;

function msSqlite() {
  return window.Capacitor?.Plugins?.CapacitorSQLite || null;
}

function msRowsOf(result) {
  return (result && result.values) ? result.values : [];
}

async function msExec(statements) {
  const sqlite = msSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");
  await sqlite.execute({ database: MASTER_DB_NAME, statements });
}

async function msQuery(sql, params = []) {
  const sqlite = msSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite not available");
  const result = await sqlite.query({ database: MASTER_DB_NAME, statement: sql, values: params });
  return msRowsOf(result);
}

/* ── Init: connection + schema + WAL ─────────────────────────────────── */

async function initializeMasterDatabase() {
  if (_masterReady) return;
  if (_masterInitPromise) return _masterInitPromise;

  _masterInitPromise = (async () => {
    const sqlite = msSqlite();
    if (!sqlite) throw new Error("CapacitorSQLite not available");

    try {
      await sqlite.createConnection({
        database: MASTER_DB_NAME, encrypted: false,
        mode: "no-encryption", version: 1, readonly: false,
      });
    } catch (e) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (!msg.includes("already") && !msg.includes("exist")) throw e;
    }

    try {
      await sqlite.open({ database: MASTER_DB_NAME });
    } catch (e) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (!msg.includes("already") && !msg.includes("exist")) throw e;
    }

    // High-concurrency read/write mode — see blueprint blind spot #4
    // (abrupt termination during ingest must not corrupt the DB).
    //
    // All three of these go through msQuery(), not msExec(). msExec()
    // wraps its statements in an implicit BEGIN/COMMIT (that's why
    // journal_mode=WAL threw "Safety level may not be changed inside a
    // transaction" once synchronous ran right after it via execute()).
    // SQLite forbids changing synchronous/journal_mode inside a
    // transaction outright, and silently no-ops foreign_keys inside one
    // — so foreign_keys=ON was never actually taking effect either.
    // msQuery() issues a bare statement with no implicit transaction,
    // which is what all three of these require.
    await msQuery("PRAGMA journal_mode=WAL;");
    await msQuery("PRAGMA synchronous=NORMAL;");
    await msQuery("PRAGMA foreign_keys=ON;");

    await msExec(`
      CREATE TABLE IF NOT EXISTS installed_packages (
        package_id   TEXT PRIMARY KEY,
        category     TEXT NOT NULL,     -- 'veda' | 'ramayana_kanda' | 'mahabharata'
        source_id    INTEGER NOT NULL,  -- scholarId / kandaPackId / parbaId
        title        TEXT,
        version      INTEGER DEFAULT 1,
        installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 1. Veda bhāṣya (mantra_id keyed, per scholar)
    await msExec(`
      CREATE TABLE IF NOT EXISTS veda_bhashya_contents (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        scholar_id INTEGER NOT NULL,
        mantra_id  INTEGER NOT NULL,
        field_key  TEXT NOT NULL,
        value      TEXT NOT NULL,
        UNIQUE(scholar_id, mantra_id, field_key)
      );
    `);
    await msExec(`CREATE INDEX IF NOT EXISTS idx_veda_bhashya_lookup ON veda_bhashya_contents(scholar_id, mantra_id);`);

    // 2. Ramayana kanda bhāṣya (shloka_id keyed, per kanda pack)
    await msExec(`
      CREATE TABLE IF NOT EXISTS ramayana_kanda_bhashya_contents (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        scholar_id INTEGER NOT NULL,   -- RAM_KANDA_PACKS id (501-506)
        shloka_id  INTEGER NOT NULL,
        field_key  TEXT NOT NULL,
        value      TEXT NOT NULL,
        UNIQUE(scholar_id, shloka_id, field_key)
      );
    `);
    await msExec(`CREATE INDEX IF NOT EXISTS idx_ram_bhashya_lookup ON ramayana_kanda_bhashya_contents(scholar_id, shloka_id);`);
    // External-content FTS5 over the value column, kept in sync by triggers
    // so search stays live across merges without a manual rebuild step.
    await msExec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ramayana_kanda_bhashya_fts USING fts5(
        value, content='ramayana_kanda_bhashya_contents', content_rowid='id'
      );
    `);
    await msExec(`
      CREATE TRIGGER IF NOT EXISTS trg_ram_bhashya_ai AFTER INSERT ON ramayana_kanda_bhashya_contents BEGIN
        INSERT INTO ramayana_kanda_bhashya_fts(rowid, value) VALUES (new.id, new.value);
      END;
    `);
    await msExec(`
      CREATE TRIGGER IF NOT EXISTS trg_ram_bhashya_ad AFTER DELETE ON ramayana_kanda_bhashya_contents BEGIN
        INSERT INTO ramayana_kanda_bhashya_fts(ramayana_kanda_bhashya_fts, rowid, value) VALUES('delete', old.id, old.value);
      END;
    `);

    // 3. Mahabharata parva content (composite-keyed by parba_id since
    //    adhyaya/upakhyan ids are only unique within a single parva pack)
    await msExec(`
      CREATE TABLE IF NOT EXISTS mahabharata_adhyayas (
        parba_id   INTEGER NOT NULL,
        id         INTEGER NOT NULL,
        chapter_no INTEGER,
        title      TEXT,
        PRIMARY KEY (parba_id, id)
      );
    `);
    await msExec(`
      CREATE TABLE IF NOT EXISTS mahabharata_upakhyanas (
        parba_id     INTEGER NOT NULL,
        id           INTEGER NOT NULL,
        adhyay_id    INTEGER NOT NULL,
        seq          INTEGER,
        upakhyan_key TEXT,
        bishoy       TEXT,
        content      TEXT,
        PRIMARY KEY (parba_id, id)
      );
    `);
    await msExec(`CREATE INDEX IF NOT EXISTS idx_mb_upakhyan_adhyay ON mahabharata_upakhyanas(parba_id, adhyay_id);`);
    // Standalone (non-external-content) FTS5: mahabharata_upakhyanas has a
    // composite PK, so it can't back an external-content FTS table via a
    // single rowid. Duplicating bishoy/content here is a few hundred KB at
    // most and avoids that mismatch entirely.
    await msExec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS mahabharata_upakhyanas_fts USING fts5(
        bishoy, content,
        parba_id UNINDEXED, upakhyan_id UNINDEXED, adhyay_id UNINDEXED
      );
    `);

    _masterReady = true;
  })();

  return _masterInitPromise;
}

/* ── Shared merge helper: ATTACH one temp file, run fn, DETACH ──────────
 * Only ever one extra database attached to this connection at a time,
 * and only for the duration of a single merge — this is what keeps the
 * "max 10 attached" ceiling out of reach regardless of how many packs
 * a user has installed over the app's lifetime.
 */
let _mergeQueue = Promise.resolve();
function withMergeLock(fn) {
  // FIX: was .then(fn, fn) — passing fn as the rejection handler caused the
  // next merge to start before the previous one's finally (DETACH) completed
  // whenever a merge errored, leaving merge_src still attached and producing
  // "already in use" on the next ATTACH. .then(fn) ensures fn only runs after
  // the previous promise fully settles (including its finally block).
  const run = _mergeQueue.then(fn);
  _mergeQueue = run.then(() => {}, () => {});
  return run;
}

// Same fix as mbForceDetach in mahabharata.js / db.js / ramayana.js:
// DETACH fails outright if an open transaction has touched this alias,
// so a plain single-shot DETACH can't clear a stuck attachment left by
// a previous merge that errored out mid-transaction. Reset whatever
// transaction state is stuck, then retry once before giving up.
async function forceDetachMergeSrc(sqlite, alias) {
  try {
    await sqlite.execute({ database: MASTER_DB_NAME, statements: `DETACH DATABASE ${alias};` });
    return true;
  } catch (e1) {
    try { await sqlite.execute({ database: MASTER_DB_NAME, statements: `COMMIT;` }); } catch (e2) { /* fine */ }
    try { await sqlite.execute({ database: MASTER_DB_NAME, statements: `ROLLBACK;` }); } catch (e3) { /* fine */ }
    try {
      await sqlite.execute({ database: MASTER_DB_NAME, statements: `DETACH DATABASE ${alias};` });
      return true;
    } catch (e4) {
      console.warn("master-db: DETACH merge_src still failing after reset:", e4.message || e4);
      return false;
    }
  }
}

async function withAttachedSource(dbPath, fn) {
  const sqlite = msSqlite();
  const alias = "merge_src";

  await forceDetachMergeSrc(sqlite, alias);

  const doAttach = () => sqlite.execute({ database: MASTER_DB_NAME, statements: `ATTACH DATABASE '${dbPath}' AS ${alias};` });

  try {
    await doAttach();
  } catch (e) {
    const msg = (e?.message || String(e));
    if (!msg.includes("already in use")) throw e;
    // Stuck attached from a previous run that the reset above couldn't
    // clear (e.g. an open read touching it right now). One more forced
    // reset-and-retry before giving up for good.
    const cleared = await forceDetachMergeSrc(sqlite, alias);
    if (!cleared) throw e;
    await doAttach();
  }

  // No manual BEGIN TRANSACTION here: execute() already wraps whatever
  // statement it's given in its own atomic call, and issuing a literal
  // "BEGIN TRANSACTION;" while none is open makes execute() try to
  // nest a transaction inside the one it auto-opens for that call —
  // "cannot start a transaction within a transaction". fn(alias) runs
  // its DELETE-then-INSERT as separate execute() calls, each already
  // atomic on its own; the merge is idempotent (safe to re-run from
  // scratch), so cross-statement atomicity here was never required.
  try {
    await fn(alias);
  } finally {
    const detached = await forceDetachMergeSrc(sqlite, alias);
    if (!detached) {
      console.warn("master-db: DETACH merge_src failed (will be retried on next merge attempt)");
    }
  }
}

function resolveNativePath(uri) {
  let p = uri;
  if (p.startsWith("file://")) p = p.replace("file://", "");
  return p;
}

async function getTempFileNativePath(fsPluginRef, path, directory) {
  const uri = await fsPluginRef.getUri({ path, directory });
  return resolveNativePath(uri.uri);
}

async function upsertInstalledPackage(packageId, category, sourceId, title) {
  const sqlite = msSqlite();
  await sqlite.execute({
    database: MASTER_DB_NAME,
    statements: `
      INSERT INTO installed_packages (package_id, category, source_id, title)
      VALUES ('${packageId}', '${category}', ${Number(sourceId)}, ${title ? `'${String(title).replace(/'/g, "''")}'` : "NULL"})
      ON CONFLICT(package_id) DO UPDATE SET title=excluded.title, version=version+1;
    `,
  });
}

/* ── 1. Veda scholar bhāṣya packs ────────────────────────────────────── */

async function mergeVedaPack(scholarId, title, tempDbPath) {
  await initializeMasterDatabase();
  return withMergeLock(async () => {
    const packageId = `veda_${scholarId}`;
    await withAttachedSource(tempDbPath, async (alias) => {
      const sqlite = msSqlite();
      // Idempotent: safe to re-merge the same pack (e.g. re-download after
      // a partial/interrupted previous merge) without duplicate rows.
      await sqlite.execute({ database: MASTER_DB_NAME, statements: `DELETE FROM veda_bhashya_contents WHERE scholar_id=${Number(scholarId)};` });
      await sqlite.execute({
        database: MASTER_DB_NAME,
        statements: `INSERT INTO veda_bhashya_contents (scholar_id, mantra_id, field_key, value)
                     SELECT ${Number(scholarId)}, mantra_id, field_key, value FROM ${alias}.bhashyas;`,
      });
    });
    await upsertInstalledPackage(packageId, "veda", scholarId, title);
    return true;
  });
}

async function isVedaInstalled(scholarId) {
  await initializeMasterDatabase();
  const rows = await msQuery(`SELECT 1 FROM installed_packages WHERE package_id=?`, [`veda_${scholarId}`]);
  return rows.length > 0;
}

async function getVedaBhashya(scholarId, mantraId) {
  await initializeMasterDatabase();
  return msQuery(
    `SELECT field_key, value FROM veda_bhashya_contents WHERE scholar_id=? AND mantra_id=?`,
    [scholarId, mantraId]
  );
}

async function removeVedaPack(scholarId) {
  await initializeMasterDatabase();
  await msExec(`DELETE FROM veda_bhashya_contents WHERE scholar_id=${Number(scholarId)};`);
  await msExec(`DELETE FROM installed_packages WHERE package_id='veda_${Number(scholarId)}';`);
}

/* ── 2. Ramayana kanda bhāṣya packs ──────────────────────────────────── */

async function mergeRamayanaKandaPack(packId, title, tempDbPath) {
  await initializeMasterDatabase();
  return withMergeLock(async () => {
    const packageId = `ram_kanda_${packId}`;
    await withAttachedSource(tempDbPath, async (alias) => {
      const sqlite = msSqlite();
      await sqlite.execute({ database: MASTER_DB_NAME, statements: `DELETE FROM ramayana_kanda_bhashya_contents WHERE scholar_id=${Number(packId)};` });
      await sqlite.execute({
        database: MASTER_DB_NAME,
        statements: `INSERT INTO ramayana_kanda_bhashya_contents (scholar_id, shloka_id, field_key, value)
                     SELECT ${Number(packId)}, shloka_id, field_key, value FROM ${alias}.ramayana_bhashyas;`,
      });
    });
    await upsertInstalledPackage(packageId, "ramayana_kanda", packId, title);
    return true;
  });
}

async function isRamayanaKandaInstalled(packId) {
  await initializeMasterDatabase();
  const rows = await msQuery(`SELECT 1 FROM installed_packages WHERE package_id=?`, [`ram_kanda_${packId}`]);
  return rows.length > 0;
}

async function getRamayanaKandaBhashya(packId, shlokaId) {
  await initializeMasterDatabase();
  return msQuery(
    `SELECT field_key, value FROM ramayana_kanda_bhashya_contents WHERE scholar_id=? AND shloka_id=? ORDER BY id`,
    [packId, shlokaId]
  );
}

async function searchRamayanaKandaBhashya(packId, term, limit = 50) {
  await initializeMasterDatabase();
  const escaped = '"' + term.trim().replace(/"/g, '""') + '"';
  try {
    return await msQuery(
      `SELECT b.shloka_id, b.field_key, b.value
       FROM ramayana_kanda_bhashya_fts f
       JOIN ramayana_kanda_bhashya_contents b ON b.id = f.rowid
       WHERE b.scholar_id = ? AND ramayana_kanda_bhashya_fts MATCH ?
       LIMIT ?`,
      [packId, escaped, limit]
    );
  } catch (e) {
    const esc = "%" + term.trim().replace(/[%_]/g, "\\$&") + "%";
    return msQuery(
      `SELECT shloka_id, field_key, value FROM ramayana_kanda_bhashya_contents
       WHERE scholar_id=? AND value LIKE ? LIMIT ?`,
      [packId, esc, limit]
    );
  }
}

async function removeRamayanaKandaPack(packId) {
  await initializeMasterDatabase();
  await msExec(`DELETE FROM ramayana_kanda_bhashya_contents WHERE scholar_id=${Number(packId)};`);
  await msExec(`DELETE FROM installed_packages WHERE package_id='ram_kanda_${Number(packId)}';`);
}

/* ── 3. Mahabharata parva packs ──────────────────────────────────────── */

async function mergeMahabharataPack(parbaId, title, tempDbPath) {
  await initializeMasterDatabase();
  return withMergeLock(async () => {
    const packageId = `mb_${parbaId}`;
    await withAttachedSource(tempDbPath, async (alias) => {
      const sqlite = msSqlite();
      await sqlite.execute({ database: MASTER_DB_NAME, statements: `DELETE FROM mahabharata_upakhyanas WHERE parba_id=${Number(parbaId)};` });
      await sqlite.execute({ database: MASTER_DB_NAME, statements: `DELETE FROM mahabharata_adhyayas WHERE parba_id=${Number(parbaId)};` });
      await sqlite.execute({ database: MASTER_DB_NAME, statements: `DELETE FROM mahabharata_upakhyanas_fts WHERE parba_id=${Number(parbaId)};` });

      await sqlite.execute({
        database: MASTER_DB_NAME,
        statements: `INSERT INTO mahabharata_adhyayas (parba_id, id, chapter_no, title)
                     SELECT ${Number(parbaId)}, id, chapter_no, title FROM ${alias}.adhyayas;`,
      });
      await sqlite.execute({
        database: MASTER_DB_NAME,
        statements: `INSERT INTO mahabharata_upakhyanas (parba_id, id, adhyay_id, seq, upakhyan_key, bishoy, content)
                     SELECT ${Number(parbaId)}, id, adhyay_id, seq, upakhyan_key, bishoy, content FROM ${alias}.upakhyanas;`,
      });
      await sqlite.execute({
        database: MASTER_DB_NAME,
        statements: `INSERT INTO mahabharata_upakhyanas_fts (parba_id, upakhyan_id, adhyay_id, bishoy, content)
                     SELECT ${Number(parbaId)}, id, adhyay_id, bishoy, content FROM ${alias}.upakhyanas;`,
      });
    });
    await upsertInstalledPackage(packageId, "mahabharata", parbaId, title);
    return true;
  });
}

async function isMahabharataInstalled(parbaId) {
  await initializeMasterDatabase();
  const rows = await msQuery(`SELECT 1 FROM installed_packages WHERE package_id=?`, [`mb_${parbaId}`]);
  return rows.length > 0;
}

async function getMahabharataAdhyayas(parbaId) {
  await initializeMasterDatabase();
  return msQuery(`SELECT id, chapter_no, title FROM mahabharata_adhyayas WHERE parba_id=? ORDER BY chapter_no`, [parbaId]);
}

async function getMahabharataAdhyay(parbaId, adhyayId) {
  await initializeMasterDatabase();
  const rows = await msQuery(`SELECT id, chapter_no, title FROM mahabharata_adhyayas WHERE parba_id=? AND id=?`, [parbaId, adhyayId]);
  return rows[0] || null;
}

async function getMahabharataUpakhyanas(parbaId, adhyayId) {
  await initializeMasterDatabase();
  return msQuery(
    `SELECT id, adhyay_id, seq, upakhyan_key, bishoy, content FROM mahabharata_upakhyanas WHERE parba_id=? AND adhyay_id=? ORDER BY seq`,
    [parbaId, adhyayId]
  );
}

async function getMahabharataAdjacentAdhyayas(parbaId, adhyayId) {
  await initializeMasterDatabase();
  const prev = await msQuery(`SELECT id FROM mahabharata_adhyayas WHERE parba_id=? AND id<? ORDER BY id DESC LIMIT 1`, [parbaId, adhyayId]);
  const next = await msQuery(`SELECT id FROM mahabharata_adhyayas WHERE parba_id=? AND id>? ORDER BY id ASC LIMIT 1`, [parbaId, adhyayId]);
  return {
    prev: prev.length ? prev[0].id : null,
    next: next.length ? next[0].id : null,
  };
}

async function searchMahabharataParva(parbaId, term, limit = 50) {
  await initializeMasterDatabase();
  const escaped = '"' + term.trim().replace(/"/g, '""') + '"';
  try {
    return await msQuery(
      `SELECT f.upakhyan_id AS id, f.adhyay_id, f.bishoy, a.title AS adhyay_title
       FROM mahabharata_upakhyanas_fts f
       JOIN mahabharata_adhyayas a ON a.parba_id = f.parba_id AND a.id = f.adhyay_id
       WHERE f.parba_id = ? AND mahabharata_upakhyanas_fts MATCH ?
       LIMIT ?`,
      [parbaId, escaped, limit]
    );
  } catch (e) {
    const esc = "%" + term.trim().replace(/[%_]/g, "\\$&") + "%";
    return msQuery(
      `SELECT u.id, u.adhyay_id, u.bishoy, a.title AS adhyay_title
       FROM mahabharata_upakhyanas u JOIN mahabharata_adhyayas a ON a.parba_id=u.parba_id AND a.id = u.adhyay_id
       WHERE u.parba_id=? AND (u.content LIKE ? OR u.bishoy LIKE ?) LIMIT ?`,
      [parbaId, esc, esc, limit]
    );
  }
}

async function removeMahabharataPack(parbaId) {
  await initializeMasterDatabase();
  await msExec(`DELETE FROM mahabharata_upakhyanas WHERE parba_id=${Number(parbaId)};`);
  await msExec(`DELETE FROM mahabharata_adhyayas WHERE parba_id=${Number(parbaId)};`);
  await msExec(`DELETE FROM mahabharata_upakhyanas_fts WHERE parba_id=${Number(parbaId)};`);
  await msExec(`DELETE FROM installed_packages WHERE package_id='mb_${Number(parbaId)}';`);
}

/* ── One-time legacy migration ───────────────────────────────────────
 * For installs updating from the old per-file ATTACH architecture:
 * any pack file still sitting on disk that ISN'T yet in
 * installed_packages gets merged in, then deleted. Safe to call on
 * every boot — it's a no-op once everything's migrated (each check is
 * a single isDownloaded + isInstalled comparison).
 *
 * Reads scholar/pack lists lazily from window.VedaDB / window.RamayanaDB
 * / window.MahabharataDB so load order doesn't matter — this only runs
 * after boot(), once all three are guaranteed to be attached to window.
 */
async function migrateAllLegacyPacks(onProgress) {
  await initializeMasterDatabase();
  const report = { veda: 0, ramayanaKanda: 0, mahabharata: 0, failed: [] };

  // Veda scholar packs — enumerate every scholar across every veda.
  try {
    const vedas = await window.VedaDB.getVedas();
    for (const veda of vedas) {
      const scholars = await window.VedaDB.getScholarsForVeda(veda.id);
      for (const scholar of scholars) {
        try {
          if (scholar.downloaded && !(await isVedaInstalled(scholar.id))) {
            if (onProgress) onProgress(`মাইগ্রেট হচ্ছে: ${scholar.name || scholar.id}`);
            const migrated = await migrateOneLegacyFile(
              "veda", scholar.id, scholar.name,
              `bhashya_packs/scholar_${scholar.id}.db`,
              (p) => mergeVedaPack(scholar.id, scholar.name, p)
            );
            if (migrated) report.veda++;
          }
        } catch (err) {
          report.failed.push({ category: "veda", id: scholar.id, error: err.message || String(err) });
        }
      }
    }
  } catch (err) {
    console.warn("master-db: veda legacy scan skipped:", err.message || err);
  }

  // Ramayana kanda bhāṣya packs — static list on RamayanaDB.
  try {
    for (const pack of (window.RamayanaDB?.KANDA_PACKS || [])) {
      try {
        const downloaded = await window.RamayanaDB.isPackDownloaded(pack.id);
        if (downloaded && !(await isRamayanaKandaInstalled(pack.id))) {
          if (onProgress) onProgress(`মাইগ্রেট হচ্ছে: ${pack.name}`);
          const migrated = await migrateOneLegacyFile(
            "ramayana_kanda", pack.id, pack.name,
            `ramayana_packs/ramayana_kanda_${pack.id - 500}.db`,
            (p) => mergeRamayanaKandaPack(pack.id, pack.name, p)
          );
          if (migrated) report.ramayanaKanda++;
        }
      } catch (err) {
        report.failed.push({ category: "ramayana_kanda", id: pack.id, error: err.message || String(err) });
      }
    }
  } catch (err) {
    console.warn("master-db: ramayana legacy scan skipped:", err.message || err);
  }

  // Mahabharata parva packs — static list on MahabharataDB.
  try {
    for (const parba of (window.MahabharataDB?.PARBAS || [])) {
      try {
        const downloaded = await window.MahabharataDB.isPackDownloaded(parba.id);
        if (downloaded && !(await isMahabharataInstalled(parba.id))) {
          if (onProgress) onProgress(`মাইগ্রেট হচ্ছে: ${parba.name}`);
          const migrated = await migrateOneLegacyFile(
            "mahabharata", parba.id, parba.name,
            `mahabharata_packs/mahabharata_parba_${parba.id - 300}.db`,
            (p) => mergeMahabharataPack(parba.id, parba.name, p)
          );
          if (migrated) report.mahabharata++;
        }
      } catch (err) {
        report.failed.push({ category: "mahabharata", id: parba.id, error: err.message || String(err) });
      }
    }
  } catch (err) {
    console.warn("master-db: mahabharata legacy scan skipped:", err.message || err);
  }

  if (report.failed.length) {
    console.warn("master-db: legacy migration finished with failures (originals left on disk, will retry next boot):", report.failed);
  }
  return report;
}

async function migrateOneLegacyFile(category, id, title, relativePath, mergeFn) {
  const fs =
    window.Capacitor?.Plugins?.Filesystem ||
    window.Capacitor?.Filesystem ||
    window.Filesystem;
  if (!fs) return false;
  const dir = fs.Directory?.Data || fs.Directory?.DATA || "DATA";

  const nativePath = await getTempFileNativePath(fs, relativePath, dir);
  await mergeFn(nativePath);

  // Only delete the legacy file once the merge (including its COMMIT)
  // has actually succeeded — mergeFn throws on failure, and we never
  // reach this line in that case, so a crash mid-migration just leaves
  // the original file in place to retry next boot.
  try {
    await fs.deleteFile({ path: relativePath, directory: dir });
  } catch (e) { /* already gone, fine */ }

  return true;
}

/* ── Public API ───────────────────────────────────────────────────────── */

window.SwadhyayMasterDB = {
  initializeMasterDatabase,

  // Veda
  mergeVedaPack,
  isVedaInstalled,
  getVedaBhashya,
  removeVedaPack,

  // Ramayana kanda bhāṣya
  mergeRamayanaKandaPack,
  isRamayanaKandaInstalled,
  getRamayanaKandaBhashya,
  searchRamayanaKandaBhashya,
  removeRamayanaKandaPack,

  // Mahabharata
  mergeMahabharataPack,
  isMahabharataInstalled,
  getMahabharataAdhyayas,
  getMahabharataAdhyay,
  getMahabharataUpakhyanas,
  getMahabharataAdjacentAdhyayas,
  searchMahabharataParva,
  removeMahabharataPack,

  // Migration
  migrateAllLegacyPacks,

  // Exposed for advanced/manual use (e.g. a settings-screen "storage" view)
  getTempFileNativePath,
};
