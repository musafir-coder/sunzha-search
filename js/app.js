/* ══════════════════════════════════════════════════════
   Поиск на реке Сунжа
   Данные: search/state → { pts, alerts, notice }
   ══════════════════════════════════════════════════════ */
'use strict';


const MAX_PER_PT    = 10;
const STALE_H       = 4;
const SHOW_PTS_ZOOM = 15;
const FREE_CLR      = '#22c55e';
const PART_CLR      = '#fb923c';
const FULL_CLR      = '#ef4444';
const MINE_CLR      = '#f59e0b';
const RIVER_CLR     = '#60a5fa';

/* ── Авто-ID: анонимный идентификатор без ввода имени ── */
let myId = localStorage.getItem('sunzha_id');
if (!myId) {
  myId = '#' + Math.floor(1000 + Math.random() * 9000);
  localStorage.setItem('sunzha_id', myId);
}

let myPtIdx   = localStorage.getItem('sunzha_pt')   !== null ? Number(localStorage.getItem('sunzha_pt'))   : null;
let mySlotIdx = localStorage.getItem('sunzha_slot') !== null ? Number(localStorage.getItem('sunzha_slot')) : null;

let map        = null;
let canvasRend = null;
let markers    = [];
let occupied   = {};
let seenAlerts = new Set(JSON.parse(localStorage.getItem('sunzha_seen') || '[]'));
let currentAlertPt = null;

let chatOpen     = false;
let chatUnseen   = 0;
let chatMsgCount = 0;
let lastChatMsgs = [];

const CHAT_DAILY_LIMIT = 15;
const CHAT_LIMIT_KEY   = 'sunzha_chat_daily';

function chatUsage() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const s = JSON.parse(localStorage.getItem(CHAT_LIMIT_KEY) || '{}');
    if (s.date !== today) return { date: today, count: 0 };
    return s;
  } catch { return { date: new Date().toISOString().slice(0, 10), count: 0 }; }
}
function chatRemaining() { return Math.max(0, CHAT_DAILY_LIMIT - chatUsage().count); }
function chatIncrement() {
  const u = chatUsage(); u.count++;
  localStorage.setItem(CHAT_LIMIT_KEY, JSON.stringify(u));
}

function stateRef() { return db.collection('search').doc('state'); }
function serverTs() { return DEMO_MODE ? { __type: 'serverTimestamp' } : firebase.firestore.FieldValue.serverTimestamp(); }
function fsDelete() { return DEMO_MODE ? FS_DELETE : firebase.firestore.FieldValue.delete(); }

/* ══════════════════════════════════════════════════════
   СТАРТ — сразу без ввода имени
   ══════════════════════════════════════════════════════ */

/* Перерисовывать чат при смене языка */
const _origSetLang = setLang;
window.setLang = function(lang) {
  _origSetLang(lang);
  renderChatMessages(lastChatMsgs);
};

document.addEventListener('DOMContentLoaded', () => {
  setLang(currentLang);
  document.getElementById('my-id-val').textContent = myId;
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMsg(); }
  });
  if (!db) return;
  buildMap();
  subscribeState();
  subscribeChat();
});

/* ══════════════════════════════════════════════════════
   КАРТА
   ══════════════════════════════════════════════════════ */

function buildMap() {
  map = L.map('map', { center: MAP_CENTER, zoom: MAP_ZOOM, zoomControl: false, attributionControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 20 }
  ).addTo(map);

  L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 20, opacity: 0.8 }
  ).addTo(map);

  L.polyline(RIVER_POLY, { color: RIVER_CLR, weight: 2, opacity: 0.7, interactive: false }).addTo(map);

  canvasRend = L.canvas({ padding: 0.5 });

  const pts = getRiverPoints();
  pts.forEach((ll, i) => {
    const m = L.circleMarker(ll, {
      renderer: canvasRend, radius: 4,
      color: 'transparent', fillColor: FREE_CLR, fillOpacity: 0.85, weight: 0
    });
    m.on('click', e => { L.DomEvent.stopPropagation(e); openPanel(i); });
    markers.push(m);
  });

  const ptsGroup = L.layerGroup(markers).addTo(map);

  function updateVisibility() {
    const z    = map.getZoom();
    const hint = document.getElementById('zoom-hint');
    if (z >= SHOW_PTS_ZOOM) {
      if (!map.hasLayer(ptsGroup)) map.addLayer(ptsGroup);
      hint.classList.add('hidden');
    } else {
      if (map.hasLayer(ptsGroup)) map.removeLayer(ptsGroup);
      hint.classList.remove('hidden');
    }
  }
  map.on('zoomend', updateVisibility);
  updateVisibility();

  map.on('click', () => {
    if (!document.getElementById('sector-panel').classList.contains('hidden')) closePanel();
  });
}

function slotCount(ptIdx) {
  const slots = occupied[ptIdx];
  return slots ? Object.keys(slots).length : 0;
}

function updateMarker(idx) {
  const m = markers[idx];
  if (!m) return;
  const cnt = slotCount(idx);
  let clr;
  if (idx === myPtIdx)        clr = MINE_CLR;
  else if (cnt >= MAX_PER_PT) clr = FULL_CLR;
  else if (cnt > 0)           clr = PART_CLR;
  else                        clr = FREE_CLR;
  m.setStyle({ fillColor: clr });
}

function updateStats() {
  let volunteers = 0, points = 0;
  for (const slots of Object.values(occupied)) {
    const cnt = Object.keys(slots).length;
    if (cnt > 0) { volunteers += cnt; points++; }
  }
  document.getElementById('stat-volunteers').textContent = volunteers;
  document.getElementById('stat-points').textContent     = points;
}

/* ══════════════════════════════════════════════════════
   FIRESTORE: подписка
   ══════════════════════════════════════════════════════ */

function subscribeState() {
  const handler = snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') return;
      const data        = change.doc.data();
      const newOccupied = data?.pts    || {};
      const alerts      = data?.alerts || {};
      const notice      = data?.notice || '';

      /* Точки */
      const allPts = new Set([
        ...Object.keys(occupied).map(Number),
        ...Object.keys(newOccupied).map(Number)
      ]);
      allPts.forEach(i => updateMarker(i));
      occupied = newOccupied;
      allPts.forEach(i => updateMarker(i));
      updateStats();

      /* Проверить свою точку */
      if (myPtIdx !== null && mySlotIdx !== null) {
        if (!newOccupied[myPtIdx]?.[mySlotIdx]) {
          myPtIdx = null; mySlotIdx = null;
          localStorage.removeItem('sunzha_pt');
          localStorage.removeItem('sunzha_slot');
          hideMySectorBar();
          showToast(t('t_auto_freed'), 'warn');
        } else {
          showMySectorBar(myPtIdx);
        }
      }

      freeStale(newOccupied);

      /* Уведомление координатора */
      updateNoticeBanner(notice);

      /* Входящие сигналы тревоги */
      handleAlerts(alerts);
    });
  };

  if (DEMO_MODE) db._onStateSnapshot(handler);
  else stateRef().onSnapshot(handler, err => console.error('snapshot', err));
}

async function freeStale(pts) {
  const cutoffMs = Date.now() - STALE_H * 60 * 60 * 1000;
  const updates  = {};
  let   hasStale = false;
  for (const [ptKey, slots] of Object.entries(pts)) {
    if (!slots || typeof slots !== 'object') continue;
    for (const [slotKey, v] of Object.entries(slots)) {
      const claimedAt = v.t?.toDate?.()?.getTime?.() ?? v.t?._ms ?? null;
      if (!claimedAt || claimedAt < cutoffMs) {
        updates[`pts.${ptKey}.${slotKey}`] = fsDelete();
        hasStale = true;
        if (Number(ptKey) === myPtIdx && Number(slotKey) === mySlotIdx) {
          myPtIdx = null; mySlotIdx = null;
          localStorage.removeItem('sunzha_pt');
          localStorage.removeItem('sunzha_slot');
          hideMySectorBar();
        }
      }
    }
  }
  if (hasStale) { try { await stateRef().update(updates); } catch(e) {} }
}

/* ══════════════════════════════════════════════════════
   БАННЕР КООРДИНАТОРА
   ══════════════════════════════════════════════════════ */

function updateNoticeBanner(notice) {
  const banner = document.getElementById('notice-banner');
  const text   = document.getElementById('notice-text');
  if (notice && notice.trim()) {
    text.textContent = notice.trim();
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════════
   ПАНЕЛЬ ТОЧКИ
   ══════════════════════════════════════════════════════ */

function openPanel(idx) {
  const slots  = occupied[idx] || {};
  const cnt    = Object.keys(slots).length;
  const isFull = cnt >= MAX_PER_PT;
  const isMine = idx === myPtIdx;
  const hasMy  = myPtIdx !== null && !isMine;
  const body   = document.getElementById('panel-body');

  map.panTo(getRiverPoints()[idx], { animate: true, duration: 0.3 });

  let html = `<div class="panel-point-name">${t('point')} #${idx + 1}</div>`;

  if (cnt === 0) {
    html += `<div class="status-badge free">${t('badge_free')}</div>`;
  } else if (isFull) {
    html += `<div class="status-badge full">${t('badge_full')} — ${cnt}/${MAX_PER_PT}</div>`;
  } else {
    html += `<div class="status-badge partial">${t('badge_partial')} — ${cnt} из ${MAX_PER_PT}</div>`;
  }

  if (cnt > 0) {
    html += `<div class="occupant-list">`;
    for (const [slotKey, v] of Object.entries(slots)) {
      const time = v.t?.toDate?.() ?? (v.t?._ms ? new Date(v.t._ms) : null);
      const ts   = time ? time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
      const isMySlot = isMine && Number(slotKey) === mySlotIdx;
      html += `<div class="occupant-row${isMySlot ? ' occupant-row--mine' : ''}">`;
      html += `<span class="occupant-row-name">${escHtml(v.n)}${isMySlot ? ` ${t('you')}` : ''}</span>`;
      if (ts) html += `<span class="occupant-row-time">${t('since')} ${ts}</span>`;
      html += `</div>`;
    }
    html += `</div>`;
  }

  html += `<div class="panel-actions">`;
  if (isMine) {
    html += `<button class="btn btn-danger btn-full" onclick="leavePt()">${t('btn_leave')}</button>`;
  } else if (hasMy) {
    html += `<p class="panel-note">${t('already_on', myPtIdx + 1)}</p>`;
  } else if (!isFull) {
    html += `<button class="btn btn-success btn-full" onclick="claimPt(${idx})">${t('btn_claim')}</button>`;
  } else {
    html += `<p class="panel-note">${t('full_note', MAX_PER_PT)}</p>`;
  }
  html += `</div>`;
  html += `<div class="panel-divider"></div>`;
  html += `<button class="btn btn-ghost btn-full" onclick="closePanel()">${t('btn_close')}</button>`;

  body.innerHTML = html;
  document.getElementById('sector-panel').classList.remove('hidden');
}

function closePanel() {
  document.getElementById('sector-panel').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════
   ЗАНЯТЬ / УЙТИ
   ══════════════════════════════════════════════════════ */

async function claimPt(ptIdx) {
  if (myPtIdx !== null) { showToast(t('t_first_leave'), 'warn'); return; }
  const ref = stateRef();
  let freeSlot = -1;
  try {
    freeSlot = await db.runTransaction(async tx => {
      const doc   = await tx.get(ref);
      const pts   = doc.data()?.pts || {};
      const taken = new Set(Object.keys(pts[ptIdx] || {}).map(Number));
      let slot = -1;
      for (let s = 0; s < MAX_PER_PT; s++) { if (!taken.has(s)) { slot = s; break; } }
      if (slot === -1) throw Object.assign(new Error('full'), { code: 'full' });
      tx.update(ref, {
        [`pts.${ptIdx}.${slot}.n`]: myId,
        [`pts.${ptIdx}.${slot}.t`]: serverTs()
      });
      return slot;
    });
    myPtIdx = ptIdx; mySlotIdx = freeSlot;
    localStorage.setItem('sunzha_pt', ptIdx);
    localStorage.setItem('sunzha_slot', freeSlot);
    closePanel();
    showMySectorBar(ptIdx);
    updateMarker(ptIdx);
    showToast(t('t_claimed', ptIdx + 1), 'ok');
  } catch (err) {
    if (err.code === 'full') { showToast(t('t_just_full'), 'warn'); closePanel(); }
    else { console.error(err); showToast(t('t_error'), 'warn'); }
  }
}

async function leavePt() {
  if (myPtIdx === null || mySlotIdx === null) return;
  const ptIdx = myPtIdx, slotIdx = mySlotIdx;
  try {
    await stateRef().update({ [`pts.${ptIdx}.${slotIdx}`]: fsDelete() });
    myPtIdx = null; mySlotIdx = null;
    localStorage.removeItem('sunzha_pt');
    localStorage.removeItem('sunzha_slot');
    hideMySectorBar(); closePanel(); updateMarker(ptIdx);
    showToast(t('t_freed'), 'ok');
  } catch (err) { showToast(t('t_error'), 'warn'); }
}

/* ══════════════════════════════════════════════════════
   СИГНАЛ ТРЕВОГИ
   ══════════════════════════════════════════════════════ */

function openSignalModal()  { document.getElementById('signal-modal').classList.remove('hidden'); }
function closeSignalModal() { document.getElementById('signal-modal').classList.add('hidden'); }

async function sendSignal(type) {
  closeSignalModal();
  const key = `${Date.now()}_${myId}`;
  const payload = {
    [`alerts.${key}.id`]:   myId,
    [`alerts.${key}.pt`]:   myPtIdx ?? null,
    [`alerts.${key}.type`]: type,
    [`alerts.${key}.t`]:    serverTs()
  };
  try {
    await stateRef().update(payload);
    showToast(t('t_signal_sent'), 'ok');
  } catch(e) { showToast(t('t_error'), 'warn'); }
}

function handleAlerts(alerts) {
  /* Найти самый новый непросмотренный сигнал */
  let latest = null, latestKey = null, latestMs = 0;
  for (const [key, a] of Object.entries(alerts)) {
    if (seenAlerts.has(key)) continue;
    if (a.id === myId) { seenAlerts.add(key); continue; } /* свой — не показывать */
    const ms = a.t?.toDate?.()?.getTime?.() ?? a.t?._ms ?? 0;
    if (ms > latestMs) { latestMs = ms; latest = a; latestKey = key; }
  }
  if (!latest) return;

  seenAlerts.add(latestKey);
  localStorage.setItem('sunzha_seen', JSON.stringify([...seenAlerts].slice(-50)));

  currentAlertPt = latest.pt;
  const isFound  = latest.type === 'found';

  const card  = document.getElementById('alert-card');
  card.className = `alert-card alert-card--${isFound ? 'found' : 'sos'}`;
  document.getElementById('alert-icon').textContent  = isFound ? '🔍' : '🆘';
  document.getElementById('alert-title').textContent = t(isFound ? 'alert_found_title' : 'alert_sos_title');
  document.getElementById('alert-body').textContent  = t(isFound ? 'alert_found_body' : 'alert_sos_body', latest.id, latest.pt);
  document.getElementById('alert-btn-go-text').textContent = t('alert_go');

  const goBtn = document.getElementById('alert-btn-go');
  goBtn.style.display = latest.pt !== null ? '' : 'none';

  document.getElementById('alert-overlay').classList.remove('hidden');
}

function goToAlert() {
  if (currentAlertPt === null) return;
  dismissAlert();
  const pts = getRiverPoints();
  if (pts[currentAlertPt]) map.setView(pts[currentAlertPt], 17, { animate: true });
}

function dismissAlert() {
  document.getElementById('alert-overlay').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════
   UI
   ══════════════════════════════════════════════════════ */

function showMySectorBar(idx) {
  const cnt = slotCount(idx);
  document.getElementById('my-bar-name').textContent = `${t('point')} #${idx + 1}  (${cnt}/${MAX_PER_PT})`;
  document.getElementById('my-bar').classList.remove('hidden');
  document.getElementById('leave-btn').onclick = leavePt;
}
function hideMySectorBar() {
  document.getElementById('my-bar').classList.add('hidden');
}

let toastTimer = null;
function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast--${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════════
   ЧАТ
   ══════════════════════════════════════════════════════ */

function subscribeChat() {
  const onSnap = snap => {
    const msgs = [];
    snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
    renderChatMessages(msgs);
  };
  db.collection('chat').orderBy('t').limitToLast(50).onSnapshot(onSnap, err => console.error('chat', err));
}

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('hidden', !chatOpen);
  if (chatOpen) {
    chatUnseen = 0;
    updateChatBadge();
    updateChatCounter();
    setTimeout(() => {
      const msgs = document.getElementById('chat-messages');
      msgs.scrollTop = msgs.scrollHeight;
      document.getElementById('chat-input').focus();
    }, 50);
  }
}

async function sendChatMsg() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  if (chatRemaining() <= 0) { showToast(t('chat_limit'), 'warn'); return; }
  input.value = '';
  chatIncrement();
  updateChatCounter();
  try {
    await db.collection('chat').add({ n: myId, text, t: serverTs() });
  } catch(e) { showToast(t('t_error'), 'warn'); }
}

function renderChatMessages(msgs) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  lastChatMsgs = msgs;
  const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;

  if (!chatOpen && msgs.length > chatMsgCount) {
    chatUnseen += msgs.length - chatMsgCount;
    updateChatBadge();
  }
  chatMsgCount = msgs.length;

  if (msgs.length === 0) {
    container.innerHTML = `<div class="chat-empty">${escHtml(t('chat_empty1'))}<br>${escHtml(t('chat_empty2'))}</div>`;
    return;
  }

  container.innerHTML = '';
  msgs.forEach(msg => {
    const isMine = msg.n === myId;
    const time   = msg.t?.toDate?.() ?? (msg.t?._ms ? new Date(msg.t._ms) : null);
    const ts     = time ? time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';

    const div = document.createElement('div');
    div.className = `chat-msg ${isMine ? 'chat-msg--mine' : 'chat-msg--other'}`;
    div.innerHTML =
      `<div class="chat-msg-meta">` +
        `<span class="chat-msg-sender">${escHtml(msg.n)}</span>` +
        (ts ? `<span class="chat-msg-time">${ts}</span>` : '') +
      `</div>` +
      `<div class="chat-msg-text">${escHtml(msg.text)}</div>`;
    container.appendChild(div);
  });

  if (wasAtBottom || chatOpen) container.scrollTop = container.scrollHeight;
}

function updateChatCounter() {
  const el  = document.getElementById('chat-counter');
  const rem = chatRemaining();
  if (!el) return;
  el.textContent = `${rem}/${CHAT_DAILY_LIMIT}`;
  el.className = `chat-counter${rem <= 3 ? ' chat-counter--low' : ''}`;
}

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  if (!badge) return;
  if (chatUnseen > 0) {
    badge.textContent = chatUnseen > 9 ? '9+' : chatUnseen;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

