/**
 * lib.js — Digital Library feature (v2: repo-hosted HTML books).
 *
 * Books are actual interactive HTML files (already built by you) stored
 * directly in this repo under library_books/, listed in library_books/manifest.json.
 * The app fetches that manifest (and the HTML files themselves) via
 * raw.githubusercontent.com, which reliably supports cross-origin fetch —
 * no CORS issues, no PDF conversion, no third-party libraries needed.
 *
 * "Download" saves the real HTML file locally; "Open" launches it in the
 * system browser, so all of the original page's interactivity (search,
 * tabs, etc.) works exactly as on the website.
 */

const REPO_RAW_BASE =
  "https://raw.githubusercontent.com/infinitydattaashim1210958-coder/-------------vx-9f2k-static-cdn-01-d7b3e9f1-xqz7-prod-8f4a2c19d6rs--4j9w/main/library_books/";
const MANIFEST_URL = REPO_RAW_BASE + "manifest.json";

const MANIFEST_KEY = "digitalLibraryManifest"; // tracks locally-downloaded books

// fsPlugin() is intentionally NOT redeclared here — db.js (loaded first)
// already defines a global `function fsPlugin()` with proper fallback
// checks and a warning if the Filesystem plugin is unavailable. This file
// used to define its own bare-bones copy (`return window.Capacitor.Plugins
// .Filesystem;`, no safety checks), which — because lib.js loads *after*
// db.js — silently overwrote db.js's safer version app-wide (function
// redeclarations don't throw, the last one just wins). Any file-write
// code elsewhere in db.js calling fsPlugin() was unknowingly using this
// unguarded version instead. Removed; calls below now resolve to db.js's
// global fsPlugin().
function prefsPlugin() {
  return window.Capacitor.Plugins.Preferences;
}
const MANIFEST_CACHE_KEY = "digitalLibraryManifestCache";

async function fetchBlogBooks() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    // Cache manifest
    await prefsPlugin().set({
      key: MANIFEST_CACHE_KEY,
      value: JSON.stringify(data),
    });

    return (data.books || []).map((b) => ({
      id: b.id,
      title: b.title,
      filename: b.filename,
      date: b.date || "",
      // "html" (existing repo-hosted interactive pages) or "db" (new
      // db.gz packs merged into swadhyay_master.db). Old manifest.json
      // entries have no type field at all — default to "html" so every
      // book uploaded before this change keeps working unchanged.
      type: b.type || "html",
    }));

  } catch (networkErr) {

    // Try cached manifest
    const cache = await prefsPlugin().get({
      key: MANIFEST_CACHE_KEY,
    });

    if (cache.value) {
      const data = JSON.parse(cache.value);

      return (data.books || []).map((b) => ({
        id: b.id,
        title: b.title,
        filename: b.filename,
        date: b.date || "",
        type: b.type || "html",
      }));
    }

    throw new Error(
      `বইয়ের তালিকা পাওয়া যায়নি। একবার ইন্টারনেট চালু করে লাইব্রেরি খুলুন।`
    );
  }
}


async function getManifest() {
  try {
    const res = await prefsPlugin().get({ key: MANIFEST_KEY });
    return res.value ? JSON.parse(res.value) : {};
  } catch (e) {
    return {};
  }
}

async function saveManifest(manifest) {
  await prefsPlugin().set({ key: MANIFEST_KEY, value: JSON.stringify(manifest) });
}

// blobToBase64() is intentionally NOT redeclared here either, for the
// same reason as fsPlugin() above — db.js already defines a global,
// behaviorally-identical version. Calls below resolve to db.js's copy.

async function downloadBook(book, onProgress) {
  if (book.type === "db") return downloadDbBook(book, onProgress);

  const url = REPO_RAW_BASE + book.filename;
  onProgress && onProgress("ডাউনলোড হচ্ছে…");

  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (networkErr) {
    throw new Error("নেটওয়ার্ক সংযোগ পাওয়া যায়নি।");
  }
  if (!res.ok) throw new Error(`ডাউনলোড ব্যর্থ (HTTP ${res.status})`);
  const htmlText = await res.text();
  const localFilename = book.filename;

  onProgress && onProgress("ফোনে সেভ হচ্ছে…");
  const blob = new Blob([htmlText], { type: "text/html;charset=utf-8" });
  const base64Data = await blobToBase64(blob);

  await fsPlugin().writeFile({
    path: localFilename,
    data: base64Data,
    directory: "DATA",
    recursive: true,
  });

  const manifest = await getManifest();
  manifest[book.id] = {
    title: book.title,
    filename: localFilename,
    type: "html",
    downloadedAt: new Date().toISOString(),
  };
  await saveManifest(manifest);

  return { success: true, filename: localFilename };
}

/* ── db.gz books — merged into swadhyay_master.db via master-db.js,
 * same fetch → DecompressionStream("gzip") → writeFile → ATTACH-merge →
 * delete-temp-file pipeline mahabharata.js/ramayana.js already use for
 * their packs (see mbDownloadPack in mahabharata.js). Nothing here reads
 * from the local html_book path — the manifest entry for a "db" book has
 * no `filename`, since the actual content lives in the master DB, not on
 * disk as a standalone file. ── */

const LIB_DB_PACK_DIR = "library_book_packs";

function libDbPackFileName(bookId) {
  return `${LIB_DB_PACK_DIR}/${bookId}.db`;
}

async function libDecompressGzip(arrayBuffer) {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(ds);
  return await new Response(stream).blob();
}

async function downloadDbBook(book, onProgress) {
  const url = REPO_RAW_BASE + book.filename; // e.g. "gurugiri.db.gz"
  onProgress && onProgress("ডাউনলোড হচ্ছে…");

  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (networkErr) {
    throw new Error("নেটওয়ার্ক সংযোগ পাওয়া যায়নি।");
  }
  if (!res.ok) throw new Error(`ডাউনলোড ব্যর্থ (HTTP ${res.status})`);
  const buffer = await res.arrayBuffer();

  onProgress && onProgress("আনপ্যাক হচ্ছে…");
  const dbBlob = await libDecompressGzip(buffer);
  const base64Data = await blobToBase64(dbBlob);

  const fs = fsPlugin();
  const packPath = libDbPackFileName(book.id);
  await fs.writeFile({ path: packPath, data: base64Data, directory: "DATA", recursive: true });

  onProgress && onProgress("একত্রিত হচ্ছে…");
  const uri = await fs.getUri({ path: packPath, directory: "DATA" });
  const nativePath = uri.uri.startsWith("file://") ? uri.uri.replace("file://", "") : uri.uri;
  await window.SwadhyayMasterDB.mergeLibraryBookPack(book.id, book.title, nativePath);
  try { await fs.deleteFile({ path: packPath, directory: "DATA" }); } catch (e) { /* non-fatal */ }

  const manifest = await getManifest();
  manifest[book.id] = {
    title: book.title,
    type: "db",
    downloadedAt: new Date().toISOString(),
  };
  await saveManifest(manifest);

  onProgress && onProgress("সম্পন্ন!");
  return { success: true };
}

async function deleteBook(bookId) {
  const manifest = await getManifest();
  const entry = manifest[bookId];
  if (!entry) return;

  if (entry.type === "db") {
    try {
      await window.SwadhyayMasterDB.removeLibraryBookPack(bookId);
    } catch (e) {
      console.warn("Library db.gz pack removal failed:", e);
    }
  } else {
    try {
      await fsPlugin().deleteFile({ path: entry.filename, directory: "DATA" });
    } catch (e) {
      console.warn("File already missing or failed to delete:", e);
    }
  }

  delete manifest[bookId];
  await saveManifest(manifest);
}

async function getFileUri(filename) {
  const res = await fsPlugin().getUri({ path: filename, directory: "DATA" });
  return res.uri;
}

window.VedaLibrary = {
  fetchBlogBooks,
  getManifest,
  downloadBook,
  deleteBook,
  getFileUri,
};
