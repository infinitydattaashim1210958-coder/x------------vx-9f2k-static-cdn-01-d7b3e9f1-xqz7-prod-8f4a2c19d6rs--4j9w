/**
 * db.js — SQLite access layer for স্বাধ্যায়
 *
 * Architecture:
 * - Core database:
 *   core.db
 *   Contains Vedas, Mantras, Scholars metadata,
 *   scholar fields and search index.
 *
 * - Bhāṣya packs:
 *   Downloaded on demand.
 *   Stored in private app storage.
 */


const CORE_DB_NAME = "core";


const PACK_RELEASE_BASE =
  "https://raw.githubusercontent.com/infinitydattaashim1210958-coder/-------------vx-9f2k-static-cdn-01-d7b3e9f1-xqz7-prod-8f4a2c19d6rs--4j9w/main/bhashya_packs/";


const PACK_DIR = "bhashya_packs";



/**
 * Capacitor plugins with robust error handling
 */

function sqlitePlugin() {

  if (!window.Capacitor?.Plugins?.CapacitorSQLite) {
    console.error("CapacitorSQLite plugin not initialized");
    return null;
  }
  return window.Capacitor.Plugins.CapacitorSQLite;

}


function fsPlugin() {
  const fs =
    window.Capacitor?.Plugins?.Filesystem ||
    window.Capacitor?.Filesystem ||
    window.Filesystem;

  if (!fs || typeof fs.writeFile !== "function") {
    console.warn("Filesystem plugin unavailable");
    return null;
  }

  return fs;
}



function directoryData() {

  const fs = fsPlugin();

  if (!fs) return "DATA";

  if (fs.Directory?.Data) return fs.Directory.Data;
  if (fs.Directory?.DATA) return fs.Directory.DATA;

  return "DATA";

}



/**
 * Ensure Capacitor is ready
 */

async function ensureCapacitorReady() {

  if (!window.Capacitor) {
    throw new Error("Capacitor is not available");
  }

  // Capacitor v6 automatically waits for ready
  return true;

}




/**
 * Initialize database
 */

async function initDB() {

  // Ensure Capacitor is ready first
  await ensureCapacitorReady();

  const sqlite = sqlitePlugin();

  if (!sqlite) {
    throw new Error("CapacitorSQLite plugin not available — cannot initialize database");
  }


  // Required for Capacitor SQLite
  try {

    await sqlite.initWebStore();

  } catch(e) {

    console.log("SQLite WebStore initialization:", e.message);

  }



  const dbExists = await sqlite.isDatabase({

    database: CORE_DB_NAME

  });



  if (!dbExists.result) {


    await sqlite.copyFromAssets({

      overwrite: false

    });


  }



  // A connection can already be open from a previous session/resume —
  // treat "already"/"exist" as fine, only rethrow genuine failures.
  try {
    await sqlite.createConnection({
      database: CORE_DB_NAME,
      encrypted: false,
      mode: "no-encryption",
      version: 1,
      readonly: false
    });
  } catch (e) {
    const msg = (e && e.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }

  try {
    await sqlite.open({
      database: CORE_DB_NAME
    });
  } catch (e) {
    const msg = (e && e.message || String(e)).toLowerCase();
    if (!msg.includes("already") && !msg.includes("exist")) throw e;
  }



  // ── Schema migrations ────────────────────────────────────────────
  // Never delete/recreate core.db to change its schema — that would
  // wipe anything a future version stores in it. Instead: track a
  // version number in app_meta, and apply only the ALTER/CREATE
  // statements needed to move forward from whatever version this
  // install is currently on.
  await runMigrations();



  // Create Bhāṣya directory (non-fatal if Filesystem unavailable)

  try {

    const fs = fsPlugin();
    const dir = directoryData();

    if (!fs || !dir) {
      console.log("Filesystem plugin not available — Bhāṣya packs feature disabled");
      return;
    }

    await fs.mkdir({

      path: PACK_DIR,

      directory: dir,

      recursive: true

    });

    console.log("Pack directory created/verified");

  } catch(e) {

    console.log("Pack directory creation:", e.message);

  }


}




/**
 * ── Database migration framework ──────────────────────────────────
 *
 * Rule: core.db is NEVER dropped or recreated to apply a schema
 * change. Existing installs keep their data (bookmarks live
 * separately in Preferences, but any future core.db user data —
 * reading history, notes, etc. — depends on this holding).
 *
 * To add a schema change in a future release:
 *   1. Bump CURRENT_DB_VERSION by 1.
 *   2. Add a new `if (version < N) { ...; version = N; }` block
 *      below, containing only ALTER TABLE / CREATE TABLE IF NOT
 *      EXISTS statements — never DROP TABLE on user data.
 *
 * Example for the next migration:
 *   if (version < 2) {
 *     await dbExec(`ALTER TABLE bookmarks ADD COLUMN note TEXT;`);
 *     version = 2;
 *     await setDbVersion(version);
 *   }
 */

const CURRENT_DB_VERSION = 1;

async function dbExec(statements) {
  const sqlite = sqlitePlugin();
  if (!sqlite) throw new Error("SQLite plugin not available");
  await sqlite.execute({ database: CORE_DB_NAME, statements });
}

async function ensureAppMeta() {
  await dbExec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

async function getDbVersion() {
  await ensureAppMeta();
  const rows = await query(`SELECT value FROM app_meta WHERE key='db_version'`);
  if (!rows.length) return 0; // no row yet — pre-migration-framework install
  const v = parseInt(rows[0].value, 10);
  return Number.isFinite(v) ? v : 0;
}

async function setDbVersion(v) {
  await dbExec(`
    INSERT INTO app_meta (key, value) VALUES ('db_version', '${v}')
    ON CONFLICT(key) DO UPDATE SET value='${v}';
  `);
}

async function runMigrations() {
  let version = await getDbVersion();

  // Installs from before this framework existed have version 0 with a
  // schema that already matches CURRENT_DB_VERSION's baseline — record
  // that baseline without running any statements against it.
  if (version === 0) {
    version = CURRENT_DB_VERSION;
    await setDbVersion(version);
    return;
  }

  // Future migrations are added here, each guarded by `if (version < N)`,
  // so an install already at N safely skips it. Never remove a past
  // migration block once released — older installs may still need it.

  if (version < CURRENT_DB_VERSION) {
    await setDbVersion(CURRENT_DB_VERSION);
  }
}




/**
 * Utility
 */


function rowsOf(result) {


  if(result && result.values) {

    return result.values;

  }


  return [];

}




async function query(

  sql,

  params = [],

  database = CORE_DB_NAME

) {


  const sqlite = sqlitePlugin();
  if (!sqlite) {
    throw new Error("SQLite plugin not available");
  }

  const result = await sqlite.query({

    database,

    statement: sql,

    values: params

  });



  return rowsOf(result);


}




/**
 * Core database queries
 */



async function getVedas() {


  return query(

    "SELECT * FROM vedas ORDER BY id"

  );


}




async function getVedaByCode(code) {


  const rows = await query(

    "SELECT * FROM vedas WHERE code=?",

    [code]

  );


  return rows[0] || null;


}




async function getLevel1List(vedaId) {


  return query(

    `SELECT DISTINCT level1 
     FROM mantras 
     WHERE veda_id=? 
     AND level1 IS NOT NULL 
     ORDER BY level1`,

    [vedaId]

  );


}



async function getLevel2List(vedaId, level1) {


  return query(

    `SELECT DISTINCT level2
     FROM mantras
     WHERE veda_id=?
     AND level1=?
     AND level2 IS NOT NULL
     ORDER BY level2`,

    [

      vedaId,

      level1

    ]

  );


}



async function getMantraList(

  vedaId,

  level1,

  level2

) {


  let sql =

    "SELECT * FROM mantras WHERE veda_id=?";


  const params = [vedaId];



  if(level1 !== null && level1 !== undefined) {


    sql += " AND level1=?";

    params.push(level1);


  }



  if(level2 !== null && level2 !== undefined) {


    sql += " AND level2=?";

    params.push(level2);


  }



  sql += " ORDER BY mantra_no, id";



  return query(sql, params);


}




async function getMantraRange(

  vedaId,

  fromNo,

  toNo

) {


  return query(

    `SELECT *
     FROM mantras
     WHERE veda_id=?
     AND mantra_no BETWEEN ? AND ?
     ORDER BY mantra_no`,

    [

      vedaId,

      fromNo,

      toNo

    ]

  );


}




async function getMantraCount(vedaId) {


  const rows = await query(

    "SELECT COUNT(*) AS c FROM mantras WHERE veda_id=?",

    [vedaId]

  );



  return rows[0]?.c || 0;


}




async function getMantraByRef(

  vedaId,

  ref

) {


  const rows = await query(

    `SELECT *
     FROM mantras
     WHERE veda_id=?
     AND mantra_ref_id=?`,

    [

      vedaId,

      ref

    ]

  );



  return rows[0] || null;


}




async function getAdjacentMantras(

  vedaId,

  mantraId

) {


  const previous = await query(

    `SELECT mantra_ref_id
     FROM mantras
     WHERE veda_id=?
     AND id < ?
     ORDER BY id DESC
     LIMIT 1`,

    [

      vedaId,

      mantraId

    ]

  );




  const next = await query(

    `SELECT mantra_ref_id
     FROM mantras
     WHERE veda_id=?
     AND id > ?
     ORDER BY id ASC
     LIMIT 1`,

    [

      vedaId,

      mantraId

    ]

  );



  return {


    prev:

      previous[0]

      ? previous[0].mantra_ref_id

      : null,



    next:

      next[0]

      ? next[0].mantra_ref_id

      : null


  };


}




/**
 * Scholar metadata
 * (Commentary is NOT stored here)
 */



async function getScholarsForVeda(vedaId) {


  const scholars = await query(

    `SELECT *
     FROM scholars
     WHERE veda_id=?
     ORDER BY display_order,id`,

    [vedaId]

  );



  for(const scholar of scholars) {


    scholar.downloaded =

      await isPackDownloaded(

        scholar.id

      );



    scholar.fields = await query(

      `SELECT field_key, display_order
       FROM scholar_fields
       WHERE scholar_id=?
       ORDER BY display_order`,

      [

        scholar.id

      ]

    );


  }



  return scholars;


}




async function getScholarsForMantra(

  vedaId,

  mantraId

) {


  const scholars = await query(

    `SELECT s.*
     FROM scholars s
     JOIN bhashya_presence p
     ON p.scholar_id=s.id
     WHERE s.veda_id=?
     AND p.mantra_id=?
     ORDER BY s.display_order,s.id`,

    [

      vedaId,

      mantraId

    ]

  );



  for(const scholar of scholars) {


    scholar.downloaded =

      await isPackDownloaded(

        scholar.id

      );


  }



  return scholars;


}




/**
 * Full text search
 */


function escapeFTS(term) {


  return '"' +

    term.replace(/"/g,'""')

    + '"';


}



async function search(

  vedaCode,

  term,

  limit=50

) {


  const ftsTerm = escapeFTS(

    term.trim()

  );



  let sql =

    "SELECT * FROM search_index WHERE search_index MATCH ?";



  const params = [ftsTerm];




  if(vedaCode) {


    sql =

      `SELECT *
       FROM search_index
       WHERE veda_code=?
       AND search_index MATCH ?`;



    params.unshift(vedaCode);


  }



  sql += " LIMIT ?";

  params.push(limit);



  return query(sql, params);


}



/**
 * Bhāṣya pack management
 */


function packDbName(scholarId) {


  return "pack_" + scholarId;


}




function packFileName(scholarId) {


  return `${PACK_DIR}/scholar_${scholarId}.db`;


}




async function isPackDownloaded(scholarId) {


  try {

    const fs = fsPlugin();
    const dir = directoryData();

    if (!fs || !dir) {
      return false;
    }

    await fs.stat({

      path: packFileName(scholarId),

      directory: dir


    });



    return true;


  }

  catch(e) {


    return false;


  }


}




/**
 * Convert gzip database to normal database
 */


async function decompressGzip(arrayBuffer) {


  const ds = new DecompressionStream("gzip");



  const stream =

    new Blob([arrayBuffer])

    .stream()

    .pipeThrough(ds);



  return await new Response(stream).blob();


}




function blobToBase64(blob) {


  return new Promise((resolve,reject)=>{


    const reader = new FileReader();



    reader.onloadend = ()=>{


      resolve(

        reader.result.split(",")[1]

      );


    };



    reader.onerror = reject;



    reader.readAsDataURL(blob);



  });


}




async function downloadPack(

  scholarId,

  packFile,

  onProgress

) {



  if(onProgress)

    onProgress("ডাউনলোড হচ্ছে…");




  const url =

    PACK_RELEASE_BASE + packFile;




  let response;



  try {


    response = await fetch(url);


  }


  catch(error) {


    throw new Error(

      `নেটওয়ার্ক সমস্যা: ${error.message}`

    );


  }




  if(!response.ok) {


    throw new Error(

      `Download failed HTTP ${response.status}`

    );


  }




  const buffer =

    await response.arrayBuffer();




  if(onProgress)

    onProgress("আনপ্যাক হচ্ছে…");



  const dbBlob =

    await decompressGzip(buffer);



  const base64 =

    await blobToBase64(dbBlob);




  if(onProgress)

    onProgress("সংরক্ষণ হচ্ছে…");




  const fs = fsPlugin();
  const dir = directoryData();

  if (!fs || !dir) {
    throw new Error("Filesystem plugin not available — cannot save Bhāṣya pack");
  }

  await fs.writeFile({
    path: packFileName(scholarId),
    data: base64,
    directory: dir || "DATA",
    recursive: true
});


  return true;


}




async function deletePack(scholarId) {


  await detachPack(scholarId);



  try {

    const fs = fsPlugin();
    const dir = directoryData();

    if (!fs || !dir) {
      return;
    }

    await fs.deleteFile({

      path: packFileName(scholarId),


      directory: dir


    });


  }


  catch(e) {


    console.log(

      "Pack already removed"

    );


  }


}




/**
 * Ramayana scholar/bhashya support
 * Mirrors getScholarsForMantra / getBhashyaForMantraFromPack exactly,
 * but keyed by (kanda_id, sarga_id, shloka_id) instead of mantra_id.
 *
 * Requires two NEW tables in core.db (additive — does not touch the
 * existing `scholars` / `bhashya_presence` Veda tables):
 *
 *   CREATE TABLE ramayana_scholars (
 *     id INTEGER PRIMARY KEY,
 *     name TEXT NOT NULL,
 *     era TEXT,
 *     description TEXT,
 *     display_order INTEGER DEFAULT 0,
 *     pack_file TEXT NOT NULL,       -- e.g. 'scholar_201.db.gz' (bhashya_packs/)
 *     pack_size_bytes INTEGER,
 *     entry_count INTEGER
 *   );
 *
 *   CREATE TABLE ramayana_bhashya_presence (
 *     scholar_id INTEGER NOT NULL REFERENCES ramayana_scholars(id),
 *     kanda_id   INTEGER NOT NULL,
 *     sarga_id   INTEGER NOT NULL,
 *     shloka_id  INTEGER NOT NULL
 *   );
 *
 * And inside each downloaded scholar_N.db pack, a `ramayana_bhashyas` table:
 *
 *   CREATE TABLE ramayana_bhashyas (
 *     kanda_id  INTEGER NOT NULL,
 *     sarga_id  INTEGER NOT NULL,
 *     shloka_id INTEGER NOT NULL,
 *     field_key TEXT NOT NULL,
 *     value     TEXT NOT NULL
 *   );
 *
 * scholar ids must not collide with existing Veda `scholars.id` values,
 * since pack filenames are derived from scholarId alone (packFileName()).
 */

// ── LRU Pack Manager (SQLite max 10 ATTACH; we use 6 max, leaving margin
// for main + any stale/orphaned attachments the emergency reset below
// hasn't caught yet) ──
// Keeps track of attach order. When limit reached, evicts the oldest.
const MAX_ATTACHED_PACKS = 6;
const attachedPacks = new Set();          // currently attached scholar IDs
const attachedPacksOrder = [];            // insertion-order list for LRU eviction
const everAttachedAliases = new Set();    // every alias ever attached this
                                           // session — used for emergency
                                           // full-reset if leaks accumulate
                                           // past SQLite's real limit despite
                                           // our own tracking believing
                                           // there's room (see bug note below)

// ── Attach lock ───────────────────────────────────────────────────
// evictOldestPackIfNeeded()+ATTACH is a check-then-act sequence. Without
// serializing it, two concurrent lookups (e.g. Promise.all over several
// scholars for one mantra) can both pass the "room available" check before
// either finishes attaching, overshooting SQLite's attached-database limit.
// All attach/detach/evict operations go through this queue so only one
// runs at a time.
let attachQueue = Promise.resolve();
function withAttachLock(fn) {
  const run = attachQueue.then(fn, fn);
  attachQueue = run.then(() => {}, () => {});
  return run;
}

// Best-effort DETACH that survives SQLite's rule against detaching a
// database while an open transaction on this connection has touched it —
// which is exactly the state right after a SELECT against a just-attached
// pack. A plain retry does nothing for that case; forcing the transaction
// closed first does. Returns true only if the pack is actually detached,
// so callers can trust tracking stays accurate.
async function forceDetachPack(sqlite, alias) {
  try {
    await sqlite.execute({ database: CORE_DB_NAME, statements: `DETACH DATABASE ${alias};` });
    return true;
  } catch (e1) {
    try { await sqlite.execute({ database: CORE_DB_NAME, statements: `COMMIT;` }); } catch (e2) { /* no transaction open, fine */ }
    try { await sqlite.execute({ database: CORE_DB_NAME, statements: `ROLLBACK;` }); } catch (e3) { /* nothing to roll back, fine */ }
    try {
      await sqlite.execute({ database: CORE_DB_NAME, statements: `DETACH DATABASE ${alias};` });
      return true;
    } catch (e4) {
      console.warn("DETACH still failing after transaction reset:", alias, e4.message || e4);
      return false;
    }
  }
}

async function evictOldestPackIfNeeded(sqlite) {
  if (attachedPacks.size < MAX_ATTACHED_PACKS) return;
  // Evict the least-recently-used (front of queue)
  const oldest = attachedPacksOrder.shift();
  if (oldest == null) return;
  const alias = packDbName(oldest);
  const detached = await forceDetachPack(sqlite, alias);
  if (detached) {
    // Only stop tracking it once we've confirmed it's actually gone —
    // deleting from `attachedPacks` unconditionally here (the previous
    // bug) let failed detaches silently leak: SQLite kept the real
    // attachment while our tracker believed there was free room, so the
    // count crept past SQLite's hard cap of 10 with no visible symptom
    // until it did.
    attachedPacks.delete(oldest);
  } else {
    // Genuinely couldn't detach — put it back at the front so eviction
    // retries it next time, rather than losing track of it while it's
    // still actually attached.
    attachedPacksOrder.unshift(oldest);
  }
}

// Last-resort recovery: if SQLite still refuses an ATTACH with "too many
// attached databases" even after our own bookkeeping says there's room,
// our tracking has drifted from reality (see evictOldestPackIfNeeded
// note above). Forcibly DETACH every alias we've ever attached this
// session and reset tracking to empty, then let the caller retry once.
async function emergencyDetachAllPacks(sqlite) {
  for (const alias of everAttachedAliases) {
    await forceDetachPack(sqlite, alias);
  }
  attachedPacks.clear();
  attachedPacksOrder.length = 0;
}

function markPackUsed(scholarId) {
  // Move to end (most recently used)
  const idx = attachedPacksOrder.indexOf(scholarId);
  if (idx !== -1) attachedPacksOrder.splice(idx, 1);
  attachedPacksOrder.push(scholarId);
}

// ── Shared attach logic ──────────────────────────────────────────
// Used by both Veda (getBhashyaForMantraFromPack) and Ramayana
// (getBhashyaForShlokaFromPack) lookups, since they share the same
// attach/eviction infrastructure. Runs inside the attach lock so
// concurrent calls for different scholars can't race past the limit.
async function ensurePackAttached(scholarId) {

  return withAttachLock(async () => {

    const sqlite = sqlitePlugin();
    if (!sqlite) throw new Error("SQLite plugin not available");

    const alias = packDbName(scholarId);

    if (!attachedPacks.has(scholarId)) {
      const fs = fsPlugin();
      const dir = directoryData();
      if (!fs || !dir) throw new Error("Filesystem plugin not available");

      const uri = await fs.getUri({ path: packFileName(scholarId), directory: dir });
      let dbPath = uri.uri;
      if (dbPath.startsWith("file://")) dbPath = dbPath.replace("file://", "");

      await evictOldestPackIfNeeded(sqlite);

      try {
        await sqlite.execute({ database: CORE_DB_NAME, statements: `DETACH DATABASE ${alias};` });
      } catch (e) { /* not attached yet, ignore */ }

      const doAttach = () => sqlite.execute({
        database: CORE_DB_NAME,
        statements: `ATTACH DATABASE '${dbPath}' AS ${alias};`,
      });

      try {
        await doAttach();
      } catch (error) {
        const msg = error.message || String(error);
        if (msg.includes("already in use")) {
          // fine — already attached under this alias
        } else if (msg.toLowerCase().includes("too many attached databases")) {
          // Our tracking thought there was room; reality disagreed.
          // Nuclear reset, then retry once.
          await emergencyDetachAllPacks(sqlite);
          await doAttach();
        } else {
          throw error;
        }
      }

      everAttachedAliases.add(alias);
      attachedPacks.add(scholarId);
    }

    markPackUsed(scholarId);
    return alias;
  });
}

async function getScholarsForShloka(kandaId, sargaId, shlokaId) {

  const scholars = await query(
    `SELECT s.*
     FROM ramayana_scholars s
     JOIN ramayana_bhashya_presence p
     ON p.scholar_id=s.id
     WHERE p.kanda_id=? AND p.sarga_id=? AND p.shloka_id=?
     ORDER BY s.display_order,s.id`,
    [kandaId, sargaId, shlokaId]
  );

  for (const scholar of scholars) {
    scholar.downloaded = await isPackDownloaded(scholar.id);
  }

  return scholars;
}

async function getBhashyaForShlokaFromPack(scholarId, kandaId, sargaId, shlokaId) {

  const sqlite = sqlitePlugin();
  if (!sqlite) throw new Error("SQLite plugin not available");

  const alias = await ensurePackAttached(scholarId);

  const result = await sqlite.query({
    database: CORE_DB_NAME,
    statement: `SELECT field_key,value FROM ${alias}.ramayana_bhashyas WHERE kanda_id=? AND sarga_id=? AND shloka_id=?`,
    values: [kandaId, sargaId, shlokaId]
  });

  return rowsOf(result);
}






async function getBhashyaForMantraFromPack(

  scholarId,

  mantraId

) {

  const sqlite = sqlitePlugin();
  if (!sqlite) {
    throw new Error("SQLite plugin not available");
  }

  const alias = await ensurePackAttached(scholarId);

  const result = await sqlite.query({

    database: CORE_DB_NAME,


    statement:

      `SELECT field_key,value
       FROM ${alias}.bhashyas
       WHERE mantra_id=?`,


    values:[mantraId]


  });




  return rowsOf(result);


}


/**
 * Detach scholar pack database
 */


async function detachPack(scholarId) {

  return withAttachLock(async () => {

  const sqlite = sqlitePlugin();
  if (!sqlite) {
    return;
  }

  const alias = packDbName(scholarId);

  if (attachedPacks.has(scholarId)) {

    // This is called on every scholar-tab switch (app.js), immediately
    // after a SELECT was run against this exact pack — precisely the
    // condition where plain DETACH DATABASE reliably fails (SQLite
    // refuses to detach a database an open transaction has already
    // touched). forceDetachPack resets the transaction state and
    // retries, instead of the previous plain attempt whose failure was
    // only console.log'd while tracking was cleared regardless — the
    // same silent-leak bug fixed in evictOldestPackIfNeeded, just
    // reached from this separate call path.
    const detached = await forceDetachPack(sqlite, alias);

    if (detached) {
      attachedPacks.delete(scholarId);
      const _lruIdx = attachedPacksOrder.indexOf(scholarId);
      if (_lruIdx !== -1) attachedPacksOrder.splice(_lruIdx, 1);
    } else {
      // Still attached in reality — leave tracking as-is so eviction
      // knows to retry it later, rather than losing track of a pack
      // that's still actually occupying an attach slot.
      console.warn("detachPack: pack still attached after retry, keeping tracked:", alias);
    }

  }

  });

}




/**
 * Public API
 *
 * Available globally:
 * window.VedaDB
 */


window.VedaDB = {


  // Database initialization

  initDB,

  getDbVersion,



  // Veda

  getVedas,

  getVedaByCode,



  // Mantra navigation

  getLevel1List,

  getLevel2List,

  getMantraList,

  getMantraRange,

  getMantraCount,

  getMantraByRef,

  getAdjacentMantras,



  // Scholars

  getScholarsForVeda,

  getScholarsForMantra,

  // Ramayana scholars/bhashya (shares the same pack download/attach infra)

  getScholarsForShloka,

  getBhashyaForShlokaFromPack,



  // Search

  search,



  // Bhāṣya packs

  isPackDownloaded,

  downloadPack,

  deletePack,

  getBhashyaForMantraFromPack,


  detachPack

};
