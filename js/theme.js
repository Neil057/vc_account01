// ─── Theme (淺色 / 深色 / 跟隨系統) ─────────────────────────────────────────────
// 必須在 <head> 以同步 script 載入，讓 data-theme 在第一次繪製前就設定好，
// 否則深色模式使用者會看到一瞬間的白畫面。
const THEME_KEY = 'jrt_theme';
const THEME_MODES = ['light', 'dark', 'system'];

const Theme = {
  // 使用者選的模式：'light' | 'dark' | 'system'
  get() {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return THEME_MODES.includes(v) ? v : 'system';
    } catch { return 'system'; }
  },

  // 實際套用的外觀：'light' | 'dark'
  resolved() {
    const m = Theme.get();
    if (m !== 'system') return m;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { return 'light'; }
  },

  set(mode) {
    const m = THEME_MODES.includes(mode) ? mode : 'system';
    try { localStorage.setItem(THEME_KEY, m); } catch {}
    Theme.apply();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { mode: m, resolved: Theme.resolved() } }));
  },

  apply() {
    const m = Theme.get();
    const root = document.documentElement;
    // 'system' 不加屬性，交給 CSS 的 prefers-color-scheme 判斷
    if (m === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', m);
    Theme.syncMeta();
  },

  // 同步瀏覽器網址列 / 狀態列顏色
  syncMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', Theme.resolved() === 'dark' ? '#0d1017' : '#eceef4');
  },

  // 淺 ⇄ 深 快速切換（跟隨系統時，切成目前實際外觀的相反色）
  toggle() {
    Theme.set(Theme.resolved() === 'dark' ? 'light' : 'dark');
  }
};

Theme.apply();

// 跟隨系統時，系統色變更要即時反映在 theme-color 上（CSS 由 media query 自動處理）
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (Theme.get() === 'system') {
      Theme.syncMeta();
      document.dispatchEvent(new CustomEvent('themechange', { detail: { mode: 'system', resolved: Theme.resolved() } }));
    }
  });
} catch {}
