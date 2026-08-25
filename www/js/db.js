/**
 * db.js — SQLite access layer for Chaturveda
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

// ── LRU Pack Manager (SQLite max 10 ATTACH; we use 9 max) ───────────
// Keeps track of attach order. When limit reached, evicts the oldest.
const MAX_ATTACHED_PACKS = 9;
const attachedPacks = new Set();          // currently attached scholar IDs
const attachedPacksOrder = [];            // insertion-order list for LRU eviction

async function evictOldestPackIfNeeded(sqlite) {
  if (attachedPacks.size < MAX_ATTACHED_PACKS) return;
  // Evict the least-recently-used (front of queue)
  const oldest = attachedPacksOrder.shift();
  if (oldest == null) return;
  attachedPacks.delete(oldest);
  const alias = packDbName(oldest);
  try {
    await sqlite.execute({ database: CORE_DB_NAME, statements: `DETACH DATABASE ${alias};` });
  } catch (e) { /* already gone */ }
}

function markPackUsed(scholarId) {
  // Move to end (most recently used)
  const idx = attachedPacksOrder.indexOf(scholarId);
  if (idx !== -1) attachedPacksOrder.splice(idx, 1);
  attachedPacksOrder.push(scholarId);
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

  const alias = packDbName(scholarId);

  if (!attachedPacks.has(scholarId)) {
    const fs = fsPlugin();
    const dir = directoryData();
    if (!fs || !dir) throw new Error("Filesystem plugin not available");

    await evictOldestPackIfNeeded(sqlite);

    const uri = await fs.getUri({ path: packFileName(scholarId), directory: dir });
    let dbPath = uri.uri;
    if (dbPath.startsWith("file://")) dbPath = dbPath.replace("file://", "");

    try {
      await sqlite.execute({ database: CORE_DB_NAME, statements: `DETACH DATABASE ${alias};` });
    } catch (e) { /* not attached yet, ignore */ }

    try {
      await sqlite.execute({ database: CORE_DB_NAME, statements: `ATTACH DATABASE '${dbPath}' AS ${alias};` });
    } catch (error) {
      const msg = error.message || String(error);
      if (!msg.includes("already in use")) throw error;
    }

    attachedPacks.add(scholarId);
  }
  markPackUsed(scholarId);

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

  const alias = packDbName(scholarId);




  if(!attachedPacks.has(scholarId)) {

    const fs = fsPlugin();
    const dir = directoryData();

    if (!fs || !dir) {
      throw new Error("Filesystem plugin not available");
    }

    const uri = await fs.getUri({

      path: packFileName(scholarId),

      directory: dir

    });




    let dbPath = uri.uri;




    if(dbPath.startsWith("file://")) {


      dbPath = dbPath.replace(

        "file://",

        ""

      );


    }




    await evictOldestPackIfNeeded(sqlite);

    try {


      await sqlite.execute({

        database: CORE_DB_NAME,


        statements:

          `DETACH DATABASE ${alias};`


      });


    }

    catch(e){}




    try {


      await sqlite.execute({

        database: CORE_DB_NAME,


        statements:

        `ATTACH DATABASE '${dbPath}' AS ${alias};`


      });


    }


    catch(error) {


      const msg =

        error.message || String(error);



      if(!msg.includes("already in use")) {

        throw error;


      }


    }



    attachedPacks.add(scholarId);


  }
  markPackUsed(scholarId);




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


  const sqlite = sqlitePlugin();
  if (!sqlite) {
    return;
  }

  const alias = packDbName(scholarId);



  if(attachedPacks.has(scholarId)) {


    try {


      await sqlite.execute({


        database: CORE_DB_NAME,


        statements:

          `DETACH DATABASE ${alias};`


      });


    }


    catch(e) {


      console.log(

        "Detach failed or already detached"

      );


    }



    attachedPacks.delete(scholarId);

    // CRITICAL FIX: also purge from the LRU order array.
    // Without this, the next evictOldestPackIfNeeded() call will shift()
    // this ghost ID, perform a no-op Set delete + silent DETACH failure,
    // and never actually free an attach slot — eventually hitting SQLite's
    // hard "max 10 attached databases" limit (error seen in production).
    const _lruIdx = attachedPacksOrder.indexOf(scholarId);
    if (_lruIdx !== -1) attachedPacksOrder.splice(_lruIdx, 1);


  }


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
