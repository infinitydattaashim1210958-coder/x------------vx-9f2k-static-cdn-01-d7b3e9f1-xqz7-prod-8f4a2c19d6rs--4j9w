/**
 * gestures.js — Touch gesture layer for স্বাধ্যায়
 *
 * §23  Swipe chapter navigation (left/right)
 * §24  Pull-down chapter selector (downward drag from reader header)
 *
 * Safety contract:
 * - Never hijack vertical scrolling
 * - Never hijack text selection, buttons, links, inputs, selects
 * - Never call preventDefault() on touchstart (keeps scroll natural)
 * - Only intercepts when the reader is active (data-swipe-nav present)
 * - Disables all motion under prefers-reduced-motion
 */

/* ─────────────────────────────────────────────────────────────
   §23  SWIPE CHAPTER / VERSE NAVIGATION
   Reuses the .mantraNav prev/next anchor-buttons that every
   detail screen already renders, so this layer adds no coupling
   to reader-specific routing logic.
───────────────────────────────────────────────────────────── */
(function initSwipeNav() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const EXCLUDED = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"]);
  const MIN_DISTANCE = 60;     // px horizontal
  const MIN_VELOCITY = 0.35;   // px/ms — forgiving enough for Android

  let t0 = 0, x0 = 0, y0 = 0;
  let tracking = false;

  document.addEventListener("touchstart", (e) => {
    const touch = e.changedTouches[0];
    // Do not start tracking when originating from interactive elements
    const tag = document.elementFromPoint(touch.clientX, touch.clientY)?.tagName;
    if (EXCLUDED.has(tag)) { tracking = false; return; }
    tracking = true;
    t0 = Date.now();
    x0 = touch.screenX;
    y0 = touch.screenY;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;

    const touch = e.changedTouches[0];
    const dx = touch.screenX - x0;
    const dy = touch.screenY - y0;
    const dt = Math.max(1, Date.now() - t0);
    const velocity = Math.abs(dx) / dt;

    // Must be horizontal-dominant, long enough, and fast enough
    if (Math.abs(dx) < MIN_DISTANCE) return;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (velocity < MIN_VELOCITY) return;

    const nav = document.querySelector(".mantraNav");
    if (!nav) return;

    const prevBtn = nav.querySelector(".navBtn:first-child");
    const nextBtn = nav.querySelector(".navBtn:last-child");
    const btn = dx < 0 ? nextBtn : prevBtn;
    if (btn && !btn.classList.contains("disabled")) btn.click();
  }, { passive: true });
})();

/* ─────────────────────────────────────────────────────────────
   §24  PULL-DOWN CHAPTER SELECTOR
   A bottom-sheet list of chapters for the current scripture,
   triggered by (a) dragging downward from the top reader zone,
   or (b) tapping the "অধ্যায়" button in the reader header.
   The button is always present so gesture is never the only path.
───────────────────────────────────────────────────────────── */

let _selectorOpen = false;
let _selectorSheet = null;

function closeSelectorSheet() {
  if (!_selectorSheet) return;
  _selectorSheet.classList.remove("selectorSheetOpen");
  _selectorSheet.setAttribute("aria-hidden", "true");
  // Remove after animation completes
  setTimeout(() => {
    if (_selectorSheet && _selectorSheet.parentNode) {
      _selectorSheet.parentNode.removeChild(_selectorSheet);
    }
    _selectorSheet = null;
    _selectorOpen = false;
  }, 280);
}

/**
 * openChapterSelector(chapters, currentHref)
 *
 * Called by the reader header button or pull-down gesture.
 *
 * @param {Array<{label: string, href: string}>} chapters — real chapter list
 * @param {string} currentHref — href of the currently active chapter
 */
function openChapterSelector(chapters, currentHref) {
  if (_selectorOpen) { closeSelectorSheet(); return; }
  if (!chapters || !chapters.length) return;

  const escHtml = window.SwadhyayEscapeHtml || (s => String(s ?? ""));

  const items = chapters.map(ch => {
    const isCurrent = ch.href === currentHref;
    return `<a class="chapterSelectorItem${isCurrent ? " active" : ""}"
               href="${ch.href}"
               aria-current="${isCurrent ? "true" : "false"}">
      <span class="chapterSelectorLabel">${escHtml(ch.label)}</span>
      ${isCurrent ? "<span class=\"chapterSelectorActive\" aria-hidden=\"true\">●</span>" : ""}
    </a>`;
  }).join("");

  const sheet = document.createElement("div");
  sheet.className = "selectorSheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "অধ্যায় নির্বাচন করুন");
  sheet.setAttribute("aria-hidden", "false");
  sheet.innerHTML = `
    <div>
      <div class="selectorSheetHandle" aria-hidden="true"></div>
      <div class="selectorSheetHeader">
        <span class="selectorSheetTitle">অধ্যায় নির্বাচন</span>
        <button class="selectorSheetClose" aria-label="বন্ধ করুন">✕</button>
      </div>
      <div class="selectorSheetList" role="list">${items}</div>
    </div>`;

  document.body.appendChild(sheet);
  _selectorSheet = sheet;
  _selectorOpen = true;

  // Trigger open animation next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => sheet.classList.add("selectorSheetOpen"));
  });

  sheet.querySelector(".selectorSheetClose").addEventListener("click", closeSelectorSheet);

  sheet.querySelector(".selectorSheetList").addEventListener("click", (e) => {
    const item = e.target.closest(".chapterSelectorItem");
    if (item) closeSelectorSheet();
  });

  // Close on backdrop tap (the sheet itself, not the inner div)
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) closeSelectorSheet();
  });

  // Keyboard escape
  const onKey = (e) => {
    if (e.key === "Escape") { closeSelectorSheet(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);

  // Close on route change
  const onHashChange = () => { closeSelectorSheet(); window.removeEventListener("hashchange", onHashChange); };
  window.addEventListener("hashchange", onHashChange);

  // Focus first item
  const firstItem = sheet.querySelector(".chapterSelectorItem");
  if (firstItem) requestAnimationFrame(() => firstItem.focus());
}

/* §24 — Pull-down gesture from reader header zone */
(function initPullDownGesture() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const MIN_DOWN_DISTANCE = 56;  // px
  const MAX_HEADER_Y = 120;      // px from top — must start in the header zone

  let py0 = 0, px0 = 0, pt0 = 0;
  let pullTracking = false;

  document.addEventListener("touchstart", (e) => {
    const touch = e.changedTouches[0];
    if (touch.clientY > MAX_HEADER_Y) { pullTracking = false; return; }
    // Only when we're in a reader (pull-down only makes sense there)
    const hasReader = !!(document.querySelector(".mantraNav") || document.querySelector(".mantraDetail"));
    if (!hasReader) { pullTracking = false; return; }
    pullTracking = true;
    pt0 = Date.now();
    py0 = touch.screenY;
    px0 = touch.screenX;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!pullTracking) return;
    pullTracking = false;
    const touch = e.changedTouches[0];
    const dy = touch.screenY - py0;
    const dx = touch.screenX - px0;
    if (dy < MIN_DOWN_DISTANCE) return;
    if (Math.abs(dx) > dy) return; // more horizontal than vertical — skip

    // Ask app.js for the current chapter list via a custom event
    const ev = new CustomEvent("swadhyay:requestchapters", { bubbles: true });
    document.dispatchEvent(ev);
  }, { passive: true });
})();

/* Expose public API */
window.SwadhyayGestures = {
  openChapterSelector,
  closeSelectorSheet,
};
