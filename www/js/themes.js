/**
 * themes.js — Theme and accent color management for স্বাধ্যায়
 *
 * §28 — Extracted from settings.js so that app.js / other modules
 * can call applyTheme/applyAccent without importing the full settings module.
 *
 * Reads/writes via ChaturvedaSettings (settings.js), which must be
 * loaded first. This module only manages the DOM side:
 *   - Sets data-theme on <body>
 *   - Sets data-accent on <html>
 *   - Responds to system color-scheme changes
 */

const SwadhyayThemes = {
  /**
   * Apply a reading theme ('auto' | 'light' | 'dark').
   * 'auto' follows the OS prefers-color-scheme.
   */
  applyTheme(theme) {
    const body = document.body;
    body.dataset.theme = theme || "auto";
    if (theme === "auto") {
      // Let the CSS media query handle it; the data-theme="auto" value
      // is present only as a signal — the actual switch is CSS-driven.
    }
  },

  /**
   * Apply a sacred accent palette ('gold' | 'emerald' | 'indigo').
   * Stored on <html data-accent> to avoid conflicting with
   * <body data-theme> (light/dark) set above.
   */
  applyAccent(accent) {
    const root = document.documentElement;
    if (accent && accent !== "gold") {
      root.dataset.accent = accent;
    } else {
      delete root.dataset.accent;
    }
  },

  /** Boot — load stored prefs and apply immediately. */
  async init() {
    if (!window.ChaturvedaSettings) return;
    const s = await window.ChaturvedaSettings.loadAll();
    this.applyTheme(s.theme || "auto");
    this.applyAccent(s.accentTheme || "gold");

    // Re-apply if OS scheme changes at runtime (e.g. auto-dark at sunset)
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => {
      const current = await window.ChaturvedaSettings.get("theme");
      if (!current || current === "auto") this.applyTheme("auto");
    });
  },
};

window.SwadhyayThemes = SwadhyayThemes;
