/**
 * 副业记账 - 核心逻辑
 * 记账 + 统计图表
 */

// ====== 工具 ======
const STORAGE_KEY = 'money_entries';
function dStr(d) { return d.toISOString().slice(0,10); }
function fmtTime(ts) { const d=new Date(ts); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

// ====== 状态 ======
let filterDate = dStr(new Date());
let entries = [];
let statMode = 'week';

// ====== DOM ======
const $ = id => document.getElementById(id);
const amountInput = $('amountInput');
const noteInput = $('noteInput');
const entryList = $('entryList');
const dateLabel = $('dateLabel');

// ====== 数据 ======
function load() { try { entries=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); } catch{entries=[];} }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }

// ====== 渲染记账页 ======
function renderTrack() {
  const day = entries.filter(e=>e.date===filterDate).sort((a,b)=>b.timestamp-a.timestamp);
  $('todayTotal').textContent = '¥'+day.reduce((s,e)=>s+e.amount,0).toFixed(2);
  $('todayCount').textContent = '共 '+day.length+' 笔';
  // 日期标签
  const today=dStr(new Date()), yest=dStr(new Date(Date.now()-86400000));
  dateLabel.textContent = filterDate===today?'今天':filterDate===yest?'昨天':filterDate;
  // 列表
  if (!day.length) { entryList.innerHTML='<div class="empty">暂无记录 ✍️</div>'; return; }
  entryList.innerHTML = day.map(e=>
    `<div class="entry" data-id="${e.id}">
      <div class="entry-body">
        <div class="entry-note">${esc(e.note||'无备注')}</div>
        <div class="entry-time">${fmtTime(e.timestamp)}</div>
      </div>
      <div class="entry-right">
        <span class="entry-amount">¥${e.amount.toFixed(2)}</span>
        <button class="entry-del" data-id="${e.id}">×</button>
      </div>
    </div>`
  ).join('');
  entryList.querySelectorAll('.entry-del').forEach(b=>b.addEventListener('click',()=>del(b.dataset.id)));
}

function add() {
  const v = parseFloat(amountInput.value);
  if (isNaN(v)||v<=0) { toast('请输入有效金额'); amountInput.focus(); return; }
  entries.push({ id:genId(), amount:Math.round(v*100)/100, note:noteInput.value.trim(), date:filterDate, timestamp:Date.now() });
  save(); amountInput.value=''; noteInput.value=''; renderTrack(); renderStats(); toast('已记录 ¥'+v.toFixed(2));
}

function del(id) {
  const el = entryList.querySelector('[data-id="'+id+'"]');
  if (el) { el.style.transform='translateX(110%)'; el.style.opacity='0'; el.style.transition='all .25s'; }
  setTimeout(()=>{ entries=entries.filter(e=>e.id!==id); save(); renderTrack(); renderStats(); toast('已删除'); },250);
}

function changeDate(d) { const dd=new Date(filterDate+'T00:00:00'); dd.setDate(dd.getDate()+d); filterDate=dStr(dd); renderTrack(); }

// ====== 图表 ======
let chart = null;
function renderStats() {
  const now = new Date();
  let start, labels=[], keyFn;
  if (statMode==='week') {
    start = new Date(now); start.setDate(now.getDate()-6);
    for (let i=0;i<7;i++) { const d=new Date(start); d.setDate(start.getDate()+i); labels.push(dStr(d)); }
    keyFn = e=>e.date;
  } else if (statMode==='month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    for (let i=1;i<=days;i++) labels.push(String(i).padStart(2,'0'));
    keyFn = e=>e.date.slice(8);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    for (let i=1;i<=12;i++) labels.push(i+'月');
    keyFn = e=>e.date.slice(5,7);
  }
  const range = entries.filter(e=>e.date>=dStr(start)&&e.date<=dStr(now));
  const data = labels.map(l=>range.filter(e=>keyFn(e)===l).reduce((s,e)=>s+e.amount,0));
  const total = data.reduce((a,b)=>a+b,0);
  const avg = labels.length>0?total/labels.length:0;
  const max = Math.max(...data,0);
  $('statsTotal').textContent = '¥'+total.toFixed(2);
  $('statsAvg').textContent = '¥'+avg.toFixed(2);
  $('statsMax').textContent = '¥'+max.toFixed(2);
  // 画图
  const ctx = $('chart');
  if (!ctx) return;
  const c = ctx.getContext('2d');
  const w = ctx.parentElement.clientWidth - 36, h = 180, px = 18, py = 20, gw = w-36, gh = h-40;
  ctx.width = w; ctx.height = h;
  c.clearRect(0,0,w,h);
  // 网格线
  c.strokeStyle='#1a1a3a'; c.lineWidth=1;
  for (let i=0;i<=4;i++) { const y=py+gh*i/4; c.beginPath(); c.moveTo(px,y); c.lineTo(px+gw,y); c.stroke(); }
  // 柱状图
  const barW = Math.max(4, gw/labels.length*0.6), gap = gw/labels.length;
  const maxVal = max||1;
  data.forEach((v,i)=>{
    const bh = v/maxVal*gh;
    const x = px + i*gap + (gap-barW)/2;
    const y = py + gh - bh;
    // 渐变
    const grad = c.createLinearGradient(x,y,x,py+gh);
    grad.addColorStop(0,'#00d2a0'); grad.addColorStop(1,'#00d2a044');
    c.fillStyle = grad;
    c.beginPath(); c.roundRect(x,y,barW,bh,[3]); c.fill();
    // 标签
    if (labels.length<=31) {
      c.fillStyle='#666'; c.font='10px system-ui'; c.textAlign='center';
      const lbl = statMode==='week' ? ['日','一','二','三','四','五','六'][new Date(labels[i]+'T00:00:00').getDay()] : labels[i];
      c.fillText(lbl, px+i*gap+gap/2, py+gh+14);
    }
  });
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
  b.classList.add('active');
  $(b.dataset.page).classList.add('active');
  if (b.dataset.page==='page-stats') renderStats();
});});

// ====== 统计 Tab ======
document.querySelectorAll('.stat-tab').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.stat-tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  statMode = b.dataset.mode;
  renderStats();
});});

// ====== 事件 ======
$('addBtn').addEventListener('click',add);
amountInput.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();add();} });
$('prevDay').addEventListener('click',()=>changeDate(-1));
$('nextDay').addEventListener('click',()=>changeDate(1));
['10','50','100','200','500','1000'].forEach(a=>{
  const b=document.createElement('button'); b.className='chip'; b.textContent='¥'+a; b.dataset.amount=a;
  b.addEventListener('click',()=>{ amountInput.value=a; amountInput.focus(); });
  $('chips').appendChild(b);
});

// ====== 启动 ======
load(); renderTrack(); renderStats();
