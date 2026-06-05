/**
 * 副业记账 - 核心逻辑
 * 记账 + 独立分类 + 编辑 + 月历 + 统计 + 导入导出
 */

// ====== 常量 ======
const STORAGE_KEY = 'money_entries';
const QUICK_COINS = ['10','50','100','200','500','1000'];
const BASE_CATEGORIES = ['GPT','抢车','基金','闲置'];
const UNCATEGORIZED = '未分类';
const CATEGORIES = [...BASE_CATEGORIES, UNCATEGORIZED];
const MIN_DATE = '2020-01-01';
const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_COLORS = {
  all: '#00d2a0',
  GPT: '#10b981',
  '抢车': '#3b82f6',
  '基金': '#f59e0b',
  '闲置': '#8b5cf6',
  '未分类': '#94a3b8'
};
const LOSS_COLOR = '#e94560';

// ====== 工具 ======
function pad2(n) { return String(n).padStart(2,'0'); }
function dStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return dStr(new Date()); }
function parseLocalDate(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2])-1 || d.getDate() !== Number(m[3])) return null;
  d.setHours(0,0,0,0);
  return d;
}
function addDays(d, days) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  next.setHours(0,0,0,0);
  return next;
}
function daysInclusive(start, end) {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.floor((b - a) / DAY_MS) + 1);
}
function fmtMD(d) { return `${d.getMonth()+1}.${d.getDate()}`; }
function fmtYMD(d) { return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`; }
function fmtTime(ts) { const d=new Date(ts); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function fmtMoney(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-' : '') + '¥' + Math.abs(v).toFixed(2);
}
function fmtChartMoney(n) {
  const v = Math.abs(Number(n || 0));
  if (v >= 10000) return (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + '万';
  if (v >= 1000) return String(Math.round(v));
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/,'');
}
function fmtChartAmount(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-' : '') + '¥' + fmtChartMoney(v);
}
function toneClass(v) {
  if (v < 0) return 'negative';
  if (v === 0) return 'neutral';
  return '';
}
function setMoneyText(id, value) {
  const el = $(id);
  el.textContent = fmtMoney(value);
  el.classList.toggle('negative', value < 0);
  el.classList.toggle('neutral', value === 0);
}
function monthStartFromDateStr(s) {
  const d = parseLocalDate(s) || parseLocalDate(todayStr());
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function monthLabel(d) { return `${d.getFullYear()}年${d.getMonth()+1}月`; }
function validCategory(c) { return CATEGORIES.includes(c) ? c : ''; }
function inferCategory(note) {
  const text = String(note || '');
  return BASE_CATEGORIES.find(c => text.includes(c)) || UNCATEGORIZED;
}
function amountFromInput(raw, sign = 1) {
  const text = String(raw || '').trim();
  const typedAmount = Number(text);
  const hasTypedSign = /^[+-]/.test(text);
  return hasTypedSign ? typedAmount : typedAmount * sign;
}
function timestampForDate(dateStr, oldTs) {
  const d = parseLocalDate(dateStr);
  if (!d) return Date.now();
  const old = Number.isFinite(Number(oldTs)) ? new Date(Number(oldTs)) : new Date();
  d.setHours(old.getHours(), old.getMinutes(), old.getSeconds(), old.getMilliseconds());
  return d.getTime();
}

// ====== 状态 ======
const $ = id => document.getElementById(id);
let filterDate = todayStr();
let calendarMonth = monthStartFromDateStr(filterDate);
let entries = [];
let statMode = 'week';
let statCategory = 'all';
let statAnchorDate = todayStr();
let amountSign = 1;
let selectedCategory = BASE_CATEGORIES[0];
let editEntryId = null;
let editCategory = BASE_CATEGORIES[0];
let swipedEntry = null;

// ====== 数据读写 ======
function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const amount = Number(e.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;

  let date = parseLocalDate(e.date) ? e.date : '';
  const timestamp = Number(e.timestamp);
  if (!date && Number.isFinite(timestamp)) date = dStr(new Date(timestamp));
  if (!parseLocalDate(date)) return null;

  const note = String(e.note || '');
  const category = validCategory(e.category) || inferCategory(note);

  return {
    id: e.id || genId(),
    amount: Math.round(amount * 100) / 100,
    category,
    note,
    date,
    timestamp: Number.isFinite(timestamp) ? timestamp : timestampForDate(date)
  };
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    entries = Array.isArray(raw) ? raw.map(normalizeEntry).filter(Boolean) : [];
  } catch{entries=[];}
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function commitEntries(nextEntries) {
  entries = nextEntries.map(normalizeEntry).filter(Boolean);
  save();
  renderAll();
}

// ====== 分类选择 ======
function renderCategoryPicker(containerId, selected, onPick) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = CATEGORIES.map(cat =>
    `<button type="button" class="entry-cat-btn ${cat===selected?'active':''}" data-cat="${esc(cat)}">${esc(cat)}</button>`
  ).join('');
  el.querySelectorAll('.entry-cat-btn').forEach(btn=>{
    btn.addEventListener('click',()=>onPick(btn.dataset.cat));
  });
}
function renderInputCategory() {
  renderCategoryPicker('entryCategory', selectedCategory, cat=>{
    selectedCategory = cat;
    renderInputCategory();
  });
}
function renderEditCategory() {
  renderCategoryPicker('editCategory', editCategory, cat=>{
    editCategory = cat;
    renderEditCategory();
  });
}

// ====== 记账页 ======
function renderTrack() {
  const day = entries.filter(e=>e.date===filterDate).sort((a,b)=>b.timestamp-a.timestamp);
  const today=todayStr(), yest=dStr(addDays(parseLocalDate(today), -1));
  const todayLabel = filterDate===today?'今日收益':filterDate===yest?'昨日收益':filterDate+' 收益';
  $('summaryLabel').textContent = todayLabel;
  setMoneyText('todayTotal', day.reduce((s,e)=>s+e.amount,0));
  $('todayCount').textContent = '共 '+day.length+' 笔';
  $('dateLabel').textContent = filterDate===today?'今天':filterDate===yest?'昨天':filterDate;
  $('dateLabel').style.cursor = 'pointer';
  $('dateLabel').onclick = () => { filterDate = today; syncCalendarToFilter(); renderTrack(); };

  const btn = $('nextDay');
  if (filterDate >= today) { btn.disabled = true; btn.style.opacity = '0.3'; }
  else { btn.disabled = false; btn.style.opacity = '1'; }

  syncCalendarToFilter();
  renderCalendar();

  if (!day.length) {
    $('entryList').innerHTML='<div class="empty">暂无记录，快去记一笔吧</div>';
    return;
  }

  $('entryList').innerHTML = day.map(e=>
    `<div class="entry" data-id="${e.id}">
      <div class="entry-delete-bg">删除</div>
      <div class="entry-inner">
        <div class="entry-body">
          <div class="entry-note"><span class="entry-cat">${esc(e.category)}</span>${esc(e.note||'无备注')}</div>
          <div class="entry-time">${fmtTime(e.timestamp)}</div>
        </div>
        <div class="entry-right">
          <span class="entry-amount ${toneClass(e.amount)}">${fmtMoney(e.amount)}</span>
        </div>
      </div>
    </div>`
  ).join('');

  let startX=0, startY=0;
  $('entryList').querySelectorAll('.entry').forEach(el=>{
    el.addEventListener('touchstart',e=>{ startX=e.touches[0].clientX; startY=e.touches[0].clientY; },{passive:true});
    el.addEventListener('touchmove',e=>{
      const dx=e.touches[0].clientX-startX, dy=e.touches[0].clientY-startY;
      if (Math.abs(dx)<Math.abs(dy)) return;
      e.preventDefault();
      const inner=el.querySelector('.entry-inner');
      if (dx<0) inner.style.transform='translateX('+Math.max(dx,-80)+'px)';
      else if (el.classList.contains('swiped')) inner.style.transform='translateX('+Math.min(dx-80,0)+'px)';
    },{passive:false});
    el.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-startX;
      const inner=el.querySelector('.entry-inner');
      if (dx<-30) { el.classList.add('swiped'); inner.style.transform='translateX(-80px)'; if (swipedEntry&&swipedEntry!==el) closeSwipe(swipedEntry); swipedEntry=el; }
      else if (dx>30) { el.classList.remove('swiped'); inner.style.transform='translateX(0)'; swipedEntry=null; }
      else { inner.style.transform = el.classList.contains('swiped')?'translateX(-80px)':'translateX(0)'; }
    });
    el.querySelector('.entry-delete-bg').addEventListener('click',e=>{ e.stopPropagation(); del(el.dataset.id); });
    el.querySelector('.entry-inner').addEventListener('click',e=>{
      e.stopPropagation();
      if (el.classList.contains('swiped')) { closeSwipe(el); return; }
      openEdit(el.dataset.id);
    });
  });
}

function closeSwipe(el) {
  el.classList.remove('swiped');
  const inner = el.querySelector('.entry-inner');
  if (inner) inner.style.transform='translateX(0)';
  swipedEntry=null;
}

function renderAmountSign() {
  const btn = $('signToggle');
  btn.classList.toggle('active', amountSign < 0);
  btn.setAttribute('aria-pressed', amountSign < 0 ? 'true' : 'false');
  btn.textContent = amountSign < 0 ? '−' : '±';
}
function toggleAmountSign() {
  amountSign *= -1;
  renderAmountSign();
  $('amountInput').focus();
}
function add() {
  const v = amountFromInput($('amountInput').value, amountSign);
  if (!Number.isFinite(v)||v===0) { toast('请输入非 0 金额'); return; }
  const note = $('noteInput').value.trim();
  entries.push({
    id:genId(),
    amount:Math.round(v*100)/100,
    category:selectedCategory,
    note,
    date:filterDate,
    timestamp:Date.now()
  });
  save();
  $('amountInput').value='';
  $('noteInput').value='';
  amountSign = 1;
  renderAmountSign();
  renderAll();
}
function del(id) {
  const el = $('entryList').querySelector('[data-id="'+id+'"]');
  if (el) {
    el.classList.add('removing');
    setTimeout(()=>{
      entries=entries.filter(e=>e.id!==id);
      save();
      renderAll();
      toast('已删除');
    },300);
  } else {
    entries=entries.filter(e=>e.id!==id);
    save();
    renderAll();
  }
}
function changeDate(d) {
  const dd = parseLocalDate(filterDate);
  if (!dd) { toast('日期错误'); return; }
  const next = addDays(dd, d);
  const today = todayStr();
  const newDate = dStr(next);
  if (newDate > today) { toast('不能超过今天'); return; }
  if (newDate < MIN_DATE) { toast('日期太早了'); return; }
  filterDate = newDate;
  syncCalendarToFilter();
  renderTrack();
}

// ====== 月历 ======
function syncCalendarToFilter() {
  const fd = parseLocalDate(filterDate);
  if (!fd || !sameMonth(fd, calendarMonth)) calendarMonth = monthStartFromDateStr(filterDate);
}
function renderCalendar() {
  const grid = $('calendarGrid');
  if (!grid) return;
  const today = todayStr();
  const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const days = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  $('calendarLabel').textContent = monthLabel(calendarMonth);
  $('nextCalendarMonth').disabled = calendarMonth >= monthStartFromDateStr(today);

  const totals = {};
  entries.forEach(e=>{
    if (e.date.slice(0,7) === dStr(calendarMonth).slice(0,7)) totals[e.date] = (totals[e.date] || 0) + e.amount;
  });

  const cells = ['一','二','三','四','五','六','日'].map(w=>`<div class="calendar-weekday">${w}</div>`);
  for (let i=0;i<offset;i++) cells.push('<button class="calendar-day empty" tabindex="-1"></button>');
  for (let day=1;day<=days;day++) {
    const date = `${calendarMonth.getFullYear()}-${pad2(calendarMonth.getMonth()+1)}-${pad2(day)}`;
    const total = totals[date] || 0;
    const disabled = date > today ? 'disabled' : '';
    const cls = [
      'calendar-day',
      date===today ? 'today' : '',
      date===filterDate ? 'active' : ''
    ].filter(Boolean).join(' ');
    cells.push(
      `<button class="${cls}" data-date="${date}" ${disabled}>
        <span class="calendar-day-num">${day}</span>
        <span class="calendar-day-amount ${toneClass(total)}">${total ? fmtChartAmount(total) : ''}</span>
      </button>`
    );
  }
  grid.innerHTML = cells.join('');
  grid.querySelectorAll('.calendar-day[data-date]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      filterDate = btn.dataset.date;
      renderTrack();
    });
  });
}
function changeCalendarMonth(step) {
  const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+step, 1);
  const todayMonth = monthStartFromDateStr(todayStr());
  if (next > todayMonth) { toast('不能超过本月'); return; }
  if (dStr(new Date(next.getFullYear(), next.getMonth()+1, 0)) < MIN_DATE) { toast('日期太早了'); return; }
  calendarMonth = next;
  renderCalendar();
}

// ====== 快捷备注模板 ======
function renderTemplates() {
  const tpl = $('noteTemplates');
  if (!tpl) return;
  const allNotes = [...new Set(entries.map(e=>e.note).filter(Boolean))];
  tpl.innerHTML = allNotes.slice(0,8).map(n=>
    `<button class="note-tpl" data-note="${esc(n)}">${esc(n)}</button>`
  ).join('');
  tpl.querySelectorAll('.note-tpl').forEach(b=>{
    b.addEventListener('click',()=>{ $('noteInput').value=b.dataset.note; });
  });
}

// ====== 编辑记录 ======
function openEdit(id) {
  const entry = entries.find(e=>e.id===id);
  if (!entry) return;
  editEntryId = id;
  editCategory = entry.category;
  $('editDate').value = entry.date;
  $('editDate').min = MIN_DATE;
  $('editDate').max = todayStr();
  $('editAmount').value = String(entry.amount);
  $('editNote').value = entry.note || '';
  renderEditCategory();
  $('editModal').classList.remove('hidden');
}
function closeEdit() {
  editEntryId = null;
  $('editModal').classList.add('hidden');
}
function saveEdit() {
  const entry = entries.find(e=>e.id===editEntryId);
  if (!entry) return;
  const amount = Number($('editAmount').value.trim());
  if (!Number.isFinite(amount) || amount===0) { toast('请输入非 0 金额'); return; }
  const date = $('editDate').value;
  if (!parseLocalDate(date)) { toast('日期错误'); return; }
  if (date > todayStr()) { toast('不能超过今天'); return; }
  if (date < MIN_DATE) { toast('日期太早了'); return; }

  entry.amount = Math.round(amount*100)/100;
  entry.category = validCategory(editCategory) || UNCATEGORIZED;
  entry.note = $('editNote').value.trim();
  entry.date = date;
  entry.timestamp = timestampForDate(date, entry.timestamp);
  save();
  filterDate = date;
  calendarMonth = monthStartFromDateStr(date);
  closeEdit();
  renderAll();
  toast('已保存');
}
function deleteEdit() {
  if (!editEntryId) return;
  if (!confirm('删除这笔记录？')) return;
  entries = entries.filter(e=>e.id!==editEntryId);
  save();
  closeEdit();
  renderAll();
  toast('已删除');
}

// ====== 统计范围 ======
function startOfWeek(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}
function isSamePeriod(a, b, mode) {
  if (mode === 'week') return dStr(startOfWeek(a)) === dStr(startOfWeek(b));
  if (mode === 'month') return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  return a.getFullYear() === b.getFullYear();
}
function shiftDateByMode(d, mode, step) {
  if (mode === 'week') return addDays(d, step * 7);
  if (mode === 'month') return new Date(d.getFullYear(), d.getMonth() + step, 1);
  return new Date(d.getFullYear() + step, 0, 1);
}
function periodEndFor(d, mode) {
  if (mode === 'week') return addDays(startOfWeek(d), 6);
  if (mode === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return new Date(d.getFullYear(), 11, 31);
}
function periodLabel(range) {
  const y = range.start.getFullYear();
  if (range.isCurrent) return statMode === 'week' ? '本周' : statMode === 'month' ? '本月' : '今年';
  if (statMode === 'week') {
    const start = fmtYMD(range.start);
    const end = range.naturalEnd.getFullYear() === y ? fmtMD(range.naturalEnd) : fmtYMD(range.naturalEnd);
    return `${start}-${end}`;
  }
  if (statMode === 'month') return `${y}年${range.start.getMonth()+1}月`;
  return `${y}年`;
}
function getStatsRange() {
  const today = parseLocalDate(todayStr());
  let anchor = parseLocalDate(statAnchorDate) || today;
  if (anchor > today) anchor = today;
  statAnchorDate = dStr(anchor);

  let start, naturalEnd, buckets, keyFn;
  if (statMode === 'week') {
    start = startOfWeek(anchor);
    naturalEnd = addDays(start, 6);
    buckets = Array.from({length: 7}, (_, i) => {
      const d = addDays(start, i);
      return { key: dStr(d), label: ['一','二','三','四','五','六','日'][i] };
    });
    keyFn = e => e.date;
  } else if (statMode === 'month') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    naturalEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    buckets = Array.from({length: naturalEnd.getDate()}, (_, i) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), i + 1);
      return { key: dStr(d), label: String(i + 1) };
    });
    keyFn = e => e.date;
  } else {
    start = new Date(anchor.getFullYear(), 0, 1);
    naturalEnd = new Date(anchor.getFullYear(), 11, 31);
    buckets = Array.from({length: 12}, (_, i) => ({
      key: pad2(i + 1),
      label: `${i + 1}月`
    }));
    keyFn = e => e.date.slice(5,7);
  }

  start.setHours(0,0,0,0);
  naturalEnd.setHours(0,0,0,0);
  const end = naturalEnd > today ? today : naturalEnd;
  const isCurrent = isSamePeriod(anchor, today, statMode);
  const nextStart = shiftDateByMode(start, statMode, 1);
  const prevEnd = periodEndFor(shiftDateByMode(start, statMode, -1), statMode);

  return {
    start,
    end,
    naturalEnd,
    buckets,
    keyFn,
    isCurrent,
    label: periodLabel({ start, naturalEnd, isCurrent }),
    canPrev: dStr(prevEnd) >= MIN_DATE,
    canNext: nextStart <= today
  };
}
function matchesCategory(e) {
  if (statCategory === 'all') return true;
  return e.category === statCategory;
}

// ====== 统计渲染 ======
function getStatsData() {
  const range = getStatsRange();
  const startStr = dStr(range.start);
  const endStr = dStr(range.end);
  const inRange = entries.filter(e=>e.date>=startStr && e.date<=endStr);
  const filtered = inRange.filter(matchesCategory);
  const data = range.buckets.map(b=>
    filtered.filter(e=>range.keyFn(e)===b.key).reduce((s,e)=>s+e.amount,0)
  );
  return { range, inRange, filtered, data };
}
function renderStats() {
  const { range, inRange, filtered, data } = getStatsData();
  const total = data.reduce((a,b)=>a+b,0);
  const ct = filtered.length;
  const avg = total / daysInclusive(range.start, range.end);
  const nonZeroData = data.filter(v=>v!==0);
  const max = nonZeroData.length ? Math.max(...nonZeroData) : 0;
  const min = nonZeroData.length ? Math.min(...nonZeroData) : 0;
  const catName = statCategory==='all'?'全部':statCategory;

  $('periodLabel').textContent = range.label;
  $('prevPeriod').disabled = !range.canPrev;
  $('nextPeriod').disabled = !range.canNext;
  $('statsTitle').textContent = `${catName}收益 · ${range.label}`;
  setMoneyText('statsTotal', total);
  setMoneyText('statsAvg', avg);
  setMoneyText('statsMax', max);
  $('statsCount').textContent = `共 ${ct} 笔`;

  renderChart(range, data, max, min, catName);
  renderCategoryShare(inRange);
}
function renderChart(range, data, max, min, catName) {
  const ctx = $('chart');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const c = ctx.getContext('2d');
  const w = Math.max(280, ctx.parentElement.clientWidth - 36);
  const h = 260;
  const px = 32, pyTop = 46, pyBottom = 50;
  const gw = w - px - 12;
  const gh = h - pyTop - pyBottom;

  ctx.width = w * dpr; ctx.height = h * dpr;
  ctx.style.width = w + 'px'; ctx.style.height = h + 'px';
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  c.fillStyle = '#0f0f1a22'; c.fillRect(px, pyTop, gw, gh);
  c.strokeStyle = '#1a1a3a'; c.lineWidth = 0.5;
  c.fillStyle = '#555'; c.font = '11px -apple-system, "PingFang SC", sans-serif'; c.textAlign = 'right';

  const domainMax = Math.max(max, 0);
  const domainMin = Math.min(min, 0);
  const domainSpan = domainMax - domainMin || 1;
  const valueToY = v => pyTop + (domainMax - v) / domainSpan * gh;
  const zeroY = valueToY(0);
  for (let i = 0; i <= 4; i++) {
    const y = pyTop + gh * i / 4;
    const val = domainMax - domainSpan * i / 4;
    c.beginPath(); c.moveTo(px, y); c.lineTo(px + gw, y); c.stroke();
    c.fillText(fmtChartAmount(val), px - 6, y + 4);
  }
  c.strokeStyle = '#3a3a5a'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(px, zeroY); c.lineTo(px + gw, zeroY); c.stroke();

  const barW = Math.max(4, Math.min(26, gw / range.buckets.length * 0.52));
  const gap = gw / range.buckets.length;
  const col = CATEGORY_COLORS[statCategory] || CATEGORY_COLORS.all;

  data.forEach((v, i) => {
    const x = px + i * gap + (gap - barW) / 2;
    const centerX = px + i * gap + gap / 2;

    if (v !== 0) {
      const y = valueToY(v);
      const top = Math.min(y, zeroY);
      const bottom = Math.max(y, zeroY);
      const drawBottom = bottom - top < 2 ? top + 2 : bottom;
      const radius = Math.min(4, barW / 2, Math.max(1, (drawBottom - top) / 2));
      const barColor = v < 0 ? LOSS_COLOR : col;
      const grad = c.createLinearGradient(x, top, x, bottom);
      grad.addColorStop(0, v < 0 ? barColor + '33' : barColor);
      grad.addColorStop(1, v < 0 ? barColor : barColor + '33');
      c.fillStyle = grad;
      c.shadowColor = barColor; c.shadowBlur = 8;
      c.beginPath();
      if (v > 0) {
        c.moveTo(x + radius, top);
        c.lineTo(x + barW - radius, top);
        c.arcTo(x + barW, top, x + barW, top + radius, radius);
        c.lineTo(x + barW, drawBottom);
        c.lineTo(x, drawBottom);
        c.lineTo(x, top + radius);
        c.arcTo(x, top, x + radius, top, radius);
      } else {
        c.moveTo(x, top);
        c.lineTo(x + barW, top);
        c.lineTo(x + barW, drawBottom - radius);
        c.arcTo(x + barW, drawBottom, x + barW - radius, drawBottom, radius);
        c.lineTo(x + radius, drawBottom);
        c.arcTo(x, drawBottom, x, drawBottom - radius, radius);
        c.lineTo(x, top);
      }
      c.closePath();
      c.fill();
      c.shadowColor = 'transparent'; c.shadowBlur = 0;

      if (range.buckets.length <= 12 || v === max || v === min) {
        c.fillStyle = '#fff'; c.font = 'bold 11px -apple-system, "PingFang SC", sans-serif'; c.textAlign = 'center';
        const labelY = v > 0
          ? (top - 6 < pyTop + 10 ? top + 16 : top - 6)
          : (bottom + 14 > pyTop + gh ? bottom - 8 : bottom + 14);
        c.fillText(fmtChartAmount(v), centerX, labelY);
      }
    }

    const shouldShowLabel = statMode !== 'month' || i === 0 || i === range.buckets.length - 1 || (i + 1) % 5 === 0;
    if (shouldShowLabel) {
      c.fillStyle = '#777'; c.font = '11px -apple-system, "PingFang SC", sans-serif'; c.textAlign = 'center';
      c.fillText(range.buckets[i].label, centerX, pyTop + gh + 18);
    }
  });

  c.fillStyle = '#888'; c.font = 'bold 13px -apple-system, "PingFang SC", sans-serif'; c.textAlign = 'center';
  c.fillText(`${catName} · ${range.label}`, px + gw / 2, 16);
}
function renderCategoryShare(inRange) {
  const list = $('categoryShareList');
  if (!list) return;
  const rows = CATEGORIES.map(cat => {
    const items = inRange.filter(e=>e.category===cat);
    const total = items.reduce((s,e)=>s+e.amount,0);
    const weight = items.reduce((s,e)=>s+Math.abs(e.amount),0);
    return { cat, total, weight, count: items.length };
  }).filter(row=>row.count>0);
  const allWeight = rows.reduce((s,row)=>s+row.weight,0);
  if (!rows.length || allWeight === 0) {
    list.innerHTML = '<div class="share-empty">暂无数据</div>';
    return;
  }
  list.innerHTML = rows.map(row=>{
    const pct = row.weight / allWeight * 100;
    const color = CATEGORY_COLORS[row.cat] || CATEGORY_COLORS[UNCATEGORIZED];
    return `<div class="share-row">
      <div class="share-name">${esc(row.cat)}</div>
      <div class="share-track"><div class="share-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
      <div class="share-value">${pct.toFixed(0)}% · ${fmtMoney(row.total)}</div>
    </div>`;
  }).join('');
}
function changeStatPeriod(step) {
  const anchor = parseLocalDate(statAnchorDate) || parseLocalDate(todayStr());
  const next = shiftDateByMode(anchor, statMode, step);
  const today = parseLocalDate(todayStr());
  const nextEnd = periodEndFor(next, statMode);
  if (next > today) { toast('不能超过今天'); return; }
  if (dStr(nextEnd) < MIN_DATE) { toast('日期太早了'); return; }
  statAnchorDate = dStr(next);
  renderStats();
}

// ====== 导入导出 ======
function exportData() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    entries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `money-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('已导出');
}
function parseImportPayload(text) {
  const raw = JSON.parse(text);
  const list = Array.isArray(raw) ? raw : raw.entries;
  if (!Array.isArray(list)) return [];
  return list.map(normalizeEntry).filter(Boolean);
}
function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parseImportPayload(String(reader.result || ''));
      if (!imported.length) { toast('没有可导入的数据'); return; }
      if (!confirm(`导入 ${imported.length} 笔记录？`)) return;
      const map = new Map(entries.map(e=>[e.id,e]));
      imported.forEach(e=>map.set(e.id,e));
      commitEntries([...map.values()]);
      toast('导入完成');
    } catch {
      toast('导入失败');
    }
  };
  reader.readAsText(file);
}

// ====== Toast ======
let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  $('toast').textContent=msg;
  $('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1500);
}

// ====== 总渲染 ======
function renderAll() {
  renderInputCategory();
  renderTrack();
  renderStats();
  renderTemplates();
}

// ====== 页面切换 ======
document.querySelectorAll('.nav-btn').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $(b.dataset.page).classList.add('active');
  if(b.dataset.page==='page-stats') renderStats();
});});

// ====== 统计 Tab ======
document.querySelectorAll('.stat-tab').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.stat-tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  statMode=b.dataset.mode;
  renderStats();
});});
document.querySelectorAll('.cat-btn').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.cat-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  statCategory=b.dataset.cat;
  renderStats();
});});

// ====== 事件 ======
$('addBtn').addEventListener('click',add);
$('signToggle').addEventListener('click',toggleAmountSign);
$('amountInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();add();} });
$('prevDay').addEventListener('click',e=>{ e.stopPropagation(); changeDate(-1); });
$('nextDay').addEventListener('click',e=>{ e.stopPropagation(); changeDate(1); });
$('prevCalendarMonth').addEventListener('click',e=>{ e.stopPropagation(); changeCalendarMonth(-1); });
$('nextCalendarMonth').addEventListener('click',e=>{ e.stopPropagation(); changeCalendarMonth(1); });
$('prevPeriod').addEventListener('click',e=>{ e.stopPropagation(); changeStatPeriod(-1); });
$('nextPeriod').addEventListener('click',e=>{ e.stopPropagation(); changeStatPeriod(1); });
$('editClose').addEventListener('click',closeEdit);
$('editCancel').addEventListener('click',closeEdit);
$('editSave').addEventListener('click',saveEdit);
$('editDelete').addEventListener('click',deleteEdit);
$('editModal').addEventListener('click',e=>{ if(e.target===$('editModal')) closeEdit(); });
$('exportBtn').addEventListener('click',exportData);
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',e=>{
  importData(e.target.files && e.target.files[0]);
  e.target.value = '';
});
document.addEventListener('click',e=>{ if (swipedEntry&&!swipedEntry.contains(e.target)) closeSwipe(swipedEntry); });
QUICK_COINS.forEach(a=>{
  const b=document.createElement('button');
  b.className='chip';
  b.textContent='¥'+a;
  b.dataset.amount=a;
  b.addEventListener('click',()=>{ $('amountInput').value=a; });
  $('chips').appendChild(b);
});

// ====== 启动 ======
load();
renderAmountSign();
renderAll();
