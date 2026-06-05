/**
 * 副业记账 - 核心逻辑
 * 记账 + 左滑删除 + 快捷备注模板 + 分类统计图表（GPT/抢车/基金/闲置 + 全部）
 */

// ====== 常量 ======
const STORAGE_KEY = 'money_entries';
const QUICK_COINS = ['10','50','100','200','500','1000'];
const CATEGORIES = ['GPT','抢车','基金','闲置'];

// ====== 工具 ======
function dStr(d) { return d.toISOString().slice(0,10); }
function fmtTime(ts) { const d=new Date(ts); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

// ====== 状态 ======
const $ = id => document.getElementById(id);
let filterDate = dStr(new Date());
let entries = [];
let statMode = 'week';
let statCategory = 'all'; // 'all' | 'GPT' | '抢车' | '基金' | '闲置'
let swipedEntry = null;

// ====== 数据读写 ======
function load() { try { entries=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); } catch{entries=[];} }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }

// ====== 渲染记账页 ======
function renderTrack() {
  const day = entries.filter(e=>e.date===filterDate).sort((a,b)=>b.timestamp-a.timestamp);
  const today=dStr(new Date()), yest=dStr(new Date(Date.now()-86400000));
  // 顶部汇总卡片标题跟随实际日期
  const todayLabel = filterDate===today?'今日收入':filterDate===yest?'昨日收入':filterDate+' 收入';
  $('summaryLabel').textContent = todayLabel;
  $('todayTotal').textContent = '¥'+day.reduce((s,e)=>s+e.amount,0).toFixed(2);
  $('todayCount').textContent = '共 '+day.length+' 笔';
  $('dateLabel').textContent = filterDate===today?'今天':filterDate===yest?'昨天':filterDate;

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
          <span class="entry-amount">¥${e.amount.toFixed(2)}</span>
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
  document.addEventListener('click',e=>{ if (swipedEntry&&!swipedEntry.contains(e.target)) closeSwipe(swipedEntry); });
}

function closeSwipe(el) { el.classList.remove('swiped'); el.querySelector('.entry-inner').style.transform='translateX(0)'; swipedEntry=null; }

function add() {
  const v = parseFloat($('amountInput').value);
  if (isNaN(v)||v<=0) { toast('请输入有效金额'); $('amountInput').focus(); return; }
  const note = $('noteInput').value.trim();
  entries.push({ id:genId(), amount:Math.round(v*100)/100, note, date:filterDate, timestamp:Date.now() });
  save();
  $('amountInput').value=''; $('noteInput').value='';
  renderTrack(); renderStats(); renderTemplates();
  toast('已记录 ¥'+v.toFixed(2));
  $('amountInput').focus();
}

function del(id) {
  const el = $('entryList').querySelector('[data-id="'+id+'"]');
  if (el) { el.classList.add('removing'); setTimeout(()=>{ entries=entries.filter(e=>e.id!==id); save(); renderTrack(); renderStats(); toast('已删除'); },300); }
  else { entries=entries.filter(e=>e.id!==id); save(); renderTrack(); renderStats(); }
}

function changeDate(d) { const dd=new Date(filterDate+'T00:00:00'); dd.setDate(dd.getDate()+d); filterDate=dStr(dd); renderTrack(); }

// ====== 快捷备注模板 ======
function renderTemplates() {
  const tpl = $('noteTemplates');
  if (!tpl) return;
  const allNotes = [...new Set([...CATEGORIES, ...entries.map(e=>e.note).filter(Boolean)])];
  tpl.innerHTML = allNotes.slice(0,8).map(n=>
    `<button class="note-tpl" data-note="${esc(n)}">${esc(n)}</button>`
  ).join('');
  tpl.querySelectorAll('.note-tpl').forEach(b=>{
    b.addEventListener('click',()=>{ $('noteInput').value=b.dataset.note; $('amountInput').focus(); });
  });
}

// ====== 统计图表 ======
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

  // 分类过滤
  const inRange = entries.filter(e=>e.date>=dStr(start)&&e.date<=dStr(now));
  const filtered = statCategory==='all' ? inRange : inRange.filter(e=>e.note===statCategory);

  const data = labels.map(l=>filtered.filter(e=>keyFn(e)===l).reduce((s,e)=>s+e.amount,0));
  const total = data.reduce((a,b)=>a+b,0);
  const ct = filtered.length;
  const avg = labels.length>0?total/labels.length:0;
  const max = Math.max(...data,0);

  $('statsTitle').textContent = (statCategory==='all'?'全部':statCategory)+'收入';
  $('statsTotal').textContent = '¥'+total.toFixed(2);
  $('statsAvg').textContent = '¥'+avg.toFixed(2);
  $('statsMax').textContent = '¥'+max.toFixed(2);
  $('statsCount').textContent = '共 '+ct+' 笔';

  // 画图
  const ctx = $('chart');
  if (!ctx) return;
  const c = ctx.getContext('2d');
  const w = ctx.parentElement.clientWidth-36, h=210, px=18, py=20, gw=w-36, gh=h-40;
  ctx.width = w; ctx.height = h;
  c.clearRect(0,0,w,h);

  // 网格线
  c.strokeStyle='#1a1a3a'; c.lineWidth=1;
  for (let i=0;i<=4;i++) { const y=py+gh*i/4; c.beginPath(); c.moveTo(px,y); c.lineTo(px+gw,y); c.stroke(); }

  // 柱子
  const barW = Math.max(4, gw/labels.length*0.6), gap = gw/labels.length;
  const maxVal = max||1;
  data.forEach((v,i)=>{
    const bh = v/maxVal*gh;
    const x = px+i*gap+(gap-barW)/2, y = py+gh-bh;
    const grad=c.createLinearGradient(x,y,x,py+gh);
    if (statCategory==='all') { grad.addColorStop(0,'#00d2a0'); grad.addColorStop(1,'rgba(0,210,160,.15)'); }
    else if (statCategory==='GPT') { grad.addColorStop(0,'#10b981'); grad.addColorStop(1,'rgba(16,185,129,.15)'); }
    else if (statCategory==='抢车') { grad.addColorStop(0,'#3b82f6'); grad.addColorStop(1,'rgba(59,130,246,.15)'); }
    else if (statCategory==='基金') { grad.addColorStop(0,'#f59e0b'); grad.addColorStop(1,'rgba(245,158,11,.15)'); }
    else { grad.addColorStop(0,'#8b5cf6'); grad.addColorStop(1,'rgba(139,92,246,.15)'); }
    c.fillStyle=grad;
    c.beginPath(); c.roundRect(x,y,barW,bh,[3]); c.fill();
    // 金额标注
    if (v>0) { c.fillStyle='#ccc'; c.font='bold 9px system-ui'; c.textAlign='center'; c.fillText('¥'+v, px+i*gap+gap/2, y-4); }
    // 底部标签
    if (labels.length<=31) {
      c.fillStyle='#666'; c.font='10px system-ui'; c.textAlign='center';
      const lbl = statMode==='week'?['日','一','二','三','四','五','六'][new Date(labels[i]+'T00:00:00').getDay()]:labels[i];
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
  b.classList.add('active'); $(b.dataset.page).classList.add('active');
  if(b.dataset.page==='page-stats') renderStats();
  else $('amountInput').focus();
});});

// ====== 统计时间 Tab ======
document.querySelectorAll('.stat-tab').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.stat-tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); statMode=b.dataset.mode; renderStats();
});});

// ====== 分类筛选 Tab ======
document.querySelectorAll('.cat-btn').forEach(b=>{ b.addEventListener('click',()=>{
  document.querySelectorAll('.cat-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); statCategory=b.dataset.cat; renderStats();
});});

// ====== 事件 ======
$('addBtn').addEventListener('click',add);
$('amountInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();add();} });
$('prevDay').addEventListener('click',()=>changeDate(-1));
$('nextDay').addEventListener('click',()=>changeDate(1));
QUICK_COINS.forEach(a=>{
  const b=document.createElement('button'); b.className='chip'; b.textContent='¥'+a; b.dataset.amount=a;
  b.addEventListener('click',()=>{ $('amountInput').value=a; $('amountInput').focus(); });
  $('chips').appendChild(b);
});

// ====== 启动 ======
load(); renderTrack(); renderStats(); renderTemplates();
$('amountInput').focus();
