// ─── Shared App Utilities ─────────────────────────────────────────────────────

// ── Category Config ───────────────────────────────────────────────────────────
const CATEGORIES = {
  // color: 圖表長條用色（Finexa 紫藍色系）；cls: 圖示底色（淺色 tint）
  '餐飲': { icon: '🍱', cls: 'cat-food',      color: '#7c3aed' },
  '交通': { icon: '🚆', cls: 'cat-transport', color: '#6366f1' },
  '購物': { icon: '🛍️', cls: 'cat-shopping',  color: '#a855f7' },
  '門票': { icon: '🎫', cls: 'cat-ticket',    color: '#3b82f6' },
  '住宿': { icon: '🏨', cls: 'cat-hotel',     color: '#0ea5e9' },
  '藥品': { icon: '💊', cls: 'cat-medicine',  color: '#8b5cf6' },
  '其他': { icon: '📦', cls: 'cat-other',     color: '#94a3b8' },
};

const PAYMENT_METHODS = ['現金', '信用卡', 'Suica', 'PayPay', '其他'];
const CATEGORY_LIST   = Object.keys(CATEGORIES);

// ── HTML Escaping ─────────────────────────────────────────────────────────────
// Every string that reaches innerHTML has passed through Gemini (i.e. it came
// off a receipt photo) or straight from a text field, so it must be escaped
// before it becomes markup. Without this, a crafted store/item name can inject
// script and read the API key out of localStorage.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function getCat(cat)      { return CATEGORIES[cat] || CATEGORIES['其他']; }
function getCatIcon(cat)  { return getCat(cat).icon; }
function getCatClass(cat) { return getCat(cat).cls; }
function getCatColor(cat) { return getCat(cat).color; }

// ── Format Utilities ──────────────────────────────────────────────────────────
const Format = {
  yen(n)  { return `¥${Math.round(n || 0).toLocaleString()}`; },
  twd(n)  { return `NT$${Math.round(n || 0).toLocaleString()}`; },
  today() { return new Date().toISOString().split('T')[0]; },

  date(s) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
  },

  dateShort(s) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return `${d.getMonth()+1}/${d.getDate()}`;
  },

  dateGroupLabel(s) {
    if (!s) return '';
    const d    = new Date(s + 'T00:00:00');
    const days = ['日','一','二','三','四','五','六'];
    const today = Format.today();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (s === today)     return `今天  ${d.getMonth()+1}/${d.getDate()}（週${days[d.getDay()]}）`;
    if (s === yesterday) return `昨天  ${d.getMonth()+1}/${d.getDate()}（週${days[d.getDay()]}）`;
    return `${d.getMonth()+1}/${d.getDate()}（週${days[d.getDay()]}）`;
  }
};

// ── Live Exchange Rate Fetcher (臺灣銀行 / 外匯即期牌告) ────────────
async function fetchLiveBotExchangeRate() {
  // Strategy 1: Bank of Taiwan Real-time Spot Rate (haotool BOT feed on jsdelivr CDN)
  try {
    const res = await fetch('https://cdn.jsdelivr.net/gh/haotool/app@data/public/rates/latest.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      const spotSell = data?.details?.JPY?.spot?.sell;
      if (spotSell && typeof spotSell === 'number') {
        return {
          rate: parseFloat(spotSell.toFixed(4)),
          source: '臺灣銀行即期賣出牌告',
          updateTime: data.updateTime || ''
        };
      }
    }
  } catch (e) {
    console.warn('BOT live rate CDN fetch failed:', e);
  }

  // Strategy 2: Taiwanese Interbank Forex API
  try {
    const res = await fetch('https://tw.rter.info/capi.php', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data?.USDTWD?.Exrate && data?.USDJPY?.Exrate) {
        const rate = (data.USDTWD.Exrate / data.USDJPY.Exrate) * 1.014; // Include bank spot spread
        return {
          rate: parseFloat(rate.toFixed(4)),
          source: '臺灣銀行即期賣出參考',
          updateTime: data?.USDTWD?.UTC || ''
        };
      }
    }
  } catch (e) {
    console.warn('rter forex fetch failed:', e);
  }

  // Strategy 3: Open Exchange Rates fallback
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/JPY', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data?.rates?.TWD) {
        return {
          rate: parseFloat((data.rates.TWD * 1.014).toFixed(4)),
          source: '即期市場牌告匯率',
          updateTime: ''
        };
      }
    }
  } catch (e) {
    console.warn('er-api fetch failed:', e);
  }

  return { rate: 0.2028, source: '臺灣銀行牌告 (基準值)', updateTime: '' };
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer;
let _toastDismiss;

function hideToast() {
  const el = document.getElementById('_toast');
  if (el) el.classList.remove('show');
  clearTimeout(_toastTimer);
  if (_toastDismiss) {
    document.removeEventListener('pointerdown', _toastDismiss, true);
    _toastDismiss = null;
  }
}

function showToast(msg, type = '', duration = 3000) {
  let el = document.getElementById('_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className   = `toast ${type}`;
  el.classList.add('show');

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(hideToast, duration);

  // Tapping anywhere dismisses it early. The toast itself keeps
  // pointer-events: none so it never swallows a tap meant for the page.
  // Registered on the next frame so the very tap that raised the toast
  // doesn't immediately close it again.
  if (_toastDismiss) document.removeEventListener('pointerdown', _toastDismiss, true);
  _toastDismiss = null;
  requestAnimationFrame(() => {
    _toastDismiss = () => hideToast();
    document.addEventListener('pointerdown', _toastDismiss, { capture: true, once: true });
  });
}

// ── Loading Overlay ───────────────────────────────────────────────────────────
function showLoading(msg = 'AI 辨識中...') {
  let el = document.getElementById('_loading');
  if (!el) {
    el = document.createElement('div');
    el.id = '_loading';
    el.className = 'loading-overlay';
    el.innerHTML = `<div class="spinner"></div><div class="loading-msg" id="_loading_msg"></div>`;
    document.body.appendChild(el);
  }
  document.getElementById('_loading_msg').textContent = msg;
  el.classList.add('show');
}

function hideLoading() {
  const el = document.getElementById('_loading');
  if (el) el.classList.remove('show');
}

// ── Bottom Navigation ─────────────────────────────────────────────────────────
function renderNav(active) {
  // 統計已併入首頁的「分析」分頁，所以導覽列只留四格
  const items = [
    { id:'home',     href:'index.html',    icon:'🏠', lbl:'首頁' },
    { id:'scan',     href:'scan.html',     icon:'📷', lbl:'掃描' },
    { id:'history',  href:'history.html',  icon:'📋', lbl:'記錄' },
    { id:'settings', href:'settings.html', icon:'⚙️', lbl:'設定' },
  ];
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.innerHTML = `
    <div class="nav-items">
      ${items.map(it => `
        <a href="${it.href}" class="nav-item ${active === it.id ? 'active' : ''}">
          <span class="nav-icon">${it.icon}</span>
          <span class="nav-lbl">${it.lbl}</span>
        </a>
      `).join('')}
    </div>`;
  document.body.appendChild(nav);
}

// ── Setup Guard ───────────────────────────────────────────────────────────────
function requireApiKey() {
  const s = Storage.getSettings();
  if (!s.geminiApiKey) {
    showToast('⚠️ 請先在設定頁面填入 Gemini API Key', 'error', 4000);
    setTimeout(() => { window.location.href = 'settings.html'; }, 1200);
    return false;
  }
  return true;
}

// ── Session Data (scan → confirm) ────────────────────────────────────────────
const Session = {
  set(key, val) { sessionStorage.setItem(key, JSON.stringify(val)); },
  get(key)      { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } },
  clear(key)    { sessionStorage.removeItem(key); }
};

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function confirm2(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(20,22,28,0.45);
      backdrop-filter:blur(8px);display:flex;align-items:center;
      justify-content:center;z-index:600;padding:24px;`;
    overlay.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border-light);
        box-shadow:var(--shadow-elevated);
        border-radius:26px;padding:28px 24px;max-width:320px;width:100%;text-align:center;">
        <div style="font-size:24px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">${msg}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:24px;">此操作無法復原</div>
        <div style="display:flex;gap:10px;">
          <button id="_cf_cancel" class="btn btn-secondary btn-full">取消</button>
          <button id="_cf_ok"     class="btn btn-danger btn-full">確定刪除</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#_cf_cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#_cf_ok'    ).onclick = () => { overlay.remove(); resolve(true);  };
  });
}
