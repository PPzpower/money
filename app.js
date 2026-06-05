/**
 * 副业记账 - 核心逻辑
 * 数据全部存在 localStorage，离线可用
 */

// ====== 工具函数 ======
const STORAGE_KEY = 'money_entries';

function getDateStr(d) {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function formatTime(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ====== 状态 ======
let filterDate = getDateStr(new Date());
let entries = [];

// ====== DOM ======
const $ = id => document.getElementById(id);
const todayTotalEl = $('todayTotal');
const todayCountEl = $('todayCount');
const amountInput = $('amountInput');
const noteInput = $('noteInput');
const addBtn = $('addBtn');
const entryList = $('entryList');
const dateLabel = $('dateLabel');
const prevDayBtn = $('prevDay');
const nextDayBtn = $('nextDay');
const toastEl = $('toast');

// ====== 数据读写 ======
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    entries = raw ? JSON.parse(raw) : [];
  } catch { entries = []; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ====== 渲染 ======
function render() {
  renderSummary();
  renderList();
  renderDateLabel();
}

function renderSummary() {
  const dayList = entries.filter(e => e.date === filterDate);
  const total = dayList.reduce((s, e) => s + e.amount, 0);
  todayTotalEl.textContent = '¥' + total.toFixed(2);
  todayCountEl.textContent = '共 ' + dayList.length + ' 笔';
}

function renderList() {
  const dayList = entries.filter(e => e.date === filterDate).sort((a, b) => b.timestamp - a.timestamp);

  if (dayList.length === 0) {
    entryList.innerHTML = '<li class="empty">暂无记录，快去记一笔吧 ✍️</li>';
    return;
  }

  entryList.innerHTML = dayList.map(e =>
    `<li class="entry" data-id="${e.id}">
      <span class="entry-amount">¥${e.amount.toFixed(2)}</span>
      <div class="entry-body">
        <div class="entry-note">${esc(e.note || '无备注')}</div>
        <div class="entry-time">${formatTime(e.timestamp)}</div>
      </div>
      <button class="entry-del" data-id="${e.id}">×</button>
    </li>`
  ).join('');

  // 绑定删除
  entryList.querySelectorAll('.entry-del').forEach(btn => {
    btn.addEventListener('click', () => delEntry(btn.dataset.id));
  });
}

function renderDateLabel() {
  const today = getDateStr(new Date());
  const yesterday = getDateStr(new Date(Date.now() - 86400000));
  if (filterDate === today) dateLabel.textContent = '今天';
  else if (filterDate === yesterday) dateLabel.textContent = '昨天';
  else dateLabel.textContent = filterDate;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ====== 操作 ======
function addEntry() {
  const val = parseFloat(amountInput.value);
  if (isNaN(val) || val <= 0) {
    showToast('请输入有效金额');
    amountInput.focus();
    return;
  }
  const entry = {
    id: genId(),
    amount: Math.round(val * 100) / 100,
    note: noteInput.value.trim(),
    date: filterDate,
    timestamp: Date.now(),
  };
  entries.push(entry);
  save();
  amountInput.value = '';
  noteInput.value = '';
  amountInput.focus();
  render();
  showToast('已记录 ¥' + entry.amount.toFixed(2));
}

function delEntry(id) {
  // 播放退出动画
  const el = entryList.querySelector('[data-id="' + id + '"]');
  if (el) {
    el.classList.add('removing');
    setTimeout(() => {
      entries = entries.filter(e => e.id !== id);
      save();
      render();
      showToast('已删除');
    }, 250);
  } else {
    entries = entries.filter(e => e.id !== id);
    save();
    render();
  }
}

function changeDate(delta) {
  const d = new Date(filterDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  filterDate = getDateStr(d);
  render();
}

// ====== Toast ======
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// ====== 事件 ======
addBtn.addEventListener('click', addEntry);
amountInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addEntry(); }
});
document.querySelectorAll('.chip').forEach(c => {
  c.addEventListener('click', () => {
    amountInput.value = c.dataset.amount;
    amountInput.focus();
  });
});
prevDayBtn.addEventListener('click', () => changeDate(-1));
nextDayBtn.addEventListener('click', () => changeDate(1));

// 左右滑动切换日期
let touchX = 0;
entryList.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
entryList.addEventListener('touchend', e => {
  const diff = e.changedTouches[0].clientX - touchX;
  if (Math.abs(diff) > 70) changeDate(diff > 0 ? -1 : 1);
});

// ====== 启动 ======
load();
render();
amountInput.focus();
