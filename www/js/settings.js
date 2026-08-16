/**
 * settings.js — Chaturveda Settings Manager
 * Uses @capacitor/preferences (native) with localStorage fallback (web).
 */

const ChaturvedaSettings = {

  defaults: {
    fontSize: "18",          // stored as bare number string, used as px
    fontFamily: "default",
    theme: "auto",
    lineHeight: "normal",
    pageMargin: "normal",
    justifyText: true,
    keepAwake: false,
    language: "বাংলা",
    script: "বাংলা",
    transliteration: false,
  },

  async save(key, value) {
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        await window.Capacitor.Plugins.Preferences.set({ key, value: String(value) });
      } else {
        localStorage.setItem("chaturveda_" + key, String(value));
      }
    } catch (e) {
      console.error("Settings save error:", e);
    }
  },

  async get(key) {
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        const result = await window.Capacitor.Plugins.Preferences.get({ key });
        return result.value;
      }
      return localStorage.getItem("chaturveda_" + key);
    } catch (e) {
      return null;
    }
  },

  async loadAll() {
    const settings = {};
    for (const key in this.defaults) {
      let value = await this.get(key);
      if (value === null || value === undefined) value = this.defaults[key];
      if (value === "true") value = true;
      if (value === "false") value = false;
      settings[key] = value;
    }
    return settings;
  },

  async apply() {
    const s = await this.loadAll();
    const body = document.body;

    // Data attributes for CSS hooks
    body.dataset.theme = s.theme;
    body.dataset.fontSize = s.fontSize;
    body.dataset.fontFamily = s.fontFamily;
    body.dataset.lineHeight = s.lineHeight;
    body.dataset.margin = s.pageMargin;

    // Font size as CSS variable — always in px
    const fsPx = parseInt(s.fontSize, 10) || 18;
    document.documentElement.style.setProperty("--reader-font-size", fsPx + "px");

    // Font family
    const fontMap = {
      default: "Georgia,'Noto Serif Bengali','Noto Serif Devanagari',serif",
      serif: "'Noto Serif Bengali','Noto Serif Devanagari',Georgia,serif",
      sans: "'Noto Sans Bengali','Noto Sans',sans-serif",
    };
    document.documentElement.style.setProperty(
      "--reader-font-family",
      fontMap[s.fontFamily] || fontMap.default
    );

    // Line height
    const lhMap = { normal: "1.8", compact: "1.4", relaxed: "2.2" };
    document.documentElement.style.setProperty(
      "--reader-line-height",
      lhMap[s.lineHeight] || "1.8"
    );

    // Text justify
    if (s.justifyText) body.classList.add("justify-text");
    else body.classList.remove("justify-text");

    this.applyTheme(s.theme);
    return s;
  },

  applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // auto
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  },

  async setTheme(value) {
    await this.save("theme", value);
    this.applyTheme(value);
  },

  async setFontSize(value) {
    await this.save("fontSize", String(parseInt(value, 10)));
    document.documentElement.style.setProperty("--reader-font-size", parseInt(value, 10) + "px");
  },

  async setReaderOption(key, value) {
    await this.save(key, value);
    this.apply();
  },

  async clearCache() {
    try {
      if (window.VedaLibrary) {
        const manifest = await window.VedaLibrary.getManifest();
        for (const id in manifest) {
          await window.VedaLibrary.deleteBook(id);
        }
      }
      return "Cache cleared";
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  async getStorageUsage() {
    if (navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    }
    return 0;
  },

  async keepScreenAwake(enable) {
    await this.save("keepAwake", enable);
    try {
      if (window.Capacitor?.Plugins?.KeepAwake) {
        if (enable) await window.Capacitor.Plugins.KeepAwake.keepAwake();
        else await window.Capacitor.Plugins.KeepAwake.allowSleep();
      }
    } catch (e) {
      console.log(e);
    }
  },
};

window.ChaturvedaSettings = ChaturvedaSettings;

document.addEventListener("DOMContentLoaded", () => {
  ChaturvedaSettings.apply();
});
