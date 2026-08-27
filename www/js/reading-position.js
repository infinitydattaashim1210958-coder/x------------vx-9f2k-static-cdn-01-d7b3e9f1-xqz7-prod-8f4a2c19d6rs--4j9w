/**
 * reading-position.js — Continue Reading / Last Position per scripture
 *
 * Distinct from bookmarks.js: this is auto-tracked (no user action),
 * keeps only the single latest position per scripture/book (not a
 * list), and drives the Home screen's "আপনার পড়া চালিয়ে যান" card.
 *
 * Storage: @capacitor/preferences with localStorage fallback, same
 * convention as settings.js / bookmarks.js.
 */

const READING_POS_KEY = "chaturveda_reading_positions";

const ReadingPosition = {
  _cache: null,

  async _load() {
    if (this._cache) return this._cache;
    let raw = null;
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        const r = await window.Capacitor.Plugins.Preferences.get({ key: READING_POS_KEY });
        raw = r.value;
      } else {
        raw = localStorage.getItem(READING_POS_KEY);
      }
    } catch (e) { /* fall back to empty */ }
    try {
      this._cache = raw ? JSON.parse(raw) : {};
    } catch (e) {
      this._cache = {};
    }
    return this._cache;
  },

  async _save() {
    const raw = JSON.stringify(this._cache || {});
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        await window.Capacitor.Plugins.Preferences.set({ key: READING_POS_KEY, value: raw });
      } else {
        localStorage.setItem(READING_POS_KEY, raw);
      }
    } catch (e) {
      console.error("Reading position save error:", e);
    }
  },

  // Maps a router hash to a stable "scripture" bucket. Each Veda and
  // Ramayana/Mahabharata get one slot each; each library book gets its
  // own slot (they're independent reading contexts, same as the spec's
  // "Multiple Reading Contexts" example). Non-reading screens (search,
  // settings, bookmarks list, etc.) return null and are not tracked.
  scriptureKeyFromHash(hash) {
    const parts = (hash || "").replace(/^#\/?/, "").split("/");
    if (parts[0] === "mantra" && parts[1]) return `veda:${parts[1]}`;
    if (parts[0] === "ramayana") return "ramayana";
    if (parts[0] === "mahabharata") return "mahabharata";
    if (parts[0] === "library" && parts[1] === "read" && parts[2]) return `library:${parts[2]}`;
    return null;
  },

  async record({ hash, title, subtitle, scrollPercent }) {
    const key = this.scriptureKeyFromHash(hash);
    if (!key) return;
    const all = await this._load();
    all[key] = {
      hash,
      title: title || "",
      subtitle: subtitle || "",
      scrollPercent: Math.max(0, Math.min(100, Math.round(scrollPercent || 0))),
      updatedAt: Date.now(),
    };
    this._cache = all;
    await this._save();
  },

  async getAll() {
    return this._load();
  },

  // Most recently touched reading context, across every scripture/book —
  // this is what the Home screen's Continue Reading card shows.
  async getLatest() {
    const all = await this._load();
    const entries = Object.values(all);
    if (!entries.length) return null;
    return entries.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
  },

  async getForScripture(key) {
    const all = await this._load();
    return all[key] || null;
  },
};

window.ReadingPosition = ReadingPosition;
