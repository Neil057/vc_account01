// ─── Storage Layer ────────────────────────────────────────────────────────────
const RECORDS_KEY  = 'jrt_records';
const SETTINGS_KEY = 'jrt_settings';

const DEFAULT_SETTINGS = {
  geminiApiKey: '',
  budget: 300000,
  exchangeRate: 0.21,
  tripStartDate: '',
  tripEndDate: '',
};

const Storage = {
  // ── Records ──────────────────────────────────────────
  getRecords() {
    try { return JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]'); }
    catch { return []; }
  },

  _save(records) {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  },

  addRecord(record) {
    const records = this.getRecords();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newRec = { ...record, id, createdAt: new Date().toISOString() };
    records.unshift(newRec);
    this._save(records);
    return newRec;
  },

  deleteRecord(id) {
    this._save(this.getRecords().filter(r => r.id !== id));
  },

  updateRecord(id, updates) {
    const records = this.getRecords();
    const i = records.findIndex(r => r.id === id);
    if (i !== -1) { records[i] = { ...records[i], ...updates }; this._save(records); }
  },

  // ── Settings ──────────────────────────────────────────
  getSettings() {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
    catch { return { ...DEFAULT_SETTINGS }; }
  },

  saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); },

  setSetting(key, val) {
    const s = this.getSettings(); s[key] = val; this.saveSettings(s);
  },

  // ── Analytics ─────────────────────────────────────────
  getTodaySpending() {
    const today = new Date().toISOString().split('T')[0];
    return this.getRecords()
      .filter(r => r.date === today)
      .reduce((s, r) => s + (r.amountJPY || 0), 0);
  },

  getTotalSpending() {
    return this.getRecords().reduce((s, r) => s + (r.amountJPY || 0), 0);
  },

  getDayCount() {
    const records = this.getRecords();
    if (!records.length) return 0;
    const dates = new Set(records.map(r => r.date).filter(Boolean));
    return dates.size;
  },

  getByCategory() {
    const map = {};
    this.getRecords().forEach(r => {
      const c = r.category || '其他';
      map[c] = (map[c] || 0) + (r.amountJPY || 0);
    });
    return map;
  },

  getByDay() {
    const map = {};
    this.getRecords().forEach(r => {
      if (r.date) map[r.date] = (map[r.date] || 0) + (r.amountJPY || 0);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
  },

  getByPayment() {
    const map = {};
    this.getRecords().forEach(r => {
      const p = r.paymentMethod || '其他';
      map[p] = (map[p] || 0) + (r.amountJPY || 0);
    });
    return map;
  },

  // ── Export ────────────────────────────────────────────
  exportCSV() {
    const records = this.getRecords();
    if (!records.length) { showToast('沒有資料可以匯出', 'error'); return; }
    const headers = ['日期','店名','店名(日文)','品項','品項(日文)','金額(JPY)','金額(TWD)','稅制','類別','支付方式','備註'];
    const rows = records.map(r => [
      r.date || '', r.storeName || '', r.storeNameJa || '',
      r.items || '', r.itemsJa || '',
      r.amountJPY || 0, r.amountTWD || 0,
      r.taxType || '', r.category || '', r.paymentMethod || '', r.notes || ''
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `japan-receipts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ CSV 已下載', 'success');
  },

  clearAll() {
    localStorage.removeItem(RECORDS_KEY);
  }
};
