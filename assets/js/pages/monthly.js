/* =====================================================================
   TEST-LEGUME · 工作总结（工作模块 · 第 1 个标签页「工作总结」）
   ---------------------------------------------------------------------
   顶部：【月历 / 周历】分段切换 + 本月已打卡统计
   主体：
     · 月历：标准 6 周日历，周一为周起点，胶囊格子，上月/下月淡色，
       选中日期外边框高亮；格子按当日计划条数 + 重要程度颜色点标识
     · 周历：本周周一至周日横向条 + 本周周计划列表
   底部：规则提示栏（打卡条件 + 云端同步说明）
   数据：全部联动自【每日计划】的日 / 周 / 月计划；点击日期弹窗同时加载
         当日日计划 + 归属本周的周计划 + 归属本月的月计划；勾选状态经
         Store.update 持久化，触发全局重绘后日历自动刷新。
   打卡：当日绑定的全部日计划勾选完成，方可算作当日打卡完成（逻辑不变）。
   ===================================================================== */
window.TL = window.TL || {};
window.TL.pages = window.TL.pages || {};

(function (TL) {
  'use strict';

  var U;
  var FILTER_KEY = TL.Store.NS + '.monthlyAnchor';

  // 当前视图锚点（月历=当月 1 日；周历=当周任意一天）
  var anchor = loadAnchor();
  // 视图模式：'month' | 'week'
  var viewMode = 'month';
  // 当前高亮选中的日期键
  var selectedKey = TL.Store.todayKey();

  function el(id) { return document.getElementById(id); }

  function loadAnchor() {
    var now = new Date();
    var def = new Date(now.getFullYear(), now.getMonth(), 1);
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        var f = JSON.parse(raw);
        if (f && f.year && f.month) def = new Date(f.year, f.month - 1, 1);
      }
    } catch (e) {}
    return def;
  }
  function saveAnchor() {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify({ year: anchor.getFullYear(), month: anchor.getMonth() + 1 })); } catch (e) {}
  }

  /* ---------------- 日期工具 ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function keyOfDate(d) { return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var off = (x.getDay() + 6) % 7; // 周一为起点
    x.setDate(x.getDate() - off);
    return x;
  }
  function endOfWeek(d) {
    var s = startOfWeek(d);
    var e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    return e;
  }
  function weekLabel(d) {
    var s = startOfWeek(d), e = endOfWeek(d);
    return (s.getMonth() + 1) + '/' + s.getDate() + ' – ' + (e.getMonth() + 1) + '/' + e.getDate();
  }

  /* ---------------- 数据读取（联动每日计划） ---------------- */
  function plans() { return TL.Store.get('work').plans; }

  function dayPlansOf(key) {
    return (plans().day || []).filter(function (p) { return p.date === key; });
  }
  function weekPlansOf(monday) {
    var start = keyOfDate(monday);
    var end = keyOfDate(endOfWeek(monday));
    return (plans().week || []).filter(function (p) {
      return p.date && p.date >= start && p.date <= end;
    });
  }

  /* 某日期归属自然月的月计划 */
  function monthPlansOf(key) {
    var ym = (key || '').slice(0, 7);
    return (plans().month || []).filter(function (p) { return (p.date || '').slice(0, 7) === ym; });
  }

  /* 重要程度：文案 + 顺序（高 > 中 > 低），色彩由 CSS 变量统一控制 */
  var LEVEL_ORDER = ['high', 'mid', 'low'];
  function levelLabel(k) {
    return ({ high: '高优先级', mid: '中优先级', low: '低优先级' })[k] || '低优先级';
  }
  /* 当日计划中出现过的重要程度（按高→低排序，用于日历格子色点） */
  function levelsOf(list) {
    var seen = {};
    list.forEach(function (p) { seen[p.level || 'low'] = 1; });
    return LEVEL_ORDER.filter(function (k) { return seen[k]; });
  }

  function daySection(title, node) {
    return U.h('div', { class: 'mo-day__section' }, [
      U.h('div', { class: 'mo-day__section-title', text: title }),
      node
    ]);
  }

  /* 某日期任务完成状态：empty | todo | partial | done */
  function cellStatus(key) {
    var list = dayPlansOf(key);
    if (!list.length) return 'empty';
    var done = list.filter(function (p) { return p.done; }).length;
    if (done === list.length) return 'done';
    if (done > 0) return 'partial';
    return 'todo';
  }

  /* 本月已打卡天数（有日计划且全部完成） */
  function monthCheckinStats() {
    var y = anchor.getFullYear(), m = anchor.getMonth() + 1;
    var total = daysInMonth(y, m);
    var done = 0;
    for (var d = 1; d <= total; d++) {
      if (cellStatus(keyOf(y, m, d)) === 'done') done++;
    }
    return { done: done, total: total };
  }

  /* ---------------- 弹窗：当日明细（日计划 + 归属周计划 + 归属月计划） ---------------- */
  /* 计划条目：统一带重要程度底色，可勾选、可编辑（编辑复用【每日计划】统一弹窗） */
  function planRow(p, sc) {
    return U.taskItem({
      text: p.text, done: p.done, level: p.level || 'low',
      meta: levelLabel(p.level || 'low'), note: p.note,
      onToggle: function (next) {
        TL.Store.update('work', function (d) {
          var it = d.plans[sc].filter(function (x) { return x.id === p.id; })[0];
          if (it) it.done = next;
        }, (next ? '完成' : '取消完成') + ({ day: '日计划', week: '周计划', month: '月计划' })[sc] + '「' + p.text + '」');
      },
      onEdit: function () {
        if (TL.pages.work && TL.pages.work.openPlanModal) TL.pages.work.openPlanModal(p, { scope: sc });
      }
    });
  }

  function openDay(key, dayNum) {
    var list = dayPlansOf(key);
    var total = list.length;
    var done = list.filter(function (p) { return p.done; }).length;
    var mon = startOfWeek(new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)));
    var wplans = weekPlansOf(mon);
    var mplans = monthPlansOf(key);

    var body = U.h('div', {}, [
      U.h('div', { class: 'tl-modal__lead' }, [
        U.h('span', { class: 'tl-tag tl-tag--' + (total && done === total ? 'success' : 'sub'), text: total ? (done + '/' + total + ' 已完成') : '无日计划' }),
        U.h('span', { class: 'tl-muted', text: key + ' · 周计划 ' + wplans.length + ' · 月计划 ' + mplans.length })
      ])
    ]);

    if (!total) {
      body.appendChild(U.h('div', { class: 'tl-empty', text: '当日暂无日计划。可点击下方按钮快速新建，或前往「工作 → 每日计划」添加。' }));
    } else {
      var box = U.h('div', { class: 'tl-review-list' });
      list.forEach(function (p) { box.appendChild(planRow(p, 'day')); });
      body.appendChild(daySection('当日日计划', box));
    }

    if (wplans.length) {
      var wbox = U.h('div', { class: 'tl-review-list' });
      wplans.forEach(function (p) { wbox.appendChild(planRow(p, 'week')); });
      body.appendChild(daySection('本周周计划（' + keyOfDate(mon) + ' ~ ' + keyOfDate(endOfWeek(mon)) + '）', wbox));
    }

    if (mplans.length) {
      var mbox = U.h('div', { class: 'tl-review-list' });
      mplans.forEach(function (p) { mbox.appendChild(planRow(p, 'month')); });
      body.appendChild(daySection('本月月计划（' + key.slice(0, 7) + '）', mbox));
    }

    /* 快捷操作：直接新建绑定该日期的日计划（与【每日计划】双向互通） */
    body.appendChild(U.h('div', { class: 'mo-day__actions' }, [
      U.h('button', {
        class: 'tl-btn tl-btn--primary tl-btn--sm', text: '＋ 新建该日期日计划',
        onClick: function () {
          if (TL.pages.work && TL.pages.work.openPlanModal) TL.pages.work.openPlanModal(null, { scope: 'day', date: key });
        }
      })
    ]));

    U.modal({
      title: (+key.slice(5, 7)) + ' 月 ' + (dayNum || +key.slice(8, 10)) + ' 日 · 当日明细',
      content: body,
      actions: [{ label: '关闭', type: 'primary', onClick: function (m) { m.close(); } }]
    });
  }

  /* 日历格子标识：完成状态圆点 + 重要程度色点 + 计划条数 */
  function cellMarks(key) {
    var marks = [];
    var s = cellStatus(key);
    if (s === 'done') marks.push(U.h('span', { class: 'mo-cell__dot is-on' }));
    else if (s === 'partial') marks.push(U.h('span', { class: 'mo-cell__dot is-partial' }));
    else if (s === 'todo') marks.push(U.h('span', { class: 'mo-cell__dot is-todo' }));
    var list = dayPlansOf(key);
    if (list.length) {
      levelsOf(list).forEach(function (lv) {
        marks.push(U.h('span', { class: 'mo-cell__lv mo-cell__lv--' + lv, title: levelLabel(lv) }));
      });
      if (list.length > 1) marks.push(U.h('span', { class: 'mo-cell__plan', text: String(list.length) }));
    }
    return marks.length ? U.h('div', { class: 'mo-cell__marks' }, marks) : null;
  }

  /* ---------------- 导航：翻页 / 今天 ---------------- */
  function stepView(dir) {
    if (viewMode === 'month') {
      anchor = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    } else {
      anchor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7);
    }
    saveAnchor();
    render();
  }
  function goToday() {
    var now = new Date();
    anchor = viewMode === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    selectedKey = TL.Store.todayKey();
    saveAnchor();
    render();
  }

  /* ---------------- 渲染：顶部切换 + 统计 ---------------- */
  function renderHeader() {
    var host = el('mo-filter');
    if (!host) return;
    host.innerHTML = '';

    var stats = monthCheckinStats();
    var seg = U.h('div', { class: 'tl-seg' }, [
      U.h('button', {
        class: 'tl-seg__btn' + (viewMode === 'month' ? ' is-active' : ''),
        text: '月历',
        onClick: function () { viewMode = 'month'; render(); }
      }),
      U.h('button', {
        class: 'tl-seg__btn' + (viewMode === 'week' ? ' is-active' : ''),
        text: '周历',
        onClick: function () { viewMode = 'week'; render(); }
      })
    ]);

    host.appendChild(seg);
    host.appendChild(U.h('div', { class: 'mo-stats', text: '本月已打卡 ' + stats.done + ' / ' + stats.total + ' 天' }));
  }

  /* ---------------- 渲染：月历 ---------------- */
  function renderMonth() {
    var host = el('mo-cal');
    if (!host) return;
    host.innerHTML = '';

    var cal = U.calendar({
      view: 'month',
      year: anchor.getFullYear(),
      month: anchor.getMonth(),
      weekStart: 1,
      selected: selectedKey,
      onSelect: function (key, d) {
        selectedKey = key;
        render();
        openDay(key, d.getDate());
      },
      cellClass: function (key) {
        var cls = 'mo-cell--' + cellStatus(key);
        if (key === selectedKey) cls += ' is-selected';
        return cls;
      },
      cellContent: cellMarks
    });

    // 接管日历自带导航，使 anchor 与页面状态同步
    var btns = cal.querySelectorAll('.tl-calendar__navbtn');
    if (btns[0]) btns[0].onclick = function (e) { e.stopPropagation(); stepView(-1); };
    if (btns[1]) btns[1].onclick = function (e) { e.stopPropagation(); stepView(1); };
    var today = cal.querySelector('.tl-calendar__today');
    if (today) today.onclick = function (e) { e.stopPropagation(); goToday(); };

    host.appendChild(U.h('div', { class: 'mo-calendar mo-calendar--month' }, [cal]));
  }

  /* ---------------- 渲染：周历 ---------------- */
  function renderWeek() {
    var host = el('mo-week');
    if (!host) return;
    host.innerHTML = '';

    var cal = U.calendar({
      view: 'week',
      weekAnchor: anchor,
      weekStart: 1,
      selected: selectedKey,
      onSelect: function (key, d) {
        selectedKey = key;
        render();
        openDay(key, d.getDate());
      },
      cellClass: function (key) {
        var cls = 'mo-cell--' + cellStatus(key);
        if (key === selectedKey) cls += ' is-selected';
        return cls;
      },
      cellContent: cellMarks
    });

    var btns = cal.querySelectorAll('.tl-calendar__navbtn');
    if (btns[0]) btns[0].onclick = function (e) { e.stopPropagation(); stepView(-1); };
    if (btns[1]) btns[1].onclick = function (e) { e.stopPropagation(); stepView(1); };
    var today = cal.querySelector('.tl-calendar__today');
    if (today) today.onclick = function (e) { e.stopPropagation(); goToday(); };

    var mon = startOfWeek(anchor);
    var wplans = weekPlansOf(mon);
    var wTotal = wplans.length;
    var wDone = wplans.filter(function (p) { return p.done; }).length;

    var planSection = U.h('div', { class: 'mo-week-plans' }, [
      U.h('div', { class: 'mo-week-plans__head' }, [
        U.h('span', { class: 'mo-week-plans__title', text: '本周周计划（' + weekLabel(anchor) + '）' }),
        U.h('span', { class: 'tl-tag tl-tag--' + (wTotal && wDone === wTotal ? 'success' : 'sub'), text: wTotal ? (wDone + '/' + wTotal + ' 已完成') : '无' })
      ])
    ]);

    if (!wTotal) {
      planSection.appendChild(U.h('div', { class: 'tl-empty', text: '本周暂无周计划。前往「工作 → 每日计划 → 周计划」添加。' }));
    } else {
      var box = U.h('div', { class: 'tl-review-list' });
      wplans.forEach(function (p) { box.appendChild(planRow(p, 'week')); });
      planSection.appendChild(box);
    }

    host.appendChild(U.h('div', { class: 'mo-calendar mo-calendar--week' }, [cal, planSection]));
  }

  /* ---------------- 渲染：底部提示栏 ---------------- */
  function renderHint() {
    var section = el('wk-monthly-section');
    if (!section) return;
    var old = el('mo-hint');
    if (old) old.remove();
    section.appendChild(U.h('div', {
      id: 'mo-hint',
      class: 'mo-hint',
      text: '规则：当日分配的全部日计划勾选完成后，才可标记当日完成；打卡状态自动同步 GitHub + Vercel 云端。'
    }));
  }

  /* ---------------- 渲染入口 ---------------- */
  function render() {
    renderHeader();
    renderMonth();
    renderWeek();
    renderHint();
    var calSec = el('mo-cal');
    var weekSec = el('mo-week');
    if (calSec) calSec.style.display = (viewMode === 'month') ? '' : 'none';
    if (weekSec) weekSec.style.display = (viewMode === 'week') ? '' : 'none';
  }

  TL.pages.monthly = {
    init: function () {
      U = TL.UI;
      render();
    },
    render: render
  };
})(window.TL);
