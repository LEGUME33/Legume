/* =====================================================================
   TEST-LEGUME · 学习模块 · 学习计划（第一个子页面）
   ---------------------------------------------------------------------
   主题驱动结构：每个学习计划主题独立承载五大板块
     · 年度模板 / 月度目标 / 网盘课程库 / 今日计划 / 30 天打卡
   预设内置 3 个主题（AI · 产品经理 · 大数据模型），支持自定义新增，
   主题与全部数据走 TL.Store.update → localStorage + GitHub 双端同步。
   今日热点为后续子页面，本文件仅保留占位入口。
   ===================================================================== */
window.TL = window.TL || {};
window.TL.pages = window.TL.pages || {};

(function (TL) {
  'use strict';

  var U;
  var PAGES = [
    { key: 'plan', label: '学习计划' },
    { key: 'hotspot', label: '今日热点' }
  ];
  var page = 'plan';
  var planId = '';  // 当前学习计划主题（内存镜像，持久化于 study.currentPlanId）
  var planTodayView = 'today'; // 'today' | 'month' | 'week' —— 今日计划视图
  var planTodayDay = '';       // 日历视图中选中的日期（YYYY-MM-DD）
  var checkinView = 'month';   // 'month' | 'week' —— 打卡视图

  function el(id) { return document.getElementById(id); }
  function today() { return TL.Store.todayKey(); }
  function getStudy() { return TL.Store.get('study'); }

  function getPlan() {
    var s = getStudy();
    if (planId && s.plans.some(function (p) { return p.id === planId; })) return s.plans.filter(function (p) { return p.id === planId; })[0];
    return (s.plans[0]) || null;
  }
  function updatePlan(mutator, action) {
    TL.Store.update('study', function (d) {
      var p = d.plans.filter(function (x) { return x.id === planId; })[0];
      if (p) mutator(p);
      d.currentPlanId = planId;
    }, action);
  }
  function setPlan(id) {
    planId = id;
    TL.Store.update('study', function (d) { d.currentPlanId = id; }, '切换学习计划主题');
    renderPlan();
  }

  /* ------------------------------ 通用：板块卡片 ------------------------------ */
  function board(title, sub, body, tip) {
    var head = U.h('div', { class: 'sd-board__head' }, [
      U.h('span', { class: 'sd-board__accent' }),
      U.h('div', { class: 'sd-board__titles' }, [
        U.h('h3', { class: 'sd-board__title', text: title }),
        sub ? U.h('span', { class: 'sd-board__sub', text: sub }) : null
      ])
    ]);
    if (tip) head.appendChild(U.h('span', { class: 'sd-board__tip', text: tip }));
    return U.h('section', { class: 'sd-board' }, [
      head,
      U.h('div', { class: 'sd-board__body' }, [body])
    ]);
  }

  /* ------------------------------ 主题切换条 ------------------------------ */
  function renderPlanBar() {
    var host = el('sd-plan-bar');
    if (!host) return;
    host.innerHTML = '';
    var s = getStudy();
    var wrap = U.h('div', { class: 'sd-plan-bar__inner' });
    s.plans.forEach(function (p) {
      wrap.appendChild(U.h('button', {
        class: 'sd-plan-chip' + (p.id === planId ? ' is-active' : ''),
        text: p.name,
        onClick: function () { setPlan(p.id); }
      }));
    });
    wrap.appendChild(U.h('button', { class: 'sd-plan-chip sd-plan-chip--add', text: '+ 新建主题', onClick: addPlan }));
    host.appendChild(wrap);
  }

  function addPlan() {
    var input = U.h('input', { class: 'tl-input', placeholder: '主题名称，如「前端工程化」' });
    U.modal({
      title: '新建学习计划主题',
      content: U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '主题名称' }), input]),
      actions: [
        { label: '取消', type: 'ghost', onClick: function (mm) { mm.close(); } },
        { label: '创建', type: 'primary', onClick: function (mm) {
          var name = input.value.trim();
          if (!name) return;
          TL.Store.update('study', function (d) {
            var p = { id: TL.Store.uid('pl'), name: name, builtin: false, createdAt: Date.now(), annual: { goal: '' }, monthly: [], courses: [], checkins: [], assignments: {} };
            d.plans.push(p);
            d.currentPlanId = p.id;
            planId = p.id;
          }, '新建学习计划主题「' + name + '」');
          mm.close();
          renderPlan();
        } }
      ]
    });
  }

  /* ------------------------------ 板块一：年度模板 ------------------------------ */
  function boardAnnual(p) {
    var ta = U.h('textarea', { class: 'tl-textarea sd-annual__area', placeholder: '写下今年的学习主题、目标与节奏规划…' }, p.annual.goal || '');
    ta.addEventListener('input', function () {
      updatePlan(function (pl) { pl.annual.goal = ta.value; }, '编辑年度模板');
    });
    return board('年度模板', 'Yearly Template', ta);
  }

  /* ------------------------------ 板块二：月度目标 ------------------------------ */
  function boardMonthly(p) {
    var body = U.h('div', {});
    var input = U.h('input', { class: 'tl-input', placeholder: '新增一个本月学习目标，回车提交' });
    function add() {
      var t = input.value.trim(); if (!t) return;
      updatePlan(function (pl) { pl.monthly.push({ id: TL.Store.uid('mo'), title: t, done: false }); }, '新增月度目标「' + t + '」');
      input.value = '';
      renderMonthlyList(list, p);
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    body.appendChild(U.h('div', { class: 'tl-inline-form', style: 'margin-bottom:12px' }, [
      input, U.h('button', { class: 'tl-btn tl-btn--primary tl-btn--sm', text: '添加', onClick: add })
    ]));
    var list = U.h('div', { class: 'sd-monthly__list' });
    body.appendChild(list);
    renderMonthlyList(list, p);
    return board('月度目标', 'Monthly Goals', body);
  }
  function renderMonthlyList(list, p) {
    list.innerHTML = '';
    if (!p.monthly.length) { list.appendChild(U.h('div', { class: 'tl-empty', text: '暂无月度目标' })); return; }
    p.monthly.forEach(function (m) {
      list.appendChild(U.taskItem({
        text: m.title, done: m.done,
        onToggle: function (next) { updatePlan(function (pl) { var it = pl.monthly.filter(function (x) { return x.id === m.id; })[0]; if (it) it.done = next; }, (next ? '完成' : '重开') + '月度目标'); },
        onDelete: function () {
          U.confirm('删除目标？', '「' + m.title + '」将被移除。', function () {
            updatePlan(function (pl) { pl.monthly = pl.monthly.filter(function (x) { return x.id !== m.id; }); }, '删除月度目标');
            renderMonthlyList(list, p);
          });
        }
      }));
    });
  }

  /* ------------------------------ 板块三：网盘课程库 ------------------------------ */
  function boardCourses(p) {
    var body = U.h('div', {});
    var nameI = U.h('input', { class: 'tl-input', placeholder: '课程名称' });
    var linkI = U.h('input', { class: 'tl-input', placeholder: '百度网盘分享链接（https://pan.baidu.com/...）' });
    function add() {
      var n = nameI.value.trim(); if (!n) return;
      var l = linkI.value.trim();
      updatePlan(function (pl) { pl.courses.push({ id: TL.Store.uid('cr'), title: n, link: l }); }, '新增网盘课程「' + n + '」');
      nameI.value = ''; linkI.value = '';
      renderCoursesList(list, p);
    }
    body.appendChild(U.h('div', { class: 'sd-course-form' }, [
      U.h('div', { class: 'sd-course-form__row' }, [nameI]),
      U.h('div', { class: 'sd-course-form__row' }, [linkI, U.h('button', { class: 'tl-btn tl-btn--primary', text: '添加课程', onClick: add })])
    ]));
    var list = U.h('div', {});
    body.appendChild(list);
    renderCoursesList(list, p);
    return board('网盘课程库', 'Netdisk Course Library', body, '独立长期学习目标仓库 · 绑定单条百度网盘链接');
  }
  function renderCoursesList(list, p) {
    list.innerHTML = '';
    if (!p.courses.length) { list.appendChild(U.h('div', { class: 'tl-empty', text: '课程库为空，添加你的第一条网盘课程' })); return; }
    p.courses.forEach(function (c) {
      var jump = c.link ? U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '打开网盘', onClick: function (e) { e.stopPropagation(); window.open(c.link, '_blank', 'noopener'); } }) : null;
      var linkNode = c.link
        ? U.h('a', { class: 'sd-course__link', href: c.link, target: '_blank', rel: 'noopener', text: c.link, onClick: function (e) { e.stopPropagation(); } })
        : U.h('span', { class: 'sd-course__link sd-course__link--empty', text: '未绑定链接' });
      list.appendChild(U.h('div', { class: 'sd-course' }, [
        U.h('div', { class: 'sd-course__main' }, [
          U.h('span', { class: 'sd-course__title', text: c.title }),
          linkNode
        ]),
        U.h('div', { class: 'sd-course__actions' }, [
          jump,
          U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '编辑', onClick: function () { editCourse(c, p, list); } }),
          U.h('button', { class: 'tl-task__del', title: '删除', html: '&times;', onClick: function () {
            U.confirm('删除课程？', '「' + c.title + '」将从课程库移除。', function () {
              updatePlan(function (pl) { pl.courses = pl.courses.filter(function (x) { return x.id !== c.id; }); }, '删除网盘课程');
              renderCoursesList(list, p);
            });
          } })
        ])
      ]));
    });
  }
  function editCourse(c, p, list) {
    var nameI = U.h('input', { class: 'tl-input', value: c.title });
    var linkI = U.h('input', { class: 'tl-input', value: c.link || '' });
    U.modal({
      title: '编辑课程',
      content: U.h('div', {}, [
        U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '课程名称' }), nameI]),
        U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '百度网盘链接' }), linkI])
      ]),
      actions: [
        { label: '取消', type: 'ghost', onClick: function (mm) { mm.close(); } },
        { label: '保存', type: 'primary', onClick: function (mm) {
          var n = nameI.value.trim(); if (!n) return;
          updatePlan(function (pl) { var it = pl.courses.filter(function (x) { return x.id === c.id; })[0]; if (it) { it.title = n; it.link = linkI.value.trim(); } }, '编辑网盘课程');
          mm.close();
          renderCoursesList(list, p);
        } }
      ]
    });
  }

  /* ------------------------------ 板块四：今日计划（支持 今日 / 月历 / 周历 分布） ------------------------------ */
  function boardToday(p) {
    var body = U.h('div', {});
    renderTodayBody(body, p);
    return board('今日计划', 'Today Plan', body, '按天分配课程 · 完成后跳转按钮与文字置灰');
  }
  function renderTodayBody(body, p) {
    body.innerHTML = '';
    if (!planTodayDay) planTodayDay = today();

    // 视图切换：今日 / 月历 / 周历（自然周=周一~周日，自然月=当月 1~末日）
    function segBtn(key, label) {
      return U.h('button', {
        class: 'tl-seg__btn' + (planTodayView === key ? ' is-active' : ''),
        text: label,
        onClick: function () { planTodayView = key; renderTodayBody(body, p); }
      });
    }
    body.appendChild(U.h('div', { class: 'tl-review-view' }, [
      U.h('div', { class: 'tl-seg' }, [segBtn('today', '今日'), segBtn('month', '月历'), segBtn('week', '周历')])
    ]));

    if (planTodayView === 'today') {
      planTodayDay = today();
      renderDayPlan(body, p, planTodayDay);
      return;
    }

    // 日历视图：每格显示该日分配课程数 + 完成数
    body.appendChild(U.calendar({
      view: planTodayView === 'week' ? 'week' : 'month',
      selected: planTodayDay,
      cellContent: function (key) {
        var a = p.assignments[key] || [];
        if (!a.length) return null;
        var done = a.filter(function (x) { return x.done; }).length;
        return U.h('span', { class: 'sd-cell-count', text: a.length + '课 · ' + done + '✓' });
      },
      cellClass: function (key) {
        var a = p.assignments[key] || [];
        if (!a.length) return '';
        return a.every(function (x) { return x.done; }) ? 'is-all-done' : '';
      },
      onSelect: function (key) { planTodayDay = key; renderTodayBody(body, p); }
    }));
    body.appendChild(U.h('div', { class: 'sd-day-label', text: '查看 / 分配：' + planTodayDay }));
    renderDayPlan(body, p, planTodayDay);
  }
  function renderDayPlan(body, p, tk) {
    var asg = p.assignments[tk] || [];

    var attach = U.h('div', { class: 'sd-attach' }, [U.h('div', { class: 'tl-sub', text: '从课程库勾选，分配为 ' + tk + ' 的学习任务（同一课程可分配到不同日期）' })]);
    if (!p.courses.length) {
      attach.appendChild(U.h('div', { class: 'tl-empty', text: '课程库暂无课程，先到「网盘课程库」添加' }));
    } else {
      var chips = [];
      p.courses.forEach(function (c) {
        var on = asg.some(function (a) { return a.courseId === c.id; });
        chips.push(U.h('button', {
          class: 'sd-attach__chip' + (on ? ' is-on' : ''),
          text: c.title,
          onClick: function () { toggleAssign(p, c, tk, body); }
        }));
      });
      attach.appendChild(U.h('div', { class: 'sd-attach__list' }, chips));
    }
    body.appendChild(attach);

    var list = U.h('div', {});
    body.appendChild(list);
    renderTodayList(list, p, tk);
  }
  function toggleAssign(p, c, tk, body) {
    updatePlan(function (pl) {
      pl.assignments[tk] = pl.assignments[tk] || [];
      var arr = pl.assignments[tk];
      var i = arr.map(function (a) { return a.courseId; }).indexOf(c.id);
      if (i > -1) arr.splice(i, 1);
      else arr.push({ id: TL.Store.uid('as'), courseId: c.id, done: false });
    }, '分配/取消课程');
    renderTodayBody(body, p);
  }
  function renderTodayList(list, p, tk) {
    list.innerHTML = '';
    var asg = p.assignments[tk] || [];
    if (!asg.length) { list.appendChild(U.h('div', { class: 'tl-empty', text: (tk === today() ? '今日' : tk) + '尚未分配课程任务' })); return; }
    asg.forEach(function (a) {
      var c = p.courses.filter(function (x) { return x.id === a.courseId; })[0];
      var title = a.title || (c ? c.title : '（课程已移除）');
      var link = (a.link != null && a.link !== '') ? a.link : (c ? c.link : '');
      var body = U.h('div', { class: 'sd-task__body' }, [
        U.h('span', { class: 'sd-task__title', text: title }),
        a.note ? U.h('span', { class: 'sd-task__note', text: a.note }) : null
      ]);
      list.appendChild(U.h('div', { class: 'sd-task' + (a.done ? ' is-done' : '') }, [
        U.h('span', { class: 'tl-check', role: 'checkbox', tabindex: '0', 'aria-checked': String(!!a.done), title: '完成',
          onClick: function () { toggleTodayDone(p, a, tk, list); } }),
        body,
        link ? U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm sd-task__jump', text: '网盘', onClick: function (e) { e.stopPropagation(); window.open(link, '_blank', 'noopener'); } }) : null,
        U.h('button', { class: 'tl-task__edit', title: '编辑', html: '&#9998;', onClick: function (e) { e.stopPropagation(); editTask(p, a, tk, list); } }),
        U.h('button', { class: 'tl-task__del', title: '移除', html: '&times;', onClick: function () {
          updatePlan(function (pl) { pl.assignments[tk] = (pl.assignments[tk] || []).filter(function (x) { return x.id !== a.id; }); }, '移除任务');
          renderTodayList(list, p, tk);
        } })
      ]));
    });
  }
  function toggleTodayDone(p, a, tk, list) {
    updatePlan(function (pl) {
      var arr = pl.assignments[tk] || [];
      var it = arr.filter(function (x) { return x.id === a.id; })[0];
      if (it) it.done = !it.done;
    }, (a.done ? '取消完成' : '完成') + '课程');
    renderTodayList(list, p, tk);
  }

  /* 编辑单条今日学习任务：名称、绑定执行日期、课程链接、学习备注
     写覆盖字段（title/link/note）保留 a.done 原有进度；移动日期触发二次确认；
     打卡日历按 assignments 实时刷新。 */
  function editTask(p, a, tk, list) {
    var c = p.courses.filter(function (x) { return x.id === a.courseId; })[0];
    var curTitle = a.title || (c ? c.title : '');
    var curLink = (a.link != null && a.link !== '') ? a.link : (c ? c.link : '');
    var nameI = U.h('input', { class: 'tl-input', value: curTitle });
    var dateI = U.h('input', { class: 'tl-input', type: 'date', value: tk });
    var linkI = U.h('input', { class: 'tl-input', value: curLink || '' });
    var noteI = U.h('textarea', { class: 'tl-textarea', placeholder: '学习备注（选填）', text: a.note || '' });
    var content = U.h('div', {}, [
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '任务名称' }), nameI]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '绑定执行日期' }), dateI]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '课程链接' }), linkI]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '学习备注' }), noteI])
    ]);
    var m = U.modal({
      title: '编辑学习任务',
      content: content,
      actions: [
        { label: '取消', type: 'ghost', onClick: function (mm) { mm.close(); } },
        { label: '保存', type: 'primary', onClick: function (mm) {
          var name = nameI.value.trim();
          var date = dateI.value || tk;
          var link = linkI.value.trim();
          var note = noteI.value;
          var commit = function () {
            // 保留 a.done（不清除学习进度）；仅覆盖展示字段，可整条移动日期
            updatePlan(function (pl) {
              var oldArr = pl.assignments[tk] || [];
              var idx = oldArr.map(function (x) { return x.id; }).indexOf(a.id);
              if (idx > -1) oldArr.splice(idx, 1);
              pl.assignments[date] = pl.assignments[date] || [];
              pl.assignments[date].push(a);
              a.title = name; a.link = link; a.note = note;
            }, '编辑学习任务');
            mm.close();
          };
          // 防误操作：修改执行日期属「大幅度修改」，二次确认后再提交
          if (date !== tk) {
            U.confirm('确认移动任务日期？', '「' + (name || curTitle) + '」将从 ' + tk + ' 移动到 ' + date + '，学习打卡日历将自动同步更新。', commit);
          } else {
            commit();
          }
        } }
      ]
    });
  }

  /* ------------------------------ 板块五：30 天打卡（月历 / 周历 视图） ------------------------------ */
  function boardCheckin(p) {
    var body = U.h('div', {});
    renderCheckinBody(body, p);
    return board('30 天打卡', '30-Day Check-in', body, '当月每日色块 · 今日课程全完成方可打卡');
  }
  function renderCheckinBody(body, p) {
    body.innerHTML = '';
    var tk = today();
    var now = new Date();
    var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var monthPrefix = tk.slice(0, 7);
    var hit = p.checkins.filter(function (d) { return d.slice(0, 7) === monthPrefix; }).length;
    var asg = p.assignments[tk] || [];
    var allDone = asg.length > 0 && asg.every(function (a) { return a.done; });

    // 视图切换：月历 / 周历
    function segBtn(key, label) {
      return U.h('button', {
        class: 'tl-seg__btn' + (checkinView === key ? ' is-active' : ''),
        text: label,
        onClick: function () { checkinView = key; renderCheckinBody(body, p); }
      });
    }
    body.appendChild(U.h('div', { class: 'tl-review-view' }, [
      U.h('div', { class: 'tl-seg' }, [segBtn('month', '月历'), segBtn('week', '周历')])
    ]));
    body.appendChild(U.h('div', { class: 'sd-checkin-metric' }, [
      U.h('span', { class: 'sd-checkin-metric__value', text: String(hit) }),
      U.h('span', { class: 'sd-checkin-metric__sep', text: '/' }),
      U.h('span', { class: 'sd-checkin-metric__total', text: String(dim) }),
      U.h('span', { class: 'sd-checkin-metric__label', text: '天已打卡' })
    ]));

    body.appendChild(U.calendar({
      view: checkinView === 'week' ? 'week' : 'month',
      selected: tk,
      cellClass: function (key) {
        var on = p.checkins.indexOf(key) > -1;
        var ready = key === tk && !on && allDone;
        return (on ? 'is-on ' : '') + (ready ? 'is-ready' : '');
      },
      cellContent: function (key) {
        if (p.checkins.indexOf(key) > -1) return U.h('span', { class: 'sd-checkin-mark', text: '✓' });
        if (key === tk && allDone && p.checkins.indexOf(key) < 0) return U.h('span', { class: 'sd-checkin-mark sd-checkin-mark--ready', text: '打卡' });
        return null;
      },
      cellClickable: function (key) { return key === tk; },
      onSelect: function (key) {
        if (key !== tk) return;
        var on = p.checkins.indexOf(tk) > -1;
        if (on) {
          updatePlan(function (pl) { pl.checkins = pl.checkins.filter(function (x) { return x !== tk; }); }, '撤销打卡');
        } else if (allDone) {
          updatePlan(function (pl) { if (pl.checkins.indexOf(tk) < 0) pl.checkins.push(tk); }, '打卡「' + (getPlan() && getPlan().name) + '」' + tk);
        } else {
          U.toast('请先完成今日全部课程任务再打卡', 'warning');
        }
        renderCheckinBody(body, p);
      }
    }));
    body.appendChild(U.h('div', { class: 'tl-note', text: '规则：当日分配的网盘课程全部勾选完成后，才可点击当天色块打卡；打卡状态自动同步 GitHub 云端。' }));
  }

  /* ------------------------------ 学习计划渲染入口 ------------------------------ */
  function renderPlan() {
    renderPlanBar();
    var host = el('sd-plan-grid');
    if (!host) return;
    host.innerHTML = '';
    var p = getPlan();
    if (!p) { host.appendChild(U.h('div', { class: 'tl-empty', text: '暂无学习计划主题，点击右上角新建' })); return; }
    host.appendChild(boardAnnual(p));
    host.appendChild(boardMonthly(p));
    host.appendChild(boardCourses(p));
    host.appendChild(boardToday(p));
    host.appendChild(boardCheckin(p));
  }

  /* ------------------------------ 今日热点：按当前学习计划主题每日自动推送 ------------------------------ */
  /* 静态站点无后端：热点来源为按主题归类的真实可跳转外链池；每日按「主题 + 日期」种子轮转选出 5 条推送。
     已读状态随条目 id 持久化（本地 + GitHub），跨日 / 跨主题切换都不丢失。 */
  var HOTSPOT_POOL = {
    'AI': [
      { title: 'OpenAI 官方博客', url: 'https://openai.com/news/' },
      { title: 'Anthropic 研究', url: 'https://www.anthropic.com/research' },
      { title: 'Google DeepMind', url: 'https://deepmind.google/' },
      { title: 'Hugging Face', url: 'https://huggingface.co/' },
      { title: 'PyTorch 官方文档', url: 'https://pytorch.org/' },
      { title: 'TensorFlow 官方文档', url: 'https://www.tensorflow.org/' },
      { title: 'arXiv 人工智能最新论文', url: 'https://arxiv.org/list/cs.AI/recent' },
      { title: 'Papers With Code', url: 'https://paperswithcode.com/' },
      { title: 'The Batch（deeplearning.ai）', url: 'https://www.deeplearning.ai/the-batch/' },
      { title: 'Machine Learning Mastery', url: 'https://machinelearningmastery.com/' }
    ],
    '产品经理': [
      { title: '人人都是产品经理', url: 'https://www.woshipm.com/' },
      { title: '鸟哥笔记', url: 'https://www.niaogebiji.com/' },
      { title: 'GrowingIO 增长博客', url: 'https://www.growingio.com/' },
      { title: 'NN/g 尼尔森诺曼集团', url: 'https://www.nngroup.com/' },
      { title: 'Product Hunt', url: 'https://www.producthunt.com/' },
      { title: '36氪', url: 'https://36kr.com/' },
      { title: '极客时间', url: 'https://time.geekbang.org/' },
      { title: 'QuestMobile 研究报告', url: 'https://www.questmobile.com.cn/' },
      { title: '腾讯 CDC', url: 'https://cdc.tencent.com/' },
      { title: '阿里研究院', url: 'https://www.aliresearch.com/' }
    ],
    '大数据模型': [
      { title: 'Apache Spark 官网', url: 'https://spark.apache.org/' },
      { title: 'Apache Kafka 官网', url: 'https://kafka.apache.org/' },
      { title: 'ClickHouse 官网', url: 'https://clickhouse.com/' },
      { title: 'dbt 官网', url: 'https://www.getdbt.com/' },
      { title: 'Snowflake 官网', url: 'https://www.snowflake.com/' },
      { title: 'Apache Flink 官网', url: 'https://flink.apache.org/' },
      { title: 'Databricks 官网', url: 'https://www.databricks.com/' },
      { title: 'ClickHouse 文档', url: 'https://clickhouse.com/docs' },
      { title: 'AWS 大数据', url: 'https://aws.amazon.com/big-data/' },
      { title: 'Kaggle', url: 'https://www.kaggle.com/' }
    ],
    '__default': [
      { title: 'GitHub', url: 'https://github.com/' },
      { title: 'Hacker News', url: 'https://news.ycombinator.com/' },
      { title: '少数派', url: 'https://sspai.com/' },
      { title: '36氪', url: 'https://36kr.com/' },
      { title: '掘金', url: 'https://juejin.cn/' },
      { title: 'InfoQ', url: 'https://www.infoq.cn/' }
    ]
  };

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seededShuffle(arr, seed) {
    var a = arr.slice(), r = seed >>> 0;
    for (var i = a.length - 1; i > 0; i--) {
      r = (r * 1664525 + 1013904223) >>> 0;
      var j = r % (i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function poolFor(planName) { return HOTSPOT_POOL[planName] || HOTSPOT_POOL['__default']; }

  /* 确保当前主题当日已生成满 5 条推送热点（按 themeId + date 去重，不重置已读标记）。
     关键：一次性批量写入（单条 update），避免在 app.js 的「数据变更 → 重绘当前页」监听下
     因多次 emit('change') 触发 renderHotspots 重入，导致热点被重复生成、DOM 被叠加。 */
  function ensureDailyHotspots(plan) {
    var tk = today();
    var pool = poolFor(plan.name);
    if (!pool.length) return;
    var all = getStudy().hotspots;
    var existing = all.filter(function (h) { return h.source === 'push' && h.themeId === plan.id && h.date === tk; });
    if (existing.length >= 5) return;
    var used = {};
    existing.forEach(function (h) { used[h.url] = true; });
    var picks = seededShuffle(pool, hashStr(plan.id + '@' + tk));
    var need = 5 - existing.length, added = 0;
    var toAdd = [];
    for (var i = 0; i < picks.length && added < need; i++) {
      if (used[picks[i].url]) continue;
      used[picks[i].url] = true;
      toAdd.push({ id: TL.Store.uid('hs'), title: picks[i].title, url: picks[i].url, source: 'push', themeId: plan.id, themeName: plan.name, date: tk, read: false, ts: Date.now() });
      added++;
    }
    if (toAdd.length) {
      TL.Store.update('study', function (d) {
        toAdd.forEach(function (h) { d.hotspots.unshift(h); });
      }, '推送今日热点 ' + toAdd.length + ' 条');
    }
  }

  function hotspotItem(hs, deletable) {
    var kids = [
      U.h('span', { class: 'tl-check', role: 'checkbox', tabindex: '0', 'aria-checked': String(!!hs.read), title: '标记为已读' }),
      U.h('a', { class: 'tl-task__text tl-hotspot__link', href: hs.url, target: '_blank', rel: 'noopener', text: hs.title }),
      U.h('span', { class: 'tl-task__meta', text: hs.source === 'manual' ? '收录' : '推送' })
    ];
    if (deletable) kids.push(U.h('button', { class: 'tl-task__del', title: '删除', html: '&times;', onClick: function (e) { e.stopPropagation(); removeHotspot(hs); } }));
    var node = U.h('div', { class: 'tl-task' + (hs.read ? ' is-done' : '') }, kids);

    function toggle() {
      var next = !node.classList.contains('is-done');
      node.classList.toggle('is-done', next);
      node.querySelector('.tl-check').setAttribute('aria-checked', String(next));
      TL.Store.update('study', function (d) {
        var it = d.hotspots.filter(function (x) { return x.id === hs.id; })[0];
        if (it) it.read = next;
      }, (next ? '标记已读' : '标记未读') + '「' + hs.title + '」');
    }
    node.querySelector('.tl-check').addEventListener('click', toggle);
    node.querySelector('.tl-check').addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    return node;
  }

  function removeHotspot(hs) {
    U.confirm('删除热点？', '「' + hs.title + '」将被移除。', function () {
      TL.Store.update('study', function (d) { d.hotspots = d.hotspots.filter(function (x) { return x.id !== hs.id; }); }, '删除热点「' + hs.title + '」');
      renderHotspots();
    });
  }

  /* 重入保护：app.js 在数据变更时会重绘当前页；ensureDailyHotspots 写入期间触发 change 事件，
     若不加保护会导致 renderHotspots 在自身渲染过程中被再次调用（热点重复生成、DOM 叠加）。 */
  var hotspotRendering = false;
  function renderHotspots() {
    if (hotspotRendering) return;
    hotspotRendering = true;
    try {
    var host = el('sd-hotspots');
    if (!host) return;
    host.innerHTML = '';
    var s = getStudy();
    var p = getPlan();
    if (!p) { host.appendChild(U.h('div', { class: 'tl-empty', text: '暂无学习计划主题，请先到「学习计划」新建' })); return; }

    // 主题切换条（今日热点按当前选中的学习计划主题推送）
    var themesHost = el('sd-hotspot-themes');
    if (themesHost) {
      themesHost.innerHTML = '';
      s.plans.forEach(function (pl) {
        themesHost.appendChild(U.h('button', {
          class: 'sd-plan-chip' + (pl.id === planId ? ' is-active' : ''),
          text: pl.name,
          onClick: function () { setPlan(pl.id); renderHotspots(); }
        }));
      });
    }

    ensureDailyHotspots(p);
    s = getStudy();
    var tk = today();
    var pushItems = s.hotspots.filter(function (h) { return h.source === 'push' && h.themeId === p.id && h.date === tk; });
    var readCnt = pushItems.filter(function (h) { return h.read; }).length;

    var pushBody = U.h('div', {});
    pushBody.appendChild(U.h('div', { class: 'sd-hs-count', text: '今日已读 ' + readCnt + ' / ' + pushItems.length + ' · 每日 5 条，按「' + p.name + '」主题推送' }));
    if (!pushItems.length) {
      pushBody.appendChild(U.h('div', { class: 'tl-empty', text: '今日热点生成中…' }));
    } else {
      var box = U.h('div', {});
      pushItems.forEach(function (h) { box.appendChild(hotspotItem(h, false)); });
      pushBody.appendChild(box);
    }
    host.appendChild(board('今日热点推送', 'Daily Hotspots', pushBody, '根据当前学习计划主题，每日自动推送 5 条外部热点 · 勾选已读后整条置灰'));

    // 手动收录区
    var manualBody = U.h('div', {});
    var titleI = U.h('input', { class: 'tl-input', placeholder: '热点标题' });
    var urlI = U.h('input', { class: 'tl-input', placeholder: '链接（可选，留空仅作记录）' });
    function addManual() {
      var t = titleI.value.trim(); if (!t) return;
      TL.Store.update('study', function (d) {
        d.hotspots.unshift({ id: TL.Store.uid('hs'), title: t, url: urlI.value.trim(), source: 'manual', themeId: p.id, themeName: p.name, date: tk, read: false, ts: Date.now() });
      }, '收录热点「' + t + '」');
      titleI.value = ''; urlI.value = '';
      renderHotspots();
    }
    titleI.addEventListener('keydown', function (e) { if (e.key === 'Enter') addManual(); });
    manualBody.appendChild(U.h('div', { class: 'tl-inline-form', style: 'margin-bottom:12px' }, [
      titleI, urlI, U.h('button', { class: 'tl-btn tl-btn--primary', text: '收录', onClick: addManual })
    ]));
    var manualItems = s.hotspots.filter(function (h) { return h.source === 'manual'; });
    var mbox = U.h('div', {});
    if (!manualItems.length) mbox.appendChild(U.h('div', { class: 'tl-empty', text: '暂无手动收录的热点' }));
    else manualItems.forEach(function (h) { mbox.appendChild(hotspotItem(h, true)); });
    manualBody.appendChild(mbox);
    host.appendChild(board('我的热点收录', 'My Collection', manualBody, '手动添加并长期保存的热点链接'));
    } finally {
      hotspotRendering = false;
    }
  }

  /* ------------------------------ 子页面切换 ------------------------------ */
  function switchPage(key) {
    page = key;
    U.$$('#sd-pages .tl-tab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-page') === key);
    });
    if (el('sd-plan-section')) el('sd-plan-section').style.display = key === 'plan' ? '' : 'none';
    if (el('sd-hotspot-section')) el('sd-hotspot-section').style.display = key === 'hotspot' ? '' : 'none';
    if (key === 'plan') renderPlan(); else renderHotspots();
  }

  TL.pages.study = {
    init: function () {
      U = TL.UI;
      var pages = el('sd-pages');
      PAGES.forEach(function (pg) {
        pages.appendChild(U.h('button', { class: 'tl-tab', 'data-page': pg.key, text: pg.label, onClick: function () { switchPage(pg.key); } }));
      });
      var s = getStudy();
      planId = s.currentPlanId || (s.plans[0] && s.plans[0].id) || '';
      var hash = (location.hash || '').replace('#', '');
      switchPage(PAGES.filter(function (p) { return p.key === hash; }).length ? hash : 'plan');
    },
    render: function () { if (page === 'plan') renderPlan(); else renderHotspots(); }
  };
})(window.TL);
