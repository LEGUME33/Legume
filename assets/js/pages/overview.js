/* =====================================================================
   TEST-LEGUME · 总览（首页）
   聚合全工作台各板块预览卡片，点击任意卡片跳转对应功能详情页
   ===================================================================== */
window.TL = window.TL || {};
window.TL.pages = window.TL.pages || {};

(function (TL) {
  'use strict';

  var U;

  function el(id) { return document.getElementById(id); }

  /* ---------------- 顶部同步状态条（与顶栏指示器同源） ---------------- */
  function renderSyncBar() {
    var host = el('ov-sync');
    if (!host) return;
    var s = TL.Sync.state();
    var cfg = TL.Store.settings();
    var configured = TL.GitHub.configured();

    var TEXT = {
      syncing: '同步中', synced: '已同步', error: '同步失败',
      offline: '离线模式', pending: '待同步', unconfigured: '未连接云端', idle: '准备中'
    };
    var TONE = { synced: 'success', syncing: 'info', error: 'danger', pending: 'warning', offline: 'sub', unconfigured: 'sub', idle: 'sub' };

    host.innerHTML = '';
    host.appendChild(U.h('div', { class: 'tl-panel' }, [
      U.h('div', { class: 'tl-inline-form', style: 'align-items:center' }, [
        U.h('span', { class: 'tl-tag tl-tag--' + (TONE[s.status] || 'sub'), text: '云端 · ' + (TEXT[s.status] || s.status) }),
        U.h('span', { class: 'tl-sub', style: 'flex:1;min-width:180px', text: s.message }),
        U.h('span', { class: 'tl-muted', text: configured ? (cfg.owner + '/' + cfg.repo + ' · ' + (cfg.branch || 'main')) : '未配置私有仓库' }),
        U.h('button', {
          class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '立即同步',
          onClick: function () {
            if (!TL.GitHub.configured()) return TL.UI.openSettings();
            U.toast('同步中…');
            TL.Sync.syncNow().then(function () { U.toast('同步完成', 'success'); render(); })
              .catch(function (e) { U.toast('同步失败：' + e.message, 'error', 4200); });
          }
        }),
        U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '同步设置', onClick: function () { TL.UI.openSettings(); } })
      ])
    ]));
  }

  /* ---------------- 工作模块预览 ---------------- */
  function renderWork(st) {
    var host = el('ov-work');
    if (!host) return;
    host.innerHTML = '';
    var w = st.work;

    // 日计划完成进度环
    host.appendChild(U.previewCard({
      key: 'work-plan',
      title: '今日计划完成度',
      href: 'work.html#plans',
      tag: w.planTotal ? (w.planDone + '/' + w.planTotal) : '待添加',
      tagType: w.planTotal && w.planDone === w.planTotal ? 'success' : 'sub',
      body: [
        U.ring(w.planRate, { size: 92 }),
        U.h('div', {}, [
          U.h('div', { class: 'tl-metric__value', text: w.planDone + '' , style: 'font-size:var(--fs-h1)' }),
          U.h('div', { class: 'tl-metric__label', text: '项已完成 · 共 ' + w.planTotal + ' 项' })
        ])
      ],
      foot: w.planTotal ? '剩余 ' + (w.planTotal - w.planDone) + ' 项待推进' : '前往工作页添加今日计划'
    }));

    // 未完成计划统计（原「工作待办」已并入每日计划）
    host.appendChild(U.previewCard({
      key: 'work-todo',
      title: '未完成计划',
      href: 'work.html#plans',
      tag: w.todoOpen ? '进行中' : '已清空',
      tagType: w.todoOpen ? 'warning' : 'success',
      body: [U.metric(w.todoOpen, '条计划等待处理', w.todoOpen ? 'warning' : 'success', ' 条')],
      foot: '累计 ' + w.todoTotal + ' 条 · 已完成 ' + (w.todoTotal - w.todoOpen) + ' 条'
    }));

    // 月度任务完成进度（跳转工作模块内的「工作总结」标签页）
    var mo = w.monthly || { dayTotal: 0, dayDone: 0, dayRate: 0, weekTotal: 0, weekDone: 0, weekRate: 0 };
    host.appendChild(U.previewCard({
      key: 'work-monthly',
      title: '月度任务完成进度',
      href: 'work.html#monthly',
      tag: mo.dayTotal ? (mo.dayDone + '/' + mo.dayTotal) : '待添加',
      tagType: mo.dayTotal && mo.dayDone === mo.dayTotal ? 'success' : 'sub',
      body: [
        U.ring(mo.dayRate, { size: 92 }),
        U.h('div', {}, [
          U.h('div', { class: 'tl-metric__value', text: mo.dayDone + '', style: 'font-size:var(--fs-h1)' }),
          U.h('div', { class: 'tl-metric__label', text: '本月日计划已完成 · 共 ' + mo.dayTotal + ' 项' })
        ])
      ],
      foot: mo.dayTotal ? '周计划 ' + mo.weekDone + '/' + mo.weekTotal + ' · 点击查看月度日历看板' : '前往「工作总结」标签页添加计划'
    }));

    // 最新复盘摘要
    var r = w.lastReview;
    host.appendChild(U.previewCard({
      key: 'work-review',
      title: '最新复盘摘要',
      href: 'work.html#reviews',
      tag: r ? (r.type || '复盘') : '暂无',
      tagType: r ? 'info' : 'sub',
      body: [
        U.h('div', { style: 'min-height:52px' }, [
          U.h('div', {
            class: r ? '' : 'tl-muted',
            style: 'color:var(--c-text-body);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden',
            text: r ? (r.summary || r.title || '（无摘要）') : '尚未记录任何复盘'
          })
        ])
      ],
      foot: r ? (U.fmtTime(r.ts) + ' · 累计 ' + w.reviewTotal + ' 篇') : '前往工作页新建复盘'
    }));
  }

  /* ---------------- 学习模块预览（学习计划主题） ---------------- */
  function renderStudyMetrics(st) {
    var host = el('ov-study-metrics');
    if (!host) return;
    host.innerHTML = '';
    var s = st.study;
    var cur = s.currentPlan;

    host.appendChild(U.previewCard({
      key: 'study-today',
      title: '当前主题·今日待完成网盘课程',
      href: 'study.html#plan',
      tag: s.currentPlanTodayTodo ? '待完成' : (s.currentPlanTodayTotal ? '已全部完成' : '暂无任务'),
      tagType: s.currentPlanTodayTodo ? 'warning' : 'success',
      body: [U.metric(s.currentPlanTodayTodo, '节待完成 · 今日共 ' + s.currentPlanTodayTotal + ' 节', s.currentPlanTodayTodo ? 'warning' : 'success', ' 节')],
      foot: cur ? ('当前主题：' + cur.name) : '前往学习页新建学习计划主题'
    }));

    var moTotal = cur ? cur.monthly.length : 0;
    var moDone = cur ? cur.monthly.filter(function (m) { return m.done; }).length : 0;
    var moRate = moTotal ? Math.round(moDone / moTotal * 100) : 0;
    host.appendChild(U.previewCard({
      key: 'study-month',
      title: '当前主题·月度目标完成率',
      href: 'study.html#plan',
      tag: moTotal ? (moDone + '/' + moTotal) : '待添加',
      tagType: moTotal && moDone === moTotal ? 'success' : 'sub',
      body: [
        U.ring(moRate, { size: 92 }),
        U.h('div', {}, [
          U.h('div', { class: 'tl-metric__value', text: String(moDone), style: 'font-size:var(--fs-h1)' }),
          U.h('div', { class: 'tl-metric__label', text: '项目已完成 · 共 ' + moTotal + ' 项' })
        ])
      ],
      foot: moTotal ? '剩余 ' + (moTotal - moDone) + ' 项月度目标' : '前往学习页添加月度目标'
    }));

    var now = new Date();
    var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var monthPrefix = TL.Store.todayKey().slice(0, 7);
    var hit = cur ? cur.checkins.filter(function (d) { return d.slice(0, 7) === monthPrefix; }).length : 0;
    host.appendChild(U.previewCard({
      key: 'study-checkin',
      title: '当前主题·本月打卡',
      href: 'study.html#plan',
      tag: hit ? (hit + ' 天') : '未打卡',
      tagType: hit ? 'info' : 'sub',
      body: [U.metric(hit, '天已打卡 · 本月共 ' + dim + ' 天', hit ? 'info' : 'sub', ' 天')],
      foot: cur ? ('主题：' + cur.name + ' · 30 天打卡计划') : '前往学习页开始打卡'
    }));
  }

  /* ---------------- 当前主题·本月打卡热力 ---------------- */
  function renderTopics(st) {
    var host = el('ov-study-topics');
    if (!host) return;
    host.innerHTML = '';
    var cur = st.study.currentPlan;

    if (!cur) {
      host.appendChild(U.h('a', { class: 'tl-card tl-card--link', href: 'study.html#plan' }, [
        U.h('div', { class: 'tl-empty', text: '尚未创建学习计划主题 · 点击前往学习页添加' })
      ]));
      return;
    }

    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var dim = new Date(y, m + 1, 0).getDate();
    var prefix = y + '-' + String(m + 1).padStart(2, '0');
    var days = [];
    for (var d = 1; d <= dim; d++) {
      var key = prefix + '-' + String(d).padStart(2, '0');
      days.push({ d: key, on: cur.checkins.indexOf(key) > -1, today: key === st.today });
    }
    var hitCount = cur.checkins.filter(function (x) { return x.slice(0, 7) === prefix; }).length;

    var panel = U.h('a', { class: 'tl-card tl-card--link', href: 'study.html#plan' }, [
      U.h('div', { class: 'tl-card__head' }, [
        U.h('span', { class: 'tl-card__title', text: '「' + cur.name + '」本月打卡进度' }),
        U.h('span', { class: 'tl-card__go', text: '查看 →' })
      ])
    ]);
    panel.appendChild(U.h('div', { class: 'tl-topic-row' }, [
      U.h('span', { class: 'tl-topic-row__name', title: cur.name, text: cur.name }),
      U.heatmap(days),
      U.h('span', { class: 'tl-topic-row__rate', text: hitCount + '/' + dim + ' 天' })
    ]));
    host.appendChild(panel);
  }

  /* ---------------- 最近操作记录 ---------------- */
  function renderActivity() {
    var host = el('ov-activity');
    if (!host) return;
    host.innerHTML = '';
    var logs = TL.Store.get('activity').logs.slice(0, 8);

    if (!logs.length) {
      host.appendChild(U.h('div', { class: 'tl-empty', text: '暂无操作记录，所有操作都会自动留痕并同步到私有仓库' }));
      return;
    }

    var CAT = { work: '工作', study: '学习', media: '图片', activity: '系统' };
    var list = U.h('div', { class: 'tl-panel' }, [
      U.h('div', { class: 'tl-activity' }, logs.map(function (l) {
        return U.h('div', { class: 'tl-activity__item' }, [
          U.h('span', { class: 'tl-activity__time', text: U.fmtTime(l.ts) }),
          U.h('span', { class: 'tl-tag tl-tag--sub', text: CAT[l.cat] || l.cat }),
          U.h('span', { class: 'tl-activity__text', title: l.action, text: l.action }),
          U.h('span', { class: 'tl-muted', text: l.device || '' })
        ]);
      }))
    ]);
    host.appendChild(list);
  }

  /* ---------------- 渲染入口 ---------------- */
  function render() {
    var st = TL.Store.stats();
    var d = el('ov-work-date');
    if (d) d.textContent = st.today;
    renderSyncBar();
    renderWork(st);
    renderStudyMetrics(st);
    renderTopics(st);
    renderActivity();
  }

  TL.pages.overview = {
    init: function () {
      U = TL.UI;
      render();
      // 同步状态变化时只刷新状态条，避免整页重绘
      TL.Sync.on(function () { try { renderSyncBar(); } catch (e) {} });
    },
    render: render
  };
})(window.TL);
