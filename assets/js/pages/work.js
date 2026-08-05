/* =====================================================================
   TEST-LEGUME · 工作模块
   ---------------------------------------------------------------------
   三个子页：工作总结 / 每日计划 / 复盘总结
     · 工作总结：月度任务总结（真实日历看板 + 周计划），已作为本页第 1 个标签页
     · 每日计划：日 / 周 / 月 三种周期，统一勾选交互 + 重要程度（高/中/低）；
                 原「工作待办」已整体并入本模块，历史数据自动迁移为日计划
     · 复盘总结：三类首销复盘模板 + 图片识图 + 自动运算 + AI 综合分析 + 飞书文档
   全局规则：莫兰迪色系、统一圆角、浏览器本地 + GitHub 双端同步，全部沿用。
   ===================================================================== */
window.TL = window.TL || {};
window.TL.pages = window.TL.pages || {};

(function (TL) {
  'use strict';

  var U;
  var TABS = [
    { key: 'monthly', label: '工作总结' },
    { key: 'plans',   label: '每日计划' },
    { key: 'reviews', label: '复盘总结' }
  ];
  var SCOPES = [{ k: 'day', t: '日计划' }, { k: 'week', t: '周计划' }, { k: 'month', t: '月计划' }];
  var LEVELS = [
    { k: 'high', label: '高优先级', sub: '重要紧急' },
    { k: 'mid',  label: '中优先级', sub: '常规重点' },
    { k: 'low',  label: '低优先级', sub: '普通事项' }
  ];

  var current = 'plans';
  var scope = 'day';
  var reviewFilter = 'all'; // 'all' | 'day' | 'week' | 'month' —— 复盘列表类型筛选
  var planDates = { day: null, week: null, month: null }; // 各周期当前选定绑定日期（YYYY-MM-DD）

  function el(id) { return document.getElementById(id); }
  function saveReview(r, action) {
    r.summary = TL.Review.summaryOf(r);
    r.ts = r.ts || Date.now();
    r.updatedAt = Date.now();
    TL.Store.update('work', function (d) {
      for (var i = 0; i < d.reviews.length; i++) {
        if (d.reviews[i].id === r.id) { d.reviews[i] = r; break; }
      }
    }, action || '编辑复盘');
  }

  /* ============================ 日期 / 周期 / 等级 工具 ============================ */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function parseKey(key) { var p = (key || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function keyOfDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function startOfWeek(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; }
  function endOfWeek(d) { var s = startOfWeek(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); }
  function weekBounds(key) { var s = startOfWeek(parseKey(key)); return { mon: s, sun: endOfWeek(s) }; }
  function scopeLabel(k) { return ({ day: '日计划', week: '周计划', month: '月计划' })[k] || '计划'; }
  function levelLabel(k) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].k === k) return LEVELS[i].label; return '低优先级'; }
  function periodText(sc, key) {
    if (sc === 'month') return key.slice(0, 7);
    if (sc === 'week') { var b = weekBounds(key); return keyOfDate(b.mon) + ' ~ ' + keyOfDate(b.sun); }
    return fmtDateKey(key);
  }
  /* 按周期 + 绑定日期过滤计划：日=单日；周=周一至周日整周；月=自然月 */
  function plansOf(sc, key) {
    var arr = (TL.Store.get('work').plans[sc] || []);
    if (sc === 'day') return arr.filter(function (p) { return p.date === key; });
    if (sc === 'week') { var b = weekBounds(key); var s = keyOfDate(b.mon), e = keyOfDate(b.sun); return arr.filter(function (p) { return p.date >= s && p.date <= e; }); }
    if (sc === 'month') { var ym = key.slice(0, 7); return arr.filter(function (p) { return (p.date || '').slice(0, 7) === ym; }); }
    return arr;
  }
  function levelSelect(value) {
    var sel = U.h('select', { class: 'tl-select' }, LEVELS.map(function (l) {
      return U.h('option', { value: l.k, text: l.label });
    }));
    sel.value = value || 'low';
    return sel;
  }
  /* 周期对应的日期选择栏：日/周=日历弹层；月=月份选择器 */
  function dateBarFor(sc) {
    if (sc === 'month') {
      var mi = U.h('input', { class: 'tl-input tl-input--month', type: 'month', value: planDates.month.slice(0, 7) });
      mi.addEventListener('input', function () { if (mi.value) { planDates.month = mi.value + '-01'; renderPlans(); } });
      return U.h('div', { class: 'tl-todo-datebar' }, [
        U.h('span', { class: 'tl-field__label', text: '月份' }), mi,
        U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '本月', onClick: function () { planDates.month = TL.Store.todayKey(); renderPlans(); } })
      ]);
    }
    var picker = tlDatePicker(planDates[sc], function (k) { planDates[sc] = k; renderPlans(); }, sc === 'week' ? function (k) {
      var b = weekBounds(k); return keyOfDate(b.mon) + ' ～ ' + keyOfDate(b.sun) + ' 当周';
    } : null);
    return U.h('div', { class: 'tl-todo-datebar' }, [
      picker,
      U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '今天', onClick: function () { planDates[sc] = TL.Store.todayKey(); renderPlans(); } })
    ]);
  }

  /* ============================ 每日计划 ============================ */
  function renderPlans() {
    var host = el('wk-plans');
    if (!host) return;
    host.innerHTML = '';
    if (!planDates[scope]) planDates[scope] = TL.Store.todayKey();

    /* 周期筛选：日计划 / 周计划 / 月计划 */
    host.appendChild(U.h('div', { class: 'tl-tabs' }, SCOPES.map(function (s) {
      return U.h('button', {
        class: 'tl-tab' + (s.k === scope ? ' is-active' : ''),
        text: s.t,
        onClick: function () { scope = s.k; renderPlans(); }
      });
    })));

    /* 日期选择栏（按周期不同） */
    host.appendChild(dateBarFor(scope));

    /* 新增输入 + 重要程度 */
    var input = U.h('input', { class: 'tl-input', placeholder: '添加' + scopeLabel(scope) + '，回车提交' });
    var pri = levelSelect('low');
    function add() {
      var text = input.value.trim();
      if (!text) return;
      var date = planDates[scope];
      TL.Store.update('work', function (d) {
        d.plans[scope].unshift({ id: TL.Store.uid('plan'), text: text, done: false, level: pri.value, date: date, note: '', scope: scope, ts: Date.now() });
      }, '新增' + scopeLabel(scope) + '「' + text + '」');
      input.value = '';
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    host.appendChild(U.h('div', { class: 'tl-inline-form', style: 'margin:12px 0 6px' }, [
      input, pri, U.h('button', { class: 'tl-btn tl-btn--primary', text: '添加', onClick: add })
    ]));

    /* 列表（按周期 + 绑定日期过滤） */
    var list = plansOf(scope, planDates[scope]);
    host.appendChild(U.h('div', { class: 'tl-muted tl-todo-count', text: periodText(scope, planDates[scope]) + ' · 共 ' + list.length + ' 条' + scopeLabel(scope) }));

    if (!list.length) { host.appendChild(U.h('div', { class: 'tl-empty', text: '该周期暂无计划，上方添加或切换周期查看。' })); return; }
    var box = U.h('div', {});
    list.forEach(function (p) {
      box.appendChild(U.taskItem({
        text: p.text, done: p.done, level: p.level, meta: levelLabel(p.level), note: p.note,
        onToggle: function (next) {
          TL.Store.update('work', function (d) {
            var it = d.plans[scope].filter(function (x) { return x.id === p.id; })[0];
            if (it) it.done = next;
          }, (next ? '完成' : '取消完成') + scopeLabel(scope) + '「' + p.text + '」');
        },
        onEdit: function () { planModal(p, { scope: scope }); },
        onDelete: function () {
          U.confirm('删除计划？', '「' + p.text + '」将被移除。', function () {
            TL.Store.update('work', function (d) { d.plans[scope] = d.plans[scope].filter(function (x) { return x.id !== p.id; }); }, '删除' + scopeLabel(scope) + '「' + p.text + '」');
          });
        }
      }));
    });
    host.appendChild(box);
  }

  /* 编辑单条日/周/月计划已由 planModal 统一接管（含周期切换 / 重要程度 / 绑定日期） */

  /* ===================== 日期工具 ===================== */
  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  function fmtDateKey(key) {
    var p = (key || '').split('-');
    if (p.length < 3) return key || '';
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return p[0] + '-' + p[1] + '-' + p[2] + ' ' + WEEK_CN[d.getDay()];
  }

  /* 莫兰迪日历弹层日期选择器：支持跨月 / 跨年挑选过去、当日、未来任意日期；labelFn 可自定义按钮文案（如周区间） */
  function tlDatePicker(initialKey, onPick, labelFn) {
    var key = initialKey || TL.Store.todayKey();
    var wrap = U.h('div', { class: 'tl-datepick' });
    var btn = U.h('button', { class: 'tl-datepick__btn', type: 'button' });
    function renderLabel() { btn.textContent = labelFn ? labelFn(key) : fmtDateKey(key); }
    renderLabel();
    var pop = U.h('div', { class: 'tl-datepick__pop', style: 'display:none' });
    var built = false;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop.style.display !== 'none') { pop.style.display = 'none'; return; }
      if (!built) {
        pop.appendChild(U.calendar({
          view: 'month', weekStart: 1, selected: key,
          onSelect: function (k) {
            key = k; renderLabel();
            pop.style.display = 'none';
            if (onPick) onPick(k);
          }
        }));
        built = true;
      }
      pop.style.display = '';
    });
    wrap.appendChild(btn);
    wrap.appendChild(pop);
    return wrap;
  }

  /* ============================ 新建 / 编辑计划（统一：日 / 周 / 月） ============================ */
  /* 弹窗字段：计划内容 / 周期类型 / 绑定日期 / 重要程度 / 完成状态 / 备注；
     改绑定日期或改周期属大幅度修改，二次确认后提交；支持跨周期移动（从原数组移除再写入目标数组）。 */
  function planModal(existing, opts) {
    opts = opts || {};
    var isNew = !existing;
    var oldScope = (existing && existing.scope) || opts.scope || scope;
    var name = existing ? existing.text : '';
    var selScope = oldScope;
    var dateKey = (existing && existing.date) || opts.date || planDates[selScope] || TL.Store.todayKey();
    var level = existing ? (existing.level || 'low') : 'low';
    var doneState = existing ? !!existing.done : false;
    var note = existing ? (existing.note || '') : '';

    var nameI = U.h('input', { class: 'tl-input', value: name, placeholder: '计划内容' });
    var scopeSel = U.h('select', { class: 'tl-select' }, SCOPES.map(function (s) {
      return U.h('option', { value: s.k, text: s.t });
    }));
    scopeSel.value = selScope;
    var dateI = U.h('input', { class: 'tl-input', type: 'date', value: dateKey });
    var levelSel = levelSelect(level);
    var noteI = U.h('textarea', { class: 'tl-textarea', placeholder: '备注（选填）', text: note });
    var doneSeg = U.h('div', { class: 'tl-seg' }, [
      U.h('button', { class: 'tl-seg__btn' + (doneState ? ' is-active' : ''), text: '已完成', onClick: function () { doneState = true; syncSeg(); } }),
      U.h('button', { class: 'tl-seg__btn' + (!doneState ? ' is-active' : ''), text: '未完成', onClick: function () { doneState = false; syncSeg(); } })
    ]);
    function syncSeg() {
      var b = doneSeg.querySelectorAll('.tl-seg__btn');
      b[0].classList.toggle('is-active', doneState);
      b[1].classList.toggle('is-active', !doneState);
    }

    var content = U.h('div', {}, [
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '计划内容' }), nameI]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '周期类型' }), scopeSel]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '绑定日期' }), dateI]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '重要程度' }), levelSel]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '完成状态' }), doneSeg]),
      U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '备注' }), noteI])
    ]);

    U.modal({
      title: isNew ? '新建计划' : '编辑计划',
      content: content,
      actions: [
        { label: '取消', type: 'ghost', onClick: function (m) { m.close(); } },
        { label: '保存', type: 'primary', onClick: function (m) {
          var text = nameI.value.trim();
          if (!text) { U.toast('请填写计划内容', 'info'); return; }
          var newScope = scopeSel.value;
          dateKey = dateI.value || (existing && existing.date) || TL.Store.todayKey();
          var newLevel = levelSel.value;
          var commit = function () {
            TL.Store.update('work', function (d) {
              if (isNew) {
                d.plans[newScope].unshift({ id: TL.Store.uid('plan'), text: text, done: doneState, level: newLevel, date: dateKey, note: noteI.value, scope: newScope, ts: Date.now() });
              } else {
                if (newScope !== oldScope) {
                  d.plans[oldScope] = d.plans[oldScope].filter(function (x) { return x.id !== existing.id; });
                }
                var arr = d.plans[newScope];
                var it = arr.filter(function (x) { return x.id === existing.id; })[0];
                if (it) { it.text = text; it.date = dateKey; it.level = newLevel; it.done = doneState; it.note = noteI.value; it.scope = newScope; }
                else { arr.unshift({ id: existing.id, text: text, done: doneState, level: newLevel, date: dateKey, note: noteI.value, scope: newScope, ts: Date.now() }); }
              }
            }, (isNew ? '新增' : '编辑') + scopeLabel(newScope) + '「' + text + '」');
            scope = newScope;
            planDates[newScope] = dateKey;
            m.close();
            renderPlans();
          };
          // 改绑定日期 / 改周期属大幅度修改，二次确认后提交
          var dateChanged = !isNew && dateKey !== existing.date;
          var scopeChanged = !isNew && newScope !== oldScope;
          if (dateChanged || scopeChanged) {
            var msg = scopeChanged
              ? ('「' + text + '」将从「' + scopeLabel(oldScope) + '」移动到「' + scopeLabel(newScope) + '」，工作总结日历将自动同步更新。')
              : ('「' + text + '」将从 ' + existing.date + ' 移动到 ' + dateKey + '，工作总结日历将自动同步更新。');
            U.confirm('确认修改计划？', msg, commit);
          } else {
            commit();
          }
        } }
      ]
    });
  }


  /* ============================ 复盘总结 ============================ */
  function reviewCard(r) {
    return U.h('div', { class: 'tl-review-card' }, [
      U.h('div', { class: 'tl-review-card__head' }, [
        U.h('span', { class: 'tl-tag tl-tag--info', text: TL.Review.TYPE_LABEL[r.type] || '复盘' }),
        U.h('span', { class: 'tl-review-card__title', text: r.title || '（未命名复盘）' }),
        r.aiReport ? U.h('span', { class: 'tl-tag tl-tag--success', text: '已分析' }) : null,
        U.h('span', { class: 'tl-muted', text: U.fmtTime(r.ts) })
      ]),
      U.h('div', { class: 'tl-review-card__summary', text: (r.aiReport && r.aiReport.highlights && r.aiReport.highlights[0]) ? ('亮点：' + r.aiReport.highlights[0]) : (TL.Review.summaryOf(r)) }),
      U.h('div', { class: 'tl-review-card__actions' }, [
        U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '查看', onClick: function () { openEditor(r); } }),
        U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: 'AI 分析', onClick: function () { doAnalyze(r, function () { renderReviews(); }); } }),
        U.h('button', { class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '飞书', onClick: function () { doFeishu(r); } })
      ])
    ]);
  }

  function renderReviews() {
    var host = el('wk-reviews');
    if (!host) return;
    host.innerHTML = '';
    var data = TL.Store.get('work');

    /* 头部：左标题 + 中类型筛选 + 右新建（与示意图结构一致） */
    function filterBtn(key, label) {
      return U.h('button', {
        class: 'tl-seg__btn' + (reviewFilter === key ? ' is-active' : ''),
        text: label,
        onClick: function () { reviewFilter = key; renderReviews(); }
      });
    }
    var head = U.h('div', { class: 'tl-review-head' }, [
      U.h('h3', { class: 'tl-review-title', text: '复盘总结' }),
      U.h('div', { class: 'tl-review-filter' }, [
        U.h('div', { class: 'tl-seg' }, [
          filterBtn('all', '全部'),
          filterBtn('day', '首销日小结'),
          filterBtn('week', '首销周复盘'),
          filterBtn('month', '首销月复盘')
        ])
      ]),
      U.h('button', { class: 'tl-btn tl-btn--primary tl-btn--sm', text: '+ 新建复盘', onClick: function () { openTypeChooser(); } })
    ]);
    host.appendChild(head);

    if (!data.reviews.length) { host.appendChild(U.h('div', { class: 'tl-empty tl-review-empty', text: '暂无复盘记录，点击「新建复盘」开始首销复盘' })); return; }

    var list = data.reviews.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (reviewFilter !== 'all') list = list.filter(function (r) { return r.type === reviewFilter; });

    if (!list.length) {
      host.appendChild(U.h('div', { class: 'tl-empty tl-review-empty', text: reviewFilter === 'all' ? '暂无复盘记录，点击「新建复盘」开始首销复盘' : '该类型下暂无复盘记录' }));
      return;
    }

    var grid = U.h('div', { class: 'tl-review-list' });
    list.forEach(function (r) { grid.appendChild(reviewCard(r)); });
    host.appendChild(grid);
  }

  function duplicateReview(src) {
    var copy = TL.Store.clone(src);
    copy.id = TL.Store.uid('rv');
    copy.title = (src.title || '复盘') + '（副本）';
    copy.status = 'draft';
    copy.aiReport = null;
    copy.feishu = null;
    copy.ts = Date.now();
    copy.createdAt = copy.ts;
    copy.updatedAt = copy.ts;
    TL.Store.update('work', function (d) { d.reviews.unshift(copy); }, '复制复盘为新「' + copy.title + '」');
    openEditor(copy);
  }

  /* 新建复盘：先弹出类型选择弹窗（首销日小结 / 首销周复盘 / 首销月复盘） */
  function openTypeChooser() {
    var body = U.h('div', { class: 'tl-type-chooser' });
    TL.Review.TYPES.forEach(function (t) {
      body.appendChild(U.h('button', {
        class: 'tl-type-card',
        onClick: function () {
          var review = {
            id: TL.Store.uid('rv'), type: t.key, title: '', status: 'draft',
            ts: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
            fields: {}, skus: [], images: [], calc: null, aiReport: null, feishu: null
          };
          TL.Store.update('work', function (d) { d.reviews.unshift(review); }, '新建复盘（' + t.label + '）');
          m.close();
          openEditor(review);
        }
      }, [
        U.h('div', { class: 'tl-type-card__title', text: t.label }),
        U.h('div', { class: 'tl-type-card__hint', text: t.hint || '点击进入对应复盘模板' })
      ]));
    });
    var m = U.modal({
      title: '选择复盘类型',
      content: body,
      actions: [{ label: '取消', type: 'ghost', onClick: function (mm) { mm.close(); } }]
    });
  }

  /* -------------------- 复盘编辑器 -------------------- */
  function openEditor(review) {
    var isNew = !review;
    if (isNew) {
      review = {
        id: TL.Store.uid('rv'), type: 'day', title: '', status: 'draft',
        ts: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
        fields: {}, skus: [], images: [], calc: null, aiReport: null, feishu: null
      };
      TL.Store.update('work', function (d) { d.reviews.unshift(review); }, '新建复盘');
    }
    review.summary = TL.Review.summaryOf(review);

    var type = review.type;
    var formBody = U.h('div', { class: 'tl-review-form' });

    function rebuild() {
      formBody.innerHTML = '';
      // 类型选择
      formBody.appendChild(U.h('div', { class: 'tl-field' }, [
        U.h('span', { class: 'tl-field__label', text: '复盘类型' }),
        U.h('div', { class: 'tl-seg' }, TL.Review.TYPES.map(function (t) {
          return U.h('button', {
            class: 'tl-seg__btn' + (t.key === type ? ' is-active' : ''), text: t.label,
            onClick: function () {
              type = t.key; review.type = t.key; review.summary = TL.Review.summaryOf(review);
              saveReview(review, '切换复盘类型');
              rebuild();
            }
          });
        }))
      ]));
      // 标题
      var titleInput = U.h('input', { class: 'tl-input', value: review.title || '', placeholder: '给这次复盘起个标题，如 O70C 首销 Day3' });
      titleInput.addEventListener('input', function () { review.title = titleInput.value; review.summary = TL.Review.summaryOf(review); saveReview(review, '编辑复盘标题'); });
      formBody.appendChild(U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: '复盘标题' }), titleInput]));

      // 模板区块
      TL.Review.template(type).blocks.forEach(function (block) {
        var blockChildren = [U.h('div', { class: 'tl-rv-block__title', text: block.title })];
        block.fields.forEach(function (field) {
          blockChildren.push(renderField(review, field, rebuild));
        });
        formBody.appendChild(U.h('div', { class: 'tl-rv-block' }, blockChildren));
      });
    }

    rebuild();

    var m = U.modal({
      title: isNew ? '新建复盘' : '编辑复盘',
      wide: true,
      content: formBody,
      actions: [
        { label: '删除', type: 'danger', onClick: function (mm) {
            U.confirm('删除复盘？', '「' + (review.title || '未命名') + '」将被移除（云端历史版本可回滚找回）。', function () {
              mm.close();
              TL.Store.update('work', function (d) { d.reviews = d.reviews.filter(function (x) { return x.id !== review.id; }); }, '删除复盘「' + (review.title || '未命名') + '」');
              renderReviews();
            });
          } },
        { label: '复制为新', type: 'ghost', onClick: function (mm) { mm.close(); duplicateReview(review); } },
        { label: '取消', type: 'ghost', onClick: function (mm) { mm.close(); renderReviews(); } },
        { label: '生成飞书文档', type: 'secondary', onClick: function () { doFeishu(review); } },
        { label: 'AI 自动分析', type: 'primary', onClick: function () { doAnalyze(review, rebuild); } },
        { label: '保存草稿', type: 'primary', onClick: function (mm) { saveReview(review, '保存复盘草稿'); mm.close(); U.toast('复盘已存为草稿并同步云端', 'success'); renderReviews(); } }
      ]
    });
  }

  function renderField(review, field, rebuild) {
    if (field.type === 'text' || field.type === 'number') {
      var inp = U.h('input', { class: 'tl-input', type: field.type === 'number' ? 'number' : 'text', value: review.fields[field.id] != null ? review.fields[field.id] : '', placeholder: field.ph || '' });
      inp.addEventListener('input', function () { review.fields[field.id] = inp.value; saveReview(review, '填写复盘字段'); });
      return U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: field.label }), inp]);
    }
    if (field.type === 'textarea') {
      var ta = U.h('textarea', { class: 'tl-textarea', placeholder: field.ph || '' }, review.fields[field.id] || '');
      ta.addEventListener('input', function () { review.fields[field.id] = ta.value; saveReview(review, '填写复盘字段'); });
      return U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: field.label }), ta]);
    }
    if (field.type === 'sku') return renderSkuField(review, field, rebuild);
    if (field.type === 'image') return renderImageField(review, field, rebuild);
    if (field.type === 'auto') return renderAutoField(review, field);
    return U.h('div', {});
  }

  function renderSkuField(review, field, rebuild) {
    var rows = U.h('div', { class: 'tl-sku-rows' });
    function draw() {
      rows.innerHTML = '';
      (review.skus || []).forEach(function (s, i) {
        var sku = U.h('input', { class: 'tl-input tl-input--sm', value: s.sku || '', placeholder: 'SKU' });
        var stock = U.h('input', { class: 'tl-input tl-input--sm', type: 'number', value: s.stock != null ? s.stock : '', placeholder: '库存' });
        var sold = U.h('input', { class: 'tl-input tl-input--sm', type: 'number', value: s.sold != null ? s.sold : '', placeholder: '已售' });
        sku.addEventListener('input', function () { s.sku = sku.value; saveReview(review, '编辑分库存'); });
        stock.addEventListener('input', function () { s.stock = stock.value; saveReview(review, '编辑分库存'); });
        sold.addEventListener('input', function () { s.sold = sold.value; saveReview(review, '编辑分库存'); });
        rows.appendChild(U.h('div', { class: 'tl-sku-row' }, [
          sku, stock, sold,
          U.h('button', { class: 'tl-task__del', title: '删除', html: '&times;', onClick: function () { review.skus.splice(i, 1); saveReview(review, '删除 SKU'); draw(); } })
        ]));
      });
    }
    draw();
    var addBtn = U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '+ 添加 SKU', onClick: function () { review.skus.push({ sku: '', stock: '', sold: '' }); saveReview(review, '添加 SKU'); draw(); } });
    return U.h('label', { class: 'tl-field' }, [
      U.h('span', { class: 'tl-field__label', text: field.label }),
      rows, addBtn
    ]);
  }

  /* AI 自动生成表格（复盘图片识图结果） */
  function renderAiTable(table) {
    return U.h('div', { class: 'tl-ai-table-wrap' }, [
      U.h('div', { class: 'tl-ai-table__head', text: 'AI 自动生成表格' }),
      U.h('table', { class: 'tl-ai-table' }, [
        U.h('thead', {}, U.h('tr', {}, (table.head || []).map(function (h) { return U.h('th', { text: String(h) }); }))),
        U.h('tbody', {}, (table.rows || []).map(function (row) {
          return U.h('tr', {}, row.map(function (c) { return U.h('td', { text: String(c == null ? '' : c) }); }));
        }))
      ])
    ]);
  }

  function renderImageField(review, field, rebuild) {
    var role = field.id;
    var upName = (TL.Review.ROLE_UP && TL.Review.ROLE_UP[role]) || '图片';
    // 用户画像原图需保留不压缩；推广/对比/趋势/画像类须完整嵌入原图
    var keepOriginal = (role === 'portrait');
    var embedFull = !!field.embed || keepOriginal;
    var box = U.h('div', { class: 'tl-img-upload' });
    // 统一上传接口：限定 PNG/JPG/JPEG、支持多图批量
    var fileInput = U.h('input', { type: 'file', accept: 'image/png,image/jpeg,image/jpg', multiple: true, style: 'display:none' });

    function uploadFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      U.toast('正在上传 ' + files.length + ' 张图片…（' + (keepOriginal ? '原图保留不压缩' : '自动压缩') + '）');
      TL.ReviewUpload.uploadBatch(files, {
        module: 'work', refId: review.id, note: field.label, compress: !keepOriginal
      }).then(function (results) {
        var ok = [], errs = [];
        results.forEach(function (r) {
          if (r.entry) {
            review.images.push({
              id: r.entry.id, role: role, name: r.entry.name, note: field.label,
              ai: null, onlineUrl: r.entry.onlineUrl || ''
            });
            ok.push(r.entry);
          } else {
            errs.push({ name: (r.file && r.file.name) || '图片', msg: r.error });
          }
        });
        if (ok.length) saveReview(review, '批量上传复盘图片（' + ok.length + ' 张）');
        draw();
        if (errs.length) {
          TL.ReviewUpload.failModal({ errors: errs, onRetry: function () { uploadFiles(files); } });
        } else if (ok.length) {
          U.toast('已上传 ' + ok.length + ' 张图片' + (TL.GitHub && TL.GitHub.configured() ? '，已入队云端同步' : ''), 'success');
        }
      });
    }

    fileInput.addEventListener('change', function () {
      uploadFiles(fileInput.files);
      fileInput.value = '';
    });
    function draw() {
      box.innerHTML = '';
      var imgs = (review.images || []).filter(function (i) { return i.role === role; });
      imgs.forEach(function (img) {
        var src = TL.Store.blobGet(img.id) || '';
        var thumb = src
          ? U.h('img', { class: embedFull ? 'tl-img-full' : 'tl-img-thumb', src: src, alt: img.name, onClick: function () { TL.ReviewUpload.preview(src, img.name); } })
          : U.h('div', { class: (embedFull ? 'tl-img-full ' : 'tl-img-thumb ') + 'tl-img-thumb--empty', text: '图' });
        var badge = embedFull ? U.h('span', { class: 'tl-img-badge', text: '原图已嵌入' }) : null;
        var a = (typeof img.ai === 'string') ? { text: img.ai } : (img.ai || {});
        var conclNode = U.h('div', { class: 'tl-img-concl' });
        if (a.table) conclNode.appendChild(renderAiTable(a.table));
        if (a.text) conclNode.appendChild(U.h('div', { class: 'tl-ai-conclusion__text', text: a.text }));
        if (!a.table && !a.text) conclNode.appendChild(U.h('div', { class: 'tl-muted', text: '尚未识图，点击下方按钮解析' }));
        box.appendChild(U.h('div', { class: 'tl-img-item' }, [
          thumb,
          U.h('div', { class: 'tl-img-item__body' }, [
            U.h('div', { class: 'tl-img-item__head' }, [U.h('div', { class: 'tl-img-item__name', text: img.name }), badge]),
            U.h('div', { class: 'tl-inline-form' }, [
              U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: 'AI 识图解析', onClick: function () {
                U.toast('识图解析中…');
                var numCtx = {};
                if (review.calc) numCtx.numbers = { conversion: Math.round((review.calc.sellThrough || 0) * 100) + '%' };
                // 将图片字节流一并交给 AI，真实视觉程序可直接读取画面内容完成识图转表
                TL.AI.analyzeImage({ name: img.name, bytes: src ? src.length : 0, role: role, dataUrl: src }, numCtx).then(function (res) {
                  img.ai = { text: res.text, table: res.table || null };
                  saveReview(review, 'AI 识图' + (field.label || ''));
                  draw();
                  U.toast(res.simulated ? '已生成模拟解析（可接入真实视觉模型）' : '已生成解析', res.simulated ? 'info' : 'success');
                });
              } }),
              U.h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '移除', onClick: function () {
                review.images = review.images.filter(function (x) { return x.id !== img.id; });
                TL.Media.remove(img.id); saveReview(review, '移除复盘图片'); draw();
              } })
            ]),
            conclNode
          ])
        ]));
      });
      box.appendChild(U.h('button', { class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '+ 上传' + upName, onClick: function () { fileInput.click(); } }));
      box.appendChild(U.h('span', { class: 'tl-upload-hint', text: '支持 PNG/JPG/JPEG · 单图 ≤ 10MB · 可多选批量上传' }));
      box.appendChild(fileInput);
    }
    draw();
    return U.h('label', { class: 'tl-field' }, [U.h('span', { class: 'tl-field__label', text: field.label }), box]);
  }

  function renderAutoField(review, field) {
    var c = TL.Review.calc(review);
    var text;
    if (field.calc === 'monthly') text = '月度总销量：' + c.totalSold + '　整体动销率：' + Math.round(c.sellThrough * 100) + '%';
    else if (field.calc === 'sku') text = c.perSku.length ? c.perSku.map(function (s) { return s.sku + ' ' + Math.round(s.rate * 100) + '%'; }).join('　') : '（录入分库存后自动计算）';
    else if (field.calc === 'yoy') text = '新机 ' + c.yoy.n + ' / 上代 ' + c.yoy.p + '　差值 ' + (c.yoy.diff >= 0 ? '+' : '') + c.yoy.diff + (c.yoy.diffPct != null ? ('（' + (c.yoy.diffPct >= 0 ? '+' : '') + c.yoy.diffPct + '%）') : '');
    else text = '';
    return U.h('div', { class: 'tl-field' }, [
      U.h('span', { class: 'tl-field__label', text: field.label }),
      U.h('div', { class: 'tl-auto-value', text: text })
    ]);
  }

  function doAnalyze(review, rebuild) {
    U.toast('正在整合分析…');
    review.calc = TL.Review.calc(review);
    TL.AI.analyzeReview(review).then(function (report) {
      review.aiReport = report;
      review.status = 'analyzed';
      saveReview(review, 'AI 综合分析复盘');
      renderReportModal(review);
    });
  }

  function renderReportModal(review) {
    var rep = review.aiReport || {};
    var node = U.h('div', {}, [
      repSection('做得好亮点', rep.highlights, 'success'),
      repSection('现存短板', rep.shortcomings, 'warning'),
      repSection('中长期落地规划', rep.plans, 'info')
    ]);
    (rep.extras || []).forEach(function (ex) {
      node.appendChild(repSection(ex.title, ex.items, 'info'));
    });
    U.modal({
      title: 'AI 综合业务分析' + (rep.simulated ? '（模拟引擎）' : ''),
      wide: true,
      content: node,
      actions: [
        { label: '生成飞书文档', type: 'secondary', onClick: function (mm) { mm.close(); doFeishu(review); } },
        { label: '完成', type: 'primary', onClick: function (mm) { mm.close(); renderReviews(); } }
      ]
    });
  }
  function repSection(title, arr, tone) {
    return U.h('div', { class: 'tl-rep-section' }, [
      U.h('div', { class: 'tl-rep-section__title tl-rep-section__title--' + tone, text: title }),
      U.h('ul', { class: 'tl-rep-list' }, (arr && arr.length ? arr : ['（无）']).map(function (x) { return U.h('li', { text: x }); }))
    ]);
  }

  function doFeishu(review) {
    review.calc = review.calc || TL.Review.calc(review);
    var text = TL.Review.buildFeishu(review);
    review.feishu = { text: text, generatedAt: Date.now() };
    saveReview(review, '生成飞书文档');
    copyText(text).then(function () {
      U.toast('全文已复制，正在打开飞书…', 'success', 3200);
      window.open('https://docs.feishu.cn/', '_blank', 'noopener');
    }, function () {
      U.modal({ title: '飞书文档全文', wide: true, content: U.h('pre', { class: 'tl-fs-doc' }, text), actions: [{ label: '关闭', type: 'primary', onClick: function (m) { m.close(); } }] });
    });
  }

  function copyText(text) {
    return new Promise(function (resolve, reject) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(resolve, reject); }
        else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); ok ? resolve() : reject(new Error('copy fail')); }
      } catch (e) { reject(e); }
    });
  }

  /* ============================ 标签页 ============================ */
  function switchTab(key) {
    current = key;
    U.$$('#wk-tabs .tl-tab').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-tab') === key); });
    TABS.forEach(function (t) {
      var sec = el('wk-' + t.key + '-section');
      if (sec) sec.style.display = t.key === key ? '' : 'none';
    });
    try { history.replaceState(null, '', '#' + key); } catch (e) {}
    render();
  }

  function render() {
    if (current === 'plans') renderPlans();
    if (current === 'reviews') renderReviews();
    if (current === 'monthly' && TL.pages.monthly) TL.pages.monthly.render();
  }

  TL.pages.work = {
    init: function () {
      U = TL.UI;
      // 点击页面其它区域时收起所有打开的日期选择弹层
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('.tl-datepick')) return;
        U.$$('.tl-datepick__pop').forEach(function (p) { if (p.style.display !== 'none') p.style.display = 'none'; });
      });
      var tabs = el('wk-tabs');
      TABS.forEach(function (t) {
        tabs.appendChild(U.h('button', { class: 'tl-tab', 'data-tab': t.key, text: t.label, onClick: function () { switchTab(t.key); } }));
      });
      // 工作总结已融合为本页第 1 个标签页：初始化其模块（设置 U 并首次渲染到隐藏分区）
      if (TL.pages.monthly && TL.pages.monthly.init) TL.pages.monthly.init();
      var hash = (location.hash || '').replace('#', '');
      switchTab(TABS.filter(function (t) { return t.key === hash; }).length ? hash : TABS[0].key);
    },
    render: render,
    // 供【工作总结】日历 openDay 快捷新建 / 编辑计划（opts: { scope, date }）
    openPlanModal: function (plan, opts) { planModal(plan, opts); },
    // 计划工具方法（供日历模块复用）
    plansOf: function (scope, key) { return plansOf(scope, key); },
    levelLabel: function (lv) { return levelLabel(lv); },
    scopeLabel: function (sc) { return scopeLabel(sc); }
  };
})(window.TL);
