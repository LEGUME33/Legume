/* 云端数据库模式 —— 同步适配器（TL.Cloud）
 * 接口与 TL.Sync（GitHub 引擎）保持一致：init / pull / push / syncNow / markDirty / on / state / configured / refresh / probe
 * 由 TL.getSync() 根据 settings.syncMode 返回当前启用的引擎。
 * 后端：FastAPI + SQLite，冲突策略为条目级时间戳合并（见 server/merge.py）。
 */
(function (TL) {
  var state = {
    status: 'idle', phase: 'idle', message: '初始化…',
    dirty: {}, countdown: 0, lastError: '', lastPullAt: 0, lastPushAt: 0, connectInfo: ''
  };
  var _pullByCat = {};
  var listeners = [];
  var pushTimer = null;

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }
  function on(fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
  function setStatus(status, message) { state.status = status; state.message = message; emit(); }
  function hasDirty() { return Object.keys(state.dirty).length > 0; }
  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + '秒前';
    var m = Math.floor(s / 60); if (m < 60) return m + '分钟前';
    var h = Math.floor(m / 60); if (h < 24) return h + '小时前';
    return Math.floor(h / 24) + '天前';
  }
  function configured() { return !!(TL.Auth && TL.Auth.configured()); }

  /* ---- 条目级时间戳合并（与后端 server/merge.py、前端 sync.js 语义对齐） ---- */
  function itemKey(it) {
    if (it && typeof it === 'object') return it.id || JSON.stringify(it);
    return String(it);
  }
  function itemTs(it) {
    if (it && typeof it === 'object') return it.updatedAt || it.ts || it.createdAt || 0;
    return 0;
  }
  function mergeArrays(base, over) {
    base = Array.isArray(base) ? base : [];
    over = Array.isArray(over) ? over : [];
    var m = {}, out = [];
    function put(list, win) {
      list.forEach(function (it) {
        var k = itemKey(it);
        if (!(k in m)) { m[k] = it; out.push(k); }
        else if (win) { if (itemTs(it) >= itemTs(m[k])) m[k] = it; }
      });
    }
    put(base, false); put(over, true);
    return out.map(function (k) { return m[k]; });
  }
  function mergeData(older, newer) {
    older = older && typeof older === 'object' ? older : {};
    newer = newer && typeof newer === 'object' ? newer : {};
    var o = Object.assign({}, older);
    Object.keys(newer).forEach(function (k) {
      var a = o[k], b = newer[k];
      if (Array.isArray(a) && Array.isArray(b)) o[k] = mergeArrays(a, b);
      else if (a && b && typeof a === 'object' && typeof b === 'object') {
        var sub = Object.assign({}, a);
        Object.keys(b).forEach(function (kk) {
          if (Array.isArray(sub[kk]) && Array.isArray(b[kk])) sub[kk] = mergeArrays(sub[kk], b[kk]);
          else sub[kk] = b[kk];
        });
        o[k] = sub;
      } else o[k] = b;
    });
    o.updatedAt = Math.max(older.updatedAt || 0, newer.updatedAt || 0);
    return o;
  }

  /* ---- 拉取 ---- */
  function pull(opts) {
    opts = opts || {};
    if (!configured()) { setStatus('unconfigured', '未连接云端数据库'); return Promise.resolve({ skipped: true }); }
    setStatus('pulling', '正在拉取云端最新数据');
    return TL.Auth.request('/api/data').then(function (res) {
      var cats = (res && res.categories) || [];
      var applied = [], merged = [];
      cats.forEach(function (c) {
        if (TL.Store.CATS.indexOf(c.category) < 0) return;
        var remote = c.content || {};
        var local = TL.Store.get(c.category);
        var lt = local.updatedAt || 0;
        var rt = c.updatedAt || 0;
        var lastSynced = _pullByCat[c.category] || 0;
        if (lt === 0) {
          TL.Store.replace(c.category, remote); applied.push(c.category);
        } else if (rt > lt) {
          if (lt > lastSynced) {
            TL.Store.replace(c.category, mergeData(local, remote));
            merged.push(c.category); state.dirty[c.category] = true;
          } else {
            TL.Store.replace(c.category, remote); applied.push(c.category);
          }
        }
        _pullByCat[c.category] = Date.now();
      });
      state.lastPullAt = Date.now();
      if (merged.length) {
        setStatus('updated', '云端数据已更新 · ' + timeAgo(state.lastPullAt));
        setTimeout(function () { if (state.status === 'updated') refreshIdleStatus(); }, 2500);
        push().catch(function () {});   // 合并结果回推
      } else if (applied.length) {
        setStatus('updated', '云端数据已更新 · ' + timeAgo(state.lastPullAt));
        setTimeout(function () { if (state.status === 'updated') refreshIdleStatus(); }, 2500);
      } else if (hasDirty()) {
        setStatus('pending', '存在本地未同步变更');
      } else {
        setStatus('connected', '已连接云端·自动同步');
      }
      return { applied: applied, merged: merged };
    }).catch(function (err) {
      state.lastError = err.message || String(err);
      setStatus('error', '同步失败 · ' + state.lastError);
      throw err;
    });
  }

  /* ---- 推送 ---- */
  function push(opts) {
    opts = opts || {};
    if (!configured()) return Promise.resolve({ skipped: true });
    var cats = opts.all ? TL.Store.CATS.slice() : Object.keys(state.dirty);
    cats = cats.filter(function (c) { return TL.Store.CATS.indexOf(c) >= 0; });
    if (!cats.length) { refreshIdleStatus(); return Promise.resolve({ nothing: true }); }
    setStatus('pushing', '正在推送数据至云端');
    var items = cats.map(function (cat) {
      var d = TL.Store.get(cat);
      return { category: cat, content: d, updatedAt: d.updatedAt || Date.now() };
    });
    return TL.Auth.request('/api/data', { method: 'POST', body: { items: items } }).then(function (res) {
      cats.forEach(function (c) { delete state.dirty[c]; });
      state.lastPushAt = Date.now();
      (res && res.categories || []).forEach(function (c) {
        if (TL.Store.CATS.indexOf(c.category) >= 0) TL.Store.replace(c.category, c.content || {});
      });
      setStatus('pushed', '同步上传成功');
      setTimeout(function () { if (state.status === 'pushed') refreshIdleStatus(); }, 2500);
      return { pushed: cats };
    }).catch(function (err) {
      state.lastError = err.message || String(err);
      setStatus('error', '同步失败 · ' + state.lastError);
      throw err;
    });
  }

  function syncNow() { return pull().then(function () { return push(); }).catch(function (e) { throw e; }); }

  function schedule() {
    if (pushTimer) return;
    var delay = (TL.Store.settings().cloudCooldownSec || 30) * 1000;
    pushTimer = setTimeout(function () { pushTimer = null; if (hasDirty()) push().catch(function () {}); }, delay);
  }
  function markDirty(cat) {
    if (!cat || cat === '*') TL.Store.CATS.forEach(function (c) { state.dirty[c] = true; });
    else state.dirty[cat] = true;
    schedule();
  }

  function probe() {
    if (!configured()) return Promise.resolve(setStatus('unconfigured', '未连接云端数据库'));
    return TL.Auth.request('/api/auth/me').then(function (info) {
      state.connectInfo = info.username;
      setStatus('connected', '已连接云端·自动同步');
      return info;
    }).catch(function (e) {
      state.lastError = e.message;
      setStatus('error', '同步失败 · ' + e.message);
      throw e;
    });
  }

  function refreshIdleStatus() {
    if (!TL.Auth.configured()) return setStatus('unconfigured', '未连接云端·仅本地');
    if (!navigator.onLine) return setStatus('offline', '离线模式·本地已保存');
    if (hasDirty()) return setStatus('pending', '存在本地未同步变更');
    return setStatus('connected', '已连接云端·自动同步');
  }

  function init() {
    if (!configured()) { refreshIdleStatus(); return Promise.resolve({ skipped: true }); }
    window.addEventListener('online', function () {
      refreshIdleStatus();
      if (hasDirty()) schedule();
      pull().catch(function () {});
    });
    document.addEventListener('visibilitychange', debounce(function () {
      if (document.visibilityState === 'visible' && TL.Auth.configured()) pull().catch(function () {});
    }, 2000));
    TL.Store.on(function (evt) { if (evt && evt.cat) markDirty(evt.cat); });
    return probe().then(function () { return pull(); }).catch(function () {});
  }

  function debounce(fn, wait) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, wait); };
  }

  TL.Cloud = {
    init: init, pull: pull, push: push, syncNow: syncNow, markDirty: markDirty,
    on: on, state: function () { return state; }, configured: configured,
    refresh: refreshIdleStatus, probe: probe
  };

  /* 路由：根据 settings.syncMode 返回当前启用的同步引擎 */
  TL.getSync = function () {
    var mode = (TL.Store && TL.Store.settings) ? (TL.Store.settings().syncMode || 'github') : 'github';
    return mode === 'cloud' ? TL.Cloud : TL.Sync;
  };
})(window.TL);
