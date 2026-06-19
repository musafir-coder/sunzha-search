/**
 * ══════════════════════════════════════════════════════
 *  НАСТРОЙКА FIREBASE
 * ══════════════════════════════════════════════════════
 *  ШАГ 1. console.firebase.google.com → Add project
 *  ШАГ 2. Build → Firestore Database → Create (test mode)
 *  ШАГ 3. ⚙️ Project settings → Web app → </> → Register
 *  ШАГ 4. Вставьте значения ниже
 * ══════════════════════════════════════════════════════
 */

const firebaseConfig = {
  apiKey:            "AIzaSyDTs-wzh7P4jyxRRIaLIa5VHWYPI7VtkXE",
  authDomain:        "oarc-809fc.firebaseapp.com",
  projectId:         "oarc-809fc",
  storageBucket:     "oarc-809fc.firebasestorage.app",
  messagingSenderId: "922960285218",
  appId:             "1:922960285218:web:ed381f9f79b3405cc3c47b"
};

const DEMO_MODE = firebaseConfig.apiKey.startsWith('ВСТАВЬТЕ');

let db = null;

if (!DEMO_MODE) {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch (e) { console.error('Firebase init error:', e); }
} else {
  db = _createLocalDB();
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.textContent = '⚙️ Demo-режим — данные хранятся локально';
    b.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:500;background:#1e293b;border:1px solid #f59e0b;color:#f59e0b;padding:5px 14px;border-radius:8px;font-size:12px;font-weight:600;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(b);
  });
}

/* ══════════════════════════════════════════════════════
   DEMO: localStorage-based Firestore mock
   Данные: search/state
   { pts: { "ptIdx": { "0": { n, t, p }, "3": { n, t, p } } } }
   ══════════════════════════════════════════════════════ */

function _createLocalDB() {
  const LS  = 'sunzha_state_v3';
  let _cbs  = [];
  let _chatCbs = [];
  const LS_CHAT = 'sunzha_chat';
  function _loadChat()  { try { return JSON.parse(localStorage.getItem(LS_CHAT)||'{}'); } catch { return {}; } }
  function _saveChat(c) { localStorage.setItem(LS_CHAT, JSON.stringify(c)); }
  function _fireChat(cb) {
    const msgs = Object.entries(_loadChat())
      .sort(([,a],[,b]) => (a.t||0)-(b.t||0)).slice(-50)
      .map(([id,v]) => ({ id, data: () => ({ n:v.n, text:v.text, t:_toTs(v.t), sig:v.sig, pt:v.pt, loc:v.loc }) }));
    try { cb({ forEach: fn => msgs.forEach(fn) }); } catch(e) {}
  }
  function _notifyChat() { _chatCbs.forEach(cb => _fireChat(cb)); }

  function _load()      { try { return JSON.parse(localStorage.getItem(LS)||'{}'); } catch { return {}; } }
  function _save(s)     { localStorage.setItem(LS, JSON.stringify(s)); }
  function _now()       { return Date.now(); }
  function _toTs(ms)    { if (!ms || typeof ms !== 'number') return null; const d = new Date(ms); return { toDate: ()=>d, _ms: ms }; }
  function _tsMs(v)     {
    if (!v) return null;
    if (v && v.__type === 'serverTimestamp') return _now();
    if (v instanceof Date) return v.getTime();
    if (v && v._ms) return v._ms;
    if (typeof v === 'number') return v;
    return v;
  }
  function _isDelete(v) { return v && v.__type === 'delete'; }

  function _hydrateDoc(raw) {
    if (!raw) return null;
    const pts = {};
    for (const [ptKey, ptVal] of Object.entries(raw.pts || {})) {
      if (!ptVal || typeof ptVal !== 'object') continue;
      const slots = {};
      for (const [slotKey, slotVal] of Object.entries(ptVal)) {
        if (!slotVal || typeof slotVal !== 'object') continue;
        slots[slotKey] = { n: slotVal.n, t: _toTs(slotVal.t), p: _toTs(slotVal.p) };
      }
      if (Object.keys(slots).length > 0) pts[ptKey] = slots;
    }
    /* alerts */
    const alerts = {};
    for (const [k, v] of Object.entries(raw.alerts || {})) {
      if (!v) continue;
      alerts[k] = { id: v.id, pt: v.pt, type: v.type, t: _toTs(v.t) };
    }
    return { pts, alerts, notice: raw.notice || '' };
  }

  function _notify() {
    const state = _load();
    const snap = {
      docChanges: () => [{ type: 'modified', doc: { id: 'state', data: () => _hydrateDoc(state) } }]
    };
    _cbs.forEach(fn => { try { fn(snap); } catch(e) {} });
  }

  function _applyDotUpdates(state, updates) {
    for (const [path, val] of Object.entries(updates)) {
      const parts = path.split('.');
      let cur = state;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      const last = parts[parts.length - 1];
      if (_isDelete(val)) {
        delete cur[last];
        /* Если родительский объект пустой — удалить и его */
        if (parts.length >= 2) {
          let parent = state;
          for (let i = 0; i < parts.length - 2; i++) parent = parent[parts[i]];
          const parentKey = parts[parts.length - 2];
          if (parent[parentKey] && Object.keys(parent[parentKey]).length === 0) {
            delete parent[parentKey];
          }
        }
      } else {
        cur[last] = _tsMs(val);
      }
    }
  }

  const stateRef = {
    get: async () => {
      const raw = _load();
      return { exists: true, data: () => _hydrateDoc(raw), ref: stateRef };
    },
    update: async (updates) => {
      const state = _load();
      if (!state.pts) state.pts = {};
      _applyDotUpdates(state, updates);
      _save(state);
      _notify();
    },
    set: async (data) => { _save(data); _notify(); }
  };

  return {
    collection: (col) => {
      if (col === 'chat') return {
        add: async (msg) => {
          const c = _loadChat();
          const entry = { n: msg.n, text: msg.text, t: _tsMs(msg.t) };
          if (msg.sig) entry.sig = msg.sig;
          if (msg.pt !== undefined && msg.pt !== null) entry.pt = msg.pt;
          if (msg.loc) entry.loc = msg.loc;
          c[`m_${_now()}_${Math.random().toString(36).slice(2,5)}`] = entry;
          _saveChat(c); _notifyChat();
        },
        orderBy: () => ({ limitToLast: () => ({
          onSnapshot: (cb) => {
            _chatCbs.push(cb);
            setTimeout(() => _fireChat(cb), 50);
            return () => { _chatCbs = _chatCbs.filter(l => l !== cb); };
          }
        })})
      };
      return {
        doc: (id) => {
          if (col === 'search' && id === 'state') return stateRef;
          return { get: async () => ({ exists: false, data: () => null }), update: async () => {}, set: async () => {} };
        },
        onSnapshot: () => {}
      };
    },

    runTransaction: async (fn) => {
      const pending = [];
      const tx = {
        get: async (ref) => ref.get(),
        update: (ref, upd) => pending.push(() => ref.update(upd))
      };
      const result = await fn(tx);
      for (const op of pending) await op();
      return result;
    },

    _onStateSnapshot: (cb, _err) => {
      _cbs.push(cb);
      setTimeout(() => {
        const snap = { docChanges: () => [{ type: 'added', doc: { id: 'state', data: () => _hydrateDoc(_load()) } }] };
        try { cb(snap); } catch(e) {}
      }, 80);
      return () => { _cbs = _cbs.filter(l => l !== cb); };
    }
  };
}

const FS_DELETE = { __type: 'delete' };
