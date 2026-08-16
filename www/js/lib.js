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

function fsPlugin() {
  return window.Capacitor.Plugins.Filesystem;
}
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadBook(book, onProgress) {
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
    downloadedAt: new Date().toISOString(),
  };
  await saveManifest(manifest);

  return { success: true, filename: localFilename };
}

async function deleteBook(bookId) {
  const manifest = await getManifest();
  const entry = manifest[bookId];
  if (!entry) return;
  try {
    await fsPlugin().deleteFile({ path: entry.filename, directory: "DATA" });
  } catch (e) {
    console.warn("File already missing or failed to delete:", e);
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
