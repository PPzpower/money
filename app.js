/**
 * 副业记账 - 核心逻辑
 * 记账 + 左滑删除 + 快捷备注模板 + 分类统计图表（GPT/抢车/基金/闲置 + 全部）
 */

// ====== 常量 ======
const STORAGE_KEY = 'money_entries';
const QUICK_COINS = ['10','50','100','200','500','1000'];
const CATEGORIES = ['GPT','抢车','基金','闲置'];
const MIN_DATE = '2020-01-01';
const DAY_MS = 24 * 60 * 60 * 1000;

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
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + '万';
  if (Math.abs(v) >= 1000) return String(Math.round(v));
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

// ====== 状态 ======
const $ = id => document.getElementById(id);
let filterDate = dStr(new Date());
let entries = [];
let statMode = 'week';
let statCategory = 'all'; // 'all' | 'GPT' | '抢车' | '基金' | '闲置'
let statAnchorDate = todayStr();
let amountSign = 1;
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

  return {
    ...e,
    id: e.id || genId(),
    amount: Math.round(amount * 100) / 100,
    note: String(e.note || ''),
    date,
    timestamp: Number.isFinite(timestamp) ? timestamp : parseLocalDate(date).getTime()
  };
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    entries = Array.isArray(raw) ? raw.map(normalizeEntry).filter(Boolean) : [];
  } catch{entries=[];}
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }

// ====== 渲染记账页 ======
function renderTrack() {
  const day = entries.filter(e=>e.date===filterDate).sort((a,b)=>b.timestamp-a.timestamp);
  const today=todayStr(), yest=dStr(addDays(parseLocalDate(today), -1));
  // 顶部汇总卡片标题跟随实际日期
  const todayLabel = filterDate===today?'今日收益':filterDate===yest?'昨日收益':filterDate+' 收益';
  $('summaryLabel').textContent = todayLabel;
  setMoneyText('todayTotal', day.reduce((s,e)=>s+e.amount,0));
  $('todayCount').textContent = '共 '+day.length+' 笔';
  $('dateLabel').textContent = filterDate===today?'今天':filterDate===yest?'昨天':filterDate;
  // 点击日期标签回到今天
  $('dateLabel').style.cursor = 'pointer';
  $('dateLabel').onclick = () => { filterDate = today; renderTrack(); };
  // 控制右箭头：今天或未来不能前进
  const btn = $('nextDay');
  if (filterDate >= today) { btn.disabled = true; btn.style.opacity = '0.3'; }
  else { btn.disabled = false; btn.style.opacity = '1'; }

  if (!day.length) { $('entryList').innerHTML='<div class="empty">暂无记录，快去记一笔吧 ✍️</div>'; return; }

  $('entryList').innerHTML = day.map(e=>
    `<div class="entry" data-id="${e.id}">
      <div class="entry-delete-bg">删除</div>
      <div class="entry-inner">
        <div class="entry-body">
          <div class="entry-note">${esc(e.note||'无备注')}</div>
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
    el.querySelector('.entry-delete-bg').addEventListener('click',()=>del(el.dataset.id));
  });
}

function closeSwipe(el) { el.classList.remove('swiped'); el.querySelector('.entry-inner').style.transform='translateX(0)'; swipedEntry=null; }

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
  const rawAmount = $('amountInput').value.trim();
  const typedAmount = Number(rawAmount);
  const hasTypedSign = /^[+-]/.test(rawAmount);
  const v = hasTypedSign ? typedAmount : typedAmount * amountSign;
  if (!Number.isFinite(v)||v===0) { toast('请输入非 0 金额'); return; }
  const note = $('noteInput').value.trim();
  entries.push({ id:genId(), amount:Math.round(v*100)/100, note, date:filterDate, timestamp:Date.now() });
  save();
  $('amountInput').value=''; $('noteInput').value='';
  amountSign = 1; renderAmountSign();
  renderTrack(); renderStats(); renderTemplates();
  // 记账后不再自动聚焦金额输入框
}

function del(id) {
  const el = $('entryList').querySelector('[data-id="'+id+'"]');
  if (el) { el.classList.add('removing'); setTimeout(()=>{ entries=entries.filter(e=>e.id!==id); save(); renderTrack(); renderStats(); toast('已删除'); },300); }
  else { entries=entries.filter(e=>e.id!==id); save(); renderTrack(); renderStats(); }
}

function changeDate(d) {
  const dd = parseLocalDate(filterDate);
  if (!dd) { toast('日期错误'); return; }
  const next = addDays(dd, d);
  // 限制不能超过今天
  const today = todayStr();
  const newDate = dStr(next);
  if (newDate > today) { toast('不能超过今天'); return; }
  if (newDate < MIN_DATE) { toast('日期太早了'); return; }
  filterDate = newDate;
  renderTrack();
}

// ====== 快捷备注模板 ======
function renderTemplates() {
  const tpl = $('noteTemplates');
  if (!tpl) return;
  const allNotes = [...new Set([...CATEGORIES, ...entries.map(e=>e.note).filter(Boolean)])];
  tpl.innerHTML = allNotes.slice(0,8).map(n=>
    `<button class="note-tpl" data-note="${esc(n)}">${esc(n)}</button>`
  ).join('');
  tpl.querySelectorAll('.note-tpl').forEach(b=>{
    b.addEventListener('click',()=>{ $('noteInput').value=b.dataset.note; });
  });
}

// ====== 统计图表 ======
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
  return String(e.note || '').includes(statCategory);
}

function renderStats() {
  const range = getStatsRange();
  const startStr = dStr(range.start);
  const endStr = dStr(range.end);
  const inRange = entries.filter(e=>e.date>=startStr && e.date<=endStr);
  const filtered = inRange.filter(matchesCategory);
  const data = range.buckets.map(b=>
    filtered.filter(e=>range.keyFn(e)===b.key).reduce((s,e)=>s+e.amount,0)
  );
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

  // 画图
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

  // 背景
  c.fillStyle = '#0f0f1a22'; c.fillRect(px, pyTop, gw, gh);

  // Y轴刻度标签 + 网格线
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

  // 柱子
  const barW = Math.max(4, Math.min(26, gw / range.buckets.length * 0.52));
  const gap = gw / range.buckets.length;
  const categoryColors = {
    all: '#00d2a0', GPT: '#10b981', '抢车': '#3b82f6', '基金': '#f59e0b', '闲置': '#8b5cf6'
  };
  const col = categoryColors[statCategory] || '#00d2a0';
  const lossCol = '#e94560';

  data.forEach((v, i) => {
    const x = px + i * gap + (gap - barW) / 2;
    const centerX = px + i * gap + gap / 2;

    if (v !== 0) {
      const y = valueToY(v);
      const top = Math.min(y, zeroY);
      const bottom = Math.max(y, zeroY);
      const drawBottom = bottom - top < 2 ? top + 2 : bottom;
      const radius = Math.min(4, barW / 2, Math.max(1, (drawBottom - top) / 2));
      const barColor = v < 0 ? lossCol : col;

      // 渐变柱子
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

      // 金额标注在柱子顶部
      if (range.buckets.length <= 12 || v === max || v === min) {
        c.fillStyle = '#fff'; c.font = 'bold 11px -apple-system, "PingFang SC", sans-serif'; c.textAlign = 'center';
        const labelY = v > 0
          ? (top - 6 < pyTop + 10 ? top + 16 : top - 6)
          : (bottom + 14 > pyTop + gh ? bottom - 8 : bottom + 14);
        c.fillText(fmtChartAmount(v), centerX, labelY);
      }
    }

    // 底部标签
    const shouldShowLabel = statMode !== 'month' || i === 0 || i === range.buckets.length - 1 || (i + 1) % 5 === 0;
    if (shouldShowLabel) {
      c.fillStyle = '#777'; c.font = '11px -apple-system, "PingFang SC", sans-serif'; c.textAlign = 'center';
      c.fillText(range.buckets[i].label, centerX, pyTop + gh + 18);
    }
  });

  // 顶部标题
  c.fillStyle = '#888'; c.font = 'bold 13px -apple-system, "PingFang SC", sans-serif'; c.textAlign = 'center';
  c.fillText(`${catName} · ${range.label}`, px + gw / 2, 16);
}

// ====== Toast ======
let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  $('toast').textContent=msg; $('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1500);
}

// ====== 页面切换 ======
document.querySelectorAll('.nav-btn').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); $(b.dataset.page).classList.add('active');
  if(b.dataset.page==='page-stats') renderStats();
  // 切到记账页不自动聚焦
});});

// ====== 统计时间 Tab ======
document.querySelectorAll('.stat-tab').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.stat-tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); statMode=b.dataset.mode; renderStats();
});});

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

// ====== 分类筛选 Tab ======
document.querySelectorAll('.cat-btn').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.cat-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); statCategory=b.dataset.cat; renderStats();
});});

// ====== 事件 ======
$('addBtn').addEventListener('click',add);
$('signToggle').addEventListener('click',toggleAmountSign);
$('amountInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();add();} });
$('prevDay').addEventListener('click',(e)=>{ e.stopPropagation(); changeDate(-1); });
$('nextDay').addEventListener('click',(e)=>{ e.stopPropagation(); changeDate(1); });
$('prevPeriod').addEventListener('click',(e)=>{ e.stopPropagation(); changeStatPeriod(-1); });
$('nextPeriod').addEventListener('click',(e)=>{ e.stopPropagation(); changeStatPeriod(1); });
document.addEventListener('click',e=>{ if (swipedEntry&&!swipedEntry.contains(e.target)) closeSwipe(swipedEntry); });
QUICK_COINS.forEach(a=>{
  const b=document.createElement('button'); b.className='chip'; b.textContent='¥'+a; b.dataset.amount=a;
  b.addEventListener('click',()=>{ $('amountInput').value=a; });
  $('chips').appendChild(b);
});

// ====== 启动 ======
load(); renderAmountSign(); renderTrack(); renderStats(); renderTemplates();
// 不再自动聚焦金额输入框
