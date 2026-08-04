/* =====================================================================
   TEST-LEGUME · 第二层存储：GitHub 私有仓库线上持久双向同步引擎
   ---------------------------------------------------------------------
   规则：
     · 打开网页          → 自动拉取云端最新数据并与本地合并
     · 数据修改          → 延迟 30 秒自动提交推送（期间再次修改则重新计时）
     · 断网 / 未配置     → 全部走本地，恢复网络后自动补推
     · 立即同步          → 先拉后推
     · 历史版本回滚      → 读取任意提交版本覆盖本地并推送为最新版本
   合并策略：
     · 仅一侧变更                → 新的一侧整体胜出
     · 两侧自上次同步后都有变更  → 按条目 id 归并（较新一侧的同 id 条目胜出，双方独有条目保留）
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  /* 状态机：idle | offline | unconfigured | pending | syncing | synced | error */
  var state = {
    status: 'idle',
    message: '初始化…',
    dirty: {},
    countdown: 0,
    lastError: '',
    lastPullAt: 0,
    lastPushAt: 0
  };

  var timer = null;    // 延迟推送
  var ticker = null;   // 倒计时刷新
  var subs = [];
  var busy = false;

  function filePath(cat) { return 'data/' + cat + '.json'; }

  function notify() {
    subs.forEach(function (fn) {
      try { fn(Object.assign({}, state)); } catch (e) { console.error('[Sync] 订阅者异常', e); }
    });
  }

  function setStatus(status, message) {
    state.status = status;
    state.message = message;
    notify();
  }

  function hasDirty() { return Object.keys(state.dirty).length > 0; }

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + '秒前';
    if (s < 3600) return Math.floor(s / 60) + '分钟前';
    if (s < 86400) return Math.floor(s / 3600) + '小时前';
    return Math.floor(s / 86400) + '天前';
  }

  function refreshIdleStatus() {
    if (!navigator.onLine) return setStatus('offline', '离线模式 · 本地已保存');
    if (!TL.GitHub.configured()) return setStatus('unconfigured', '未连接云端 · 仅本地');
    if (hasDirty()) return setStatus('pending', '待同步 ' + state.countdown + 's');
    var t = state.lastPushAt || state.lastPullAt;
    return setStatus('synced', '已同步' + (t ? ' · ' + timeAgo(t) : ''));
  }

  /* ------------------------------ 脏标记 + 延迟推送 ------------------------------ */
  function markDirty(cat) {
    state.dirty[cat] = true;
    if (!TL.GitHub.configured() || !navigator.onLine) return refreshIdleStatus();
    if (!TL.Store.settings().autoSync) return refreshIdleStatus();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    clearInterval(ticker);
    var delay = TL.Store.settings().delaySec || 30;
    state.countdown = delay;
    setStatus('pending', '待同步 ' + state.countdown + 's');

    ticker = setInterval(function () {
      state.countdown = Math.max(0, state.countdown - 1);
      if (state.status === 'pending') setStatus('pending', '待同步 ' + state.countdown + 's');
    }, 1000);

    timer = setTimeout(function () {
      clearInterval(ticker);
      push().catch(function () {});
    }, delay * 1000);
  }

  /* ------------------------------ 合并 ------------------------------ */
  function mergeArrays(base, over) {
    var map = {}, order = [];
    function put(list) {
      (list || []).forEach(function (it) {
        var key = it && it.id ? it.id : JSON.stringify(it);
        if (!(key in map)) order.push(key);
        map[key] = it;
      });
    }
    put(base);  // 先放较旧一侧
    put(over);  // 较新一侧覆盖同 id 条目
    return order.map(function (k) { return map[k]; });
  }

  /** 两侧并发变更时的条目级归并；newer 为较新一侧 */
  function mergeData(older, newer) {
    var out = Object.assign({}, older, newer);
    Object.keys(newer).forEach(function (k) {
      var a = older[k], b = newer[k];
      if (Array.isArray(a) && Array.isArray(b)) {
        out[k] = mergeArrays(a, b);
      } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
        var sub = Object.assign({}, a, b);
        Object.keys(b).forEach(function (kk) {
          if (Array.isArray(a[kk]) && Array.isArray(b[kk])) sub[kk] = mergeArrays(a[kk], b[kk]);
        });
        out[k] = sub;
      }
    });
    out.updatedAt = Math.max(older.updatedAt || 0, newer.updatedAt || 0);
    return out;
  }

  /* ------------------------------ 拉取 ------------------------------ */
  function pull(opts) {
    opts = opts || {};
    if (!TL.GitHub.configured() || !navigator.onLine) {
      refreshIdleStatus();
      return Promise.resolve({ skipped: true });
    }

    setStatus('syncing', '正在拉取云端数据…');
    var meta = TL.Store.meta();
    var applied = [], merged = [], keptLocal = [];

    var chain = TL.Store.CATS.reduce(function (p, cat) {
      return p.then(function () {
        return TL.GitHub.getFile(filePath(cat)).then(function (file) {
          if (!file) return;                       // 云端尚未生成该文件
          meta.sha[cat] = file.sha;

          var remote;
          try { remote = JSON.parse(file.text); }
          catch (e) { console.warn('[Sync] 云端 JSON 解析失败', cat); return; }

          var local = TL.Store.get(cat);
          var rt = remote.updatedAt || 0;
          var lt = local.updatedAt || 0;
          var lastSynced = (meta.remoteUpdatedAt && meta.remoteUpdatedAt[cat]) || 0;

          if (opts.force || lt === 0) {
            TL.Store.replace(cat, remote);
            applied.push(cat);
          } else if (rt > lt) {
            // 云端更新：若本地自上次同步后也改过 → 条目级归并，否则直接采用云端
            if (lt > lastSynced) {
              TL.Store.replace(cat, mergeData(local, remote));
              state.dirty[cat] = true;             // 归并结果需要回推
              merged.push(cat);
            } else {
              TL.Store.replace(cat, remote);
              applied.push(cat);
            }
          } else if (lt > rt) {
            state.dirty[cat] = true;               // 本地较新，等待推送
            keptLocal.push(cat);
          }
          meta.remoteUpdatedAt[cat] = rt;
        });
      });
    }, Promise.resolve());

    return chain.then(function () {
      TL.Store.saveMeta(meta);
      state.lastPullAt = Date.now();
      TL.Store.saveSettings({ lastPullAt: state.lastPullAt });
      state.lastError = '';
      TL.Store.emit('change', { cat: '*', action: 'pulled', silent: true });
      if (hasDirty()) schedule(); else refreshIdleStatus();
      // 顺带把仅存在本地的图片补传到仓库
      if (TL.Media) TL.Media.uploadPending().catch(function () {});
      return { applied: applied, merged: merged, keptLocal: keptLocal };
    }).catch(function (err) {
      state.lastError = err.message || String(err);
      setStatus('error', '同步失败 · ' + state.lastError);
      throw err;
    });
  }

  /* ------------------------------ 推送 ------------------------------ */
  function push(opts) {
    opts = opts || {};
    clearTimeout(timer);
    clearInterval(ticker);

    if (!TL.GitHub.configured() || !navigator.onLine) {
      refreshIdleStatus();
      return Promise.resolve({ skipped: true });
    }
    if (busy) return Promise.resolve({ busy: true });

    var cats = opts.all ? TL.Store.CATS.slice() : Object.keys(state.dirty);
    if (!cats.length) { refreshIdleStatus(); return Promise.resolve({ nothing: true }); }

    busy = true;
    setStatus('syncing', '正在推送 ' + cats.length + ' 个数据文件…');
    var meta = TL.Store.meta();
    var device = TL.Store.settings().device;

    var chain = cats.reduce(function (p, cat) {
      return p.then(function () {
        var data = TL.Store.get(cat);
        var text = JSON.stringify(data, null, 2);
        var msg = 'data(' + cat + '): sync from ' + device + ' @ ' + new Date().toLocaleString('zh-CN');

        return TL.GitHub.putFile(filePath(cat), text, msg, meta.sha[cat])
          .then(function (r) {
            meta.sha[cat] = r.sha;
            meta.remoteUpdatedAt[cat] = data.updatedAt;
            delete state.dirty[cat];
          })
          .catch(function (err) {
            // 409/422：本地缓存的 sha 已过期（其他设备先提交）→ 重新取 sha 后重试一次
            if (err.status === 409 || err.status === 422) {
              return TL.GitHub.getFile(filePath(cat)).then(function (file) {
                return TL.GitHub.putFile(filePath(cat), text, msg, file && file.sha).then(function (r2) {
                  meta.sha[cat] = r2.sha;
                  meta.remoteUpdatedAt[cat] = data.updatedAt;
                  delete state.dirty[cat];
                });
              });
            }
            throw err;
          });
      });
    }, Promise.resolve());

    return chain.then(function () {
      TL.Store.saveMeta(meta);
      busy = false;
      state.lastPushAt = Date.now();
      TL.Store.saveSettings({ lastPushAt: state.lastPushAt });
      state.lastError = '';
      refreshIdleStatus();
      return { pushed: cats };
    }).catch(function (err) {
      busy = false;
      TL.Store.saveMeta(meta);
      state.lastError = err.message || String(err);
      setStatus('error', '同步失败 · ' + state.lastError);
      throw err;
    });
  }

  /* ------------------------------ 立即同步 ------------------------------ */
  function syncNow() {
    return pull()
      .then(function () { return TL.Media ? TL.Media.uploadPending().catch(function () {}) : null; })
      .then(function () { return push({ all: true }); });
  }

  /* ------------------------------ 历史版本 ------------------------------ */
  function history(cat, limit) {
    return TL.GitHub.listCommits(filePath(cat), limit || 20);
  }

  function preview(cat, sha) {
    return TL.GitHub.getFile(filePath(cat), sha).then(function (file) {
      if (!file) throw new Error('该版本不存在');
      return JSON.parse(file.text);
    });
  }

  function rollback(cat, sha) {
    setStatus('syncing', '正在回滚 ' + cat + ' …');
    return preview(cat, sha).then(function (data) {
      data.updatedAt = Date.now();                 // 让回滚结果成为最新版本
      TL.Store.replace(cat, data);
      TL.Store.log(cat, '回滚到版本 ' + String(sha).slice(0, 7));
      state.dirty[cat] = true;
      return push();
    }).catch(function (err) {
      state.lastError = err.message || String(err);
      setStatus('error', '同步失败 · ' + state.lastError);
      throw err;
    });
  }

  /* ------------------------------ 生命周期 ------------------------------ */
  function init() {
    window.addEventListener('online', function () {
      refreshIdleStatus();
      if (hasDirty()) schedule();
      pull().catch(function () {});
    });
    window.addEventListener('offline', refreshIdleStatus);

    // 关闭页面前尽力推送，避免 30 秒窗口内的数据丢失
    window.addEventListener('beforeunload', function () {
      if (!hasDirty() || !TL.GitHub.configured() || !navigator.onLine) return;
      try { flushSync(); } catch (e) { /* 浏览器可能拦截，本地数据已落盘，下次打开会补推 */ }
    });

    // 「已同步 · x 分钟前」文案定时刷新
    setInterval(function () { if (state.status === 'synced') refreshIdleStatus(); }, 30000);

    refreshIdleStatus();
    return pull().catch(function () {});
  }

  /** 卸载时的阻塞式兜底推送（仅推 dirty 分类） */
  function flushSync() {
    var c = TL.Store.settings();
    var meta = TL.Store.meta();
    Object.keys(state.dirty).forEach(function (cat) {
      var data = TL.Store.get(cat);
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', 'https://api.github.com/repos/' + c.owner + '/' + c.repo + '/contents/' + filePath(cat), false);
      xhr.setRequestHeader('Authorization', 'Bearer ' + c.token);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        message: 'data(' + cat + '): flush on unload',
        content: TL.GitHub.b64encode(JSON.stringify(data, null, 2)),
        branch: c.branch || 'main',
        sha: meta.sha[cat]
      }));
    });
  }

  TL.Sync = {
    state: function () { return Object.assign({}, state); },
    on: function (fn) {
      subs.push(fn);
      fn(Object.assign({}, state));
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },
    init: init,
    markDirty: markDirty,
    pull: pull,
    push: push,
    syncNow: syncNow,
    history: history,
    preview: preview,
    rollback: rollback,
    filePath: filePath,
    refresh: refreshIdleStatus,
    _merge: mergeData
  };
})(window.TL);
