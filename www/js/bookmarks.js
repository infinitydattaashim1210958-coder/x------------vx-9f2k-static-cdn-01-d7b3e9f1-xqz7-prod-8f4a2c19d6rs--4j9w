/**
 * bookmarks.js — Universal Bookmark Manager
 *
 * Works across every reader (Veda db.js mantras, Ramayana shlokas,
 * Mahabharata adhyays, Digital Library html_book) without knowing
 * anything about their internal DB structure. A bookmark is just:
 *
 *   { id, hash, title, subtitle, preview, note, scrollPercent, createdAt }
 *
 * `note` is optional free text the user can attach after bookmarking.
 *
 * `hash` is the app's own router hash (e.g. "#/mantra/rigveda/1.1.1",
 * "#/ramayana/shloka/1.1.1", "#/mahabharata/parba/301/adhyay/5",
 * "#/library/read/<bookId>"). Since app.js already routes every
 * readable location universally, reusing that hash as the bookmark's
 * target means bookmarks automatically work for any current — or
 * future — reader type, with zero reader-specific bookmark code.
 *
 * Storage: @capacitor/preferences (native) with localStorage fallback
 * (web), same convention as settings.js.
 */

const BOOKMARKS_KEY = "chaturveda_bookmarks";

const BookmarkManager = {
  _cache: null,

  async _load() {
    if (this._cache) return this._cache;
    let raw = null;
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        const r = await window.Capacitor.Plugins.Preferences.get({ key: BOOKMARKS_KEY });
        raw = r.value;
      } else {
        raw = localStorage.getItem(BOOKMARKS_KEY);
      }
    } catch (e) { /* fall back to empty list */ }
    try {
      this._cache = raw ? JSON.parse(raw) : [];
    } catch (e) {
      this._cache = [];
    }
    return this._cache;
  },

  async _save() {
    const raw = JSON.stringify(this._cache || []);
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        await window.Capacitor.Plugins.Preferences.set({ key: BOOKMARKS_KEY, value: raw });
      } else {
        localStorage.setItem(BOOKMARKS_KEY, raw);
      }
    } catch (e) {
      console.error("Bookmark save error:", e);
    }
  },

  async list() {
    const items = await this._load();
    return [...items].sort((a, b) => b.createdAt - a.createdAt);
  },

  async isBookmarked(hash) {
    const items = await this._load();
    return items.some(b => b.hash === hash);
  },

  // Adding again at the same hash updates that bookmark's scroll
  // position/timestamp in place instead of creating a duplicate.
  // Any existing `note` on the bookmark is preserved across re-adds.
  async add({ hash, title, subtitle, preview, scrollPercent }) {
    const items = await this._load();
    const existingIdx = items.findIndex(b => b.hash === hash);
    const bookmark = {
      id: existingIdx !== -1
        ? items[existingIdx].id
        : `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      hash,
      title: title || "",
      subtitle: subtitle || "",
      preview: (preview || "").slice(0, 140),
      note: existingIdx !== -1 ? (items[existingIdx].note || "") : "",
      scrollPercent: Math.max(0, Math.min(100, Math.round(scrollPercent || 0))),
      createdAt: Date.now(),
    };
    if (existingIdx !== -1) items[existingIdx] = bookmark;
    else items.push(bookmark);
    this._cache = items;
    await this._save();
    return bookmark;
  },

  // Update or clear the note on an existing bookmark (by hash).
  // Creates the bookmark first if it does not exist yet.
  async updateNote(hash, noteText) {
    const items = await this._load();
    const idx = items.findIndex(b => b.hash === hash);
    if (idx === -1) return; // only update existing bookmarks
    items[idx] = { ...items[idx], note: (noteText || "").slice(0, 500) };
    this._cache = items;
    await this._save();
    return items[idx];
  },

  async remove(id) {
    const items = await this._load();
    this._cache = items.filter(b => b.id !== id);
    await this._save();
  },
};

window.BookmarkManager = BookmarkManager;

/* ── Scroll capture / restore (main-window reading screens) ──────────
 * The iframe-based Digital Library reader captures/restores its own
 * scroll position separately in app.js (screenLibraryReader), since
 * that content lives in a different document. */

function bmCurrentScrollPercent() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return (window.scrollY / max) * 100;
}

// Content renders asynchronously (DB query → innerHTML), so the target
// scrollHeight isn't known the instant navigation happens. Retry a few
// times over ~1s rather than trying to hook into every screen's own
// render-completion timing.
function bmRestoreScrollPercent(percent, attemptsLeft = 6) {
  requestAnimationFrame(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    if (max > 0) window.scrollTo(0, (percent / 100) * max);
    if (attemptsLeft > 0) {
      setTimeout(() => bmRestoreScrollPercent(percent, attemptsLeft - 1), 150);
    }
  });
}

window.bmCurrentScrollPercent = bmCurrentScrollPercent;
window.bmRestoreScrollPercent = bmRestoreScrollPercent;
