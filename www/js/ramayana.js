/**
 * ramayana.js — SQLite access layer for Valmiki Ramayana
 *
 * Database: ramayana.db (bundled in www/assets/databases/)
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

function rSqlite() {
  if (!window.Capacitor?.Plugins?.CapacitorSQLite) return null;
  return window.Capacitor.Plugins.CapacitorSQLite;
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

/* ── Init ─────────────────────────────────────────────────────────── */

let _rInitDone = false;

async function rInitDB() {
  if (_rInitDone) return;
  const sqlite = rSqlite();
  if (!sqlite) throw new Error("CapacitorSQLite plugin not available");

  try { await sqlite.initWebStore(); } catch (e) { /* ok */ }

  const exists = await sqlite.isDatabase({ database: RAMAYANA_DB_NAME });
  if (!exists.result) {
    await sqlite.copyFromAssets({ overwrite: false });
  }

  // A connection can already be open from a previous session/resume —
  // that's not an error, so we treat "already"/"exist" messages as fine
  // and only rethrow genuine failures.
  try {
    await sqlite.createConnection({
      database: RAMAYANA_DB_NAME,
      encrypted: false,
      mode: "no-encryption",
      version: 1,
      readonly: false,
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
      // benign — connection was already open, nothing to do
    } else if (msg.includes("no available connection")) {
      // createConnection() silently failed to register despite not
      // throwing an "already" error — self-heal by creating it again
      // right before retrying open().
      await sqlite.createConnection({
        database: RAMAYANA_DB_NAME,
        encrypted: false,
        mode: "no-encryption",
        version: 1,
        readonly: false,
      });
      await sqlite.open({ database: RAMAYANA_DB_NAME });
    } else {
      throw e;
    }
  }

  _rInitDone = true;
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
  // ref format: "K<kandaId>.S<sargaId>.<shlokaId>"
  const m = ref.match(/^K(\d+)\.S(\d+)\.(\d+)$/);
  if (!m) return null;
  const [, kandaId, sargaId, shlokaId] = m.map(Number);
  // Use ROWID for uniqueness since shloka ids repeat across sargas.
  // Some SQLite plugin bridges lowercase result column names, so we
  // alias explicitly and read both cases defensively.
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
      ref: `K${d.kanda.id}.S${d.sarga.id}.${d.id}`,
      kandaId: d.kanda.id,
      sargaId: d.sarga.id,
      shlokaId: d.id,
      sanskrit: d.sanskrit,
      tat: d.tat,
    };
  });
}

/* ── Public API ─────────────────────────────────────────────────── */

window.RamayanaDB = {
  initDB: rInitDB,
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
