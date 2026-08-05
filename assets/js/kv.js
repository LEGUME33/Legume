/* =====================================================================
   TEST-LEGUME · 本地存储抽象层（离线层）
   ---------------------------------------------------------------------
   · 浏览器（支持 IndexedDB）：以 IndexedDB 为主存储（容量更大、手机兼容更好）
   · 无 IndexedDB 环境（jsdom / 旧浏览器）：自动降级为 localStorage 镜像，
     保证业务代码调用方式完全一致、回归测试零改动。
   · 所有接口均为异步（Promise）；shim 模式下的写入在返回前已同步落盘，
     因此依赖「写入后立即读 localStorage」的测试依然成立。
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var DB_NAME = 'legume-kv';
  var STORE = 'kv';
  var PREFIX = 'legume.';
  var MIG_FLAG = 'legume.migrated.v2';

  var hasIDB = (typeof indexedDB !== 'undefined' && indexedDB !== null);
  var db = null;

  /* ---------- localStorage 镜像（同步，shim / 弱网兜底） ---------- */
  function lsGet(k) {
    try { var raw = localStorage.getItem(k); return raw == null ? undefined : JSON.parse(raw); }
    catch (e) { return undefined; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.error('[KV] 写入失败（可能超出配额）', k, e); return false; }
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function lsKeys(prefix) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) out.push(k);
      }
    } catch (e) {}
    return out;
  }

  /* ---------- IndexedDB 打开 ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      if (!hasIDB) return resolve(null);
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 打开失败')); };
    });
  }

  function tx(mode) {
    return openDB().then(function (d) {
      if (!d) return null;
      return d.transaction(STORE, mode).objectStore(STORE);
    });
  }

  /* ---------- 异步接口 ---------- */
  function get(k) {
    if (!hasIDB) return Promise.resolve(lsGet(k));
    return tx('readonly').then(function (os) {
      if (!os) return lsGet(k);
      return new Promise(function (res) {
        var r = os.get(k);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(undefined); };
      });
    });
  }

  function set(k, v) {
    if (!hasIDB) { lsSet(k, v); return Promise.resolve(); }
    return tx('readwrite').then(function (os) {
      if (!os) { lsSet(k, v); return; }
      return new Promise(function (res, rej) {
        var r = os.put(v, k);
        r.onsuccess = function () { res(); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function del(k) {
    if (!hasIDB) { lsDel(k); return Promise.resolve(); }
    return tx('readwrite').then(function (os) {
      if (!os) { lsDel(k); return; }
      return new Promise(function (res) {
        var r = os.delete(k);
        r.onsuccess = function () { res(); };
        r.onerror = function () { res(); };
      });
    });
  }

  function keys(prefix) {
    if (!hasIDB) return Promise.resolve(lsKeys(prefix));
    return tx('readonly').then(function (os) {
      if (!os) return Promise.resolve(lsKeys(prefix));
      return new Promise(function (res) {
        var out = [];
        var r = os.openCursor();
        r.onsuccess = function () {
          var cur = r.result;
          if (cur) { if (String(cur.key).indexOf(prefix) === 0) out.push(String(cur.key)); cur.continue(); }
          else res(out);
        };
        r.onerror = function () { res(out); };
      });
    });
  }

  /* ---------- 历史 localStorage 数据一次性迁移至 IndexedDB（无需手动重建） ---------- */
  function migrateFromLocalStorage() {
    if (!hasIDB) return Promise.resolve(false);
    return get(MIG_FLAG).then(function (done) {
      if (done) return false;
      var legacy = lsKeys(PREFIX);
      return Promise.all(legacy.map(function (k) {
        return set(k, lsGet(k));
      })).then(function () {
        return set(MIG_FLAG, 1).then(function () { return true; });
      });
    }).catch(function () { return false; });
  }

  TL.KV = {
    hasIDB: hasIDB,
    get: get,
    set: set,
    del: del,
    keys: keys,
    open: openDB,
    migrateFromLocalStorage: migrateFromLocalStorage
  };
})(window.TL);
