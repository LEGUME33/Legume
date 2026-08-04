/* =====================================================================
   TEST-LEGUME · 工作总结（工作模块 · 第 1 个标签页「工作总结」）
   ---------------------------------------------------------------------
   顶部：【月历 / 周历】分段切换 + 本月已打卡统计
   主体：
     · 月历：标准 6 周日历，周一为周起点，胶囊格子，上月/下月淡色，
       选中日期外边框高亮，完成日期显示标识；点击格子弹窗看当日日计划
     · 周历：本周周一至周日横向条 + 本周周计划列表
   底部：规则提示栏（打卡条件 + 云端同步说明）
   数据：全部联动自【每日计划】的日计划 / 周计划；勾选状态经 Store.update
         持久化，触发全局重绘后日历自动刷新。
   约束：仅替换「工作总结」内部展示样式，不改动每日计划 / 工作待办 /
         复盘总结任何功能、表单、图片接口、AI 分析逻辑。
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

  /* 某日期绑定的工作待办（联动【工作待办】模块，按 date 聚合） */
  function todosOf(key) {
    return (TL.Store.get('work').todos || []).filter(function (t) { return t.date === key; });
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

  /* ---------------- 弹窗：当日明细（日计划 + 工作待办，双向互通） ---------------- */
  function openDay(key, dayNum) {
    var list = dayPlansOf(key);
    var total = list.length;
    var done = list.filter(function (p) { return p.done; }).length;
    var todos = todosOf(key);

    var body = U.h('div', {}, [
      U.h('div', { class: 'tl-modal__lead' }, [
        U.h('span', { class: 'tl-tag tl-tag--' + (total && done === total ? 'success' : 'sub'), text: total ? (done + '/' + total + ' 已完成') : '无日计划' }),
        U.h('span', { class: 'tl-muted', text: key + (todos.length ? (' · 待办 ' + todos.length) : '') })
      ])
    ]);

    if (!total) {
      body.appendChild(U.h('div', { class: 'tl-empty', text: '当日暂无日计划。前往「工作 → 每日计划」添加并勾选完成。' }));
    } else {
      var box = U.h('div', { class: 'tl-review-list' });
      list.forEach(function (p) {
        box.appendChild(U.taskItem({
          text: p.text, done: p.done,
          onToggle: function (next) {
            TL.Store.update('work', function (d) {
              var it = d.plans.day.filter(function (x) { return x.id === p.id; })[0];
              if (it) it.done = next;
            }, (next ? '完成' : '取消完成') + '日计划「' + p.text + '」');
          }
        }));
      });
      body.appendChild(daySection('当日日计划', box));
    }

    if (todos.length) {
      var tbox = U.h('div', { class: 'tl-review-list' });
      todos.forEach(function (t) {
        tbox.appendChild(U.taskItem({
          text: t.text, done: t.done, meta: t.priority || '普通', note: t.note,
          onToggle: function (next) {
            TL.Store.update('work', function (d) {
              var it = d.todos.filter(function (x) { return x.id === t.id; })[0];
              if (it) it.done = next;
            }, (next ? '完成' : '重开') + '待办「' + t.text + '」');
          },
          onEdit: function () { TL.pages.work.openTodoModal(t, key); }
        }));
      });
      body.appendChild(daySection('当日工作待办', tbox));
    } else if (!total) {
      body.appendChild(U.h('div', { class: 'tl-empty', text: '当日暂无工作待办。点击下方按钮快速新建。' }));
    }

    /* 快捷操作：直接新建该日期的工作待办（与【工作待办】模块双向互通） */
    body.appendChild(U.h('div', { class: 'mo-day__actions' }, [
      U.h('button', { class: 'tl-btn tl-btn--primary tl-btn--sm', text: '＋ 新建该日期工作待办', onClick: function () { TL.pages.work.openTodoModal(null, key); } })
    ]));

    U.modal({
      title: (anchor.getMonth() + 1) + ' 月 ' + dayNum + ' 日 · 当日明细',
      content: body,
      actions: [{ label: '关闭', type: 'primary', onClick: function (m) { m.close(); } }]
    });
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
      cellContent: function (key) {
        var marks = [];
        var s = cellStatus(key);
        if (s === 'done') marks.push(U.h('span', { class: 'mo-cell__dot is-on' }));
        else if (s === 'partial') marks.push(U.h('span', { class: 'mo-cell__dot is-partial' }));
        else if (s === 'todo') marks.push(U.h('span', { class: 'mo-cell__dot is-todo' }));
        var ts = todosOf(key);
        if (ts.length) marks.push(U.h('span', { class: 'mo-cell__todo', text: String(ts.length) }));
        return marks.length ? U.h('div', { class: 'mo-cell__marks' }, marks) : null;
      }
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
      cellContent: function (key) {
        var marks = [];
        var s = cellStatus(key);
        if (s === 'done') marks.push(U.h('span', { class: 'mo-cell__dot is-on' }));
        else if (s === 'partial') marks.push(U.h('span', { class: 'mo-cell__dot is-partial' }));
        else if (s === 'todo') marks.push(U.h('span', { class: 'mo-cell__dot is-todo' }));
        var ts = todosOf(key);
        if (ts.length) marks.push(U.h('span', { class: 'mo-cell__todo', text: String(ts.length) }));
        return marks.length ? U.h('div', { class: 'mo-cell__marks' }, marks) : null;
      }
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
      wplans.forEach(function (p) {
        box.appendChild(U.taskItem({
          text: p.text, done: p.done,
          onToggle: function (next) {
            TL.Store.update('work', function (d) {
              var it = d.plans.week.filter(function (x) { return x.id === p.id; })[0];
              if (it) it.done = next;
            }, (next ? '完成' : '取消完成') + '周计划「' + p.text + '」');
          }
        }));
      });
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
