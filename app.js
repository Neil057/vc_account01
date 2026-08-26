/**
 * Lumina Ledger - Core Application Logic
 * Pure Vanilla JavaScript: State Management, Chart.js Controller, LocalStorage, CSV Export
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. Constants & Metadata
  // =========================================================================
  const STORAGE_KEY = 'lumina_ledger_transactions_v1';

  const CATEGORY_MAP = {
    // Expense Categories
    '餐飲': { emoji: '🍔', color: '#f59e0b', type: 'expense' },
    '交通': { emoji: '🚗', color: '#3b82f6', type: 'expense' },
    '娛樂': { emoji: '🎮', color: '#ec4899', type: 'expense' },
    '購物': { emoji: '🛍️', color: '#a855f7', type: 'expense' },
    '居家': { emoji: '🏠', color: '#14b8a6', type: 'expense' },
    // Income Categories
    '薪資': { emoji: '💰', color: '#10b981', type: 'income' },
    '獎金': { emoji: '🎁', color: '#eab308', type: 'income' },
    '投資': { emoji: '📈', color: '#06b6d4', type: 'income' },
    '兼職': { emoji: '💼', color: '#8b5cf6', type: 'income' },
    // Shared
    '其他': { emoji: '📦', color: '#64748b', type: 'other' }
  };

  const DEFAULT_EXPENSE_CAT = '餐飲';
  const DEFAULT_INCOME_CAT = '薪資';

  // =========================================================================
  // 2. Application State
  // =========================================================================
  const today = new Date();
  const state = {
    transactions: [],
    selectedYear: today.getFullYear(),
    selectedMonth: today.getMonth() + 1, // 1 - 12
    searchQuery: '',
    categoryFilter: 'ALL',
    typeFilter: 'ALL',
    itemToDeleteId: null,
    editingId: null
  };

  // Chart instance holder
  let categoryChartInstance = null;

  // =========================================================================
  // 3. Sample Seed Data Generator (For first-time delight)
  // =========================================================================
  function getSampleData(year, month) {
    const mStr = String(month).padStart(2, '0');
    return [
      {
        id: 'tx_seed_1',
        type: 'income',
        date: `${year}-${mStr}-05`,
        category: '薪資',
        amount: 52000,
        note: '每月本薪入帳',
        createdAt: Date.now() - 86400000 * 20
      },
      {
        id: 'tx_seed_2',
        type: 'expense',
        date: `${year}-${mStr}-06`,
        category: '餐飲',
        amount: 1450,
        note: '週末家庭聚餐',
        createdAt: Date.now() - 86400000 * 18
      },
      {
        id: 'tx_seed_3',
        type: 'expense',
        date: `${year}-${mStr}-08`,
        category: '交通',
        amount: 1200,
        note: '悠遊卡 1280 雙北月票',
        createdAt: Date.now() - 86400000 * 15
      },
      {
        id: 'tx_seed_4',
        type: 'expense',
        date: `${year}-${mStr}-12`,
        category: '娛樂',
        amount: 680,
        note: '電影院 IMAX 雙人票',
        createdAt: Date.now() - 86400000 * 12
      },
      {
        id: 'tx_seed_5',
        type: 'expense',
        date: `${year}-${mStr}-15`,
        category: '購物',
        amount: 2380,
        note: 'Uniqlo 春季換季衣物',
        createdAt: Date.now() - 86400000 * 10
      },
      {
        id: 'tx_seed_6',
        type: 'expense',
        date: `${year}-${mStr}-18`,
        category: '餐飲',
        amount: 320,
        note: '星巴克下午茶與點心',
        createdAt: Date.now() - 86400000 * 6
      },
      {
        id: 'tx_seed_7',
        type: 'income',
        date: `${year}-${mStr}-20`,
        category: '兼職',
        amount: 6500,
        note: '設計接案專案尾款',
        createdAt: Date.now() - 86400000 * 4
      },
      {
        id: 'tx_seed_8',
        type: 'expense',
        date: `${year}-${mStr}-22`,
        category: '居家',
        amount: 950,
        note: '全聯日常清潔與生活用品',
        createdAt: Date.now() - 86400000 * 2
      }
    ];
  }

  // =========================================================================
  // 4. LocalStorage Helper Functions
  // =========================================================================
  function loadTransactionsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // First time initialization: populate sample data
        const sample = getSampleData(state.selectedYear, state.selectedMonth);
        saveTransactionsToStorage(sample);
        return sample;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse localStorage data:', e);
      return [];
    }
  }

  function saveTransactionsToStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      showToast('儲存失敗：本地儲存空間不足', 'error');
    }
  }

  // =========================================================================
  // 5. Utility & Formatters
  // =========================================================================
  function formatCurrency(num) {
    return '$' + Number(num || 0).toLocaleString('zh-TW', {
      maximumFractionDigits: 0
    });
  }

  function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getCategoryInfo(categoryName) {
    return CATEGORY_MAP[categoryName] || { emoji: '📦', color: '#64748b', type: 'other' };
  }

  function generateUniqueId() {
    return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  }

  // =========================================================================
  // 6. Toast Notification Component
  // =========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle-2';
    if (type === 'error') iconName = 'alert-circle';

    toast.innerHTML = `
      <i data-lucide="${iconName}" class="toast-icon"></i>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // 7. Filtering & Summary Calculations
  // =========================================================================
  function getTransactionsForSelectedMonth() {
    const targetPrefix = `${state.selectedYear}-${String(state.selectedMonth).padStart(2, '0')}`;
    return state.transactions.filter(t => t.date.startsWith(targetPrefix));
  }

  function getFilteredTransactions() {
    const monthlyList = getTransactionsForSelectedMonth();
    const q = state.searchQuery.trim().toLowerCase();

    return monthlyList.filter(t => {
      // Type Filter
      if (state.typeFilter !== 'ALL' && t.type !== state.typeFilter) {
        return false;
      }
      // Category Filter
      if (state.categoryFilter !== 'ALL' && t.category !== state.categoryFilter) {
        return false;
      }
      // Search Query
      if (q) {
        const matchNote = (t.note || '').toLowerCase().includes(q);
        const matchCat = (t.category || '').toLowerCase().includes(q);
        const matchAmount = String(t.amount).includes(q);
        const matchDate = t.date.includes(q);
        if (!matchNote && !matchCat && !matchAmount && !matchDate) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      // Sort descending by date, then createdAt
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function calculateMonthlyStats(monthlyList) {
    let income = 0;
    let expense = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    const categoryExpenseMap = {};

    monthlyList.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        income += amt;
        incomeCount++;
      } else {
        expense += amt;
        expenseCount++;
        categoryExpenseMap[t.category] = (categoryExpenseMap[t.category] || 0) + amt;
      }
    });

    const net = income - expense;
    const totalTransactions = monthlyList.length;

    // Calculate days in selected month for daily avg
    const daysInMonth = new Date(state.selectedYear, state.selectedMonth, 0).getDate();
    const avgDailyExpense = Math.round(expense / daysInMonth);

    return {
      income,
      expense,
      net,
      incomeCount,
      expenseCount,
      totalTransactions,
      avgDailyExpense,
      categoryExpenseMap
    };
  }

  // =========================================================================
  // 8. Chart.js Controller (Doughnut / Category Breakdown)
  // =========================================================================
  function renderCategoryChart(categoryExpenseMap, totalExpense) {
    const canvas = document.getElementById('categoryChart');
    const centerVal = document.getElementById('chartCenterTotal');
    const breakdownList = document.getElementById('categoryBreakdownList');

    if (!canvas) return;

    centerVal.textContent = formatCurrency(totalExpense);

    const categories = Object.keys(categoryExpenseMap);
    const amounts = categories.map(c => categoryExpenseMap[c]);
    const colors = categories.map(c => getCategoryInfo(c).color);

    // Render Progress Breakdown List below chart
    if (categories.length === 0 || totalExpense === 0) {
      breakdownList.innerHTML = `
        <div class="empty-chart-note">
          <p>本月尚無支出分類資料</p>
        </div>
      `;
    } else {
      // Sort categories descending by amount
      const sortedCats = [...categories].sort((a, b) => categoryExpenseMap[b] - categoryExpenseMap[a]);

      breakdownList.innerHTML = sortedCats.map(cat => {
        const amt = categoryExpenseMap[cat];
        const pct = ((amt / totalExpense) * 100).toFixed(1);
        const info = getCategoryInfo(cat);

        return `
          <div class="cat-item">
            <div class="cat-item-top">
              <div class="cat-item-info">
                <span class="cat-color-dot" style="background-color: ${info.color}"></span>
                <span class="cat-name">${info.emoji} ${escapeHtml(cat)}</span>
              </div>
              <div class="cat-amount-group">
                <span class="cat-amt">${formatCurrency(amt)}</span>
                <span class="cat-pct">(${pct}%)</span>
              </div>
            </div>
            <div class="cat-progress-bar">
              <div class="cat-progress-fill" style="width: ${pct}%; background: ${info.color}"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Prepare Chart.js datasets
    let chartLabels = categories;
    let chartData = amounts;
    let chartBg = colors;

    if (categories.length === 0 || totalExpense === 0) {
      chartLabels = ['無支出'];
      chartData = [1];
      chartBg = ['rgba(255, 255, 255, 0.08)'];
    }

    if (categoryChartInstance) {
      categoryChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    categoryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: chartLabels,
        datasets: [{
          data: chartData,
          backgroundColor: chartBg,
          borderColor: 'rgba(15, 21, 35, 0.9)',
          borderWidth: 3,
          hoverBorderColor: '#ffffff',
          hoverBorderWidth: 2,
          hoverOffset: 6,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: categories.length > 0 && totalExpense > 0,
            backgroundColor: 'rgba(15, 21, 35, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            callbacks: {
              label: function (context) {
                const val = context.raw || 0;
                const pct = totalExpense > 0 ? ((val / totalExpense) * 100).toFixed(1) : 0;
                return ` 金額: ${formatCurrency(val)} (${pct}%)`;
              }
            }
          }
        },
        animation: {
          duration: 650,
          easing: 'easeOutQuart'
        }
      }
    });
  }

  // =========================================================================
  // 9. UI Renderers (Overview Cards, Table, Month Display)
  // =========================================================================
  function renderAll() {
    // 1. Update Month Header Display
    const monthText = document.getElementById('currentMonthText');
    if (monthText) {
      monthText.textContent = `${state.selectedYear} 年 ${state.selectedMonth} 月`;
    }

    // 2. Compute Monthly Stats
    const monthlyTransactions = getTransactionsForSelectedMonth();
    const stats = calculateMonthlyStats(monthlyTransactions);

    // 3. Update Stat Cards
    document.getElementById('totalIncome').textContent = formatCurrency(stats.income);
    document.getElementById('incomeCount').textContent = `共 ${stats.incomeCount} 筆收入`;

    document.getElementById('totalExpense').textContent = formatCurrency(stats.expense);
    document.getElementById('expenseCount').textContent = `共 ${stats.expenseCount} 筆支出`;

    const netBalanceElem = document.getElementById('netBalance');
    const balanceStatusElem = document.getElementById('balanceStatus');
    netBalanceElem.textContent = formatCurrency(stats.net);

    if (stats.net > 0) {
      balanceStatusElem.textContent = '盈餘 (收入大於支出)';
      balanceStatusElem.style.color = '#10b981';
    } else if (stats.net < 0) {
      balanceStatusElem.textContent = '透支 (赤字)';
      balanceStatusElem.style.color = '#f43f5e';
    } else {
      balanceStatusElem.textContent = '收支平衡';
      balanceStatusElem.style.color = 'var(--text-muted)';
    }

    document.getElementById('totalTransactionsCount').innerHTML = `${stats.totalTransactions} <span class="unit">筆</span>`;
    document.getElementById('avgExpenseText').textContent = `平均每日支出 ${formatCurrency(stats.avgDailyExpense)}`;

    // 4. Update Chart
    renderCategoryChart(stats.categoryExpenseMap, stats.expense);

    // 5. Update Table & Filtered List
    const filteredList = getFilteredTransactions();
    renderTable(filteredList);

    // Re-initialize Lucide icons
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function renderTable(filteredList) {
    const tbody = document.getElementById('transactionTableBody');
    const emptyState = document.getElementById('emptyState');
    const filteredCountBadge = document.getElementById('tableFilteredCount');
    const summaryFooter = document.getElementById('tableSummaryFooter');

    filteredCountBadge.textContent = `${filteredList.length} 筆記錄`;
    summaryFooter.textContent = `顯示 ${state.selectedYear}年${state.selectedMonth}月之收支記錄 (共 ${filteredList.length} 筆)`;

    if (filteredList.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = filteredList.map(t => {
      const isExpense = t.type === 'expense';
      const catInfo = getCategoryInfo(t.category);
      const formattedAmt = `${isExpense ? '-' : '+'}${formatCurrency(t.amount)}`;
      const noteHtml = t.note ? escapeHtml(t.note) : '<span class="empty-note">無備註</span>';

      return `
        <tr data-id="${t.id}">
          <td class="table-date">${t.date}</td>
          <td>
            <span class="type-tag ${t.type}">
              ${isExpense ? '支出' : '收入'}
            </span>
          </td>
          <td>
            <span class="category-tag" style="border-color: ${catInfo.color}40; background: ${catInfo.color}15;">
              <span>${catInfo.emoji}</span>
              <span style="color: #f1f5f9">${escapeHtml(t.category)}</span>
            </span>
          </td>
          <td>
            <div class="table-note" title="${escapeHtml(t.note || '')}">${noteHtml}</div>
          </td>
          <td class="table-amount ${t.type} text-right">${formattedAmt}</td>
          <td class="text-center">
            <div class="row-actions">
              <button class="action-icon-btn edit-btn" data-id="${t.id}" title="編輯記錄" aria-label="編輯記錄">
                <i data-lucide="pencil"></i>
              </button>
              <button class="action-icon-btn delete-btn" data-id="${t.id}" title="刪除記錄" aria-label="刪除記錄">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // 10. CSV Export Utility (UTF-8 with BOM for Excel Compatibility)
  // =========================================================================
  function exportTransactionsToCsv() {
    const list = getTransactionsForSelectedMonth();
    if (list.length === 0) {
      showToast('目前月份無任何記帳記錄可匯出', 'error');
      return;
    }

    // CSV Headers
    const headers = ['日期', '類型', '類別', '金額', '備註說明'];
    const rows = [headers];

    list.forEach(t => {
      const typeLabel = t.type === 'income' ? '收入' : '支出';
      // Escape commas and double quotes for CSV safety
      const safeNote = (t.note || '').replace(/"/g, '""');
      rows.push([
        `"${t.date}"`,
        `"${typeLabel}"`,
        `"${t.category}"`,
        `"${t.amount}"`,
        `"${safeNote}"`
      ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\r\n');

    // Add UTF-8 BOM (\uFEFF) so Excel displays Traditional Chinese correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Lumina記帳_${state.selectedYear}年${state.selectedMonth}月.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`已成功匯出 ${state.selectedYear}年${state.selectedMonth}月 CSV 檔案！`, 'success');
  }

  // =========================================================================
  // 11. Modal & Form Controller
  // =========================================================================
  const modal = document.getElementById('transactionModal');
  const confirmModal = document.getElementById('confirmModal');
  const form = document.getElementById('transactionForm');

  function openAddModal() {
    state.editingId = null;
    document.getElementById('modalTitle').textContent = '新增記帳記錄';
    document.getElementById('editTransactionId').value = '';
    
    // Reset Form to default
    form.reset();
    document.getElementById('txDate').value = getTodayDateString();
    
    // Default to Expense
    setModalType('expense');
    setSelectedCategory(DEFAULT_EXPENSE_CAT);

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('txAmount').focus();
  }

  function openEditModal(id) {
    const item = state.transactions.find(t => t.id === id);
    if (!item) return;

    state.editingId = id;
    document.getElementById('modalTitle').textContent = '編輯記帳記錄';
    document.getElementById('editTransactionId').value = id;
    document.getElementById('txDate').value = item.date;
    document.getElementById('txAmount').value = item.amount;
    document.getElementById('txNote').value = item.note || '';

    setModalType(item.type);
    setSelectedCategory(item.category);

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    state.editingId = null;
  }

  function setModalType(type) {
    const radio = document.querySelector(`input[name="txType"][value="${type}"]`);
    if (radio) radio.checked = true;

    const expenseSeg = document.querySelector('.type-segment.expense-segment');
    const incomeSeg = document.querySelector('.type-segment.income-segment');
    const expenseGrid = document.getElementById('expenseCategoryGrid');
    const incomeGrid = document.getElementById('incomeCategoryGrid');

    if (type === 'expense') {
      expenseSeg.classList.add('active');
      incomeSeg.classList.remove('active');
      expenseGrid.style.display = 'grid';
      incomeGrid.style.display = 'none';
      if (!CATEGORY_MAP[getSelectedCategory()] || CATEGORY_MAP[getSelectedCategory()].type === 'income') {
        setSelectedCategory(DEFAULT_EXPENSE_CAT);
      }
    } else {
      expenseSeg.classList.remove('active');
      incomeSeg.classList.add('active');
      expenseGrid.style.display = 'none';
      incomeGrid.style.display = 'grid';
      if (!CATEGORY_MAP[getSelectedCategory()] || CATEGORY_MAP[getSelectedCategory()].type === 'expense') {
        setSelectedCategory(DEFAULT_INCOME_CAT);
      }
    }
  }

  function getSelectedCategory() {
    return document.getElementById('txCategory').value;
  }

  function setSelectedCategory(catName) {
    document.getElementById('txCategory').value = catName;
    const allPills = document.querySelectorAll('.category-pill');
    allPills.forEach(pill => {
      if (pill.getAttribute('data-category') === catName) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  function handleFormSubmit(e) {
    e.preventDefault();

    const type = document.querySelector('input[name="txType"]:checked').value;
    const date = document.getElementById('txDate').value;
    const category = document.getElementById('txCategory').value;
    const amountVal = parseFloat(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value.trim();

    // Validation
    if (!date) {
      showToast('請選擇交易日期', 'error');
      return;
    }
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('請輸入大於 0 的有效金額', 'error');
      return;
    }

    if (state.editingId) {
      // Update existing
      const idx = state.transactions.findIndex(t => t.id === state.editingId);
      if (idx !== -1) {
        state.transactions[idx] = {
          ...state.transactions[idx],
          type,
          date,
          category,
          amount: amountVal,
          note
        };
        showToast('記帳記錄已成功更新！', 'success');
      }
    } else {
      // Add new
      const newTx = {
        id: generateUniqueId(),
        type,
        date,
        category,
        amount: amountVal,
        note,
        createdAt: Date.now()
      };
      state.transactions.push(newTx);
      showToast('新增記帳成功！', 'success');

      // If user added item in a different month, optionally jump to that month
      const [txY, txM] = date.split('-').map(Number);
      if (txY !== state.selectedYear || txM !== state.selectedMonth) {
        state.selectedYear = txY;
        state.selectedMonth = txM;
      }
    }

    saveTransactionsToStorage(state.transactions);
    closeModal();
    renderAll();
  }

  // =========================================================================
  // 12. Delete & Confirm Dialog Controller
  // =========================================================================
  function openConfirmDeleteModal(id) {
    state.itemToDeleteId = id;
    confirmModal.classList.add('active');
    confirmModal.setAttribute('aria-hidden', 'false');
  }

  function closeConfirmModal() {
    confirmModal.classList.remove('active');
    confirmModal.setAttribute('aria-hidden', 'true');
    state.itemToDeleteId = null;
  }

  function executeDelete() {
    if (!state.itemToDeleteId) return;

    state.transactions = state.transactions.filter(t => t.id !== state.itemToDeleteId);
    saveTransactionsToStorage(state.transactions);
    closeConfirmModal();
    renderAll();
    showToast('該筆記錄已刪除', 'info');
  }

  // =========================================================================
  // 13. Event Listeners Initialization
  // =========================================================================
  function setupEventListeners() {
    // 1. Month Navigation
    document.getElementById('prevMonthBtn').addEventListener('click', () => {
      if (state.selectedMonth === 1) {
        state.selectedYear--;
        state.selectedMonth = 12;
      } else {
        state.selectedMonth--;
      }
      renderAll();
    });

    document.getElementById('nextMonthBtn').addEventListener('click', () => {
      if (state.selectedMonth === 12) {
        state.selectedYear++;
        state.selectedMonth = 1;
      } else {
        state.selectedMonth++;
      }
      renderAll();
    });

    document.getElementById('todayMonthBtn').addEventListener('click', () => {
      const now = new Date();
      state.selectedYear = now.getFullYear();
      state.selectedMonth = now.getMonth() + 1;
      renderAll();
    });

    // 2. Add / Edit Modal triggers
    document.getElementById('openAddModalBtn').addEventListener('click', openAddModal);
    document.getElementById('emptyAddBtn').addEventListener('click', openAddModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

    // Modal background click to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Segmented Type radio change in Modal
    document.querySelectorAll('input[name="txType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        setModalType(e.target.value);
      });
    });

    // Category Pills click
    document.querySelectorAll('.category-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const cat = pill.getAttribute('data-category');
        setSelectedCategory(cat);
      });
    });

    // Quick Amount Buttons
    document.querySelectorAll('.quick-amt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const amtAdd = Number(btn.getAttribute('data-amt')) || 0;
        const input = document.getElementById('txAmount');
        const currentVal = Number(input.value) || 0;
        input.value = currentVal + amtAdd;
      });
    });

    // Form Submit
    form.addEventListener('submit', handleFormSubmit);

    // 3. Confirm Delete Modal Handlers
    document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
    document.getElementById('executeConfirmBtn').addEventListener('click', executeDelete);
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeConfirmModal();
    });

    // 4. Table Row Actions (Delegation for Edit & Delete)
    document.getElementById('transactionTableBody').addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        openEditModal(id);
        return;
      }

      const deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        openConfirmDeleteModal(id);
        return;
      }
    });

    // 5. Search & Filters
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
      renderTable(getFilteredTransactions());
      if (window.lucide) lucide.createIcons();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      clearSearchBtn.style.display = 'none';
      renderTable(getFilteredTransactions());
      if (window.lucide) lucide.createIcons();
    });

    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      state.categoryFilter = e.target.value;
      renderTable(getFilteredTransactions());
      if (window.lucide) lucide.createIcons();
    });

    document.getElementById('typeFilter').addEventListener('change', (e) => {
      state.typeFilter = e.target.value;
      renderTable(getFilteredTransactions());
      if (window.lucide) lucide.createIcons();
    });

    // 6. CSV Export Button
    document.getElementById('exportCsvBtn').addEventListener('click', exportTransactionsToCsv);

    // 7. Reset / Sample Data Actions
    document.getElementById('loadSampleDataBtn').addEventListener('click', () => {
      const sample = getSampleData(state.selectedYear, state.selectedMonth);
      state.transactions = [...state.transactions, ...sample];
      saveTransactionsToStorage(state.transactions);
      renderAll();
      showToast('已成功匯入示範資料！', 'success');
    });

    document.getElementById('clearMonthDataBtn').addEventListener('click', () => {
      const targetPrefix = `${state.selectedYear}-${String(state.selectedMonth).padStart(2, '0')}`;
      const countBefore = state.transactions.length;
      state.transactions = state.transactions.filter(t => !t.date.startsWith(targetPrefix));
      
      if (countBefore === state.transactions.length) {
        showToast('本月份目前沒有記錄可清除', 'info');
        return;
      }

      saveTransactionsToStorage(state.transactions);
      renderAll();
      showToast(`已清空 ${state.selectedYear}年${state.selectedMonth}月 的所有記帳記錄`, 'info');
    });

    // Keyboard shortcut (Escape to close modals)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modal.classList.contains('active')) closeModal();
        if (confirmModal.classList.contains('active')) closeConfirmModal();
      }
    });
  }

  // =========================================================================
  // 14. Initialization
  // =========================================================================
  function init() {
    state.transactions = loadTransactionsFromStorage();
    setupEventListeners();
    renderAll();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
