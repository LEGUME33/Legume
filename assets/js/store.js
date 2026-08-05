/* =====================================================================
   TEST-LEGUME · 第一层存储：浏览器 localStorage 兜底缓存
   ---------------------------------------------------------------------
   · 断网状态下所有功能照常可用，全部写本地，恢复网络后由 sync.js 自动补推
   · 每个业务分类对应云端仓库 /data/<cat>.json 一个文件
   · 修改业务数据的唯一入口是 TL.Store.update()，保证「落盘 + 日志 + 标脏」三件事不遗漏
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var NS = 'legume';   // localStorage 命名空间
  var SCHEMA = 1;      // 数据结构版本，后续细分模块升级字段时递增并在 migrate() 里兼容

  /* 业务分类 → 云端文件 data/<cat>.json
     后续新增顶层业务域时，只需在此登记 + 补 DEFAULTS，同步引擎自动接管 */
  var CATS = ['work', 'study', 'media', 'activity'];

  var DEFAULTS = {
    /* 工作域：日 / 周 / 月计划（含重要程度）、复盘；todos 为历史遗留字段，
       仅作为旧版「工作待办」的迁移入口保留，migrate 会将其并入 plans.day 后清空 */
    work: function () {
      return { schema: SCHEMA, plans: { month: [], week: [], day: [] }, todos: [], reviews: [], updatedAt: 0 };
    },
    /* 学习域：学习计划主题（含五大板块）、打卡主题/课程/任务/热点（兼容旧字段） */
    study: function () {
      return {
        schema: SCHEMA,
        plans: [],          // 学习计划主题：每个主题独立承载年度模板/月度目标/网盘课程库/今日计划/30天打卡
        currentPlanId: '',  // 当前选中的学习计划主题（首页总览预览的依据）
        topics: [], courses: [], tasks: [], hotspots: [], // 旧骨架/今日热点子页沿用
        updatedAt: 0
      };
    },
    /* 媒体域：上传图片缓存索引（二进制存仓库 data/image/，此处只存索引） */
    media: function () {
      return { schema: SCHEMA, images: [], updatedAt: 0 };
    },
    /* 操作记录：多设备操作留痕 */
    activity: function () {
      return { schema: SCHEMA, logs: [], updatedAt: 0 };
    }
  };

  var DEFAULT_SETTINGS = {
    owner: 'LEGUME33', // GitHub 用户名（已预设，仍可在「设置」中修改）
    repo: 'Legume',    // 业务数据仓库（私有）：data/*.json 的持久同步目标
    token: '',         // ⚠️ 切勿在此写入明文令牌！仅在应用内「设置 → GitHub 私有仓库连接」中粘贴，令牌只存本机 localStorage，绝不入库
    branch: 'main',    // 目标分支
    autoSync: true,
    delaySec: 60,      // GitHub 同步冷却秒数：本地变更后静默等待 60s 再推送，短时间内多次修改只合并提交一次
    theme: 'system',   // system | light | dark
    device: '',        // 本机标识，用于提交信息与操作日志
    lastPullAt: 0,
    lastPushAt: 0,
    /* —— 新增：全局部署 / 登录配置 —— */
    authMethod: 'oauth',   // oauth（免 PAT 账号登录）| pat（手动令牌）
    clientId: 'Ov23liUHIt4aahx4qSx0', // GitHub OAuth App 的 Client ID（仅需注册一次，无需密钥）
    codeRepo: 'legume',    // 前端代码仓库（私有）：静态站点源码托管，Vercel 部署源
    vercelToken: '',       // Vercel 访问令牌（在 Vercel 后台一次性生成，用于站内查询部署状态）
    lastCodePushAt: 0,
    /* —— 新增：双模式同步开关 —— */
    syncMode: 'github',     // github（GitHub 私有仓库）| cloud（云端数据库 FastAPI 后端）
    cloudUrl: '',           // 云端数据库服务地址，例如 http://1.2.3.4:8000
    cloudCooldownSec: 30    // 云端模式推送节流秒数（合并短时间多次修改）
  };

  var cache = {};       // 内存副本
  var settings = null;  // 本地设置
  var listeners = [];   // 变更订阅者
  var blobCache = {};   // 图片 dataURL 内存缓存（同步读取，避免渲染阻塞）

  /* ------------------------------ 本地自动保存（第二层之前的兜底） ------------------------------
     规范要求：每 30 秒检测并落盘 localStorage；关闭/刷新/切后台前强制落盘；
     覆盖所有业务分类与配置。所有改动经 update/replace/saveSettings/logActivity 进入，
     均会标记 localDirty，由 30s 轮询与关页兜底统一刷写。 */
  var localDirty = false;
  var localLastSavedAt = 0;
  var localSubs = [];

  /* ------------------------------ 基础工具 ------------------------------ */
  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[Store] 读取失败', key, e);
      return fallback;
    }
  }

  function lsSet(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.error('[Store] 写入失败（可能超出配额）', key, e);
      if (TL.UI && TL.UI.toast) TL.UI.toast('本地存储写入失败，请清理图片缓存或浏览器数据', 'error', 4200);
      return false;
    }
  }

  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayKey(d) {
    var t = d ? new Date(d) : new Date();
    return t.getFullYear() + '-' +
           String(t.getMonth() + 1).padStart(2, '0') + '-' +
           String(t.getDate()).padStart(2, '0');
  }

  function last30Days() {
    var arr = [], now = new Date();
    for (var i = 29; i >= 0; i--) {
      arr.push(todayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    }
    return arr;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function emit(evt, payload) {
    listeners.forEach(function (fn) {
      try { fn(evt, payload); } catch (e) { console.error('[Store] 订阅者异常', e); }
    });
  }

  /* ------------------------------ 本地自动保存接口 ------------------------------ */
  function markLocalDirty() { localDirty = true; emitLocal(); }

  /**
   * 将内存中所有业务分类 + 设置 + 元信息写入 localStorage（幂等兜底）。
   * @returns {boolean} 本次是否真正发生了写入
   */
  function flushLocal() {
    var wrote = localDirty;
    if (localDirty) {                       // 仅当确有未保存改动时才写盘，避免无谓的写入
      CATS.forEach(function (cat) { persist(cat); });
      if (settings) {
        lsSet(NS + '.settings', settings);
        if (TL.KV && TL.KV.hasIDB) TL.KV.set(NS + '.settings', settings).catch(function () {});
      }
      var m = TL.Store.meta();
      lsSet(NS + '.meta', m);
      if (TL.KV && TL.KV.hasIDB) TL.KV.set(NS + '.meta', m).catch(function () {});
      localDirty = false;
      localLastSavedAt = Date.now();
    }
    emitLocal();
    return wrote;
  }

  function localState() { return { dirty: localDirty, lastSavedAt: localLastSavedAt }; }

  function emitLocal() {
    var snap = localState();
    localSubs.forEach(function (fn) { try { fn(snap); } catch (e) { console.error('[Store] 本地订阅者异常', e); } });
  }

  function onLocal(fn) {
    localSubs.push(fn);
    fn(localState());
    return function () { localSubs = localSubs.filter(function (f) { return f !== fn; }); };
  }

  /** 启动本地自动保存：30s 轮询兜底 + 关页/切后台强制落盘 */
  function startAutosave() {
    // ① 每 30 秒检测并落盘本地缓存，杜绝内存与 localStorage 不一致
    setInterval(function () { try { flushLocal(); } catch (e) { console.warn('[Store] 本地轮询落盘失败', e); } }, 30000);

    // ② 关闭 / 刷新 / 切到后台前强制落盘，杜绝数据丢失
    function force() { try { flushLocal(); } catch (e) {} }
    window.addEventListener('beforeunload', force);
    window.addEventListener('pagehide', force);
    if (document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') force();
      });
    }

    if (!localLastSavedAt) localLastSavedAt = Date.now();
  }

  /* ------------------------------ 设置 ------------------------------ */
  function detectDevice() {
    var ua = navigator.userAgent || '';
    var os = /Windows/.test(ua) ? 'Windows'
           : /Macintosh/.test(ua) ? 'macOS'
           : /iPhone|iPad/.test(ua) ? 'iOS'
           : /Android/.test(ua) ? 'Android' : 'Web';
    return os + '-' + Math.random().toString(36).slice(2, 6);
  }

  function loadSettings() {
    settings = Object.assign({}, DEFAULT_SETTINGS, lsGet(NS + '.settings', {}));
    // 迁移：旧版默认冷却 30s 统一升级为 60s（仅当等于旧默认值时，尊重用户后续手动调整）
    if (settings.delaySec === 30) settings.delaySec = 60;
    if (!settings.device) {
      settings.device = detectDevice();
      lsSet(NS + '.settings', settings);
    }
    return settings;
  }

  /* ------------------------------ 结构兼容 ------------------------------ */
  function migrate(cat, d) {
    if (!d || typeof d !== 'object') return;
    if (cat === 'work') {
      if (!d.plans || typeof d.plans !== 'object' || Array.isArray(d.plans)) d.plans = { month: [], week: [], day: [] };
      ['month', 'week', 'day'].forEach(function (k) { if (!Array.isArray(d.plans[k])) d.plans[k] = []; });
      // 规范每条计划：补齐 id / 重要等级（high|mid|low，默认 low）/ 绑定日期 / 完成态 / 备注 / 周期
      ['month', 'week', 'day'].forEach(function (k) {
        d.plans[k].forEach(function (p) {
          if (typeof p.id !== 'string' || !p.id) p.id = uid('plan');
          if (typeof p.level !== 'string' || (p.level !== 'high' && p.level !== 'mid' && p.level !== 'low')) p.level = 'low';
          if (typeof p.date !== 'string' || !p.date) p.date = todayKey();
          if (typeof p.done !== 'boolean') p.done = false;
          if (typeof p.note !== 'string') p.note = '';
          if (typeof p.scope !== 'string') p.scope = k;
        });
      });
      // 历史工作待办平滑迁移并入「每日计划」：旧优先级映射为等级（紧急→高 / 重要→中 / 普通→低），
      // 保留原内容、完成态、绑定日期、备注；迁移后清空 todos，保证单一数据源、无需手动重建。
      if (!Array.isArray(d.todos)) d.todos = [];
      if (d.todos.length) {
        var dayIds = {};
        d.plans.day.forEach(function (p) { dayIds[p.id] = 1; });
        d.todos.forEach(function (t) {
          if (t && typeof t.id === 'string' && dayIds[t.id]) return; // 已迁移过，避免云端半合并态产生重复
          d.plans.day.unshift({
            id: (typeof t.id === 'string' && t.id) ? t.id : uid('plan'),
            text: (typeof t.text === 'string') ? t.text : '',
            done: typeof t.done === 'boolean' ? t.done : false,
            level: (t.priority === '紧急') ? 'high' : (t.priority === '重要') ? 'mid' : 'low',
            date: (typeof t.date === 'string' && t.date) ? t.date : todayKey(),
            note: (typeof t.note === 'string') ? t.note : '',
            scope: 'day',
            ts: (t && t.ts) ? t.ts : Date.now()
          });
        });
        d.todos = [];
      }
      if (!Array.isArray(d.reviews)) d.reviews = [];
      // 规范化每条复盘结构，兼容旧版只有 {type, summary} 的记录
      d.reviews.forEach(function (r) {
        if (!r.id) r.id = uid('rv');
        if (!r.type) r.type = 'day';
        if (!r.fields || typeof r.fields !== 'object') r.fields = {};
        if (!Array.isArray(r.skus)) r.skus = [];
        if (!Array.isArray(r.images)) r.images = [];
        if (typeof r.status !== 'string') r.status = r.aiReport ? 'analyzed' : 'draft';
        if (!r.calc) r.calc = null;
        if (!r.aiReport) r.aiReport = null;
        if (!r.feishu) r.feishu = null;
        r.ts = r.ts || r.updatedAt || r.createdAt || Date.now();
      });
    }
    if (cat === 'study') {
      ['topics', 'courses', 'tasks', 'hotspots'].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
      d.topics.forEach(function (t) { if (!Array.isArray(t.checkins)) t.checkins = []; });
      // 学习计划主题结构规范化
      if (!Array.isArray(d.plans)) d.plans = [];
      if (!d.currentPlanId) d.currentPlanId = '';
      d.plans.forEach(function (p) {
        if (!p.id) p.id = uid('pl');
        if (!p.name) p.name = '未命名计划';
        if (typeof p.builtin !== 'boolean') p.builtin = false;
        if (!p.annual || typeof p.annual !== 'object') p.annual = {};
        if (typeof p.annual.goal !== 'string') p.annual.goal = '';
        if (!Array.isArray(p.monthly)) p.monthly = [];
        p.monthly.forEach(function (m) {
          if (!m.id) m.id = uid('mo');
          if (typeof m.done !== 'boolean') m.done = false;
        });
        if (!Array.isArray(p.courses)) p.courses = [];
        p.courses.forEach(function (c) {
          if (!c.id) c.id = uid('cr');
          if (typeof c.link !== 'string') c.link = '';
        });
        if (!Array.isArray(p.checkins)) p.checkins = [];
        if (!p.assignments || typeof p.assignments !== 'object') p.assignments = {};
        Object.keys(p.assignments).forEach(function (day) {
          if (!Array.isArray(p.assignments[day])) return;
          p.assignments[day].forEach(function (a) {
            if (!a.id) a.id = uid('as');
            if (typeof a.done !== 'boolean') a.done = false;
          });
        });
      });
    }
    if (cat === 'media' && !Array.isArray(d.images)) d.images = [];
    if (cat === 'activity' && !Array.isArray(d.logs)) d.logs = [];
    d.schema = SCHEMA;
  }

  /* ------------------------------ 读写 ------------------------------ */
  function load(cat) {
    if (cache[cat]) return cache[cat];
    var def = DEFAULTS[cat] ? DEFAULTS[cat]() : { schema: SCHEMA, updatedAt: 0 };
    var data = lsGet(NS + '.' + cat, null);
    cache[cat] = data ? Object.assign(def, data) : def;
    migrate(cat, cache[cat]);
    return cache[cat];
  }

  /* 浏览器专用：从 IndexedDB 水合权威数据到内存缓存，完成后触发重绘。
     采用「双写镜像」策略——localStorage 始终作为即时可读镜像（含弱网/隐私模式兜底），
     IndexedDB 为容量更大的主存储；即使隐私模式清空 localStorage，IndexedDB 仍保有完整数据。 */
  function hydrateFromIDB() {
    if (!TL.KV || !TL.KV.hasIDB) return;
    TL.KV.migrateFromLocalStorage().then(function () {
      return TL.KV.get(NS + '.settings');
    }).then(function (s) {
      if (s) settings = Object.assign(DEFAULT_SETTINGS, s);
      return TL.KV.get(NS + '.meta');
    }).then(function () {
      return TL.KV.keys(NS + '.blob.');
    }).then(function (blobKeys) {
      return Promise.all(blobKeys.map(function (k) {
        return TL.KV.get(k).then(function (v) { if (v != null) blobCache[k.slice((NS + '.blob.').length)] = v; });
      }));
    }).then(function () {
      return Promise.all(CATS.map(function (cat) {
        return TL.KV.get(NS + '.' + cat).then(function (v) {
          if (v) { cache[cat] = Object.assign(DEFAULTS[cat] ? DEFAULTS[cat]() : {}, v); migrate(cat, cache[cat]); }
        });
      }));
    }).then(function () {
      emit('change', { cat: '*', action: 'hydrated', silent: true });   // 触发页面重绘
    }).catch(function (e) { console.warn('[Store] IndexedDB 水合失败，继续使用本地镜像', e); });
  }

  function persist(cat) {
    var data = clone(cache[cat]);
    lsSet(NS + '.' + cat, data);                 // 镜像：即时可读、弱网/隐私模式兜底
    if (TL.KV && TL.KV.hasIDB) TL.KV.set(NS + '.' + cat, data).catch(function () {});  // 主存储：IndexedDB
    return true;
  }

  /**
   * 修改业务数据的唯一入口
   * @param {string}   cat      业务分类（CATS 之一）
   * @param {Function} mutator  接收数据对象，直接原地修改
   * @param {string}   action   操作描述，写入操作日志并同步到私有仓库
   */
  function update(cat, mutator, action) {
    var data = load(cat);
    mutator(data);
    data.updatedAt = Date.now();
    persist(cat);
    markLocalDirty();
    if (action && cat !== 'activity') logActivity(cat, action);
    emit('change', { cat: cat, action: action });
    if (TL.Sync && TL.Sync.markDirty) TL.Sync.markDirty(cat);
    return data;
  }

  /** 供同步引擎调用：以云端数据整体覆盖本地（不产生新的推送任务） */
  function replace(cat, data) {
    cache[cat] = Object.assign(DEFAULTS[cat] ? DEFAULTS[cat]() : {}, data || {});
    migrate(cat, cache[cat]);
    persist(cat);
    markLocalDirty();
    emit('change', { cat: cat, action: 'remote-apply', silent: true });
  }

  /* ------------------------------ 学习计划预设主题 ------------------------------ */
  /* 首次进入时若 study.plans 为空，注入 3 个内置主题（AI / 产品经理 / 大数据模型）。
     预设主题仅写入本地初始数据，用户可随时新增自定义主题；数据随业务域整体同步 GitHub。 */
  var STUDY_PRESETS = ['AI', '产品经理', '大数据模型'];
  function ensureStudyPresets() {
    var d = load('study');
    if (d.plans && d.plans.length) return;
    d.plans = STUDY_PRESETS.map(function (name) {
      return {
        id: uid('pl'),
        name: name,
        builtin: true,
        createdAt: Date.now(),
        annual: { goal: '' },
        monthly: [],
        courses: [],
        checkins: [],
        assignments: {}
      };
    });
    if (!d.currentPlanId && d.plans.length) d.currentPlanId = d.plans[0].id;
    persist('study');
    if (TL.Sync && TL.Sync.markDirty) TL.Sync.markDirty('study');
  }

  /* ------------------------------ 操作日志 ------------------------------ */
  function logActivity(cat, action) {
    var log = load('activity');
    log.logs.unshift({
      id: uid('log'),
      ts: Date.now(),
      cat: cat,
      action: action,
      device: settings ? settings.device : ''
    });
    if (log.logs.length > 500) log.logs.length = 500;
    log.updatedAt = Date.now();
    persist('activity');
    markLocalDirty();
    if (TL.Sync && TL.Sync.markDirty) TL.Sync.markDirty('activity');
  }

  /* ------------------------------ 总览派生统计 ------------------------------ */
  function stats() {
    var work = load('work');
    var study = load('study');
    var media = load('media');
    var tk = todayKey();
    var win = last30Days();

    /* —— 工作：日计划完成进度 —— */
    var dayPlans = work.plans.day || [];
    var planDone = dayPlans.filter(function (p) { return p.done; }).length;

    /* —— 工作：本月任务完成进度（月度任务总结页 / 首页卡片用） —— */
    var curYM = tk.slice(0, 7); // YYYY-MM
    var mDay = dayPlans.filter(function (p) { return (p.date || '').slice(0, 7) === curYM; });
    var mDayDone = mDay.filter(function (p) { return p.done; }).length;
    var mWeek = (work.plans.week || []).filter(function (p) { return (p.date || '').slice(0, 7) === curYM; });
    var mWeekDone = mWeek.filter(function (p) { return p.done; }).length;

    /* —— 工作：未完成日计划（原「工作待办」已并入每日计划） —— */
    var dayPlanAll = work.plans.day || [];
    var todoOpen = dayPlanAll.filter(function (p) { return !p.done; }).length;

    /* —— 工作：最新复盘摘要 —— */
    var lastReview = work.reviews.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0] || null;

    /* —— 学习：各主题 30 天打卡热力 —— */
    var topics = study.topics.map(function (t) {
      var checkins = t.checkins || [];
      var hit = win.filter(function (d) { return checkins.indexOf(d) > -1; }).length;
      return {
        id: t.id,
        name: t.name,
        hit: hit,
        total: 30,
        rate: Math.round(hit / 30 * 100),
        days: win.map(function (d) { return { d: d, on: checkins.indexOf(d) > -1, today: d === tk }; })
      };
    });

    /* —— 学习：今日网盘课程 / 今日任务完成率 / 待阅读热点 —— */
    var todayCourses = study.courses.filter(function (c) { return c.date === tk; });
    var courseTodo = todayCourses.filter(function (c) { return !c.done; }).length;
    var todayTasks = study.tasks.filter(function (t) { return t.date === tk; });
    var taskDone = todayTasks.filter(function (t) { return t.done; }).length;
    var hotspotUnread = study.hotspots.filter(function (h) { return !h.read; }).length;

    /* —— 学习·学习计划：当前主题 + 今日待完成网盘课程任务数 —— */
    var plans = study.plans || [];
    var curId = (study.currentPlanId && plans.some(function (p) { return p.id === study.currentPlanId; }))
      ? study.currentPlanId
      : (plans[0] ? plans[0].id : '');
    var curPlan = plans.filter(function (p) { return p.id === curId; })[0] || null;
    var todayAsg = curPlan ? (curPlan.assignments[tk] || []) : [];
    var curTodayTodo = todayAsg.filter(function (a) { return !a.done; }).length;
    var curTodayTotal = todayAsg.length;

    return {
      today: tk,
      work: {
        planTotal: dayPlans.length,
        planDone: planDone,
        planRate: dayPlans.length ? Math.round(planDone / dayPlans.length * 100) : 0,
        todoOpen: todoOpen,
        todoTotal: dayPlanAll.length,
        reviewTotal: work.reviews.length,
        lastReview: lastReview,
        monthly: {
          dayTotal: mDay.length,
          dayDone: mDayDone,
          dayRate: mDay.length ? Math.round(mDayDone / mDay.length * 100) : 0,
          weekTotal: mWeek.length,
          weekDone: mWeekDone,
          weekRate: mWeek.length ? Math.round(mWeekDone / mWeek.length * 100) : 0
        }
      },
      study: {
        topics: topics,
        topicTotal: study.topics.length,
        courseTodo: courseTodo,
        courseTotal: todayCourses.length,
        taskDone: taskDone,
        taskTotal: todayTasks.length,
        taskRate: todayTasks.length ? Math.round(taskDone / todayTasks.length * 100) : 0,
        hotspotUnread: hotspotUnread,
        hotspotTotal: study.hotspots.length,
        plans: plans,
        planTotal: plans.length,
        currentPlan: curPlan,
        currentPlanTodayTodo: curTodayTodo,
        currentPlanTodayTotal: curTodayTotal
      },
      media: {
        total: media.images.length,
        pending: media.images.filter(function (i) { return !i.remotePath; }).length
      }
    };
  }

  /* ------------------------------ 导出 ------------------------------ */
  TL.Store = {
    NS: NS,
    CATS: CATS,
    SCHEMA: SCHEMA,
    uid: uid,
    todayKey: todayKey,
    last30Days: last30Days,
    clone: clone,

    init: function () {
      loadSettings();
      CATS.forEach(load);                 // 同步：localStorage 镜像 → 内存缓存（首屏即时可用）
      ensureStudyPresets();
      startAutosave();
      if (TL.KV && TL.KV.hasIDB) hydrateFromIDB();                              // 浏览器：异步从 IndexedDB 拉取权威数据并重绘
      else if (TL.KV && TL.KV.migrateFromLocalStorage) TL.KV.migrateFromLocalStorage().catch(function () {});
      return this;
    },

    get: load,
    update: update,
    replace: replace,
    stats: stats,
    log: logActivity,

    /* 本地自动保存接口（30s 轮询兜底 + 关页强制落盘） */
    markLocalDirty: markLocalDirty,
    flushLocal: flushLocal,
    localState: localState,
    onLocal: onLocal,

    settings: function () { return settings || loadSettings(); },
    saveSettings: function (patch) {
      settings = Object.assign(loadSettings(), patch || {});
      lsSet(NS + '.settings', settings);
      if (TL.KV && TL.KV.hasIDB) TL.KV.set(NS + '.settings', settings).catch(function () {});
      markLocalDirty();
      emit('settings', settings);
      return settings;
    },

    /* 本地二进制缓存（图片 dataURL），独立键存放，避免撑大业务 JSON */
    blobGet: function (id) {
      if (id in blobCache) return blobCache[id];
      var v = lsGet(NS + '.blob.' + id);
      blobCache[id] = v == null ? '' : v;
      return blobCache[id];
    },
    blobSet: function (id, dataUrl) {
      blobCache[id] = dataUrl;
      lsSet(NS + '.blob.' + id, dataUrl);   // 镜像
      if (TL.KV && TL.KV.hasIDB) TL.KV.set(NS + '.blob.' + id, dataUrl).catch(function () {});  // 主存储
      return true;
    },
    blobDel: function (id) {
      delete blobCache[id];
      lsDel(NS + '.blob.' + id);
      if (TL.KV && TL.KV.hasIDB) TL.KV.del(NS + '.blob.' + id).catch(function () {});
    },

    /* 同步元信息：各文件 sha 缓存，减少 API 往返 */
    meta: function () { return lsGet(NS + '.meta', { sha: {}, remoteUpdatedAt: {} }); },
    saveMeta: function (meta) {
      lsSet(NS + '.meta', meta);
      if (TL.KV && TL.KV.hasIDB) TL.KV.set(NS + '.meta', meta).catch(function () {});
    },

    on: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    emit: emit
  };
})(window.TL);
