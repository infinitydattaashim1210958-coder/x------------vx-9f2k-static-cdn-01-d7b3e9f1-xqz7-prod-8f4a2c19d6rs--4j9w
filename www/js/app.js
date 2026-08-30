/**
 * app.js — Hash router + screen renderer for স্বাধ্যায়
 * Covers: Vedas (4), Ramayana, Digital Library, Settings (all sections)
 */

const APP_BUILD_VERSION = "v7.1-home-hierarchy-settings-fix-2026-07-18";

const COPYRIGHT_HTML = `
  <div style="font-weight:bold;color:var(--gold-bright);">©️ Copyright &amp; Preservation</div>
  <div>All rights reserved. This digital work is protected and preserved for educational, spiritual and research purposes.</div>
  <div style="margin-top:6px;">Kyronix Innovation Group (KIG)</div>
  <div>Ashim Datta</div>
  <div>Founder &amp; CEO</div>`;
const root = document.getElementById("app");
const backBtn = document.getElementById("backBtn");
const titleEl = document.getElementById("appTitle");
const searchBtn = document.getElementById("searchBtn");
const settingsBtn = document.getElementById("settingsBtn");
const bookmarkBtn = document.getElementById("bookmarkBtn");
const addBookmarkFab = document.getElementById("addBookmarkFab");
const bottomDock = document.getElementById("bottomDock");

const VEDA_THEME = {
  rigveda:     { a: "#d4a24c", b: "#e8915c", tag: "Veda I · Knowledge" },
  yajurveda:   { a: "#ff7a1a", b: "#e8b23d", tag: "Veda II · Ritual" },
  samaveda:    { a: "#f2c464", b: "#ff7a1a", tag: "Veda III · Chant" },
  atharvaveda: { a: "#4f8c6b", b: "#c99a3e", tag: "Veda IV · Life" },
};

const RAMAYANA_KANDA_COLORS = [
  { a: "#c27ba0", b: "#e06c9f" },
  { a: "#7ba0c2", b: "#5c85c7" },
  { a: "#79b87a", b: "#4f8c6b" },
  { a: "#d4a24c", b: "#c98c30" },
  { a: "#b87979", b: "#c74f4f" },
  { a: "#9879b8", b: "#7b4fc9" },
];

const MAHABHARATA_PARBA_COLORS = [
  { a: "#b3542c", b: "#d97a3f" },
  { a: "#7ba0c2", b: "#5c85c7" },
  { a: "#4f8c6b", b: "#79b87a" },
  { a: "#c99a3e", b: "#e8b23d" },
  { a: "#9879b8", b: "#7b4fc9" },
  { a: "#c74f4f", b: "#b87979" },
];

let vedaCache = {};
let kandaCache = {}; // ramayana: id -> kanda object

/* ══════════════════════════════════════════════════════
   QUICK-JUMP PICKER BAR — v7.3
   "MANDALA: 1  SUKTA: 1  MANTRA: 1" style bar that can be dropped on
   top of any detail screen (mantra/shloka/adhyay). Tapping a field
   opens a scrollable number-list overlay (or a plain number input for
   very long ranges); picking a value calls the field's onSelect(value),
   which is responsible for navigating (sets location.hash). Existing
   list-based browsing screens are completely untouched by this —
   purely additive, called explicitly from screenMantra() /
   screenRamayanaShloka() / screenMahabharataAdhyay().
   fields: [{ key, label, current, currentLabel, options: async()=>[{value,label}] | null,
              range: {min,max} | null,  // used instead of options() when list would be too long
              onSelect: (value) => void }]
══════════════════════════════════════════════════════ */
const QUICK_JUMP_LIST_LIMIT = 300; // beyond this, fall back to a number-input prompt

/**
 * Horizontal scripture-switcher tab row (Rigveda/Yajurveda/... or Kanda
 * names or পর্ব names) — sits above the quick-jump picker bar on a
 * reading screen so the top-level scripture/section can be changed
 * without leaving the page. Single line, horizontal scroll for rows
 * that don't fit (18 পর্ব tabs).
 * tabs: [{ label, active, onSelect: () => void }]
 */
function renderScriptureTabBar(tabs) {
  const bar = el(`<div class="scriptureTabBar" role="tablist"></div>`);
  tabs.forEach((t) => {
    const btn = el(`<button type="button" role="tab" aria-selected="${t.active}" class="scriptureTab${t.active ? " active" : ""}">${t.label}</button>`);
    btn.addEventListener("click", t.onSelect);
    bar.appendChild(btn);
  });
  return bar;
}

function renderQuickJumpBar(fields) {
  const bar = el(`<div class="quickJumpBar"></div>`);
  fields.forEach((f) => {
    const chip = el(`<button type="button" class="quickJumpField" aria-haspopup="listbox" aria-expanded="false" aria-label="${f.label} নির্বাচন করুন">
      <span class="qjLabel">${f.label}</span><span class="qjValue">${f.currentLabel ?? f.current ?? "…"}</span>
    </button>`);
    chip.addEventListener("click", async () => {
      if (f.range && !f.options) {
        chip.setAttribute("aria-expanded", "true");
        openNumberInputPrompt(f.label, f.range.min, f.range.max, f.current, f.onSelect, () => chip.setAttribute("aria-expanded", "false"));
        return;
      }
      chip.classList.add("qjLoading");
      let options = [];
      try { options = await f.options(); }
      catch (e) { console.warn("quickJump options failed:", e); }
      finally { chip.classList.remove("qjLoading"); }
      if (!options.length) return;
      chip.setAttribute("aria-expanded", "true");
      const onClose = () => chip.setAttribute("aria-expanded", "false");
      if (options.length > QUICK_JUMP_LIST_LIMIT) {
        const vals = options.map(o => Number(o.value)).filter(v => !Number.isNaN(v));
        openNumberInputPrompt(f.label, Math.min(...vals), Math.max(...vals), f.current, f.onSelect, onClose);
        return;
      }
      openNumberPickerOverlay(f.label, options, f.current, f.onSelect, onClose);
    });
    bar.appendChild(chip);
  });
  return bar;
}

function closeAnyPickerOverlay() {
  document.querySelectorAll(".numberPickerOverlay, .numberInputOverlay").forEach(o => o.remove());
  document.querySelectorAll('.quickJumpField[aria-expanded="true"]').forEach(c => c.setAttribute("aria-expanded", "false"));
}

function openNumberPickerOverlay(title, options, currentValue, onPick, onClose) {
  closeAnyPickerOverlay();
  const overlay = el(`
    <div class="numberPickerOverlay">
      <div class="numberPickerScrim"></div>
      <div class="numberPickerSheet" role="listbox" aria-label="${title} নির্বাচন করুন">
        <div class="numberPickerTitle">${title} নির্বাচন করুন</div>
        <div class="numberPickerList">
          ${options.map(o => `<button type="button" role="option" aria-selected="${String(o.value) === String(currentValue)}" class="numberPickerItem${String(o.value) === String(currentValue) ? " active" : ""}" data-value="${o.value}">${o.label}</button>`).join("")}
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  const close = () => { onClose && onClose(); closeAnyPickerOverlay(); };
  overlay.querySelector(".numberPickerScrim").addEventListener("click", close);
  overlay.querySelectorAll(".numberPickerItem").forEach(btn => {
    btn.addEventListener("click", () => {
      close();
      onPick(btn.dataset.value);
    });
  });
  const activeEl = overlay.querySelector(".numberPickerItem.active");
  if (activeEl) { activeEl.scrollIntoView({ block: "center" }); activeEl.focus(); }
  else overlay.querySelector(".numberPickerItem")?.focus();
}

function openNumberInputPrompt(title, min, max, currentValue, onPick, onClose) {
  closeAnyPickerOverlay();
  const overlay = el(`
    <div class="numberInputOverlay">
      <div class="numberPickerScrim"></div>
      <div class="numberInputSheet" role="dialog" aria-label="${title} নির্বাচন করুন">
        <div class="numberPickerTitle" style="border:none;padding:0;">${title} (${min}–${max})</div>
        <input type="number" min="${min}" max="${max}" value="${currentValue ?? min}" inputmode="numeric" aria-label="${title} সংখ্যা লিখুন">
        <button type="button">যান</button>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  const input = overlay.querySelector("input");
  const close = () => { onClose && onClose(); closeAnyPickerOverlay(); };
  overlay.querySelector(".numberPickerScrim").addEventListener("click", close);
  overlay.querySelector("button").addEventListener("click", () => {
    const v = Math.max(min, Math.min(max, parseInt(input.value, 10) || min));
    close();
    onPick(String(v));
  });
  input.focus();
}

// Escape closes whichever picker overlay is open (§ accessibility: dialogs
// must be dismissible from the keyboard, not just by tapping the scrim).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = document.querySelector(".numberPickerOverlay, .numberInputOverlay");
  if (open) closeAnyPickerOverlay();
});

backBtn.onclick = () => window.history.back();

function setTitle(t) { titleEl.textContent = t; }
function showBack(show) { backBtn.style.visibility = show ? "visible" : "hidden"; }

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

/* ══════════════════════════════════════════════════════
   "LIVING UI" HELPERS — v7.2
   Small, self-contained, called from a few hook points
   (router, showBookmarkFab, addChapterBookmarkButtons)
   rather than threaded through every screen function.
══════════════════════════════════════════════════════ */

// 3. Ripple feedback on tappable rows — single delegated listener covers
// every screen since new .listItem/.mantraItem/etc DOM is created fresh
// per render; no per-screen wiring needed.
document.addEventListener("pointerdown", (e) => {
  const target = e.target.closest(
    ".listItem, .numChip, .rangeItem, .mantraItem, .bookCard, .item, .tabBtn, .langChip"
  );
  if (!target) return;
  const rect = target.getBoundingClientRect();
  target.style.setProperty("--x", `${e.clientX - rect.left}px`);
  target.style.setProperty("--y", `${e.clientY - rect.top}px`);
  target.classList.remove("ripple");
  void target.offsetWidth; // restart animation
  target.classList.add("ripple");
});

// 7. Bookmark burst — called wherever a bookmark 🔖 is actually saved
// (the FAB, and each per-chapter button in the library reader code).
function animateBookmarkBurst(button) {
  if (!button) return;
  button.classList.remove("bookmarkPop");
  void button.offsetWidth;
  button.classList.add("bookmarkPop");
}

// 8. Reading progress bar — one persistent element, shown/hidden together
// with the bookmark FAB (which already marks exactly which screens are
// "reading screens": mantra/shloka/adhyay/library-book detail views).
let _readingProgressEl = null;
function _readingProgressBar() {
  if (_readingProgressEl) return _readingProgressEl;
  _readingProgressEl = document.createElement("div");
  _readingProgressEl.id = "readingProgress";
  document.body.appendChild(_readingProgressEl);
  // rAF-batched, same pattern as the bottom dock's scroll handler — avoids
  // running a layout read (scrollHeight) + write (style.width) on every
  // single scroll event, which causes layout thrashing on long pages.
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!_readingProgressEl.classList.contains("visible") || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      _readingProgressEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      ticking = false;
    });
  }, { passive: true });
  return _readingProgressEl;
}
function showReadingProgress() { _readingProgressBar().classList.add("visible"); }
function hideReadingProgress() {
  if (_readingProgressEl) _readingProgressEl.classList.remove("visible");
}

// 10. Swipe navigation — left/right swipe triggers the same prev/next
// mantra/shloka/adhyay buttons every detail screen already renders
// (`.mantraNav .navBtn:first-child` = prev, `:last-child` = next).
// Ignored when the swipe is more vertical than horizontal (a normal
// scroll), and harmless no-op on screens with no .mantraNav at all.
(function initSwipeNav() {
  let x0 = 0, y0 = 0;
  document.addEventListener("touchstart", (e) => {
    x0 = e.changedTouches[0].screenX;
    y0 = e.changedTouches[0].screenY;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].screenX - x0;
    const dy = e.changedTouches[0].screenY - y0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy)) return;
    const nav = root.querySelector(".mantraNav");
    if (!nav) return;
    const prevBtn = nav.querySelector(".navBtn:first-child");
    const nextBtn = nav.querySelector(".navBtn:last-child");
    const btn = dx < 0 ? nextBtn : prevBtn;
    if (btn && !btn.classList.contains("disabled")) btn.click();
  }, { passive: true });
})();

/* ══════════════════════════════════════════════════════
   BOOKMARKS — universal add/open, works for any reader
   (db.js mantras, ramayana shlokas, mahabharata adhyays,
   html_book library) because it stores the app's own hash
   plus generic title/subtitle/preview/scroll% — no
   reader-specific structure required.
══════════════════════════════════════════════════════ */

// Set by a library-reader bookmark tap so screenLibraryReader knows to
// restore scroll inside its <iframe> once the book finishes loading.
window._bmPendingLibraryScroll = null;

function showBookmarkFab(meta) {
  if (!addBookmarkFab) return;
  addBookmarkFab.style.display = "flex";
  addBookmarkFab.onclick = async () => {
    const scrollPercent = meta.getScrollPercent ? meta.getScrollPercent() : bmCurrentScrollPercent();
    await window.BookmarkManager.add({
      hash: location.hash,
      title: meta.title || "",
      subtitle: meta.subtitle || "",
      preview: meta.preview || "",
      scrollPercent,
    });
    addBookmarkFab.textContent = "✅";
    animateBookmarkBurst(addBookmarkFab);
    setTimeout(() => { if (addBookmarkFab) addBookmarkFab.textContent = "🔖"; }, 900);
  };
  startReadingPositionTracking(meta);
  showReadingProgress();
}

function hideBookmarkFab() {
  if (!addBookmarkFab) return;
  addBookmarkFab.style.display = "none";
  addBookmarkFab.onclick = null;
  stopReadingPositionTracking();
  hideReadingProgress();
}

/* ── Continue Reading / Last Position ─────────────────────────────────
 * Piggybacks on the same show/hide lifecycle as the bookmark FAB, since
 * that already marks exactly which screens are "reading screens". Every
 * reader screen calling showBookmarkFab(meta) gets its position tracked
 * automatically — no extra call sites needed. */

let _readingPosCleanup = null;

function startReadingPositionTracking(meta) {
  stopReadingPositionTracking();
  if (!window.ReadingPosition) return;

  const record = () => {
    const pct = meta.getScrollPercent ? meta.getScrollPercent() : bmCurrentScrollPercent();
    window.ReadingPosition.record({
      hash: location.hash,
      title: meta.title,
      subtitle: meta.subtitle,
      scrollPercent: pct,
    });
  };

  record(); // capture the opening position immediately

  let debounceTimer;
  const onScroll = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(record, 800);
  };

  // Library reader scrolls inside its <iframe>'s own window, not the
  // main window — the caller passes that in as scrollEventTarget.
  const scrollTarget = meta.scrollEventTarget || window;
  try { scrollTarget.addEventListener("scroll", onScroll, { passive: true }); }
  catch (e) { /* cross-origin — skip live tracking, opening snapshot still recorded */ }
  document.addEventListener("visibilitychange", record);

  _readingPosCleanup = () => {
    clearTimeout(debounceTimer);
    try { scrollTarget.removeEventListener("scroll", onScroll); } catch (e) { /* ignore */ }
    document.removeEventListener("visibilitychange", record);
  };
}

function stopReadingPositionTracking() {
  if (_readingPosCleanup) {
    _readingPosCleanup();
    _readingPosCleanup = null;
  }
}

function openBookmark(bm) {
  if (bm.hash.startsWith("#/library/")) {
    window._bmPendingLibraryScroll = bm.scrollPercent;
  } else {
    bmRestoreScrollPercent(bm.scrollPercent);
  }
  if (location.hash === bm.hash) router();
  else location.hash = bm.hash;
}

async function screenBookmarks() {
  showBack(true);
  setTitle("বুকমার্ক");
  hideBookmarkFab();

  const items = await window.BookmarkManager.list();
  if (!items.length) {
    root.innerHTML = `<div class="empty">এখনো কোনো বুকমার্ক নেই।<br><small style="opacity:.6;">পড়ার সময় 🔖 বাটনে ট্যাপ করে বুকমার্ক যোগ করুন।</small></div>`;
    return;
  }

  root.innerHTML = `
    <div class="listHeader">${items.length}টা বুকমার্ক</div>
    <div class="bookmarkList">
      ${items.map(bm => `
        <div class="mantraItem" data-bm-id="${bm.id}" style="position:relative;">
          <div class="mref">${bm.title}${bm.subtitle ? " · " + bm.subtitle : ""}</div>
          ${bm.preview ? `<div class="mtext">${bm.preview}</div>` : ""}
          <button class="bmDeleteBtn" data-bm-del="${bm.id}" aria-label="মুছুন" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--gold);opacity:.6;font-size:1rem;">✕</button>
        </div>`).join("")}
    </div>`;

  const byId = {};
  items.forEach(bm => (byId[bm.id] = bm));

  root.querySelectorAll("[data-bm-id]").forEach(card => {
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-bm-del]")) return;
      openBookmark(byId[card.dataset.bmId]);
    });
  });

  root.querySelectorAll("[data-bm-del]").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await window.BookmarkManager.remove(btn.dataset.bmDel);
      screenBookmarks();
    });
  });
}

async function ensureVedaCache() {
  if (Object.keys(vedaCache).length) return;
  const rows = await window.VedaDB.getVedas();
  for (const r of rows) vedaCache[r.code] = r;
}

async function ensureKandaCache() {
  if (Object.keys(kandaCache).length) return;
  const kandas = await window.RamayanaDB.getKandas();
  for (const k of kandas) kandaCache[k.id] = k;
}

/* ══════════════════════════════════════════════════════
   HOME
══════════════════════════════════════════════════════ */
// Branch hierarchy shown on the home screen.
// `route` = available now; `soon` = placeholder, no data bundled yet.
const HOME_SECTIONS = [
  { icon: "🕉", label: "বেদ",           route: "#/vedas" },
  { icon: "🏹", label: "রামায়ণ",        route: "#/ramayana" },
  { icon: "⚔️", label: "মহাভারত",       route: "#/mahabharata" },
  { icon: "📖", label: "পুরাণ",         soon: true },
  { icon: "🔥", label: "ব্রাহ্মণ",      soon: true },
  { icon: "🪔", label: "উপনিষদ",        soon: true },
  { icon: "🌳", label: "আরণ্যক",        soon: true },
  { icon: "🔤", label: "নিরুক্তশাস্ত্র", soon: true },
  { icon: "🎵", label: "ছন্দশাস্ত্র",   soon: true },
  { icon: "🎓", label: "শিক্ষাশাস্ত্র", soon: true },
  { icon: "🕯", label: "তন্ত্র",         soon: true },
  { icon: "📜", label: "স্মৃতি",        soon: true },
  { icon: "🏠", label: "গৃহ্যসূত্র",    soon: true },
  { icon: "⚖️", label: "ধর্মসূত্র",     soon: true },
  { icon: "📚", label: "ডিজিটাল লাইব্রেরি", route: "#/library" },
];

async function screenHome() {
  showBack(false);
  setTitle("চতুর্বেদ সংকলন");

  const items = HOME_SECTIONS.map((s) => {
    if (s.soon) {
      return `<div class="listItem comingSoon" aria-disabled="true">
        <span class="icon">${s.icon}</span>
        <span class="label">${s.label}</span>
        <span class="badge">শীঘ্রই আসছে</span>
      </div>`;
    }
    return `<a class="listItem" href="${s.route}">
      <span class="icon">${s.icon}</span>
      <span class="label">${s.label}</span>
      <span class="arrow">›</span>
    </a>`;
  }).join("");

  const continueReading = window.ReadingPosition ? await window.ReadingPosition.getLatest() : null;
  const continueCard = continueReading ? `
    <div class="continueReadingCard" id="continueReadingCard">
      <div class="continueReadingLabel">আপনার পড়া চালিয়ে যান</div>
      <div class="continueReadingTitle">${continueReading.title}${continueReading.subtitle ? " · " + continueReading.subtitle : ""}</div>
    </div>` : "";

  const categoryChips = HOME_SECTIONS.filter(s => !s.soon).map(s => `
    <a class="categoryChip" href="${s.route}"><span class="chipIcon">${s.icon}</span>${s.label}</a>
  `).join("");

  root.innerHTML = `
    <div class="hero">
      <div class="om">ओ३म्</div>
      <div class="sub">The Four Vedas & Valmiki Ramayana — সম্পূর্ণ সংকলন</div>
    </div>
    <div class="categoryBar">${categoryChips}</div>
    ${continueCard}
    <div class="homeList">${items}</div>`;

  if (continueReading) {
    document.getElementById("continueReadingCard").addEventListener("click", () => {
      openBookmark(continueReading); // same hash + scroll% restore path as a bookmark tap
    });
  }
}

async function screenVedas() {
  await ensureVedaCache();
  const firstCode = Object.values(vedaCache)[0]?.code;
  if (firstCode) { await jumpToFirstMantra(firstCode); return; }
  showBack(true);
  setTitle("বেদ");
  root.innerHTML = `<div class="empty">বেদের তথ্য পাওয়া যায়নি।</div>`;
}

/**
 * Resolves and navigates to the very first mantra of a Veda (Mandala 1 ·
 * Sukta 1 · Mantra 1, or the equivalent for vedas with fewer levels),
 * so tapping "বেদ" (or a Veda tab) lands directly on the picker-bar
 * reading screen instead of the Mandala/Sukta grid drill-down. Those
 * grid screens (screenVeda/screenLevel1/etc, below) still exist and
 * still work if something else links to them.
 */
async function jumpToFirstMantra(code) {
  const veda = vedaCache[code];
  if (!veda) return;
  let firstRef = null;

  if (veda.level1_label) {
    const level1s = await window.VedaDB.getLevel1List(veda.id);
    const l1 = level1s[0]?.level1;
    if (l1 !== undefined) {
      if (veda.level2_label) {
        const level2s = await window.VedaDB.getLevel2List(veda.id, l1);
        const list = await window.VedaDB.getMantraList(veda.id, l1, level2s[0]?.level2 ?? null);
        firstRef = list[0]?.mantra_ref_id;
      } else {
        const list = await window.VedaDB.getMantraList(veda.id, l1, null);
        firstRef = list[0]?.mantra_ref_id;
      }
    }
  } else {
    const list = await window.VedaDB.getMantraRange(veda.id, 1, 1);
    firstRef = list[0]?.mantra_ref_id;
  }

  if (firstRef) location.hash = `#/mantra/${code}/${encodeURIComponent(firstRef)}`;
}

/* ══════════════════════════════════════════════════════
   VEDA SCREENS (unchanged logic)
══════════════════════════════════════════════════════ */
async function screenVeda(code) {
  await ensureVedaCache();
  const veda = vedaCache[code];
  if (!veda) return screenHome();
  showBack(true);
  setTitle(veda.name);

  if (veda.level1_label) {
    const level1s = await window.VedaDB.getLevel1List(veda.id);
    root.innerHTML = `
      <div class="listHeader">${veda.level1_label} বেছে নিন</div>
      <div class="numGrid">
        ${level1s.map(r => `<a class="numChip" href="#/veda/${code}/${r.level1}">${r.level1}</a>`).join("")}
      </div>`;
  } else {
    const total = await window.VedaDB.getMantraCount(veda.id);
    const chunkSize = 100;
    const chunks = [];
    for (let start = 1; start <= total; start += chunkSize)
      chunks.push([start, Math.min(start + chunkSize - 1, total)]);
    root.innerHTML = `
      <div class="listHeader">${veda.mantra_no_label || "মন্ত্র"} নির্বাচন করুন (মোট ${total})</div>
      <div class="rangeList">
        ${chunks.map(([s, e]) => `<a class="rangeItem" href="#/veda/${code}/range/${s}-${e}">${s}–${e}</a>`).join("")}
      </div>`;
  }
}

async function screenLevel1(code, level1) {
  await ensureVedaCache();
  const veda = vedaCache[code];
  if (!veda) return screenHome();
  showBack(true);
  setTitle(`${veda.level1_label} ${level1}`);

  if (veda.level2_label) {
    const level2s = await window.VedaDB.getLevel2List(veda.id, level1);
    root.innerHTML = `
      <div class="listHeader">${veda.level2_label} বেছে নিন</div>
      <div class="numGrid">
        ${level2s.map(r => `<a class="numChip" href="#/veda/${code}/${level1}/${r.level2}">${r.level2}</a>`).join("")}
      </div>`;
  } else {
    const mantras = await window.VedaDB.getMantraList(veda.id, level1, null);
    renderMantraList(veda, mantras);
  }
}

async function screenRange(code, fromNo, toNo) {
  await ensureVedaCache();
  const veda = vedaCache[code];
  if (!veda) return screenHome();
  showBack(true);
  setTitle(`${veda.mantra_no_label || "মন্ত্র"} ${fromNo}–${toNo}`);
  const mantras = await window.VedaDB.getMantraRange(veda.id, fromNo, toNo);
  renderMantraList(veda, mantras);
}

async function screenLevel2(code, level1, level2) {
  await ensureVedaCache();
  const veda = vedaCache[code];
  if (!veda) return screenHome();
  showBack(true);
  setTitle(`${veda.level1_label} ${level1} · ${veda.level2_label} ${level2}`);
  const mantras = await window.VedaDB.getMantraList(veda.id, level1, level2);
  renderMantraList(veda, mantras);
}

function renderMantraList(veda, mantras) {
  root.innerHTML = `
    <div class="listHeader">${mantras.length} মন্ত্র</div>
    <div class="mantraList">
      ${mantras.map(m => `
        <a class="mantraItem" href="#/mantra/${veda.code}/${encodeURIComponent(m.mantra_ref_id)}">
          <div class="mref">${m.mantra_ref_id}</div>
          <div class="mtext">${(m.sanskrit_swara || m.sanskrit_text || "").slice(0, 70)}${(m.sanskrit_swara || m.sanskrit_text || "").length > 70 ? "…" : ""}</div>
        </a>`).join("")}
    </div>`;
}

/**
 * Builds the Mandala/Sukta/Mantra (or however many levels this veda
 * actually has) quick-jump field set for screenMantra()'s picker bar.
 * Returns null for vedas with zero hierarchy levels AND a huge flat
 * mantra count where a jump bar wouldn't add much over Prev/Next.
 */
async function buildVedaQuickJumpFields(code, veda, mantra) {
  const fields = [];

  if (veda.level1_label && veda.level2_label) {
    // 3-level: Mandala / Sukta / Mantra-in-sukta
    const groupList = await window.VedaDB.getMantraList(veda.id, mantra.level1, mantra.level2);
    const localIndex = groupList.findIndex(m => m.id === mantra.id) + 1;

    fields.push({
      label: veda.level1_label, current: mantra.level1, currentLabel: mantra.level1,
      options: async () => (await window.VedaDB.getLevel1List(veda.id)).map(r => ({ value: r.level1, label: r.level1 })),
      onSelect: async (val) => {
        const level2s = await window.VedaDB.getLevel2List(veda.id, val);
        const list = await window.VedaDB.getMantraList(veda.id, val, level2s[0]?.level2 ?? null);
        if (list[0]) location.hash = `#/mantra/${code}/${encodeURIComponent(list[0].mantra_ref_id)}`;
      },
    });
    fields.push({
      label: veda.level2_label, current: mantra.level2, currentLabel: mantra.level2,
      options: async () => (await window.VedaDB.getLevel2List(veda.id, mantra.level1)).map(r => ({ value: r.level2, label: r.level2 })),
      onSelect: async (val) => {
        const list = await window.VedaDB.getMantraList(veda.id, mantra.level1, val);
        if (list[0]) location.hash = `#/mantra/${code}/${encodeURIComponent(list[0].mantra_ref_id)}`;
      },
    });
    fields.push({
      label: veda.mantra_no_label || "মন্ত্র", current: localIndex, currentLabel: String(localIndex),
      options: async () => groupList.map((m, i) => ({ value: m.mantra_ref_id, label: String(i + 1) })),
      onSelect: (val) => { location.hash = `#/mantra/${code}/${encodeURIComponent(val)}`; },
    });
  } else if (veda.level1_label) {
    // 2-level: level1 / Mantra-in-level1
    const groupList = await window.VedaDB.getMantraList(veda.id, mantra.level1, null);
    const localIndex = groupList.findIndex(m => m.id === mantra.id) + 1;

    fields.push({
      label: veda.level1_label, current: mantra.level1, currentLabel: mantra.level1,
      options: async () => (await window.VedaDB.getLevel1List(veda.id)).map(r => ({ value: r.level1, label: r.level1 })),
      onSelect: async (val) => {
        const list = await window.VedaDB.getMantraList(veda.id, val, null);
        if (list[0]) location.hash = `#/mantra/${code}/${encodeURIComponent(list[0].mantra_ref_id)}`;
      },
    });
    fields.push({
      label: veda.mantra_no_label || "মন্ত্র", current: localIndex, currentLabel: String(localIndex),
      options: async () => groupList.map((m, i) => ({ value: m.mantra_ref_id, label: String(i + 1) })),
      onSelect: (val) => { location.hash = `#/mantra/${code}/${encodeURIComponent(val)}`; },
    });
  } else {
    // Flat: just a global mantra-number jump (number-input for large counts).
    const total = await window.VedaDB.getMantraCount(veda.id);
    if (total <= 1) return null;
    fields.push({
      label: veda.mantra_no_label || "মন্ত্র", current: mantra.mantra_no, currentLabel: String(mantra.mantra_no),
      range: { min: 1, max: total },
      onSelect: async (val) => {
        const list = await window.VedaDB.getMantraRange(veda.id, Number(val), Number(val));
        if (list[0]) location.hash = `#/mantra/${code}/${encodeURIComponent(list[0].mantra_ref_id)}`;
      },
    });
  }

  return fields;
}

async function screenMantra(code, refEncodedWithQuery) {
  await ensureVedaCache();
  const veda = vedaCache[code];
  if (!veda) return screenHome();

  const [refEncoded, queryString] = refEncodedWithQuery.split("?");
  const ref = decodeURIComponent(refEncoded);
  const queryParams = new URLSearchParams(queryString || "");
  const wantedLang = queryParams.get("lang");
  const wantedScholarId = queryParams.get("scholar") ? parseInt(queryParams.get("scholar"), 10) : null;

  showBack(true);
  setTitle(`${veda.name} ${ref}`);

  const mantra = await window.VedaDB.getMantraByRef(veda.id, ref);
  if (!mantra) {
    root.innerHTML = `<div class="empty">এই মন্ত্র খুঁজে পাওয়া যায়নি।</div>`;
    return;
  }
  const scholars = await window.VedaDB.getScholarsForMantra(veda.id, mantra.id);
  const { prev, next } = await window.VedaDB.getAdjacentMantras(veda.id, mantra.id);
  const quickJumpFields = await buildVedaQuickJumpFields(code, veda, mantra);

  const meta = [
    mantra.devata ? `দেবতা: ${mantra.devata}` : "",
    mantra.rishi ? `ঋষি: ${mantra.rishi}` : "",
    mantra.chhanda ? `ছন্দ: ${mantra.chhanda}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const LANG_NORMALIZE = { "Hinglish": "Hindi" };
  const byLang = {};
  for (const s of scholars) {
    let lang = s.language || "অন্যান্য";
    lang = LANG_NORMALIZE[lang] || lang;
    s._lang = lang;
    if (!byLang[lang]) byLang[lang] = [];
    byLang[lang].push(s);
  }
  const langOrder = Object.keys(byLang).sort((a, b) => a.localeCompare(b, "en"));

  let activeLang = langOrder.includes(wantedLang) ? wantedLang : langOrder[0];
  let activeScholarId =
    wantedScholarId && byLang[activeLang]?.some(s => s.id === wantedScholarId)
      ? wantedScholarId
      : byLang[activeLang]?.[0]?.id ?? null;

  const navState = { lang: activeLang, scholarId: activeScholarId };

  function navUrl(targetRef) {
    if (!targetRef) return "";
    const q = navState.lang
      ? `?lang=${encodeURIComponent(navState.lang)}${navState.scholarId ? `&scholar=${navState.scholarId}` : ""}`
      : "";
    return `#/mantra/${code}/${encodeURIComponent(targetRef)}${q}`;
  }

  function sizeLabel(bytes) {
    if (!bytes) return "";
    const kb = bytes / 1024;
    return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  const langChipsHtml = langOrder.map(lang =>
    `<button class="langChip ${lang === activeLang ? "active" : ""}" data-lang="${lang}">${lang}</button>`
  ).join("");

  const scholarGroupsHtml = langOrder.map(lang => `
    <div class="scholarGroup ${lang === activeLang ? "active" : ""}" data-lang-group="${lang}">
      <div class="tabBar tabBarVertical">
        ${byLang[lang].map(s =>
          `<button class="tabBtn ${s.id === activeScholarId ? "active" : ""}" data-scholar="${s.id}">
            ${s.name}${s.downloaded ? "" : " ⬇"}
          </button>`
        ).join("")}
      </div>
      <div class="tabPanels">
        ${byLang[lang].map(s =>
          `<div class="tabPanel ${s.id === activeScholarId ? "active" : ""}" data-scholar="${s.id}" data-loaded="0">
            <div class="panelBody"></div>
          </div>`
        ).join("")}
      </div>
    </div>
  `).join("");

  root.innerHTML = `
    <div class="mantraDetail">
      <div class="sanskritBlock">${mantra.sanskrit_swara || mantra.sanskrit_text || ""}</div>
      ${meta ? `<div class="mantraMeta">${meta}</div>` : ""}
    </div>
    ${scholars.length ? `
      <div class="langChips">${langChipsHtml}</div>
      ${scholarGroupsHtml}
    ` : `<div class="empty">এই মন্ত্রের কোনো ভাষ্য পাওয়া যায়নি।</div>`}
    <div class="mantraNav">
      <a class="navBtn ${prev ? "" : "disabled"}" ${prev ? `href="${navUrl(prev)}"` : ""}>← আগের মন্ত্র</a>
      <a class="navBtn ${next ? "" : "disabled"}" ${next ? `href="${navUrl(next)}"` : ""}>পরের মন্ত্র →</a>
    </div>`;

  if (quickJumpFields) {
    const topBars = document.createElement("div");
    topBars.appendChild(renderScriptureTabBar(
      Object.values(vedaCache).map(v => ({
        label: v.name, active: v.code === code,
        onSelect: () => { if (v.code !== code) jumpToFirstMantra(v.code); },
      }))
    ));
    topBars.appendChild(renderQuickJumpBar(quickJumpFields));
    root.prepend(topBars);
  }

  showBookmarkFab({
    title: veda.name,
    subtitle: ref,
    preview: (mantra.sanskrit_swara || mantra.sanskrit_text || "").replace(/\n/g, " ").slice(0, 140),
  });

  function refreshNavLinks() {
    const p = root.querySelector(".mantraNav .navBtn:first-child");
    const n = root.querySelector(".mantraNav .navBtn:last-child");
    if (p && prev) p.setAttribute("href", navUrl(prev));
    if (n && next) n.setAttribute("href", navUrl(next));
  }

  const scholarsById = {};
  scholars.forEach(s => (scholarsById[s.id] = s));

  async function loadPanel(panel) {
    if (panel.dataset.loaded === "1") return;
    const scholarId = parseInt(panel.dataset.scholar, 10);
    const s = scholarsById[scholarId];
    const body = panel.querySelector(".panelBody");

    if (!s.downloaded) {
      body.innerHTML = `
        <div class="downloadPrompt">
          <div class="downloadPromptText">এই ভাষ্য ডাউনলোড করা হয়নি (${sizeLabel(s.pack_size_bytes)}, ${s.entry_count} এন্ট্রি)</div>
          <button class="bookBtn downloadBtn" data-scholar-dl="${scholarId}">ডাউনলোড করুন</button>
          <div class="bookStatus" data-dl-status="${scholarId}"></div>
        </div>`;
      body.querySelector(".downloadBtn").addEventListener("click", async () => {
        const btn = body.querySelector(".downloadBtn");
        const statusEl = body.querySelector(`[data-dl-status="${scholarId}"]`);
        btn.disabled = true;
        try {
          await window.VedaDB.downloadPack(scholarId, s.pack_file, msg => { if (statusEl) statusEl.textContent = msg; });
          s.downloaded = true;
          panel.dataset.loaded = "0";
          await loadPanel(panel);
          const tabBtn = root.querySelector(`.tabBtn[data-scholar="${scholarId}"]`);
          if (tabBtn) tabBtn.innerHTML = s.name;
        } catch (e) {
          btn.disabled = false;
          if (statusEl) statusEl.textContent = "ব্যর্থ: " + (e.message || e);
        }
      });
      return;
    }

    body.innerHTML = `<div class="empty" style="padding:20px 0;">লোড হচ্ছে…</div>`;
    try {
      const fields = await window.VedaDB.getBhashyaForMantraFromPack(scholarId, mantra.id);
      body.innerHTML = `
        <div class="panelDeleteRow">
          <button class="miniBtn deletePackBtn" data-scholar-del="${scholarId}">এই ভাষ্য মুছুন</button>
        </div>
        ${fields.length
          ? fields.map(f => `<div class="field"><div class="fieldLabel">${f.field_key}</div><div class="fieldValue">${f.value}</div></div>`).join("")
          : `<div class="empty">এই মন্ত্রে এই ভাষ্যকারের কোনো তথ্য নেই।</div>`}`;
      body.querySelector(".deletePackBtn").addEventListener("click", async () => {
        if (!confirm(`"${s.name}" ভাষ্য মুছে ফেলতে চান?`)) return;
        await window.VedaDB.deletePack(scholarId);
        s.downloaded = false;
        panel.dataset.loaded = "0";
        await loadPanel(panel);
        const tabBtn = root.querySelector(`.tabBtn[data-scholar="${scholarId}"]`);
        if (tabBtn) tabBtn.innerHTML = s.name + " ⬇";
      });
    } catch (e) {
      body.innerHTML = `<div class="empty">লোড করতে সমস্যা।<br><small>${e.message || e}</small></div>`;
    }
    panel.dataset.loaded = "1";
  }

  const firstActive = root.querySelector(".tabPanel.active");
  if (firstActive) loadPanel(firstActive);

  root.querySelectorAll(".langChip").forEach(chip => {
    chip.addEventListener("click", () => {
      root.querySelectorAll(".langChip").forEach(c => c.classList.remove("active"));
      root.querySelectorAll(".scholarGroup").forEach(g => g.classList.remove("active"));
      chip.classList.add("active");
      const group = root.querySelector(`.scholarGroup[data-lang-group="${chip.dataset.lang}"]`);
      group.classList.add("active");
      const activePanel = group.querySelector(".tabPanel.active");
      if (activePanel) loadPanel(activePanel);
      navState.lang = chip.dataset.lang;
      const activeBtn = group.querySelector(".tabBtn.active");
      navState.scholarId = activeBtn ? parseInt(activeBtn.dataset.scholar, 10) : null;
      refreshNavLinks();
      chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  });

  let _vedaActiveScholarId = null;
  const initVedaBtn = root.querySelector(".tabBtn.active");
  if (initVedaBtn) _vedaActiveScholarId = parseInt(initVedaBtn.dataset.scholar, 10);

  root.querySelectorAll(".tabBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newId = parseInt(btn.dataset.scholar, 10);
      if (newId === _vedaActiveScholarId) return;
      if (_vedaActiveScholarId != null) {
        try { await window.VedaDB.detachPack(_vedaActiveScholarId); } catch (e) {}
        const prev = root.querySelector(`.tabPanel[data-scholar="${_vedaActiveScholarId}"]`);
        if (prev && prev.dataset.loaded === "1") prev.dataset.loaded = "0";
      }
      _vedaActiveScholarId = newId;
      const group = btn.closest(".scholarGroup");
      group.querySelectorAll(".tabBtn").forEach(b => b.classList.remove("active"));
      group.querySelectorAll(".tabPanel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = group.querySelector(`.tabPanel[data-scholar="${btn.dataset.scholar}"]`);
      panel.classList.add("active");
      loadPanel(panel);
      navState.scholarId = newId;
      refreshNavLinks();
      btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  });
}

/* ══════════════════════════════════════════════════════
   RAMAYANA SCREENS
══════════════════════════════════════════════════════ */

/**
 * Ramayana download gate.
 *
 * Renders a full-screen download prompt if ramayana.db has not been
 * fetched yet. Returns true if the DB is ready (caller may proceed),
 * false if the download UI was shown (caller must return immediately).
 *
 * On successful download it re-initialises RamayanaDB, repopulates
 * kandaCache, then navigates to the requested destination hash so the
 * user lands exactly where they tapped.
 *
 * @param {string} [destHash]  Hash to navigate to after download,
 *                             e.g. "#/ramayana". Defaults to "#/ramayana".
 */
async function ramayanaDownloadGate(destHash = "#/ramayana") {
  // Fast path: DB already open and init'd — no gate needed.
  if (window.RamayanaDB._initDone) return true;

  const alreadyDl = await window.RamayanaDB.isRamayanaDownloaded();
  if (alreadyDl) {
    // Downloaded but not yet connected in this session — init now.
    try {
      await window.RamayanaDB.initDB();
      return true;
    } catch (e) {
      if (!e.needsDownload) throw e;
    }
  }

  // ── Show download gate UI ──────────────────────────────────────
  showBack(true);
  setTitle("বাল্মীকি রামায়ণ");

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:28px 20px;text-align:center;">
      <div style="font-size:3rem;margin-bottom:16px;">🏹</div>
      <h2 style="margin:0 0 8px;">বাল্মীকি রামায়ণ</h2>
      <p style="opacity:.7;margin:0 0 8px;font-size:.9rem;">534 Sargas · 17,902 Shlokas</p>
      <p style="opacity:.6;margin:0 0 28px;font-size:.85rem;">
        রামায়ণ ডেটাবেস একবার ডাউনলোড করতে হবে (~৩০–৫০ MB)।<br>
        এরপর সম্পূর্ণ অফলাইনে পড়া যাবে।
      </p>
      <button id="dlRamayanaBtn" style="
        background:var(--gold,#c8972b);color:#1a1200;border:none;
        padding:14px 32px;border-radius:12px;font-size:1rem;
        font-weight:700;cursor:pointer;min-width:200px;">
        ডাউনলোড করুন
      </button>
      <div id="dlRamayanaStatus" style="margin-top:18px;font-size:.9rem;min-height:24px;opacity:.8;"></div>
      <div id="dlRamayanaBar" style="
        display:none;width:240px;height:6px;background:rgba(255,255,255,.15);
        border-radius:4px;margin-top:12px;overflow:hidden;">
        <div id="dlRamayanaFill" style="height:100%;width:0%;background:var(--gold,#c8972b);
          transition:width .3s;border-radius:4px;"></div>
      </div>
    </div>`;

  const btn       = root.querySelector("#dlRamayanaBtn");
  const statusEl  = root.querySelector("#dlRamayanaStatus");
  const barEl     = root.querySelector("#dlRamayanaBar");
  const fillEl    = root.querySelector("#dlRamayanaFill");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "ডাউনলোড হচ্ছে…";
    barEl.style.display = "block";

    // Animate the bar indeterminately while downloading
    let pct = 0;
    const ticker = setInterval(() => {
      pct = pct < 90 ? pct + 2 : pct;
      fillEl.style.width = pct + "%";
    }, 300);

    try {
      await window.RamayanaDB.downloadRamayana(msg => {
        if (statusEl) statusEl.textContent = msg;
      });

      clearInterval(ticker);
      fillEl.style.width = "100%";
      statusEl.textContent = "ইনিশিয়ালাইজ হচ্ছে…";

      window.RamayanaDB.resetInit();
      await window.RamayanaDB.initDB();

      // Repopulate kanda cache so subsequent screens don't re-fetch
      kandaCache = {};
      await ensureKandaCache();

      // Navigate to where the user wanted to go
      window.location.hash = destHash;

    } catch (e) {
      clearInterval(ticker);
      btn.disabled = false;
      btn.textContent = "আবার চেষ্টা করুন";
      statusEl.textContent = "ব্যর্থ: " + (e.message || e);
      fillEl.style.width = "0%";
    }
  });

  return false; // gate shown; caller must return
}

async function screenRamayana() {
  if (!await ramayanaDownloadGate("#/ramayana")) return;
  await ensureKandaCache();
  const firstKandaId = Object.values(kandaCache)[0]?.id;
  if (firstKandaId) { await jumpToFirstShloka(firstKandaId); return; }
  showBack(true);
  setTitle("বাল্মীকি রামায়ণ");
  root.innerHTML = `<div class="empty">রামায়ণের তথ্য পাওয়া যায়নি।</div>`;
}

/**
 * Resolves and navigates to Sarga 1 · Shloka 1 of a Kanda, so tapping
 * "রামায়ণ" (or a Kanda tab) lands directly on the picker-bar reading
 * screen instead of the Sarga-list drill-down. screenRamayanaKanda()
 * (below) still exists and still works if something else links to it.
 */
async function jumpToFirstShloka(kandaId) {
  const sargas = await window.RamayanaDB.getSargasForKanda(kandaId);
  if (!sargas[0]) return;
  const shlokas = await window.RamayanaDB.getShlokasForSarga(sargas[0].id);
  if (!shlokas[0]) return;
  const ref = `K${kandaId}.S${sargas[0].id}.${shlokas[0].id}`;
  location.hash = `#/ramayana/shloka/${encodeURIComponent(ref)}`;
}

async function screenRamayanaKanda(kandaId) {
  if (!await ramayanaDownloadGate(`#/ramayana/kanda/${kandaId}`)) return;
  showBack(true);
  await ensureKandaCache();
  const kanda = kandaCache[kandaId];
  if (!kanda) return screenRamayana();
  setTitle(`${kanda.name} Kanda`);

  const sargas = await window.RamayanaDB.getSargasForKanda(kandaId);
  root.innerHTML = `
    <div class="listHeader">${sargas.length} Sargas</div>
    <div class="mantraList">
      ${sargas.map(s => `
        <a class="mantraItem" href="#/ramayana/sarga/${s.id}">
          <div class="mref">Sarga ${s.chapter}</div>
          <div class="mtext">${s.name}</div>
        </a>`).join("")}
    </div>`;
}

async function screenRamayanaSarga(sargaId) {
  if (!await ramayanaDownloadGate(`#/ramayana/sarga/${sargaId}`)) return;
  showBack(true);
  setTitle("Sarga লোড হচ্ছে…");

  const sarga = await window.RamayanaDB.getSargaById(sargaId);
  if (!sarga) { root.innerHTML = `<div class="empty">Sarga পাওয়া যায়নি।</div>`; return; }

  await ensureKandaCache();
  const kanda = kandaCache[sarga.kanda_id];
  setTitle(`${kanda?.name || ""} · Sarga ${sarga.chapter}`);

  const shlokas = await window.RamayanaDB.getShlokasForSarga(sargaId);

  root.innerHTML = `
    <div class="mantraDetail" style="text-align:left;">
      <div style="color:var(--gold);font-size:.88rem;margin-bottom:6px;">${kanda?.name || ""} Kanda · Sarga ${sarga.chapter}</div>
      <div style="font-size:1rem;line-height:1.5;">${sarga.name}</div>
    </div>
    <div class="listHeader">${shlokas.length} Shlokas</div>
    <div class="mantraList">
      ${shlokas.map(sh => {
        const ref = `K${sh.kanda_id}.S${sh.sarga_id}.${sh.id}`;
        const preview = (sh.sanskrit || "").slice(0, 70).replace(/\n/g, " ");
        return `<a class="mantraItem" href="#/ramayana/shloka/${encodeURIComponent(ref)}">
          <div class="mref">Shloka ${sh.id}</div>
          <div class="mtext">${preview}${(sh.sanskrit || "").length > 70 ? "…" : ""}</div>
        </a>`;
      }).join("")}
    </div>`;
}

/**
 * Builds the Sarga/Shloka quick-jump field set for screenRamayanaShloka()'s
 * picker bar. Kanda-switching is handled by the scriptureTabBar above it
 * (see screenRamayanaShloka), not a field here, so there's no third
 * "কাণ্ড" field duplicating that.
 */
async function buildRamayanaQuickJumpFields(shloka, kanda) {
  const sargas = await window.RamayanaDB.getSargasForKanda(shloka.kanda_id);
  const currentSarga = sargas.find(s => s.id === shloka.sarga_id);
  const shlokas = await window.RamayanaDB.getShlokasForSarga(shloka.sarga_id);

  return [
    {
      label: "সর্গ", current: shloka.sarga_id, currentLabel: currentSarga ? String(currentSarga.chapter) : "…",
      options: async () => sargas.map(s => ({ value: s.id, label: String(s.chapter) })),
      onSelect: async (val) => {
        const newShlokas = await window.RamayanaDB.getShlokasForSarga(Number(val));
        if (!newShlokas[0]) return;
        location.hash = `#/ramayana/shloka/${encodeURIComponent(`K${shloka.kanda_id}.S${val}.${newShlokas[0].id}`)}`;
      },
    },
    {
      label: "শ্লোক", current: shloka.id, currentLabel: String(shloka.id),
      options: async () => shlokas.map(sh => ({ value: sh.id, label: String(sh.id) })),
      onSelect: (val) => {
        location.hash = `#/ramayana/shloka/${encodeURIComponent(`K${shloka.kanda_id}.S${shloka.sarga_id}.${val}`)}`;
      },
    },
  ];
}

async function screenRamayanaShloka(refEncoded) {
  if (!await ramayanaDownloadGate(`#/ramayana/shloka/${refEncoded}`)) return;
  showBack(true);
  const ref = decodeURIComponent(refEncoded);
  setTitle("Shloka লোড হচ্ছে…");

  const shloka = await window.RamayanaDB.getShlokaByRef(ref);
  if (!shloka) {
    root.innerHTML = `<div class="empty">Shloka পাওয়া যায়নি। (ref: ${ref})</div>`;
    return;
  }

  await ensureKandaCache();
  const kanda = kandaCache[shloka.kanda_id];
  setTitle(`${kanda?.name || ""} · Sarga ${shloka.sarga_id} · ${shloka.id}`);

  const { prev, next } = await window.RamayanaDB.getAdjacentShlokas(shloka.id, shloka.sarga_id);
  const quickJumpFields = await buildRamayanaQuickJumpFields(shloka, kanda);

  function navHref(shlokaId) {
    if (!shlokaId) return "";
    const ref = `K${shloka.kanda_id}.S${shloka.sarga_id}.${shlokaId}`;
    return `#/ramayana/shloka/${encodeURIComponent(ref)}`;
  }

  function sizeLabel(bytes) {
    if (!bytes) return "";
    const kb = bytes / 1024;
    return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  // Bhāṣya commentary — one pack per Kanda (RamayanaDB's own pack system,
  // NOT VedaDB.getScholarsForShloka, whose core.db tables are unpopulated
  // for Ramayana; the real downloaded data lives in ramayana_kanda_N.db.gz).
  const ramPack = window.RamayanaDB.KANDA_PACKS.find(p => p.kanda_id === shloka.kanda_id);
  const ramPackDownloaded = ramPack ? await window.RamayanaDB.isPackDownloaded(ramPack.id) : false;

  const bhashyaSectionHtml = ramPack ? `
    <div class="section" style="margin-top:14px;">
      <div class="sectionTitle">📜 ভাষ্য (Commentary) — ${ramPack.name}</div>
      <div class="tabPanel active" id="ramBhashyaPanel">
        <div class="panelBody"></div>
      </div>
    </div>` : "";

  root.innerHTML = `
    <div class="mantraDetail">
      <div class="mantraMeta">${kanda?.name || ""} Kanda · Sarga ${shloka.sarga_id} · Shloka ${shloka.id}</div>
      <div class="sanskritBlock" style="margin-top:12px;">${(shloka.sanskrit || "").replace(/\n/g, "<br>")}</div>
    </div>

    ${shloka.tat ? `
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:14px;">
      <div class="fieldLabel">Translation</div>
      <div class="fieldValue" style="font-style:italic;">${shloka.tat.replace(/\n/g, "<br>")}</div>
    </div>` : ""}

    ${shloka.pratipada ? `
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:14px;">
      <div class="fieldLabel">Word-by-word (Pratipada)</div>
      <div class="fieldValue" style="font-family:monospace;font-size:.88rem;line-height:1.9;">${shloka.pratipada.replace(/\n/g, "<br>")}</div>
    </div>` : ""}

    ${shloka.comment ? `
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:14px;">
      <div class="fieldLabel">Comment</div>
      <div class="fieldValue">${shloka.comment.replace(/\n/g, "<br>")}</div>
    </div>` : ""}

    ${bhashyaSectionHtml}

    <div class="mantraNav">
      <a class="navBtn ${prev ? "" : "disabled"}" ${prev ? `href="${navHref(prev)}"` : ""}>← আগের শ্লোক</a>
      <a class="navBtn ${next ? "" : "disabled"}" ${next ? `href="${navHref(next)}"` : ""}>পরের শ্লোক →</a>
    </div>`;

  root.prepend(renderQuickJumpBar(quickJumpFields));

  {
    const topBars = document.createElement("div");
    topBars.appendChild(renderScriptureTabBar(
      Object.values(kandaCache).map(k => ({
        label: k.name, active: k.id === shloka.kanda_id,
        onSelect: () => { if (k.id !== shloka.kanda_id) jumpToFirstShloka(k.id); },
      }))
    ));
    root.prepend(topBars);
    topBars.appendChild(root.querySelector(".quickJumpBar"));
  }

  showBookmarkFab({
    title: kanda?.name || "রামায়ণ",
    subtitle: `Sarga ${shloka.sarga_id} · Shloka ${shloka.id}`,
    preview: (shloka.sanskrit || "").replace(/\n/g, " ").slice(0, 140),
  });

  if (!ramPack) return;

  const panel = document.getElementById("ramBhashyaPanel");
  const body = panel.querySelector(".panelBody");

  async function loadBhashyaPanel() {
    if (!ramPackDownloaded) {
      body.innerHTML = `
        <div class="downloadPrompt">
          <div class="downloadPromptText">এই ভাষ্য ডাউনলোড করা হয়নি (${sizeLabel(ramPack.pack_size_bytes)})</div>
          <button class="bookBtn downloadBtn" id="ramBhashyaDownloadBtn">ডাউনলোড করুন</button>
          <div class="bookStatus" id="ramBhashyaDownloadStatus"></div>
        </div>`;
      document.getElementById("ramBhashyaDownloadBtn").addEventListener("click", async () => {
        const btn = document.getElementById("ramBhashyaDownloadBtn");
        const statusEl = document.getElementById("ramBhashyaDownloadStatus");
        btn.disabled = true;
        try {
          await window.RamayanaDB.downloadPack(ramPack.id, ramPack.pack_file, msg => { if (statusEl) statusEl.textContent = msg; });
          await loadBhashyaFields();
        } catch (e) {
          btn.disabled = false;
          if (statusEl) statusEl.textContent = "ব্যর্থ: " + (e.message || e);
        }
      });
      return;
    }
    await loadBhashyaFields();
  }

  async function loadBhashyaFields() {
    body.innerHTML = `<div class="empty" style="padding:20px 0;">লোড হচ্ছে…</div>`;
    try {
      const fields = await window.RamayanaDB.getBhashyaForShloka(ramPack.id, shloka.id);
      body.innerHTML = `
        <div class="panelDeleteRow">
          <button class="miniBtn" id="ramBhashyaDeleteBtn">এই ভাষ্য মুছুন</button>
        </div>
        ${fields.length
          ? fields.map(f => `<div class="field"><div class="fieldLabel">${f.field_key}</div><div class="fieldValue">${f.value}</div></div>`).join("")
          : `<div class="empty">এই শ্লোকে কোনো ভাষ্য তথ্য নেই।</div>`}`;
      document.getElementById("ramBhashyaDeleteBtn").addEventListener("click", async () => {
        if (!confirm(`"${ramPack.name}" মুছে ফেলতে চান?`)) return;
        await window.RamayanaDB.deletePack(ramPack.id);
        body.innerHTML = "";
        await loadBhashyaPanel(); // will now show the download prompt again
      });
    } catch (e) {
      body.innerHTML = `<div class="empty">লোড করতে সমস্যা।<br><small>${e.message || e}</small></div>`;
    }
  }

  await loadBhashyaPanel();
}

/* ══════════════════════════════════════════════════════
   MAHABHARATA (কালীপ্রসন্ন সিংহ অনূদিত)

   Hierarchy: পর্ব লিস্ট → কালীপ্রসন্ন সিংহ অনূদিত [download gate]
              → অধ্যায় তালিকা → অধ্যায় (সব উপাখ্যান, sectioned by বিষয়/টপিক)
══════════════════════════════════════════════════════ */

function mbSizeLabel(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

async function screenMahabharata() {
  const firstParba = window.MahabharataDB.PARBAS[0];
  if (firstParba) { await jumpToFirstAdhyay(firstParba.id); return; }
  showBack(true);
  setTitle("মহাভারত");
  root.innerHTML = `<div class="empty">মহাভারতের তথ্য পাওয়া যায়নি।</div>`;
}

/**
 * If this পর্ব is already downloaded, jumps straight to Adhyay 1
 * (picker-bar reading screen) — so tapping "মহাভারত" (or a পর্ব tab)
 * lands directly on the reading screen instead of the Adhyay-list
 * drill-down. An un-downloaded পর্ব still falls back to the normal
 * download-gate screen (screenMahabharataParba, below) — nothing to
 * jump to until it's downloaded.
 */
async function jumpToFirstAdhyay(parbaId) {
  const downloaded = await window.MahabharataDB.isPackDownloaded(parbaId);
  if (!downloaded) { location.hash = `#/mahabharata/parba/${parbaId}`; return; }
  const adhyayas = await window.MahabharataDB.getAdhyayasForParba(parbaId);
  if (adhyayas[0]) location.hash = `#/mahabharata/parba/${parbaId}/adhyay/${adhyayas[0].id}`;
  else location.hash = `#/mahabharata/parba/${parbaId}`;
}

async function screenMahabharataParba(parbaId) {
  showBack(true);
  const parba = window.MahabharataDB.getParbaById(parbaId);
  if (!parba) return screenMahabharata();
  setTitle(parba.name);

  const downloaded = await window.MahabharataDB.isPackDownloaded(parbaId);

  if (!downloaded) {
    root.innerHTML = `
      <div class="hero">
        <div class="om">⚔️</div>
        <div class="sub">${parba.name} — পর্ব ${parba.parba_no}</div>
      </div>
      <div class="listHeader">অনুবাদক</div>
      <div class="mantraList">
        <div class="mantraItem" style="cursor:default;">
          <div class="mref">📜</div>
          <div class="mtext">
            <div>${window.MahabharataDB.SCHOLAR_NAME}</div>
            <div style="font-size:.8rem;opacity:.65;margin-top:2px;">
              ${parba.adhyay_count} অধ্যায় · ${parba.upakhyan_count} উপাখ্যান · ${mbSizeLabel(parba.pack_size_bytes)}
            </div>
          </div>
        </div>
      </div>
      <div style="padding:18px 20px;">
        <button id="dlParbaBtn" style="
          background:var(--gold,#c8972b);color:#1a1200;border:none;
          padding:14px 32px;border-radius:12px;font-size:1rem;
          font-weight:700;cursor:pointer;width:100%;">
          ডাউনলোড করুন
        </button>
        <div id="dlParbaStatus" style="margin-top:14px;font-size:.9rem;min-height:22px;opacity:.8;text-align:center;"></div>
      </div>`;

    const btn = root.querySelector("#dlParbaBtn");
    const statusEl = root.querySelector("#dlParbaStatus");

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "ডাউনলোড হচ্ছে…";
      try {
        await window.MahabharataDB.downloadPack(parbaId, msg => { if (statusEl) statusEl.textContent = msg; });
        await jumpToFirstAdhyay(parbaId);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "আবার চেষ্টা করুন";
        statusEl.textContent = "ব্যর্থ: " + (e.message || e);
      }
    });

    root.prepend(renderScriptureTabBar(
      window.MahabharataDB.PARBAS.map(p => ({
        label: `পর্ব ${p.parba_no}`, active: p.id === parbaId,
        onSelect: () => { if (p.id !== parbaId) jumpToFirstAdhyay(p.id); },
      }))
    ));
    return;
  }

  // Downloaded — show অধ্যায় তালিকা directly under the single অনুবাদক.
  let adhyayas = [];
  try {
    adhyayas = await window.MahabharataDB.getAdhyayasForParba(parbaId);
  } catch (e) {
    root.innerHTML = `<div class="empty">অধ্যায় তালিকা লোড করতে সমস্যা।<br><small>${e.message || e}</small></div>`;
    return;
  }

  root.innerHTML = `
    <div class="hero">
      <div class="om">⚔️</div>
      <div class="sub">${parba.name} · ${window.MahabharataDB.SCHOLAR_NAME}</div>
    </div>
    <div class="listHeader">${adhyayas.length} অধ্যায়</div>
    <div class="mantraList">
      ${adhyayas.map(a => `
        <a class="mantraItem" href="#/mahabharata/parba/${parbaId}/adhyay/${a.id}">
          <div class="mref">${a.chapter_no}</div>
          <div class="mtext">${a.title}</div>
        </a>`).join("")}
    </div>
    <div style="padding:14px 20px 24px;">
      <button id="delParbaBtn" class="miniBtn">এই পর্ব মুছুন</button>
    </div>`;

  root.querySelector("#delParbaBtn").addEventListener("click", async () => {
    if (!confirm(`"${parba.name}" মুছে ফেলতে চান?`)) return;
    await window.MahabharataDB.deletePack(parbaId);
    await screenMahabharataParba(parbaId);
  });

  root.prepend(renderScriptureTabBar(
    window.MahabharataDB.PARBAS.map(p => ({
      label: `পর্ব ${p.parba_no}`, active: p.id === parbaId,
      onSelect: () => { if (p.id !== parbaId) jumpToFirstAdhyay(p.id); },
    }))
  ));
}

/**
 * Builds the Parba/Adhyay quick-jump field set for
 * screenMahabharataAdhyay()'s picker bar. Jumping to an
 * un-downloaded পর্ব goes to its download-gate screen instead of
 * trying to open an adhyay that isn't there yet.
 */
/**
 * Builds the Adhyay quick-jump field for screenMahabharataAdhyay()'s
 * picker bar. পর্ব-switching is handled by the scriptureTabBar above it
 * (see screenMahabharataAdhyay), not a field here.
 */
async function buildMahabharataQuickJumpFields(parbaId, adhyay) {
  const adhyayas = await window.MahabharataDB.getAdhyayasForParba(parbaId);

  return [
    {
      label: "অধ্যায়", current: adhyay.id, currentLabel: String(adhyay.chapter_no),
      options: async () => adhyayas.map(a => ({ value: a.id, label: String(a.chapter_no) })),
      onSelect: (val) => { location.hash = `#/mahabharata/parba/${parbaId}/adhyay/${val}`; },
    },
  ];
}

async function screenMahabharataAdhyay(parbaId, adhyayId) {
  showBack(true);
  const parba = window.MahabharataDB.getParbaById(parbaId);
  if (!parba) return screenMahabharata();

  const downloaded = await window.MahabharataDB.isPackDownloaded(parbaId);
  if (!downloaded) return screenMahabharataParba(parbaId);

  setTitle("অধ্যায় লোড হচ্ছে…");

  const adhyay = await window.MahabharataDB.getAdhyayById(parbaId, adhyayId);
  if (!adhyay) { root.innerHTML = `<div class="empty">অধ্যায় পাওয়া যায়নি।</div>`; return; }

  setTitle(`${parba.name} · অধ্যায় ${adhyay.chapter_no}`);

  const upakhyanas = await window.MahabharataDB.getUpakhyanasForAdhyay(parbaId, adhyayId);
  const { prev, next } = await window.MahabharataDB.getAdjacentAdhyayas(parbaId, adhyayId);
  const quickJumpFields = await buildMahabharataQuickJumpFields(parbaId, adhyay);

  function navHref(id) {
    return id ? `#/mahabharata/parba/${parbaId}/adhyay/${id}` : "";
  }

  // সব উপাখ্যান sectioned by বিষয়/টপিক
  const sectionsHtml = upakhyanas.map(u => `
    <div class="section" style="margin-top:14px;">
      ${u.bishoy ? `<div class="sectionTitle">${u.bishoy}</div>` : ""}
      <div class="fieldValue" style="white-space:pre-line;line-height:1.9;margin-top:6px;">${(u.content || "").replace(/\n/g, "<br>")}</div>
    </div>`).join("");

  root.innerHTML = `
    <div class="mantraDetail" style="text-align:left;">
      <div style="color:var(--gold);font-size:.88rem;margin-bottom:6px;">${parba.name} · অধ্যায় ${adhyay.chapter_no}</div>
      <div style="font-size:1.05rem;font-weight:700;line-height:1.5;">${adhyay.title}</div>
    </div>
    ${sectionsHtml || `<div class="empty">এই অধ্যায়ে কোনো উপাখ্যান পাওয়া যায়নি।</div>`}
    <div class="mantraNav">
      <a class="navBtn ${prev ? "" : "disabled"}" ${prev ? `href="${navHref(prev)}"` : ""}>← আগের অধ্যায়</a>
      <a class="navBtn ${next ? "" : "disabled"}" ${next ? `href="${navHref(next)}"` : ""}>পরের অধ্যায় →</a>
    </div>`;

  root.prepend(renderQuickJumpBar(quickJumpFields));

  {
    const topBars = document.createElement("div");
    topBars.appendChild(renderScriptureTabBar(
      window.MahabharataDB.PARBAS.map(p => ({
        label: `পর্ব ${p.parba_no}`, active: p.id === parbaId,
        onSelect: () => { if (p.id !== parbaId) jumpToFirstAdhyay(p.id); },
      }))
    ));
    root.prepend(topBars);
    topBars.appendChild(root.querySelector(".quickJumpBar"));
  }

  showBookmarkFab({
    title: parba.name,
    subtitle: `অধ্যায় ${adhyay.chapter_no}`,
    preview: (adhyay.title || "").replace(/\n/g, " ").slice(0, 140),
  });
}

/* ══════════════════════════════════════════════════════
   LIBRARY
══════════════════════════════════════════════════════ */
async function screenLibrary() {
  showBack(true);
  setTitle("ডিজিটাল লাইব্রেরি");
  root.innerHTML = `<div class="loading" style="padding:60px 20px;"><div>বইয়ের তালিকা লোড হচ্ছে…</div></div>`;

  let books, manifest;
  try {
    [books, manifest] = await Promise.all([
      window.VedaLibrary.fetchBlogBooks(),
      window.VedaLibrary.getManifest(),
    ]);
  } catch (e) {
    root.innerHTML = `<div class="empty">বইয়ের তালিকা লোড করা যায়নি।<br><small>ইন্টারনেট সংযোগ পরীক্ষা করুন।</small><br><br><small style="opacity:.5;">${e.message || e}</small></div>`;
    return;
  }

  if (!books.length) {
    root.innerHTML = `<div class="empty">এখনো কোনো বই যোগ করা হয়নি।</div>`;
    return;
  }

  // Always show alphabetically, regardless of upload/manifest order.
  books.sort((a, b) => (a.title || "").localeCompare(b.title || "", "bn"));

  renderLibraryList(books, manifest);
}

function renderLibraryList(books, manifest) {
  root.innerHTML = `
    <div class="listHeader">${books.length}টা বই · সম্পূর্ণ অনলাইন-ভিত্তিক</div>
    <div class="libraryList">
      ${books.map(b => {
        const dl = manifest[b.id];
        const thumb = b.thumbnail
          ? `<img class="bookThumb" src="${b.thumbnail}" alt="">`
          : `<div class="bookThumb bookThumbPlaceholder">ও৩ম্</div>`;
        return `
          <div class="bookCard" data-book-id="${b.id}">
            ${thumb}
            <div class="bookInfo">
              <div class="bookTitle">${b.title}</div>
              <div class="bookMeta">${(b.published || "").slice(0, 10)}</div>
              <div class="bookActions">
                ${dl
                  ? `<button class="bookBtn openBtn" data-id="${b.id}">খুলুন</button>
                     <button class="bookBtn deleteBtn" data-id="${b.id}">মুছুন</button>`
                  : `<button class="bookBtn downloadBtn" data-id="${b.id}">ডাউনলোড</button>`}
              </div>
              <div class="bookStatus" data-status="${b.id}"></div>
            </div>
          </div>`;
      }).join("")}
    </div>`;

  const booksById = {};
  books.forEach(b => (booksById[b.id] = b));

  root.querySelectorAll(".downloadBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const statusEl = root.querySelector(`.bookStatus[data-status="${id}"]`);
      btn.disabled = true;
      btn.textContent = "ডাউনলোড হচ্ছে…";
      try {
        await window.VedaLibrary.downloadBook(booksById[id], msg => { if (statusEl) statusEl.textContent = msg; });
        if (statusEl) statusEl.textContent = "✓ সেভ হয়েছে";
        const manifest = await window.VedaLibrary.getManifest();
        renderLibraryList(books, manifest);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "ডাউনলোড";
        if (statusEl) statusEl.textContent = "ব্যর্থ: " + (e.message || e);
      }
    });
  });

  root.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!confirm("এই বইটা ফোন থেকে মুছে ফেলতে চান?")) return;
      await window.VedaLibrary.deleteBook(id);
      const manifest = await window.VedaLibrary.getManifest();
      renderLibraryList(books, manifest);
    });
  });

  root.querySelectorAll(".openBtn").forEach(btn => {
    btn.addEventListener("click", () => { location.hash = `#/library/read/${btn.dataset.id}`; });
  });
}

/**
 * Adds a 🔖 button after every heading (h1/h2/h3) inside a library
 * book's iframe, so each chapter can be bookmarked on its own — not
 * just one bookmark for the whole book.
 *
 * Each chapter bookmark gets its own hash:
 *   #/library/read/<bookId>/h/<headingId>
 * The router (see router()) only reads parts[2] (bookId) for this
 * route, so the "/h/<id>" suffix is inert for navigation — it exists
 * purely so BookmarkManager.add() (which keys on hash) treats every
 * chapter as a distinct bookmark instead of overwriting the same one.
 * scrollPercent is still what actually restores position on open.
 *
 * Headings that already have an id keep it; headings without one get
 * a stable auto-generated id so re-opening the book doesn't shuffle
 * existing bookmark targets on repeat runs of this function.
 */
function addChapterBookmarkButtons(frame, bookId, bookTitle) {
  try {
    const cd = frame.contentDocument;
    const cw = frame.contentWindow;
    if (!cd || !cw) return;
    const headings = cd.querySelectorAll("h1, h2, h3");
    headings.forEach((h, i) => {
      if (h.querySelector(".swadhyayChBookmark")) return; // already added
      if (!h.id) h.id = `swadhyay-ch-${i}`;

      const btn = cd.createElement("button");
      btn.className = "swadhyayChBookmark";
      btn.type = "button";
      btn.textContent = "🔖";
      btn.setAttribute("aria-label", "এই অধ্যায়ে বুকমার্ক করুন");
      btn.style.cssText =
        "border:none;background:none;cursor:pointer;font-size:.8em;" +
        "opacity:.5;margin-inline-start:8px;vertical-align:middle;padding:0;";

      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          const max = cd.documentElement.scrollHeight - cw.innerHeight;
          const top = h.getBoundingClientRect().top + cw.scrollY;
          const pct = max > 0 ? Math.max(0, Math.min(100, (top / max) * 100)) : 0;
          const chapterLabel = (h.textContent || "").replace(/🔖|✅/g, "").trim();
          await window.BookmarkManager.add({
            hash: `#/library/read/${bookId}/h/${encodeURIComponent(h.id)}`,
            title: bookTitle,
            subtitle: chapterLabel,
            preview: "",
            scrollPercent: pct,
          });
          btn.textContent = "✅";
          setTimeout(() => { btn.textContent = "🔖"; }, 900);
        } catch (e) { /* ignore — non-critical UI affordance */ }
      });

      h.appendChild(btn);
    });
  } catch (e) {
    /* cross-origin document — can't inject, chapter bookmarking just
       silently unavailable for this book; whole-book bookmark FAB
       still works via showBookmarkFab() as before. */
  }
}

/**
 * Renders a "db" type library book (downloaded as db.gz, merged into
 * swadhyay_master.db) as a single scrollable native page — table of
 * contents at top, every chapter's heading + paragraphs below it, same
 * one-page reading feel the old html_book pages had, just DB-backed.
 *
 * Reference markers: each paragraph's inline digit marker (e.g. the "১"
 * in "দুষ্কর১") is located in `content` at render time by matching the
 * ref's ref_number against a standalone Bengali-digit run, then wrapped
 * in a highlighted, linked <sup>. This mirrors the same heuristic used
 * when gurugiri.html was first hand-built, but now runs generically for
 * ANY db.gz book — no per-book markup authoring needed going forward.
 */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function renderParagraphWithRefs(content, refs) {
  let text = esc(content);
  const footnotes = [];
  (refs || []).forEach((r, i) => {
    const refAnchor = `dbref-${r.para_seq}-${i}-${Math.random().toString(36).slice(2, 6)}`;
    let placed = false;
    if (r.ref_number) {
      const pattern = new RegExp(`(?<![০-৯])${r.ref_number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![০-৯])`);
      const m = pattern.exec(text);
      if (m) {
        const marker =
          `<sup class="dbRefMarkerWrap"><a href="javascript:void(0)" data-scroll-to="${refAnchor}" class="dbRefMarker">${esc(r.ref_number)}</a></sup>`;
        text = text.slice(0, m.index) + marker + text.slice(m.index + m[0].length);
        placed = true;
      }
    }
    footnotes.push({ refAnchor, num: r.ref_number || "?", note: r.ref_note || "", placed });
  });
  return { html: text, footnotes };
}

function addNativeChapterBookmarkButtons(bookId, bookTitle) {
  root.querySelectorAll(".dbBookChapter h2[id]").forEach(h => {
    if (h.querySelector(".dbChBookmark")) return;
    const btn = document.createElement("button");
    btn.className = "dbChBookmark";
    btn.type = "button";
    btn.textContent = "🔖";
    btn.setAttribute("aria-label", "এই অধ্যায়ে বুকমার্ক করুন");
    btn.style.cssText = "border:none;background:none;cursor:pointer;font-size:.8em;opacity:.5;margin-inline-start:8px;vertical-align:middle;padding:0;";
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const top = h.getBoundingClientRect().top + window.scrollY;
      const pct = max > 0 ? Math.max(0, Math.min(100, (top / max) * 100)) : 0;
      const chapterLabel = (h.textContent || "").replace(/🔖|✅/g, "").trim();
      await window.BookmarkManager.add({
        hash: `#/library/read/${bookId}/h/${encodeURIComponent(h.id)}`,
        title: bookTitle,
        subtitle: chapterLabel,
        preview: "",
        scrollPercent: pct,
      });
      btn.textContent = "✅";
      animateBookmarkBurst(btn);
      setTimeout(() => { btn.textContent = "🔖"; }, 900);
    });
    h.appendChild(btn);
  });
}

async function renderDbBookReader(bookId, entry, pendingPct) {
  const chapters = await window.SwadhyayMasterDB.getLibraryBookChapters(bookId);
  if (!chapters.length) {
    setTitle(entry.title || "বই পড়ুন");
    root.innerHTML = `<div class="empty">এই বইয়ের কনটেন্ট পাওয়া যায়নি। আবার ডাউনলোড করে দেখুন।</div>`;
    return;
  }

  setTitle(entry.title || "বই পড়ুন");

  const tocChapters = chapters.filter(c => !c.is_cover);
  const tocHtml = tocChapters.length ? `
    <div class="toc" style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:10px 0 24px;">
      <div style="font-weight:bold;color:var(--gold);margin-bottom:8px;">সূচিপত্র</div>
      <ol style="margin:0;padding-inline-start:1.3em;">
        ${tocChapters.map(c => `<li><a href="javascript:void(0)" data-scroll-to="${c.chapter_id}" style="color:var(--parchment);">${esc(c.heading)}</a></li>`).join("")}
      </ol>
    </div>` : "";

  const chapterBlocks = await Promise.all(chapters.map(async (c) => {
    const paras = await window.SwadhyayMasterDB.getLibraryBookParagraphs(bookId, c.chapter_id);
    let footnoteBlock = "";
    const allFootnotes = [];
    const paraHtml = paras.map(p => {
      const { html, footnotes } = renderParagraphWithRefs(p.content, p.refs);
      allFootnotes.push(...footnotes);
      return `<p style="text-align:justify;line-height:1.9;margin:0 0 1em;">${html}</p>`;
    }).join("");

    if (allFootnotes.length) {
      footnoteBlock = `
        <div class="dbRefBlock" style="margin-top:1.2em;padding:12px 16px;background:var(--panel);border-inline-start:3px solid var(--gold-bright);border-radius:6px;">
          <div style="font-weight:bold;color:var(--gold);font-size:.9em;margin-bottom:6px;">তথ্যসূত্র</div>
          ${allFootnotes.map(fn => `
            <p id="${fn.refAnchor}" style="font-size:.9em;color:var(--ash);margin:.4em 0;${fn.placed ? "" : "opacity:.7;"}">
              <span style="background:#3a2f14;color:var(--gold-bright);border-radius:4px;padding:0 4px;font-weight:bold;">${esc(fn.num)}।</span>
              ${esc(fn.note)}
            </p>`).join("")}
        </div>`;
    }

    if (c.is_cover) {
      return `<section class="dbBookChapter" id="${c.chapter_id}" style="text-align:center;padding-bottom:24px;border-bottom:2px solid var(--gold-bright);margin-bottom:20px;">
        <h1 style="color:var(--gold);">${esc(c.heading)}</h1>${paraHtml}
      </section>`;
    }
    return `<section class="dbBookChapter" id="${c.chapter_id}" style="margin-top:2em;">
      <h2 id="${c.chapter_id}-h" style="color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:6px;">${esc(c.heading)}</h2>
      ${paraHtml}${footnoteBlock}
    </section>`;
  }));

  root.innerHTML = `
    <style>
      .dbRefMarkerWrap { font-size:.7em; }
      .dbRefMarker { background:#3a2f14; color:var(--gold-bright); font-weight:bold; border-radius:4px; padding:0 3px; text-decoration:none; }
    </style>
    <div class="mantraDetail" style="text-align:left;">${tocHtml}${chapterBlocks.join("")}</div>`;

  addNativeChapterBookmarkButtons(bookId, entry.title || "বই");

  // TOC entries and reference markers use data-scroll-to + scrollIntoView
  // instead of href="#id" — a plain in-page anchor would change
  // location.hash and fire the app's own hashchange router, which reads
  // it as a (nonexistent) route and navigates away from the book.
  root.querySelectorAll("[data-scroll-to]").forEach(a => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      const target = document.getElementById(a.dataset.scrollTo);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (pendingPct != null) {
    bmRestoreScrollPercent(pendingPct);
  }

  showBookmarkFab({
    title: entry.title || "বই",
    subtitle: "ডিজিটাল লাইব্রেরি",
    preview: "",
  });
}

async function screenLibraryReader(bookId) {
  showBack(true);
  setTitle("বই পড়ুন");
  root.innerHTML = `<div class="loading" style="padding:60px 20px;"><div>বই লোড হচ্ছে…</div></div>`;

  const manifest = await window.VedaLibrary.getManifest();
  const entry = manifest[bookId];
  if (!entry) {
    root.innerHTML = `<div class="empty">এই বইটা ডাউনলোড করা নেই।</div>`;
    return;
  }

  if (entry.type === "db") {
    const pendingPct = window._bmPendingLibraryScroll;
    window._bmPendingLibraryScroll = null;
    return renderDbBookReader(bookId, entry, pendingPct);
  }

  if (entry.renderMode === "external") {
    setTitle(entry.title || "বই পড়ুন");
    root.innerHTML = `
      <div class="empty" style="padding:60px 20px;">
        এই বইটা তুলনামূলক ভারী — সরাসরি ব্রাউজারে খোলা হচ্ছে।<br><br>
        <button class="bookBtn downloadBtn" id="openExternalNow">এখন খুলুন</button>
      </div>`;
    document.getElementById("openExternalNow").addEventListener("click", async () => {
      try {
        const uri = await window.VedaLibrary.getFileUri(entry.filename);
        await window.Capacitor.Plugins.FileOpener.open({ filePath: uri, contentType: "text/html" });
      } catch (e2) {
        alert("ব্রাউজারে খুলতে সমস্যা: " + (e2.message || e2));
      }
    });
    return;
  }

  try {
    const uri = await window.VedaLibrary.getFileUri(entry.filename);
    const playableSrc = window.Capacitor.convertFileSrc(uri);
    setTitle(entry.title || "বই পড়ুন");
    root.innerHTML = `<iframe class="bookReaderFrame" src="${playableSrc}"></iframe>`;

    const frame = root.querySelector(".bookReaderFrame");
    const pendingPct = window._bmPendingLibraryScroll;
    window._bmPendingLibraryScroll = null;

    function iframeScrollPercent() {
      try {
        const cw = frame.contentWindow, cd = frame.contentDocument;
        const max = cd.documentElement.scrollHeight - cw.innerHeight;
        return max > 0 ? (cw.scrollY / max) * 100 : 0;
      } catch (e) { return 0; }
    }

    frame.addEventListener("load", () => {
      // Universal Font System — an <iframe> is a separate document and
      // does not inherit the parent's :root CSS variables, so html_book
      // content would otherwise ignore the user's font choice entirely.
      // Inject the same font settings directly into the book's document.
      try {
        const cd = frame.contentDocument;
        const fontFamily = getComputedStyle(document.documentElement)
          .getPropertyValue("--reader-font-family") || "inherit";
        const fontSize = getComputedStyle(document.documentElement)
          .getPropertyValue("--reader-font-size") || "18px";
        const style = cd.createElement("style");
        style.id = "chaturveda-global-font";
        style.textContent = `
          html, body, p, div, span, li, td, th {
            font-family: ${fontFamily} !important;
          }
          body { font-size: ${fontSize}; }
        `;
        cd.head.appendChild(style);
      } catch (e) { /* cross-origin — book can't be restyled, ignore */ }

      // Per-chapter bookmarking: add a small 🔖 next to every heading so
      // any chapter can be bookmarked individually, not just "this book"
      // as a whole. See addChapterBookmarkButtons() below.
      addChapterBookmarkButtons(frame, bookId, entry.title || "বই");

      if (pendingPct == null) return;
      try {
        const cw = frame.contentWindow, cd = frame.contentDocument;
        const max = cd.documentElement.scrollHeight - cw.innerHeight;
        if (max > 0) cw.scrollTo(0, (pendingPct / 100) * max);
      } catch (e) { /* cross-origin — can't restore, ignore */ }
    });

    showBookmarkFab({
      title: entry.title || "বই",
      subtitle: "ডিজিটাল লাইব্রেরি",
      preview: "",
      getScrollPercent: iframeScrollPercent,
      scrollEventTarget: frame.contentWindow,
    });
  } catch (e) {
    root.innerHTML = `<div class="empty">বই খুলতে সমস্যা।<br><small>${e.message || e}</small></div>`;
  }
}

/* ══════════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════════ */
async function screenSearch() {
  showBack(true);
  setTitle("খুঁজুন");
  root.innerHTML = `
    <div class="searchBox">
      <input type="text" id="searchInput" placeholder="সংস্কৃত, বাংলা, ইংরেজি বা Ramayana…" autofocus />
    </div>
    <div class="langChips" style="margin-bottom:14px;">
      <button class="langChip active" data-scope="all">সব</button>
      <button class="langChip" data-scope="vedas">Vedas</button>
      <button class="langChip" data-scope="ramayana">Ramayana</button>
      <button class="langChip" data-scope="mahabharata">Mahabharata</button>
    </div>
    <div id="searchResults"></div>`;

  let activeScope = "all";
  root.querySelectorAll(".langChip[data-scope]").forEach(chip => {
    chip.addEventListener("click", () => {
      root.querySelectorAll(".langChip[data-scope]").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeScope = chip.dataset.scope;
      const input = document.getElementById("searchInput");
      if (input.value.trim().length >= 2) runSearch(input.value, activeScope);
    });
  });

  const input = document.getElementById("searchInput");
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value, activeScope), 350);
  });
}

async function runSearch(term, scope = "all") {
  const resultsEl = document.getElementById("searchResults");
  if (!term || term.trim().length < 2) { resultsEl.innerHTML = ""; return; }
  await ensureVedaCache();
  await ensureKandaCache();

  const codeToName = {};
  for (const [code, v] of Object.entries(vedaCache)) codeToName[code] = v.name;

  try {
    let html = "";

    if (scope === "all" || scope === "vedas") {
      const results = await window.VedaDB.search(null, term, 30);
      if (results.length) {
        html += `<div class="listHeader" style="margin-bottom:8px;">📜 বেদ (${results.length})</div>`;
        html += results.map(r => `
          <a class="mantraItem" href="#/mantra/${r.veda_code}/${encodeURIComponent(r.mantra_ref_id)}">
            <div class="mref">${codeToName[r.veda_code] || r.veda_code} ${r.mantra_ref_id}</div>
            <div class="mtext">${(r.content || "").slice(0, 90)}…</div>
          </a>`).join("");
      }
    }

    if ((scope === "all" || scope === "ramayana") && window.RamayanaDB._initDone) {
      const rResults = await window.RamayanaDB.searchRamayana(term, 30);
      if (rResults.length) {
        html += `<div class="listHeader" style="margin:14px 0 8px;">📖 রামায়ণ (${rResults.length})</div>`;
        html += rResults.map(r => {
          const kanda = kandaCache[r.kandaId];
          return `
            <a class="mantraItem" href="#/ramayana/shloka/${encodeURIComponent(r.ref)}">
              <div class="mref">${kanda?.name || "Kanda " + r.kandaId} · Sarga ${r.sargaId} · ${r.shlokaId}</div>
              <div class="mtext">${(r.tat || r.sanskrit || "").slice(0, 90)}…</div>
            </a>`;
        }).join("");
      }
    }

    if ((scope === "all" || scope === "mahabharata") && window.MahabharataDB) {
      const parbas = window.MahabharataDB.PARBAS;
      const downloadedFlags = await Promise.all(
        parbas.map(p => window.MahabharataDB.isPackDownloaded(p.id))
      );
      const downloaded = parbas.filter((_, i) => downloadedFlags[i]);
      const notDownloadedCount = parbas.length - downloaded.length;

      // Cap per-পর্ব so one huge পর্ব doesn't crowd out the rest; overall
      // results still bounded by how many পর্ব packs are downloaded.
      const perParbaLimit = 8;
      const mbResultsNested = await Promise.all(
        downloaded.map(p => window.MahabharataDB.searchInParba(p.id, term, perParbaLimit)
          .then(rows => rows.map(r => ({ ...r, parba: p })))
          .catch(() => []))
      );
      const mbResults = [].concat(...mbResultsNested).slice(0, 30);

      if (mbResults.length) {
        html += `<div class="listHeader" style="margin:14px 0 8px;">📚 মহাভারত (${mbResults.length})</div>`;
        html += mbResults.map(r => `
          <a class="mantraItem" href="#/mahabharata/parba/${r.parba.id}/adhyay/${r.adhyay_id}">
            <div class="mref">${r.parba.name} · ${r.adhyay_title || "অধ্যায় " + r.adhyay_id}</div>
            <div class="mtext">${(r.bishoy || "").slice(0, 90)}…</div>
          </a>`).join("");
      }
      if (notDownloadedCount > 0 && (scope === "mahabharata" || mbResults.length === 0)) {
        html += `<div class="empty" style="padding:12px 4px;text-align:left;">${notDownloadedCount}টা পর্ব ডাউনলোড করা নেই — সেগুলোতে খোঁজা হয়নি।</div>`;
      }
    }

    resultsEl.innerHTML = html || `<div class="empty">কোনো ফলাফল পাওয়া যায়নি।</div>`;
  } catch (e) {
    resultsEl.innerHTML = `<div class="empty">সার্চ ব্যর্থ।</div>`;
    console.error(e);
  }
}

/* ══════════════════════════════════════════════════════
   SETTINGS — Main menu
══════════════════════════════════════════════════════ */
async function screenSettings() {
  showBack(true);
  setTitle("Settings");
  root.innerHTML = `
    <div class="section">
      <div class="sectionTitle">📖 Reader</div>
      <a class="item" href="#/settings/reader"><span class="icon">📖</span>Reader Preferences<span class="arrow">›</span></a>
    </div>
    <div class="section">
      <div class="sectionTitle">📚 Library</div>
      <a class="item" href="#/settings/library"><span class="icon">📚</span>Library & Storage<span class="arrow">›</span></a>
    </div>
    <div class="section">
      <div class="sectionTitle">🌐 Language</div>
      <a class="item" href="#/settings/language"><span class="icon">🌐</span>Language Settings<span class="arrow">›</span></a>
    </div>
    <div class="section">
      <div class="sectionTitle">🔔 Notifications</div>
      <a class="item" href="#/settings/notification"><span class="icon">🔔</span>Notification Settings<span class="arrow">›</span></a>
    </div>
    <div class="section">
      <div class="sectionTitle">🔍 Search</div>
      <a class="item" href="#/settings/search"><span class="icon">🔍</span>Search Settings<span class="arrow">›</span></a>
    </div>
    <div class="section">
      <div class="sectionTitle">🛡 Privacy & Legal</div>
      <a class="item" href="#/settings/privacy"><span class="icon">📖</span>Privacy Policy<span class="arrow">›</span></a>
      <a class="item" href="#/settings/terms"><span class="icon">📄</span>Terms & Conditions<span class="arrow">›</span></a>
      <a class="item" href="#/settings/disclaimer"><span class="icon">⚖️</span>Disclaimer<span class="arrow">›</span></a>
      <a class="item" href="#/settings/licenses"><span class="icon">📜</span>Open Source Licenses<span class="arrow">›</span></a>
    </div>
    <div class="section">
      <div class="sectionTitle">💬 Support</div>
      <a class="item" href="#/settings/contact"><span class="icon">📧</span>Contact Us<span class="arrow">›</span></a>
      <a class="item" href="#/settings/feedback"><span class="icon">💡</span>Send Feedback<span class="arrow">›</span></a>
      <a class="item" href="#/settings/report-bug"><span class="icon">🐞</span>Report a Bug<span class="arrow">›</span></a>
      <a class="item" href="#/settings/faq"><span class="icon">❓</span>Help & FAQ<span class="arrow">›</span></a>
    </div>
    <div class="section">
      <div class="sectionTitle">⭐ About</div>
      <a class="item" href="#/settings/about"><span class="icon">🕉</span>About স্বাধ্যায়<span class="arrow">›</span></a>
    </div>
    <div class="settingsFooter">
      <div style="color:var(--gold-bright);font-weight:bold;">স্বাধ্যায়</div>
      <div>Version 1.0.0 (Build 1)</div>
      <div>Developed by Ashim Datta</div>
      ${COPYRIGHT_HTML}
    </div>`;
}

/* ══════════════════════════════════════════════════════
   SETTINGS — Reader Preferences (fully functional)
══════════════════════════════════════════════════════ */
async function screenReaderSettings() {
  showBack(true);
  setTitle("Reader Preferences");
  const s = await ChaturvedaSettings.loadAll();

  root.innerHTML = `
    <div class="section">
      <div class="sectionTitle">🎨 Appearance</div>
      <div class="settingRow">
        <span>Theme</span>
        <select id="themeSelect" class="settingSelect">
          <option value="auto">System Default</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div class="settingRow" style="border-bottom:none;">
        <span>Accent Color</span>
        <select id="accentSelect" class="settingSelect">
          <option value="gold">🟡 স্বর্ণালী (Gold)</option>
          <option value="emerald">🟢 পান্না (Emerald)</option>
          <option value="indigo">🔵 নীলাভ (Indigo)</option>
        </select>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">🔤 Font Size</div>
      <div class="settingRow">
        <span>Size</span>
        <span id="fontSizeLabel" style="color:var(--gold-bright);font-weight:bold;">18px</span>
      </div>
      <div style="padding:0 16px 16px;">
        <input type="range" id="fontSlider" min="14" max="30" step="1" class="settingSlider">
        <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--ash);margin-top:4px;">
          <span>Small (14)</span><span>Large (30)</span>
        </div>
      </div>
      <div style="padding:12px 16px;background:rgba(212,162,76,.06);border-top:1px solid var(--line);">
        <div id="fontPreview" style="line-height:1.8;">
          ॐ अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम्।
        </div>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">🖋 Font Family</div>
      <div class="settingRow">
        <span>Font</span>
        <select id="fontFamilySelect" class="settingSelect">
          <option value="default">Default (Serif)</option>
          <option value="serif">Noto Serif</option>
          <option value="sans">Sans Serif</option>
        </select>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">📐 Layout</div>
      <div class="settingRow">
        <span>Line Height</span>
        <select id="lineHeightSelect" class="settingSelect">
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="relaxed">Relaxed</option>
        </select>
      </div>
      <div class="settingRow" style="border-bottom:none;">
        <span>Justify Text</span>
        <label class="toggle">
          <input type="checkbox" id="justifyToggle">
          <span class="toggleSlider"></span>
        </label>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">⚡ Performance</div>
      <div class="settingRow" style="border-bottom:none;">
        <div>
          <div>Keep Screen Awake</div>
          <div style="font-size:.78rem;color:var(--ash);margin-top:2px;">Prevents screen from dimming while reading</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="keepAwakeToggle">
          <span class="toggleSlider"></span>
        </label>
      </div>
    </div>

    <div style="padding:16px;">
      <button id="saveReaderBtn" class="primaryBtn">💾 Save Preferences</button>
      <div id="saveStatus" style="text-align:center;margin-top:10px;color:var(--gold);min-height:1.2em;"></div>
    </div>`;

  // Populate saved values
  const themeEl = document.getElementById("themeSelect");
  const accentEl = document.getElementById("accentSelect");
  const sliderEl = document.getElementById("fontSlider");
  const labelEl = document.getElementById("fontSizeLabel");
  const previewEl = document.getElementById("fontPreview");
  const fontFamilyEl = document.getElementById("fontFamilySelect");
  const lineHeightEl = document.getElementById("lineHeightSelect");
  const justifyEl = document.getElementById("justifyToggle");
  const awakeEl = document.getElementById("keepAwakeToggle");
  const saveBtn = document.getElementById("saveReaderBtn");
  const saveStatus = document.getElementById("saveStatus");

  const fsPx = parseInt(s.fontSize, 10) || 18;
  themeEl.value = s.theme || "auto";
  accentEl.value = s.accentTheme || "gold";
  sliderEl.value = fsPx;
  labelEl.textContent = fsPx + "px";
  previewEl.style.fontSize = fsPx + "px";
  fontFamilyEl.value = s.fontFamily || "default";
  lineHeightEl.value = s.lineHeight || "normal";
  justifyEl.checked = s.justifyText === true || s.justifyText === "true";
  awakeEl.checked = s.keepAwake === true || s.keepAwake === "true";

  // Live preview as slider moves
  sliderEl.addEventListener("input", () => {
    labelEl.textContent = sliderEl.value + "px";
    previewEl.style.fontSize = sliderEl.value + "px";
  });
  accentEl.addEventListener("change", () => {
    ChaturvedaSettings.applyAccent(accentEl.value); // live preview only; saved on "Save"
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveStatus.textContent = "সেভ হচ্ছে…";
    try {
      await ChaturvedaSettings.save("theme", themeEl.value);
      await ChaturvedaSettings.save("accentTheme", accentEl.value);
      await ChaturvedaSettings.save("fontSize", sliderEl.value);
      await ChaturvedaSettings.save("fontFamily", fontFamilyEl.value);
      await ChaturvedaSettings.save("lineHeight", lineHeightEl.value);
      await ChaturvedaSettings.save("justifyText", justifyEl.checked);
      await ChaturvedaSettings.save("keepAwake", awakeEl.checked);
      await ChaturvedaSettings.apply();
      await ChaturvedaSettings.keepScreenAwake(awakeEl.checked);
      saveStatus.textContent = "✓ Saved!";
      setTimeout(() => { saveStatus.textContent = ""; }, 2000);
    } catch (e) {
      saveStatus.textContent = "Error: " + e.message;
    }
    saveBtn.disabled = false;
  });
}

/* ══════════════════════════════════════════════════════
   SETTINGS — Library & Storage (fully functional)

   Lists every download type across the app in one place:
   Veda bhāṣya packs, Ramayana Kanda packs, Mahabharata পর্ব
   packs, and Digital Library books — each with real size and
   its own delete button, instead of pointing the user back to
   individual reader pages.
══════════════════════════════════════════════════════ */

function sizeLabelGeneric(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

async function screenLibrarySettings() {
  showBack(true);
  setTitle("Library & Storage");

  root.innerHTML = `
    <div class="section">
      <div class="sectionTitle">💾 Storage Usage</div>
      <div class="settingRow" style="border-bottom:none;">
        <span>মোট ব্যবহৃত স্টোরেজ</span>
        <span id="storageUsed" style="color:var(--gold-bright);">গণনা হচ্ছে…</span>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">📜 বেদ ভাষ্য (Veda Bhāṣya Packs)</div>
      <div id="vedaPackList"><div class="empty" style="padding:20px;">লোড হচ্ছে…</div></div>
    </div>

    <div class="section">
      <div class="sectionTitle">📖 রামায়ণ ভাষ্য (Kanda Packs)</div>
      <div id="ramPackList"><div class="empty" style="padding:20px;">লোড হচ্ছে…</div></div>
    </div>

    <div class="section">
      <div class="sectionTitle">📚 মহাভারত (পর্ব)</div>
      <div id="mbPackList"><div class="empty" style="padding:20px;">লোড হচ্ছে…</div></div>
    </div>

    <div class="section">
      <div class="sectionTitle">📗 ডিজিটাল লাইব্রেরি বই</div>
      <div id="bookList"><div class="empty" style="padding:20px;">লোড হচ্ছে…</div></div>
    </div>

    <div class="section">
      <div class="sectionTitle">🧹 Cache Management</div>
      <div style="padding:16px;">
        <p style="color:var(--ash);font-size:.9rem;margin-bottom:14px;">শুধু ডিজিটাল লাইব্রেরির বই এখানে একসঙ্গে মোছা যায়। ভাষ্য/পর্ব প্যাক ওপরের তালিকা থেকে আলাদাভাবে মুছুন।</p>
        <button id="clearCacheBtn" style="background:#b22222;color:white;border:none;padding:12px 20px;border-radius:10px;font-size:.95rem;width:100%;">
          🗑 Clear All Downloaded Books
        </button>
        <div id="clearStatus" style="text-align:center;margin-top:10px;color:var(--ash);min-height:1em;"></div>
      </div>
    </div>`;

  let totalBytes = 0;
  const bumpStorage = (bytes) => {
    totalBytes += (bytes || 0);
    const el = document.getElementById("storageUsed");
    if (el) el.textContent = sizeLabelGeneric(totalBytes) || "0 KB";
  };

  // ── Veda bhāṣya packs — collected across all 4 Vedas, deduplicated
  // (a scholar can appear under more than one Veda) ──
  try {
    const listEl = document.getElementById("vedaPackList");
    const vedas = await window.VedaDB.getVedas();
    const byScholarId = {};
    for (const veda of vedas) {
      const scholars = await window.VedaDB.getScholarsForVeda(veda.id);
      for (const s of scholars) if (!byScholarId[s.id]) byScholarId[s.id] = s;
    }
    const downloaded = Object.values(byScholarId).filter(s => s.downloaded);
    if (!downloaded.length) {
      listEl.innerHTML = `<div class="empty" style="padding:20px;">কোনো ভাষ্য ডাউনলোড করা নেই।</div>`;
    } else {
      listEl.innerHTML = downloaded.map(s => `
        <div class="settingRow" data-scholar-id="${s.id}">
          <div><div>${s.name}</div><div style="font-size:.75rem;color:var(--ash);">${sizeLabelGeneric(s.pack_size_bytes)}</div></div>
          <button class="miniBtn deleteVedaPackBtn" data-id="${s.id}" style="color:#e8756c;border-color:rgba(232,117,108,.3);">Delete</button>
        </div>`).join("");
      downloaded.forEach(s => bumpStorage(s.pack_size_bytes));
      listEl.querySelectorAll(".deleteVedaPackBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("এই ভাষ্য মুছে ফেলতে চান?")) return;
          await window.VedaDB.deletePack(parseInt(btn.dataset.id, 10));
          btn.closest(".settingRow").remove();
          if (!listEl.querySelector(".settingRow"))
            listEl.innerHTML = `<div class="empty" style="padding:20px;">কোনো ভাষ্য ডাউনলোড করা নেই।</div>`;
        });
      });
    }
  } catch (e) {
    document.getElementById("vedaPackList").innerHTML = `<div class="empty" style="padding:20px;">লোড করতে সমস্যা।</div>`;
  }

  // ── Ramayana Kanda commentary packs ──
  try {
    const listEl = document.getElementById("ramPackList");
    const packs = window.RamayanaDB.KANDA_PACKS;
    const flags = await Promise.all(packs.map(p => window.RamayanaDB.isPackDownloaded(p.id)));
    const downloaded = packs.filter((_, i) => flags[i]);
    if (!downloaded.length) {
      listEl.innerHTML = `<div class="empty" style="padding:20px;">কোনো কাণ্ড ভাষ্য ডাউনলোড করা নেই।</div>`;
    } else {
      listEl.innerHTML = downloaded.map(p => `
        <div class="settingRow" data-pack-id="${p.id}">
          <div><div>${p.name}</div><div style="font-size:.75rem;color:var(--ash);">${sizeLabelGeneric(p.pack_size_bytes)}</div></div>
          <button class="miniBtn deleteRamPackBtn" data-id="${p.id}" style="color:#e8756c;border-color:rgba(232,117,108,.3);">Delete</button>
        </div>`).join("");
      downloaded.forEach(p => bumpStorage(p.pack_size_bytes));
      listEl.querySelectorAll(".deleteRamPackBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("এই কাণ্ড ভাষ্য মুছে ফেলতে চান?")) return;
          await window.RamayanaDB.deletePack(parseInt(btn.dataset.id, 10));
          btn.closest(".settingRow").remove();
          if (!listEl.querySelector(".settingRow"))
            listEl.innerHTML = `<div class="empty" style="padding:20px;">কোনো কাণ্ড ভাষ্য ডাউনলোড করা নেই।</div>`;
        });
      });
    }
  } catch (e) {
    document.getElementById("ramPackList").innerHTML = `<div class="empty" style="padding:20px;">লোড করতে সমস্যা।</div>`;
  }

  // ── Mahabharata পর্ব packs ──
  try {
    const listEl = document.getElementById("mbPackList");
    const parbas = window.MahabharataDB.PARBAS;
    const flags = await Promise.all(parbas.map(p => window.MahabharataDB.isPackDownloaded(p.id)));
    const downloaded = parbas.filter((_, i) => flags[i]);
    if (!downloaded.length) {
      listEl.innerHTML = `<div class="empty" style="padding:20px;">কোনো পর্ব ডাউনলোড করা নেই।</div>`;
    } else {
      listEl.innerHTML = downloaded.map(p => `
        <div class="settingRow" data-parba-id="${p.id}">
          <div>${p.name}</div>
          <button class="miniBtn deleteMbPackBtn" data-id="${p.id}" style="color:#e8756c;border-color:rgba(232,117,108,.3);">Delete</button>
        </div>`).join("");
      listEl.querySelectorAll(".deleteMbPackBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("এই পর্ব মুছে ফেলতে চান?")) return;
          await window.MahabharataDB.deletePack(parseInt(btn.dataset.id, 10));
          btn.closest(".settingRow").remove();
          if (!listEl.querySelector(".settingRow"))
            listEl.innerHTML = `<div class="empty" style="padding:20px;">কোনো পর্ব ডাউনলোড করা নেই।</div>`;
        });
      });
    }
  } catch (e) {
    document.getElementById("mbPackList").innerHTML = `<div class="empty" style="padding:20px;">লোড করতে সমস্যা।</div>`;
  }

  // Downloaded books
  try {
    const manifest = await window.VedaLibrary.getManifest();
    const books = Object.entries(manifest);
    const bookList = document.getElementById("bookList");
    if (!books.length) {
      bookList.innerHTML = `<div class="empty" style="padding:20px;">No books downloaded.</div>`;
    } else {
      bookList.innerHTML = books.map(([id, b]) =>
        `<div class="settingRow" data-book-id="${id}">
          <div><div>${b.title}</div><div style="font-size:.75rem;color:var(--ash);">Downloaded ${new Date(b.downloadedAt).toLocaleDateString()}</div></div>
          <button class="miniBtn deleteBookBtn" data-id="${id}" style="color:#e8756c;border-color:rgba(232,117,108,.3);">Delete</button>
        </div>`
      ).join("");
      bookList.querySelectorAll(".deleteBookBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("এই বই মুছে ফেলতে চান?")) return;
          await window.VedaLibrary.deleteBook(btn.dataset.id);
          btn.closest(".settingRow").remove();
          if (!bookList.querySelector(".settingRow"))
            bookList.innerHTML = `<div class="empty" style="padding:20px;">No books downloaded.</div>`;
        });
      });
    }
  } catch (e) {
    document.getElementById("bookList").innerHTML = `<div class="empty" style="padding:20px;">Error loading books.</div>`;
  }

  // Clear all (books only — packs are deleted individually above, each
  // via its own already-existing deletePack, so no new deletion logic)
  document.getElementById("clearCacheBtn").addEventListener("click", async () => {
    if (!confirm("সব ডাউনলোড করা বই মুছে ফেলতে চান?")) return;
    const status = document.getElementById("clearStatus");
    try {
      await ChaturvedaSettings.clearCache();
      status.textContent = "✓ সব বই মুছে ফেলা হয়েছে।";
      document.getElementById("bookList").innerHTML = `<div class="empty" style="padding:20px;">No books downloaded.</div>`;
    } catch (e) {
      status.textContent = "Error: " + e.message;
    }
  });
}

/* ══════════════════════════════════════════════════════
   SETTINGS — Language (fully functional)
══════════════════════════════════════════════════════ */
async function screenLanguageSettings() {
  showBack(true);
  setTitle("Language Settings");
  const s = await ChaturvedaSettings.loadAll();

  root.innerHTML = `
    <div class="section">
      <div class="sectionTitle">🌐 App Language</div>
      <div class="settingRow" style="border-bottom:none;">
        <span>Language</span>
        <select id="langSelect" class="settingSelect">
          <option value="বাংলা">বাংলা</option>
          <option value="English">English</option>
          <option value="हिन्दी">हिन्दी</option>
        </select>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">📜 Script Preference</div>
      <div class="settingRow" style="border-bottom:none;">
        <span>Script</span>
        <select id="scriptSelect" class="settingSelect">
          <option value="বাংলা">বাংলা লিপি</option>
          <option value="Devanagari">देवनागरी</option>
          <option value="Roman">Roman</option>
        </select>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">🔤 Transliteration</div>
      <div class="settingRow" style="border-bottom:none;">
        <div>
          <div>Sanskrit Transliteration</div>
          <div style="font-size:.78rem;color:var(--ash);margin-top:2px;">Show romanized Sanskrit alongside Devanagari</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="translitToggle">
          <span class="toggleSlider"></span>
        </label>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">👁 Preview</div>
      <div style="padding:18px 16px;background:rgba(212,162,76,.06);">
        <div id="langPreview" style="font-size:1.1rem;line-height:1.8;color:var(--parchment);">
          ॐ अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम्।
        </div>
      </div>
    </div>

    <div style="padding:16px;">
      <button id="saveLangBtn" class="primaryBtn">💾 Save Language Settings</button>
      <div id="langStatus" style="text-align:center;margin-top:10px;color:var(--gold);min-height:1.2em;"></div>
    </div>`;

  const langEl = document.getElementById("langSelect");
  const scriptEl = document.getElementById("scriptSelect");
  const translitEl = document.getElementById("translitToggle");
  const previewEl = document.getElementById("langPreview");
  const saveBtn = document.getElementById("saveLangBtn");
  const status = document.getElementById("langStatus");

  langEl.value = s.language || "বাংলা";
  scriptEl.value = s.script || "বাংলা";
  translitEl.checked = s.transliteration === true || s.transliteration === "true";

  const PREVIEWS = {
    "বাংলা": "ওঁ অগ্নিমীলে পুরোহিতং যজ্ঞস্য দেবমৃত্বিজম্।",
    "Devanagari": "ॐ अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम्।",
    "Roman": "Om Agnimīle Purohitaṃ Yajñasya Devam Ṛtvijam.",
  };
  function updatePreview() {
    previewEl.textContent = PREVIEWS[scriptEl.value] || PREVIEWS["Devanagari"];
  }
  scriptEl.addEventListener("change", updatePreview);
  updatePreview();

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    status.textContent = "সেভ হচ্ছে…";
    try {
      await ChaturvedaSettings.save("language", langEl.value);
      await ChaturvedaSettings.save("script", scriptEl.value);
      await ChaturvedaSettings.save("transliteration", translitEl.checked);
      status.textContent = "✓ Saved!";
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch (e) {
      status.textContent = "Error: " + e.message;
    }
    saveBtn.disabled = false;
  });
}

/* ══════════════════════════════════════════════════════
   SETTINGS — Notifications (fully functional)
══════════════════════════════════════════════════════ */
async function screenNotificationSettings() {
  showBack(true);
  setTitle("Notification Settings");

  const getVal = async key => {
    const v = await ChaturvedaSettings.get("notif_" + key);
    return v;
  };

  const appUpdates = await getVal("appUpdates");
  const newBooks = await getVal("newBooks");
  const reminder = await getVal("readingReminder");
  const reminderTime = await getVal("reminderTime");

  root.innerHTML = `
    <div class="section">
      <div class="sectionTitle">🔔 Notifications</div>
      <div class="settingRow">
        <div><div>📱 App Updates</div><div style="font-size:.78rem;color:var(--ash);">New version available alerts</div></div>
        <label class="toggle"><input type="checkbox" id="updatesToggle" ${appUpdates === "true" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
      <div class="settingRow">
        <div><div>📚 New Books</div><div style="font-size:.78rem;color:var(--ash);">When new books are added to library</div></div>
        <label class="toggle"><input type="checkbox" id="newBooksToggle" ${newBooks === "true" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
      <div class="settingRow" style="border-bottom:none;">
        <div><div>📖 Daily Reading Reminder</div><div style="font-size:.78rem;color:var(--ash);">Reminder to read a mantra each day</div></div>
        <label class="toggle"><input type="checkbox" id="reminderToggle" ${reminder === "true" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
    </div>

    <div class="section" id="reminderTimeSection" style="${reminder === "true" ? "" : "opacity:.4;pointer-events:none;"}">
      <div class="sectionTitle">⏰ Reminder Time</div>
      <div style="padding:16px;">
        <input type="time" id="reminderTime" value="${reminderTime || "06:00"}" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--parchment);font-size:1rem;">
      </div>
      <div style="padding:8px 16px 16px;background:rgba(212,162,76,.06);">
        <div style="font-size:.85rem;color:var(--ash);">🕉 Daily Vedic Study Reminder — Read a mantra, sukta, or Ramayana shloka every day.</div>
      </div>
    </div>

    <div style="padding:16px;">
      <button id="saveNotifBtn" class="primaryBtn">💾 Save Preferences</button>
      <div id="notifStatus" style="text-align:center;margin-top:10px;color:var(--gold);min-height:1.2em;"></div>
    </div>`;

  const reminderToggle = document.getElementById("reminderToggle");
  const reminderSection = document.getElementById("reminderTimeSection");
  reminderToggle.addEventListener("change", () => {
    reminderSection.style.opacity = reminderToggle.checked ? "1" : ".4";
    reminderSection.style.pointerEvents = reminderToggle.checked ? "auto" : "none";
  });

  document.getElementById("saveNotifBtn").addEventListener("click", async () => {
    const btn = document.getElementById("saveNotifBtn");
    const status = document.getElementById("notifStatus");
    btn.disabled = true;
    status.textContent = "সেভ হচ্ছে…";
    try {
      await ChaturvedaSettings.save("notif_appUpdates", document.getElementById("updatesToggle").checked);
      await ChaturvedaSettings.save("notif_newBooks", document.getElementById("newBooksToggle").checked);
      await ChaturvedaSettings.save("notif_readingReminder", reminderToggle.checked);
      await ChaturvedaSettings.save("notif_reminderTime", document.getElementById("reminderTime").value);
      status.textContent = "✓ Saved!";
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch (e) {
      status.textContent = "Error: " + e.message;
    }
    btn.disabled = false;
  });
}

/* ══════════════════════════════════════════════════════
   SETTINGS — Search Settings (fully functional)
══════════════════════════════════════════════════════ */
async function screenSearchSettings() {
  showBack(true);
  setTitle("Search Settings");

  const getLang = await ChaturvedaSettings.get("search_language") || "all";
  const getTranslit = await ChaturvedaSettings.get("search_translit");
  const getMantra = await ChaturvedaSettings.get("search_mantra");
  const getSukta = await ChaturvedaSettings.get("search_sukta");
  const getMandala = await ChaturvedaSettings.get("search_mandala");
  const getRamayana = await ChaturvedaSettings.get("search_ramayana");

  root.innerHTML = `
    <div class="section">
      <div class="sectionTitle">🔍 Default Search Scope</div>
      <div class="settingRow" style="border-bottom:none;">
        <span>Default Scope</span>
        <select id="searchLang" class="settingSelect">
          <option value="all">All Texts</option>
          <option value="vedas">Vedas Only</option>
          <option value="ramayana">Ramayana Only</option>
        </select>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">⚙️ Search Options</div>
      <div class="settingRow">
        <div><div>🔤 Transliteration Search</div><div style="font-size:.78rem;color:var(--ash);">Match Roman transliterations</div></div>
        <label class="toggle"><input type="checkbox" id="translitSearch" ${getTranslit === "true" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
      <div class="settingRow">
        <div><div>📜 Search Mantras</div></div>
        <label class="toggle"><input type="checkbox" id="mantraSearch" ${getMantra !== "false" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
      <div class="settingRow">
        <div><div>📖 Search Suktas</div></div>
        <label class="toggle"><input type="checkbox" id="suktaSearch" ${getSukta !== "false" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
      <div class="settingRow">
        <div><div>🕉 Search Mandalas</div></div>
        <label class="toggle"><input type="checkbox" id="mandalaSearch" ${getMandala !== "false" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
      <div class="settingRow" style="border-bottom:none;">
        <div><div>🏹 Search Ramayana</div></div>
        <label class="toggle"><input type="checkbox" id="ramayanaSearch" ${getRamayana !== "false" ? "checked" : ""}><span class="toggleSlider"></span></label>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">🕘 Recent Searches</div>
      <div id="historyList" style="padding:16px;color:var(--ash);font-size:.88rem;">No recent searches</div>
      <div style="padding:0 16px 16px;">
        <button id="clearHistoryBtn" style="background:#b22222;color:white;border:none;padding:10px 16px;border-radius:8px;font-size:.88rem;">Clear History</button>
      </div>
    </div>

    <div style="padding:16px;">
      <button id="saveSearchBtn" class="primaryBtn">💾 Save Settings</button>
      <div id="searchStatus" style="text-align:center;margin-top:10px;color:var(--gold);min-height:1.2em;"></div>
    </div>`;

  document.getElementById("searchLang").value = getLang;

  // Load history
  const histEl = document.getElementById("historyList");
  try {
    const hist = JSON.parse(localStorage.getItem("searchHistory") || "[]");
    histEl.innerHTML = hist.length
      ? hist.map(t => `<div style="padding:4px 0;border-bottom:1px solid var(--line);">🔎 ${t}</div>`).join("")
      : "No recent searches";
  } catch (e) { /* ignore */ }

  document.getElementById("clearHistoryBtn").addEventListener("click", () => {
    localStorage.removeItem("searchHistory");
    histEl.innerHTML = "No recent searches";
  });

  document.getElementById("saveSearchBtn").addEventListener("click", async () => {
    const btn = document.getElementById("saveSearchBtn");
    const status = document.getElementById("searchStatus");
    btn.disabled = true;
    status.textContent = "সেভ হচ্ছে…";
    try {
      await ChaturvedaSettings.save("search_language", document.getElementById("searchLang").value);
      await ChaturvedaSettings.save("search_translit", document.getElementById("translitSearch").checked);
      await ChaturvedaSettings.save("search_mantra", document.getElementById("mantraSearch").checked);
      await ChaturvedaSettings.save("search_sukta", document.getElementById("suktaSearch").checked);
      await ChaturvedaSettings.save("search_mandala", document.getElementById("mandalaSearch").checked);
      await ChaturvedaSettings.save("search_ramayana", document.getElementById("ramayanaSearch").checked);
      status.textContent = "✓ Saved!";
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch (e) {
      status.textContent = "Error: " + e.message;
    }
    btn.disabled = false;
  });
}

/* ══════════════════════════════════════════════════════
   SETTINGS — Static info pages (inline, no iframe)
══════════════════════════════════════════════════════ */

function renderInfoPage(title, bodyHtml) {
  showBack(true);
  setTitle(title);
  root.innerHTML = `<div class="infoPage">${bodyHtml}</div>`;
}

async function screenPrivacyPolicy() {
  renderInfoPage("Privacy Policy", `
    <div class="infoCard"><h2>Privacy Policy</h2><p><strong>Effective Date:</strong> July 12, 2026</p>
    <p>স্বাধ্যায় App is committed to respecting your privacy. This policy explains how we handle information when you use the app.</p></div>
    <div class="infoCard"><h2>1. Information We Collect</h2>
    <p>স্বাধ্যায় collects minimal information necessary to function:</p>
    <ul><li>App preferences stored locally on your device</li><li>Anonymous crash reports (via Firebase Crashlytics, if enabled)</li><li>Feedback you voluntarily submit</li></ul>
    <p>We do not collect passwords, financial information, contacts, SMS, photos, or biometric data.</p></div>
    <div class="infoCard"><h2>2. How We Use Information</h2>
    <ul><li>To save your reading preferences locally</li><li>To improve app stability via crash reports</li><li>To respond to your feedback</li></ul></div>
    <div class="infoCard"><h2>3. Data Storage</h2>
    <p>All preferences are stored locally on your device using Capacitor Preferences (native storage). No personal data is sent to external servers beyond optional crash analytics.</p></div>
    <div class="infoCard"><h2>4. Third-Party Services</h2>
    <p>The app may use Firebase Crashlytics and Google Play Services. These services operate under their own privacy policies.</p></div>
    <div class="infoCard"><h2>5. Children's Privacy</h2>
    <p>স্বাধ্যায় is an educational app suitable for all ages. We do not knowingly collect data from children.</p></div>
    <div class="infoCard"><h2>6. Contact</h2>
    <p>For privacy-related questions, contact: <strong>Ashim Datta</strong><br>Website: <a href="https://arsa-siddanto.blogspot.com" style="color:var(--gold);">arsa-siddanto.blogspot.com</a></p></div>
    <div class="infoCard" style="text-align:center;color:var(--ash);">${COPYRIGHT_HTML}</div>`);
}

async function screenTerms() {
  renderInfoPage("Terms & Conditions", `
    <div class="infoCard"><h2>Terms & Conditions</h2><p><strong>Effective Date:</strong> July 12, 2026</p>
    <p>By using স্বাধ্যায় App, you agree to these terms.</p></div>
    <div class="infoCard"><h2>1. License</h2>
    <p>You are granted a personal, non-commercial license to use স্বাধ্যায় App for educational purposes. You may not sell, modify, or redistribute the app.</p></div>
    <div class="infoCard"><h2>2. Acceptable Use</h2>
    <ul><li>Use the app lawfully and respectfully</li><li>Do not attempt to reverse engineer or modify the app</li><li>Do not use automated tools to scrape content</li></ul></div>
    <div class="infoCard"><h2>3. Intellectual Property</h2>
    <p>Ancient Vedic scriptures and Ramayana are in the public domain. App design, code, and compilation are protected under applicable copyright laws.</p>
    <div style="margin-top:10px;">${COPYRIGHT_HTML}</div></div>
    <div class="infoCard"><h2>4. Disclaimer</h2>
    <p>The app is provided "as is" without warranties. We are not liable for any loss or damage arising from use of the app.</p></div>
    <div class="infoCard"><h2>5. Changes</h2>
    <p>We may update these terms. Continued use after changes constitutes acceptance.</p></div>
    <div class="infoCard"><h2>6. Contact</h2>
    <p><strong>Developer:</strong> Ashim Datta<br>Website: <a href="https://arsa-siddanto.blogspot.com" style="color:var(--gold);">arsa-siddanto.blogspot.com</a></p></div>`);
}

async function screenDisclaimer() {
  renderInfoPage("Disclaimer", `
    <div class="infoCard"><h2>⚖ Disclaimer</h2></div>
    <div class="infoCard"><h2>1. General Information</h2>
    <p>স্বাধ্যায় is a digital platform for reading and exploring Vedic literature, Sanskrit texts, and the Valmiki Ramayana. Content is provided for educational, spiritual, and cultural purposes only.</p></div>
    <div class="infoCard"><h2>2. Accuracy</h2>
    <p>We make reasonable efforts to provide accurate information, but do not guarantee all texts, translations, or interpretations are error-free. Consult original scriptures and qualified scholars for academic or religious guidance.</p></div>
    <div class="infoCard"><h2>3. Religious & Philosophical Content</h2>
    <p>Interpretations may vary among different scholars and traditions. স্বাধ্যায় does not promote any particular school of thought or disrespect any belief system.</p></div>
    <div class="infoCard"><h2>4. No Professional Advice</h2>
    <p>Content is not professional religious, legal, medical, or financial advice.</p></div>
    <div class="infoCard"><h2>5. Liability</h2>
    <p>স্বাধ্যায় and its developer are not liable for any loss or consequence arising from use of this application.</p></div>
    <div class="infoCard" style="text-align:center;color:var(--ash);">স্বাধ্যায় v1.0.0<br>${COPYRIGHT_HTML}</div>`);
}

async function screenLicenses() {
  renderInfoPage("Open Source Licenses", `
    <div class="infoCard"><h2>Open Source Licenses</h2><p>স্বাধ্যায় App uses the following open source components.</p></div>
    <div class="infoCard"><h2>Capacitor (Apache 2.0)</h2><p>Copyright © Ionic. Used for native Android platform integration.</p></div>
    <div class="infoCard"><h2>@capacitor-community/sqlite (MIT)</h2><p>SQLite plugin for Capacitor. Powers the Veda and Ramayana databases.</p></div>
    <div class="infoCard"><h2>@capacitor/filesystem (Apache 2.0)</h2><p>File storage for downloaded Bhāṣya packs and library books.</p></div>
    <div class="infoCard"><h2>@capacitor/preferences (Apache 2.0)</h2><p>Native key-value storage for app settings.</p></div>
    <div class="infoCard"><h2>AndroidX Libraries (Apache 2.0)</h2><p>Copyright © Google LLC. AppCompat, Core, Lifecycle, and other AndroidX components.</p></div>
    <div class="infoCard"><h2>Kotlin (Apache 2.0)</h2><p>Copyright © JetBrains s.r.o. Android application development language.</p></div>
    <div class="infoCard"><h2>Material Design Components (Apache 2.0)</h2><p>Copyright © Google LLC.</p></div>
    <div class="infoCard"><h2>Noto Fonts (OFL)</h2><p>Copyright © Google LLC. Noto Sans Bengali, Noto Serif Bengali, Noto Serif Devanagari.</p></div>
    <div class="infoCard"><h2>Valmiki Ramayana Text</h2><p>Source: valmikiramayan.net — Public domain Sanskrit text with English translations by Sri Desiraju Hanumantha Rao and Sri K.M.K. Murthy.</p></div>
    <div class="infoCard" style="text-align:center;color:var(--ash);">${COPYRIGHT_HTML}</div>`);
}

async function screenContact() {
  renderInfoPage("Contact Us", `
    <div class="infoCard"><h2>📧 স্বাধ্যায় Support</h2>
    <p>For questions, suggestions, or technical issues regarding স্বাধ্যায় App, contact the development team.</p></div>
    <div class="infoCard">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><div style="color:var(--gold);font-size:.78rem;margin-bottom:4px;">DEVELOPER</div><div>Ashim Datta</div></div>
        <div><div style="color:var(--gold);font-size:.78rem;margin-bottom:4px;">WEBSITE</div><a href="https://arsa-siddanto.blogspot.com" style="color:var(--gold-bright);">arsa-siddanto.blogspot.com</a></div>
        <div><div style="color:var(--gold);font-size:.78rem;margin-bottom:4px;">APP VERSION</div><div>1.0.0 (Build 1)</div></div>
      </div>
    </div>
    <div class="infoCard" style="text-align:center;color:var(--ash);">${COPYRIGHT_HTML}</div>`);
}

async function screenFeedback() {
  showBack(true);
  setTitle("Send Feedback");
  root.innerHTML = `
    <div class="infoCard" style="margin:16px;">
      <h2>💡 Send Feedback</h2>
      <p style="color:var(--ash);margin-bottom:16px;">Help us improve স্বাধ্যায় by sharing your suggestions.</p>
      <textarea id="feedbackText" placeholder="Write your feedback here…" style="width:100%;height:140px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--parchment);font-size:.95rem;font-family:inherit;resize:vertical;"></textarea>
      <br><br>
      <button id="submitFeedback" class="primaryBtn">Submit Feedback</button>
      <div id="feedbackStatus" style="text-align:center;margin-top:10px;color:var(--gold);min-height:1.2em;"></div>
    </div>`;

  document.getElementById("submitFeedback").addEventListener("click", () => {
    const text = document.getElementById("feedbackText").value.trim();
    if (!text) {
      document.getElementById("feedbackStatus").textContent = "Please write your feedback first.";
      return;
    }
    const subject = encodeURIComponent("[স্বাধ্যায়] Feedback");
    const body = encodeURIComponent(text);
    // No backend exists to receive this silently — this app is static/
    // client-only. Opening the device's mail app pre-filled is the
    // honest zero-infrastructure way to make this actually reach
    // kyronix.support@gmail.com, versus the previous version which
    // showed a "submitted" message and sent nothing anywhere.
    window.location.href = `mailto:kyronix.support@gmail.com?subject=${subject}&body=${body}`;
    document.getElementById("feedbackStatus").textContent = "আপনার মেইল অ্যাপ খোলা হচ্ছে…";
  });
}

async function screenReportBug() {
  showBack(true);
  setTitle("Report a Bug");
  root.innerHTML = `
    <div class="infoCard" style="margin:16px;">
      <h2>🐞 Report a Bug</h2>
      <p style="color:var(--ash);margin-bottom:16px;">Describe the issue so we can fix it quickly.</p>
      <label style="display:block;color:var(--gold);font-size:.78rem;margin-bottom:6px;">PROBLEM TITLE</label>
      <input id="bugTitle" type="text" placeholder="Example: Book not opening" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--parchment);font-size:.95rem;margin-bottom:14px;">
      <label style="display:block;color:var(--gold);font-size:.78rem;margin-bottom:6px;">DESCRIPTION</label>
      <textarea id="bugDesc" placeholder="Steps to reproduce the issue…" style="width:100%;height:100px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--parchment);font-size:.95rem;font-family:inherit;resize:vertical;margin-bottom:14px;"></textarea>
      <label style="display:block;color:var(--gold);font-size:.78rem;margin-bottom:6px;">DEVICE INFO</label>
      <input id="bugDevice" type="text" placeholder="Android version / Device model" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--parchment);font-size:.95rem;margin-bottom:16px;">
      <button id="submitBug" class="primaryBtn" style="background:#b22222;">Send Report</button>
      <div id="bugStatus" style="text-align:center;margin-top:10px;color:var(--gold);min-height:1.2em;"></div>
    </div>`;

  document.getElementById("submitBug").addEventListener("click", () => {
    const title = document.getElementById("bugTitle").value.trim();
    const desc = document.getElementById("bugDesc").value.trim();
    const device = document.getElementById("bugDevice").value.trim();
    if (!title) {
      document.getElementById("bugStatus").textContent = "Please add a problem title.";
      return;
    }
    const subject = encodeURIComponent(`[স্বাধ্যায় Bug] ${title}`);
    const body = encodeURIComponent(
      `Problem: ${title}\n\nDescription:\n${desc || "(none provided)"}\n\nDevice info: ${device || "(not provided)"}`
    );
    // Same as Send Feedback — no backend to submit to silently, so this
    // opens the mail app pre-addressed instead of just showing a fake
    // "submitted" message that went nowhere.
    window.location.href = `mailto:kyronix.support@gmail.com?subject=${subject}&body=${body}`;
    document.getElementById("bugStatus").textContent = "আপনার মেইল অ্যাপ খোলা হচ্ছে…";
  });
}

async function screenFAQ() {
  renderInfoPage("Help & FAQ", `
    <div class="infoCard"><h2>❓ Help & FAQ</h2></div>
    <div class="infoCard"><div class="faqQ">What is স্বাধ্যায়?</div><div class="faqA">স্বাধ্যায় is a digital platform for reading and exploring the four Vedas (Rigveda, Yajurveda, Samaveda, Atharvaveda) and the Valmiki Ramayana with Sanskrit text, word-by-word analysis, and translations.</div></div>
    <div class="infoCard"><div class="faqQ">Is স্বাধ্যায় free?</div><div class="faqA">Yes, স্বাধ্যায় provides free access to Vedic knowledge resources.</div></div>
    <div class="infoCard"><div class="faqQ">Can I read texts offline?</div><div class="faqA">The core Veda database and Ramayana database are bundled with the app and work offline. Bhāṣya (commentary) packs need to be downloaded once and then work offline. Library books must be downloaded individually.</div></div>
    <div class="infoCard"><div class="faqQ">How do I download a Bhāṣya (commentary)?</div><div class="faqA">Open any mantra, select a language tab, then tap the "ডাউনলোড করুন" button next to any scholar's name. Each pack downloads once and then works offline.</div></div>
    <div class="infoCard"><div class="faqQ">How do I search across both Vedas and Ramayana?</div><div class="faqA">Tap the search icon (⌕) in the top bar. Use the "সব / Vedas / Ramayana" chips to filter your search scope.</div></div>
    <div class="infoCard"><div class="faqQ">How do I change the font size or theme?</div><div class="faqA">Go to Settings → Reader Preferences. Adjust the font size slider and select your preferred theme, then tap Save.</div></div>
    <div class="infoCard"><div class="faqQ">How can I suggest new features or report a bug?</div><div class="faqA">Use Settings → Send Feedback or Settings → Report a Bug.</div></div>
    <div class="infoCard"><div class="faqQ">Where do the texts come from?</div><div class="faqA">Vedic texts come from traditional and public-domain Sanskrit sources. The Ramayana is sourced from valmikiramayan.net (public domain) with translations by Sri Desiraju Hanumantha Rao.</div></div>`);
}

async function screenAbout() {
  renderInfoPage("About স্বাধ্যায়", `
    <div class="infoCard" style="text-align:center;">
      <div style="font-size:3rem;margin-bottom:12px;">🕉</div>
      <h2 style="font-size:1.5rem;">স্বাধ্যায়</h2>
      <p style="color:var(--ash);">Version 1.0.0 (Build 1)</p>
    </div>
    <div class="infoCard"><h2>About</h2>
    <p>স্বাধ্যায় is a digital platform dedicated to preserving and presenting the timeless knowledge of Vedic literature, Sanskrit scriptures, and the Valmiki Ramayana.</p>
    <p>The application combines ancient wisdom with modern technology to create a simple, accessible, and immersive reading experience for students, researchers, and knowledge seekers.</p>
    <blockquote style="background:rgba(212,162,76,.08);padding:14px;border-left:3px solid var(--gold);border-radius:6px;font-style:italic;margin:14px 0;">"Knowledge preserved through time becomes wisdom for future generations."</blockquote></div>
    <div class="infoCard"><h2>Core Features</h2>
    <ul>
      <li>📖 Complete four Vedas with Bhāṣya packs</li>
      <li>🏹 Valmiki Ramayana — all 6 Kandas, 534 Sargas, 17,902 Shlokas</li>
      <li>🔤 Sanskrit · Word-by-word · English translation</li>
      <li>🔍 Unified search across Vedas and Ramayana</li>
      <li>📚 Digital Library with downloadable books</li>
      <li>🌙 Dark/Light/System theme support</li>
      <li>🔤 Adjustable font size and family</li>
    </ul></div>
    <div class="infoCard"><h2>🧑‍💻 Developer</h2>
    <p><strong>Ashim Datta</strong><br>Founder & Developer of স্বাধ্যায়</p>
    <p>Website: <a href="https://arsa-siddanto.blogspot.com" style="color:var(--gold-bright);">arsa-siddanto.blogspot.com</a></p></div>
    <div class="infoCard" style="text-align:center;color:var(--ash);">
      <div>স্বাধ্যায় v1.0.0 · Build 1</div>
      ${COPYRIGHT_HTML}
    </div>`);
}

/* ══════════════════════════════════════════════════════
   ROUTER
══════════════════════════════════════════════════════ */
async function routeDispatch() {
  document.querySelectorAll(".pdfRenderContainer").forEach(el => {
    try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { /* ignore */ }
  });
  hideBookmarkFab(); // reader screens re-show it themselves after render

  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);

  try {
    if (!parts.length) return await screenHome();

    if (parts[0] === "search") return await screenSearch();
    if (parts[0] === "bookmarks") return await screenBookmarks();

    // Library
    if (parts[0] === "library" && parts.length === 1) return await screenLibrary();
    // (parts.length >= 3, not === 3: per-chapter bookmarks append /h/<slug>
    // after the bookId — screenLibraryReader only reads parts[2], the rest
    // is used purely to make each chapter's bookmark hash unique)
    if (parts[0] === "library" && parts[1] === "read" && parts.length >= 3) return await screenLibraryReader(parts[2]);

    // Vedas
    if (parts[0] === "vedas" && parts.length === 1) return await screenVedas();
    if (parts[0] === "veda" && parts.length === 2) return await screenVeda(parts[1]);
    if (parts[0] === "veda" && parts.length === 4 && parts[2] === "range") {
      const [fromNo, toNo] = parts[3].split("-").map(Number);
      return await screenRange(parts[1], fromNo, toNo);
    }
    if (parts[0] === "veda" && parts.length === 3) return await screenLevel1(parts[1], parts[2]);
    if (parts[0] === "veda" && parts.length === 4) return await screenLevel2(parts[1], parts[2], parts[3]);
    if (parts[0] === "mantra" && parts.length === 3) return await screenMantra(parts[1], parts[2]);

    // Ramayana
    if (parts[0] === "ramayana" && parts.length === 1) return await screenRamayana();
    if (parts[0] === "ramayana" && parts[1] === "kanda" && parts.length === 3) return await screenRamayanaKanda(parseInt(parts[2]));
    if (parts[0] === "ramayana" && parts[1] === "sarga" && parts.length === 3) return await screenRamayanaSarga(parseInt(parts[2]));
    if (parts[0] === "ramayana" && parts[1] === "shloka" && parts.length === 3) return await screenRamayanaShloka(parts[2]);

    // Mahabharata
    if (parts[0] === "mahabharata" && parts.length === 1) return await screenMahabharata();
    if (parts[0] === "mahabharata" && parts[1] === "parba" && parts.length === 3) return await screenMahabharataParba(parseInt(parts[2]));
    if (parts[0] === "mahabharata" && parts[1] === "parba" && parts[3] === "adhyay" && parts.length === 5) return await screenMahabharataAdhyay(parseInt(parts[2]), parseInt(parts[4]));

    // Settings
    if (parts[0] === "settings" && parts.length === 1) return await screenSettings();
    if (parts[0] === "settings" && parts[1] === "reader") return await screenReaderSettings();
    if (parts[0] === "settings" && parts[1] === "library") return await screenLibrarySettings();
    if (parts[0] === "settings" && parts[1] === "language") return await screenLanguageSettings();
    if (parts[0] === "settings" && parts[1] === "notification") return await screenNotificationSettings();
    if (parts[0] === "settings" && parts[1] === "search") return await screenSearchSettings();
    if (parts[0] === "settings" && parts[1] === "privacy") return await screenPrivacyPolicy();
    if (parts[0] === "settings" && parts[1] === "terms") return await screenTerms();
    if (parts[0] === "settings" && parts[1] === "disclaimer") return await screenDisclaimer();
    if (parts[0] === "settings" && parts[1] === "licenses") return await screenLicenses();
    if (parts[0] === "settings" && parts[1] === "contact") return await screenContact();
    if (parts[0] === "settings" && parts[1] === "feedback") return await screenFeedback();
    if (parts[0] === "settings" && parts[1] === "report-bug") return await screenReportBug();
    if (parts[0] === "settings" && parts[1] === "faq") return await screenFAQ();
    if (parts[0] === "settings" && parts[1] === "about") return await screenAbout();

    return await screenHome();
  } catch (e) {
    const stackInfo = (e && e.stack) ? e.stack.replace(/\n/g, "<br>") : "no stack";
    root.innerHTML = `<div class="empty" style="text-align:left;word-break:break-word;">পাতা লোড করতে সমস্যা। [${APP_BUILD_VERSION}]<br><br>hash: ${hash}<br><br><b>${e.message || e}</b><br><br><small style="opacity:.6;">${stackInfo}</small></div>`;
    console.error(e);
  }
}

// Page transition: every navigation replays a short fade+slide on #app.
// Wrapping routeDispatch() (instead of touching every individual
// screenXxx() function) keeps this a single hook point — new screens
// automatically get it too.
async function router() {
  await routeDispatch();
  root.classList.remove("pageEnter");
  void root.offsetWidth; // force reflow so the animation restarts every time
  root.classList.add("pageEnter");
  updateDockActive();
}

window.addEventListener("hashchange", router);

/* ══════════════════════════════════════════════════════
   BOTTOM NAVIGATION DOCK — persistent mobile nav (5 zones).
   Active state follows the current hash; the dock itself hides
   while scrolling down during a long reading session and
   reappears on scroll-up, so it never blocks the text.
══════════════════════════════════════════════════════ */
function updateDockActive() {
  if (!bottomDock) return;
  const hash = location.hash || "#/";
  const items = bottomDock.querySelectorAll(".dockItem");
  let bestMatch = items[0];
  let bestLen = -1;
  items.forEach((btn) => {
    const route = btn.dataset.dockRoute;
    const isHome = route === "#/";
    const matches = isHome ? (hash === "#/" || hash === "" || hash === "#") : hash.startsWith(route);
    if (matches && route.length > bestLen) {
      bestMatch = btn;
      bestLen = route.length;
    }
  });
  items.forEach((btn) => {
    const isActive = btn === bestMatch && bestLen >= 0;
    btn.classList.toggle("active", isActive);
    if (isActive) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

if (bottomDock) {
  bottomDock.addEventListener("click", (e) => {
    const btn = e.target.closest(".dockItem");
    if (!btn) return;
    location.hash = btn.dataset.dockRoute;
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const goingDown = y > lastY && y > 80;
        bottomDock.classList.toggle("dockHidden", goingDown);
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }
}
backBtn.addEventListener("click", () => history.length ? window.history.back() : (location.hash = "#/"));
searchBtn.addEventListener("click", () => (location.hash = "#/search"));
bookmarkBtn.addEventListener("click", () => (location.hash = "#/bookmarks"));
settingsBtn.addEventListener("click", () => (location.hash = "#/settings"));

async function boot() {
  root.innerHTML = `
    <div class="loadingFull">
      <div class="sacredParticles" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="omBig">ओ३म्</div>
      <div class="loadingText">নমস্কার, ডাটাবেস লোড হচ্ছে…</div>
      <div class="loadingVersion">${APP_BUILD_VERSION}</div>
    </div>`;
  await ChaturvedaSettings.apply();
  try {
    // Master DB (Strategy 3) — must exist before any pack download/read
    // path touches it. Cheap: just opens swadhyay_master.db and runs
    // idempotent CREATE TABLE IF NOT EXISTS statements.
    await window.SwadhyayMasterDB.initializeMasterDatabase();

    // VedaDB must always succeed — it is bundled.
    await window.VedaDB.initDB();

    // RamayanaDB is now downloadable (not bundled). A missing DB is
    // expected on first launch — we catch the sentinel error and let
    // the router show the download gate instead of crashing on boot.
    try {
      await window.RamayanaDB.initDB();
    } catch (e) {
      if (!e.needsDownload) throw e; // re-throw genuine errors only
      // DB not downloaded yet — screenRamayana() will show the download UI
    }

    // One-time migration for installs updating from the old per-file
    // ATTACH architecture: merges any pack still sitting on disk from
    // before this update into swadhyay_master.db. No-op (fast) once
    // everything's migrated. Runs in the background — never blocks boot,
    // and a failure here must not stop the app from opening.
    window.SwadhyayMasterDB.migrateAllLegacyPacks().catch(err => {
      console.warn("Legacy pack migration did not complete (will retry next launch):", err);
    });

    router();
  } catch (e) {
    const stackInfo = (e && e.stack) ? e.stack.replace(/\n/g, "<br>") : "no stack";
    root.innerHTML = `<div class="empty" style="text-align:left;word-break:break-word;">ডাটাবেস লোড করতে সমস্যা। [${APP_BUILD_VERSION}]<br><br><b>${e.message || e}</b><br><br><small style="opacity:.6;">${stackInfo}</small></div>`;
    console.error(e);
  }
}

document.addEventListener("deviceready", boot);
if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
  window.addEventListener("DOMContentLoaded", () => {
    root.innerHTML = `<div class="empty">এই অ্যাপ শুধু Android বিল্ডে (Capacitor) কাজ করে।</div>`;
  });
}
