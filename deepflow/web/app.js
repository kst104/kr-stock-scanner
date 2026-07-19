/* deepflow SPA — 실시간/리플레이 오더플로우 뷰어 (의존성 없음, vanilla JS) */
'use strict';

const $ = (s) => document.querySelector(s);
const api = async (p) => (await fetch(p, { cache: 'no-store' })).json();
const won = (n) => {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '억';
  if (Math.abs(n) >= 1e4) return Math.round(n / 1e4) + '만';
  return Math.round(n).toLocaleString();
};
const comma = (n) => Math.round(Number(n) || 0).toLocaleString();
const fmtTime = (ms) => {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const state = {
  symbols: [],
  activeCode: null,
  names: {},
  date: null,
  today: null,
  live: true,
  cutoff: Infinity,
  tab: 'bubbles',
  ticks: [],
  quotes: [],
  events: [],
  deep: [],
  themes: [],
  profile: null,
  dirty: true,
};

/* ------------------------------------------------------------------ boot */
async function boot() {
  wireUI();
  const cfg = await api('/api/config');
  applyStatus(cfg.capture);
  const sess = await api('/api/sessions');
  state.today = sess.today;
  fillDates(sess.sessions);
  state.date = sess.sessions[0] || sess.today;
  $('#dateSelect').value = state.date;
  await loadSymbols();
  await reloadSession();
  connectWS();
  requestAnimationFrame(renderLoop);
  setInterval(refreshAux, 10000); // 프로파일/테마 주기 갱신
  setInterval(pollStatus, 8000);
}

function applyStatus(cap) {
  const b = $('#statusBadge');
  const map = { live: '실시간 · ' + (cap.env || ''), demo: '데모 모드', connecting: '연결 중…',
    error: '오류', stopped: '정지' };
  b.textContent = map[cap.status] || cap.status;
  b.className = 'badge ' + (cap.status === 'live' ? 'live' : cap.status === 'demo' ? 'demo'
    : cap.status === 'error' ? 'error' : '');
  b.title = cap.detail || '';
}
async function pollStatus() { try { applyStatus((await api('/api/config')).capture); } catch (e) {} }

/* --------------------------------------------------------------- symbols */
async function loadSymbols() {
  const r = await api('/api/symbols');
  state.symbols = r.symbols;
  state.names = {};
  const sel = $('#symbolSelect');
  sel.innerHTML = '';
  r.symbols.forEach((s) => {
    state.names[s.code] = s.name;
    const o = document.createElement('option');
    o.value = s.code;
    o.textContent = `${s.name} (${s.code})`;
    sel.appendChild(o);
  });
  if (!state.activeCode || !r.symbols.find((s) => s.code === state.activeCode))
    state.activeCode = r.symbols[0] ? r.symbols[0].code : null;
  sel.value = state.activeCode || '';
  renderSlotInfo(r.slots);
}

function fillDates(sessions) {
  const sel = $('#dateSelect');
  sel.innerHTML = '';
  sessions.forEach((d) => {
    const o = document.createElement('option');
    o.value = d; o.textContent = d;
    sel.appendChild(o);
  });
}

/* --------------------------------------------------------------- session */
async function reloadSession() {
  if (!state.activeCode) return;
  const d = state.date;
  const [t, e, q] = await Promise.all([
    api(`/api/ticks?code=${state.activeCode}&date=${d}`),
    api(`/api/events?date=${d}`),
    api(`/api/dom/series?code=${state.activeCode}&date=${d}`),
  ]);
  state.ticks = t.ticks || [];
  state.events = e.events || [];
  state.quotes = q.quotes || [];
  await refreshAux();
  await loadDeep();
  if (state.live) state.cutoff = Infinity;
  state.dirty = true;
}

async function refreshAux() {
  if (!state.activeCode) return;
  try {
    const [p, th] = await Promise.all([
      api(`/api/profile?code=${state.activeCode}&date=${state.date}`),
      api(`/api/themes?date=${state.date}`),
    ]);
    state.profile = p;
    state.themes = th.themes || [];
    state.dirty = true;
  } catch (e) {}
}

async function loadDeep() {
  const min = $('#minAmount').value;
  const r = await api(`/api/deep-trades?date=${state.date}&min_amount=${min}`);
  state.deep = r.trades || [];
  state.dirty = true;
}

/* -------------------------------------------------------------------- ws */
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    const d = m.data;
    if (m.type === 'trade' && d.session_date === state.date) {
      if (d.code === state.activeCode) state.ticks.push(d);
      if (Number(d.amount) >= Number($('#minAmount').value)) {
        state.deep.unshift(d);
        if (state.deep.length > 400) state.deep.pop();
      }
      if (state.live) state.dirty = true;
    } else if (m.type === 'quote' && d.code === state.activeCode && d.session_date === state.date) {
      state.quotes.push(d);
      if (state.live) state.dirty = true;
    } else if (m.type === 'event' && d.session_date === state.date) {
      state.events.unshift(d);
      if (state.live) state.dirty = true;
    }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onopen = () => { try { ws.send('hi'); } catch (e) {} };
  setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 20000);
}

/* --------------------------------------------------------------- render */
function timeDomain() {
  if (state.ticks.length) {
    return [state.ticks[0].ts, state.ticks[state.ticks.length - 1].ts];
  }
  const base = new Date(state.date + 'T09:00:00');
  return [base.getTime(), base.getTime() + 6.5 * 3600 * 1000];
}
function currentCutoff() {
  if (state.live) return Infinity;
  const [a, b] = timeDomain();
  const v = Number($('#timeSlider').value) / 1000;
  return a + (b - a) * v;
}
function visibleTicks() {
  const c = state.live ? Infinity : currentCutoff();
  return c === Infinity ? state.ticks : state.ticks.filter((t) => t.ts <= c);
}

function renderLoop() {
  if (state.dirty) { state.dirty = false; renderActive(); updateTimeLabel(); }
  requestAnimationFrame(renderLoop);
}
function updateTimeLabel() {
  const c = currentCutoff();
  const vt = visibleTicks();
  const last = vt.length ? vt[vt.length - 1].ts : (c === Infinity ? Date.now() : c);
  $('#timeLabel').textContent = fmtTime(c === Infinity ? last : c);
}

function renderActive() {
  switch (state.tab) {
    case 'bubbles': renderBubbles(); renderProfile(); break;
    case 'deep': renderDeep(); break;
    case 'dom': renderDom(); break;
    case 'themes': renderThemes(); break;
    case 'events': renderEvents(); break;
  }
}

function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr);
  cv.height = Math.max(1, r.height * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

function renderBubbles() {
  const cv = $('#bubbleCanvas');
  const { ctx, w, h } = setupCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const ticks = visibleTicks();
  const pad = { l: 8, r: 56, t: 10, b: 10 };
  const [tA, tB] = timeDomain();
  const span = Math.max(1, tB - tA);
  let pMin = Infinity, pMax = -Infinity;
  for (const t of ticks) { if (t.price < pMin) pMin = t.price; if (t.price > pMax) pMax = t.price; }
  if (!isFinite(pMin)) { drawEmpty(ctx, w, h, '데이터 없음 — 장중에 켜두거나 날짜를 바꿔보세요'); updateCVDLabels(); return; }
  const yp = pMax - pMin || 1;
  const X = (ts) => pad.l + ((ts - tA) / span) * (w - pad.l - pad.r);
  const Y = (p) => pad.t + (1 - (p - pMin) / yp) * (h - pad.t - pad.b);
  // 가격 축 그리드
  ctx.strokeStyle = '#1b2430'; ctx.fillStyle = '#6b7a90'; ctx.font = '11px sans-serif';
  for (let i = 0; i <= 4; i++) {
    const p = pMin + (yp * i) / 4, y = Y(p);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText(comma(p), w - pad.r + 4, y + 3);
  }
  let maxAmt = 1;
  for (const t of ticks) if (t.amount > maxAmt) maxAmt = t.amount;
  const rOf = (a) => 2 + 22 * Math.sqrt(a / maxAmt);
  for (const t of ticks) {
    ctx.beginPath();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = t.side === 'sell' ? '#ff5b6e' : t.side === 'buy' ? '#26c281' : '#8493a8';
    ctx.arc(X(t.ts), Y(t.price), rOf(t.amount), 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 이벤트 마커
  const c = currentCutoff();
  for (const e of state.events) {
    if (e.code !== state.activeCode || e.ts > c) continue;
    const x = X(e.ts), y = Y(e.price || pMin);
    ctx.fillStyle = e.kind === 'stoprun' ? '#ffb454' : e.kind === 'surge' ? '#ff5b6e' : '#7fd4ff';
    ctx.beginPath();
    if (e.kind === 'absorption') { ctx.moveTo(x, y - 7); ctx.lineTo(x - 6, y + 5); ctx.lineTo(x + 6, y + 5); }
    else if (e.kind === 'stoprun') { ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); }
    else { ctx.arc(x, y, 5, 0, 6.2832); }
    ctx.closePath(); ctx.fill();
  }
  updateCVDLabels();
}

function updateCVDLabels() {
  const ticks = visibleTicks();
  let cvd = 0;
  for (const t of ticks) cvd += t.side === 'buy' ? t.volume : t.side === 'sell' ? -t.volume : 0;
  $('#cvdVal').textContent = comma(cvd);
  $('#cvdVal').className = cvd >= 0 ? 'buy-txt' : 'sell-txt';
  $('#pocVal').textContent = state.profile && state.profile.poc ? comma(state.profile.poc) : '–';
}

function renderProfile() {
  const cv = $('#profileCanvas');
  const { ctx, w, h } = setupCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const p = state.profile;
  if (!p || !p.levels || !p.levels.length) { drawEmpty(ctx, w, h, ''); return; }
  const levels = p.levels;
  let maxT = 1;
  for (const l of levels) if (l.total > maxT) maxT = l.total;
  const bh = h / levels.length;
  levels.forEach((l, i) => {
    const y = h - (i + 1) * bh;
    const bw = (l.buy / maxT) * w, sw = (l.sell / maxT) * w;
    ctx.fillStyle = '#26c281'; ctx.fillRect(0, y + 1, bw, bh - 1);
    ctx.fillStyle = '#ff5b6e'; ctx.fillRect(bw, y + 1, sw, bh - 1);
    if (p.poc && Math.abs(l.price - p.poc) < 1e-6) {
      ctx.strokeStyle = '#4c8dff'; ctx.strokeRect(0, y + 1, w - 1, bh - 1);
    }
  });
}

function drawEmpty(ctx, w, h, msg) {
  ctx.fillStyle = '#6b7a90'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  if (msg) ctx.fillText(msg, w / 2, h / 2);
  ctx.textAlign = 'left';
}

function renderDeep() {
  const min = Number($('#minAmount').value);
  const rows = state.deep.filter((t) => t.amount >= min).slice(0, 300);
  const tb = $('#deepTable tbody');
  tb.innerHTML = rows.map((t) => `
    <tr>
      <td>${fmtTime(t.ts)}</td>
      <td>${state.names[t.code] || t.code}</td>
      <td class="${t.side === 'sell' ? 'sell-txt' : 'buy-txt'}">${t.side === 'sell' ? '매도' : t.side === 'buy' ? '매수' : '-'}</td>
      <td class="num">${comma(t.price)}</td>
      <td class="num">${comma(t.volume)}</td>
      <td class="num">${won(t.amount)}</td>
      <td class="num">${(t.strength || 0).toFixed(0)}</td>
    </tr>`).join('') || `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">대형 체결 없음</td></tr>`;
}

function renderDom() {
  const cv = $('#domCanvas');
  const { ctx, w, h } = setupCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const c = currentCutoff();
  let q = null;
  for (let i = state.quotes.length - 1; i >= 0; i--) { if (state.quotes[i].ts <= c) { q = state.quotes[i]; break; } }
  if (!q && state.quotes.length && state.live) q = state.quotes[state.quotes.length - 1];
  if (!q) { drawEmpty(ctx, w, h, '호가 데이터 없음 — ⚙에서 해당 종목 호가를 켜세요'); $('#totAsk').textContent = '–'; $('#totBid').textContent = '–'; $('#imbal').textContent = '–'; return; }
  const rows = 20, rh = h / rows;
  const sizes = q.ask_sizes.concat(q.bid_sizes);
  const maxS = Math.max(1, ...sizes);
  ctx.font = '11px sans-serif';
  // 매도 10 (위, 역순: 10..1 내려오며 1이 중앙쪽)
  for (let i = 9; i >= 0; i--) {
    const rowIdx = 9 - i; // 0..9 위에서 아래
    drawDomRow(ctx, w, rowIdx * rh, rh, q.ask_prices[i], q.ask_sizes[i], maxS, '#ff5b6e', true);
  }
  for (let i = 0; i < 10; i++) {
    drawDomRow(ctx, w, (10 + i) * rh, rh, q.bid_prices[i], q.bid_sizes[i], maxS, '#26c281', false);
  }
  ctx.strokeStyle = '#4c8dff'; ctx.beginPath(); ctx.moveTo(0, 10 * rh); ctx.lineTo(w, 10 * rh); ctx.stroke();
  $('#totAsk').textContent = comma(q.total_ask);
  $('#totBid').textContent = comma(q.total_bid);
  const im = q.total_bid - q.total_ask;
  const el = $('#imbal');
  el.textContent = (im >= 0 ? '+' : '') + comma(im);
  el.className = im >= 0 ? 'buy-txt' : 'sell-txt';
}
function drawDomRow(ctx, w, y, rh, price, size, maxS, color, isAsk) {
  const bw = (size / maxS) * (w - 90);
  ctx.globalAlpha = 0.25 + 0.6 * (size / maxS);
  ctx.fillStyle = color;
  ctx.fillRect(isAsk ? w - 90 - bw : 90, y + 1, bw, rh - 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#c9d4e2';
  ctx.fillText(comma(price), 6, y + rh / 2 + 4);
  ctx.fillStyle = '#7a8698';
  ctx.fillText(comma(size), w - 84, y + rh / 2 + 4);
}

function renderThemes() {
  const rows = state.themes;
  let maxAbs = 1;
  for (const r of rows) maxAbs = Math.max(maxAbs, Math.abs(r.net));
  const tb = $('#themeTable tbody');
  tb.innerHTML = rows.map((r) => {
    const pct = (Math.abs(r.net) / maxAbs) * 100;
    const col = r.net >= 0 ? 'var(--buy)' : 'var(--sell)';
    return `<tr>
      <td>${r.theme}</td>
      <td class="num">${r.symbols}</td>
      <td class="num">${won(r.buy)}</td>
      <td class="num">${won(r.sell)}</td>
      <td class="num ${r.net >= 0 ? 'buy-txt' : 'sell-txt'}">${r.net >= 0 ? '+' : ''}${won(r.net)}</td>
      <td><div class="bar"><i style="width:${pct}%;background:${col}"></i></div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">데이터 없음</td></tr>`;
}

function renderEvents() {
  const c = currentCutoff();
  const rows = state.events.filter((e) => e.ts <= c).slice(0, 300);
  const label = { absorption: '흡수', stoprun: '스탑런', surge: '급증' };
  const ul = $('#eventList');
  ul.innerHTML = rows.map((e) => {
    const meta = Object.entries(e.meta || {}).map(([k, v]) => `${k}:${v}`).join(' · ');
    return `<li>
      <span class="t">${fmtTime(e.ts)}</span>
      <span class="tag ${e.kind}">${label[e.kind] || e.kind}</span>
      <b>${state.names[e.code] || e.code}</b>
      <span class="muted">@ ${comma(e.price)}</span>
      <span class="muted small">${meta}</span>
    </li>`;
  }).join('') || `<li class="muted" style="justify-content:center;padding:24px">이벤트 없음</li>`;
}

/* ----------------------------------------------------------------- UI wire */
function wireUI() {
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab'); if (!btn) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    state.tab = btn.dataset.tab;
    $(`#view-${state.tab}`).classList.add('active');
    state.dirty = true;
  });
  $('#symbolSelect').addEventListener('change', async (e) => {
    state.activeCode = e.target.value; await reloadSession();
  });
  $('#dateSelect').addEventListener('change', async (e) => {
    state.date = e.target.value;
    state.live = (state.date === state.today) && state.live;
    await reloadSession();
  });
  $('#minAmount').addEventListener('change', loadDeep);
  $('#liveBtn').addEventListener('click', () => {
    state.live = !state.live;
    $('#liveBtn').classList.toggle('on', state.live);
    $('#liveBtn').textContent = state.live ? '▶ 실시간' : '⏸ 리플레이';
    if (state.live) { $('#timeSlider').value = 1000; state.cutoff = Infinity; }
    state.dirty = true;
  });
  $('#timeSlider').addEventListener('input', () => {
    if (state.live) { state.live = false; $('#liveBtn').classList.remove('on'); $('#liveBtn').textContent = '⏸ 리플레이'; }
    state.dirty = true;
  });
  window.addEventListener('resize', () => { state.dirty = true; });

  // 종목 관리 모달
  $('#gearBtn').addEventListener('click', () => { renderSymTable(); $('#gearModal').classList.remove('hidden'); });
  $('#closeGear').addEventListener('click', () => $('#gearModal').classList.add('hidden'));
  $('#addSym').addEventListener('click', () => {
    const code = $('#newCode').value.trim();
    if (!/^\d{6}$/.test(code)) { alert('종목코드 6자리를 입력하세요'); return; }
    state.symbols.push({ code, name: $('#newName').value.trim() || code, quotes: $('#newQuotes').checked });
    $('#newCode').value = ''; $('#newName').value = ''; $('#newQuotes').checked = false;
    renderSymTable();
  });
  $('#applyCapture').addEventListener('click', async () => {
    await fetch('/api/symbols', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: state.symbols }) });
    await fetch('/api/capture/restart', { method: 'POST' });
    $('#gearModal').classList.add('hidden');
    await loadSymbols();
    await reloadSession();
  });
}

function renderSlotInfo(slots) {
  if (!slots) return;
  $('#slotInfo').innerHTML = `KIS 등록: 체결 ${slots.trades} + 호가 ${slots.quotes} = <b>${slots.used}</b>/${slots.limit}칸`
    + (slots.over ? ' <span class="sell-txt">— 한계 초과! 호가/종목을 줄이세요</span>' : '');
}
function renderSymTable() {
  const tb = $('#symTable tbody');
  tb.innerHTML = state.symbols.map((s, i) => `
    <tr>
      <td>${s.code}</td>
      <td>${s.name}</td>
      <td><input type="checkbox" data-i="${i}" class="qchk" ${s.quotes ? 'checked' : ''}></td>
      <td><button class="link-btn" data-del="${i}">삭제</button></td>
    </tr>`).join('');
  tb.querySelectorAll('.qchk').forEach((c) =>
    c.addEventListener('change', (e) => { state.symbols[+e.target.dataset.i].quotes = e.target.checked; renderSlotInfo(slotLocal()); }));
  tb.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', (e) => { state.symbols.splice(+e.target.dataset.del, 1); renderSymTable(); renderSlotInfo(slotLocal()); }));
  renderSlotInfo(slotLocal());
}
function slotLocal() {
  const trades = state.symbols.length;
  const quotes = state.symbols.filter((s) => s.quotes).length;
  return { trades, quotes, used: trades + quotes, limit: 41, over: trades + quotes > 41 };
}

boot();
