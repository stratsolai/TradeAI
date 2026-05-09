/**
 * strategic-plan-modules.js
 * Operational Tasks rendering, initiative/subtask CRUD, and the
 * Strategic Plan document view (SWOT, version history). Loaded
 * alongside strategic-plan-logic.js (wizard, draft autosave,
 * profile prefill, plan generation), strategic-plan-wizard.js (BI
 * prefill bucketers, incomplete-fields modal, BI Generated Items
 * Tab 9), strategic-plan-review.js (Review screen + AI chat
 * panel), and strategic-plan-archive.js (archive screen). Every
 * file contributes methods to the same window.SP_LOGIC object.
 */
window.SP_LOGIC = window.SP_LOGIC || {};
Object.assign(window.SP_LOGIC, {

  bindOpsEvents: function() {
    var self = this;
    var opsContent = document.getElementById('sp-ops-content');
    if (!opsContent) return;
    if (opsContent.dataset.bound === '1') return;
    opsContent.dataset.bound = '1';

    opsContent.addEventListener('click', function(e) {
      // Spec §9.3 filters
      var viewPill = e.target.closest('[data-view]');
      if (viewPill) {
        document.querySelectorAll('#sp-ops-controls [data-view]').forEach(function(p) { p.classList.remove('active'); });
        viewPill.classList.add('active');
        self._otCurrentFilter = viewPill.dataset.view;
        self._applyOTFilter();
        return;
      }
      // Expand All / Collapse All
      var expandBtn = e.target.closest('[data-expand]');
      if (expandBtn) { self.toggleExpandAll(); return; }
      // View toggle (List / 90-Day Outlook)
      var viewBtn = e.target.closest('[data-ops-view]');
      if (viewBtn) { self.toggleOpsView(viewBtn.dataset.opsView); return; }
      // View Archive
      var archiveLink = e.target.closest('#sp-ops-archive-link');
      if (archiveLink) { if (typeof self.openArchiveScreen === 'function') self.openArchiveScreen(); return; }

      // Category accordion toggle — click anywhere on the tile that
      // isn't inside the content area, mirroring BI / Review pattern.
      var catTile = e.target.closest('.sp-ot-cat');
      if (catTile && !e.target.closest('.expand-tile-content')) {
        catTile.classList.toggle('expanded');
        self.saveExpandState();
        return;
      }

      // Task checkbox — fires off the toggle which routes through
      // archive modal on completion (spec §5.2 step 3 / §9.6).
      var taskCheck = e.target.closest('.sp-ot-task-check');
      if (taskCheck) {
        var task = taskCheck.closest('.sp-ot-task');
        if (task) self.toggleSubtask(task.dataset.id);
        return;
      }
      // Task title click → expand/collapse description body
      var titleEl = e.target.closest('.sp-ot-task-title');
      if (titleEl) {
        var task = titleEl.closest('.sp-ot-task');
        if (task) task.classList.toggle('sp-ot-task-expanded');
        return;
      }
      // Task due click → inline edit
      var dueEl = e.target.closest('.sp-ot-task-due');
      if (dueEl) {
        var task = dueEl.closest('.sp-ot-task');
        if (task) self.editDueDate(task.dataset.id, dueEl);
        return;
      }
      // Task owner click → inline edit
      var ownerEl = e.target.closest('.sp-ot-task-owner');
      if (ownerEl) {
        var task = ownerEl.closest('.sp-ot-task');
        if (task) self.editOwner(task.dataset.id, ownerEl);
        return;
      }
      // Task delete
      var deleteBtn = e.target.closest('.sp-ot-task-delete-btn');
      if (deleteBtn) {
        var task = deleteBtn.closest('.sp-ot-task');
        if (task) self.confirmDeleteTask(task.dataset.id);
        return;
      }
      // Task archive button (spec §9.6 — keeps task visible after
      // completion until the owner explicitly archives)
      var archBtn = e.target.closest('.sp-ot-task-archive-btn');
      if (archBtn) {
        var task = archBtn.closest('.sp-ot-task');
        if (task && typeof self.archiveTask === 'function') self.archiveTask(task.dataset.id);
        return;
      }
      // Add Task — shows inline form for the goal
      var addTaskBtn = e.target.closest('.sp-ot-add-task-btn');
      if (addTaskBtn) {
        self.showAddTaskForm(addTaskBtn);
        return;
      }
      // Add Task form submit / cancel
      var addTaskSubmit = e.target.closest('.sp-ot-add-task-submit');
      if (addTaskSubmit) { self.submitAddTaskForm(addTaskSubmit); return; }
      var addTaskCancel = e.target.closest('.sp-ot-add-task-cancel');
      if (addTaskCancel) {
        var form = addTaskCancel.closest('.sp-ot-add-task-form');
        if (form) form.remove();
        return;
      }
    });

    // Notes textarea autosave — debounced. Lives in the expanded
    // body of each task; saves to items.notes on blur.
    opsContent.addEventListener('blur', function(e) {
      var notesEl = e.target && e.target.closest && e.target.closest('.sp-ot-task-notes');
      if (!notesEl) return;
      var task = notesEl.closest('.sp-ot-task');
      if (!task) return;
      self.saveTaskField(task.dataset.id, 'notes', notesEl.value || '');
    }, true);
  },

  bindDocEvents: function() {
    var self = this;
    var docContent = document.getElementById('sp-doc-content');
    var docLocked = document.getElementById('sp-doc-locked');
    if (docContent) {
      docContent.addEventListener('click', function(e) {
        var templateBtn = e.target.closest('.btn-sp-use-template');
        if (templateBtn) {
          self.useAsTemplate(templateBtn.dataset.planId);
          return;
        }
        var printBtn = e.target.closest('.btn-sp-print');
        if (printBtn) {
          window.print();
          return;
        }
        var updateBtn = e.target.closest('#sp-update-plan-btn');
        if (updateBtn) {
          self.switchTab('create-plan');
          return;
        }
      });
    }
    // Spec §3.2 — Create Strategic Plan button on the empty state
    // routes the owner into the wizard.
    if (docLocked) {
      docLocked.addEventListener('click', function(e) {
        var createBtn = e.target.closest('#sp-doc-create-btn');
        if (createBtn) self.switchTab('create-plan');
      });
    }
  },

  loadOperationalPlan: function() {
    var self = this;
    if (!self._supabase || !self._userId) return;
    self._supabase
      .from('strategic_plans')
      .select('id, plan_name, version')
      .eq('user_id', self._userId)
      .eq('is_current', true)
      .single()
      .then(function(res) {
        if (res.error || !res.data) return;
        var titleEl = document.getElementById('sp-ops-plan-title');
        if (titleEl) titleEl.textContent = (res.data.plan_name || 'Strategic Plan') + ' v' + (res.data.version || 1);
        self.loadInitiatives();
      });
  },

  loadInitiatives: function() {
    var self = this;
    if (!self._supabase || !self._userId) return;

    // Filter out is_pending = true rows. These belong to a draft
    // plan that hasn't been approved yet; the Review screen owns
    // them until Approve flips the flag (api/strategic-plan-
    // approve.js). Older rows from before the column existed have
    // is_pending = false by default, so they pass through unchanged.
    self._supabase
      .from('action_tracker')
      .select('id, items, month_group, is_carried_forward, owner, plan_id, parent_task_id, initiative_name, sp_section, source, bi_insight_id')
      .eq('user_id', self._userId)
      .eq('is_pending', false)
      .order('created_at', { ascending: true })
      .then(function(res) {
        if (res.error) { console.error('[SP] Load initiatives error:', res.error); return; }
        // Two-status model (Gap 4) — items.status is either
        // 'in_progress' or 'archived'. Skip archived rows here; the
        // Archive screen handles those.
        self.renderInitiatives(res.data || []);
      });
  },

  // Spec §9 — group goals by category, drop archived, render one
  // .expand-tile per category with goal cards inside.
  renderInitiatives: function(rows) {
    var self = this;
    self._otRows = rows;

    var goals = [];
    var taskMap = {};
    rows.forEach(function(row) {
      var status = row.items && row.items.status;
      if (status === 'archived') return;
      if (!row.parent_task_id) {
        goals.push(row);
        taskMap[row.id] = [];
      }
    });
    rows.forEach(function(row) {
      var status = row.items && row.items.status;
      if (status === 'archived') return;
      if (row.parent_task_id && taskMap[row.parent_task_id]) {
        taskMap[row.parent_task_id].push(row);
      }
    });

    if (goals.length === 0) {
      var listElEmpty = document.getElementById('sp-initiatives-list');
      if (listElEmpty) {
        listElEmpty.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1F4CB;</div>' +
          '<h3>No goals yet</h3><p>Generate or approve a Strategic Plan to populate your Operational Tasks.</p></div>';
      }
      self.updateOpsStats(0, 0, 0, 0, 0);
      self.renderOutlookView([], [], {});
      self.renderCategoryTiles();
      return;
    }

    var totalTasks = 0;
    var completedTasks = 0;
    var overdueTasks = 0;
    var dueThisWeek = 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    var allSubtasks = [];

    // Group goals by normalised category (spec §4 7 keys).
    var goalsByCategory = {};
    var categories = self._SP_REVIEW_CATEGORIES || [
      { key: 'financial',  label: 'Financial',              icon: '\u{1F4B0}' },
      { key: 'products',   label: 'Products & Services',     icon: '\u{1F527}' },
      { key: 'customers',  label: 'Customers & Suppliers',   icon: '\u{1F465}' },
      { key: 'operations', label: 'Operations & Capacity',   icon: '⚙' },
      { key: 'market',     label: 'Market & Competition',    icon: '\u{1F4CA}' },
      { key: 'growth',     label: 'Growth & Transformation', icon: '\u{1F680}' },
      { key: 'risk',       label: 'Risk & Resilience',       icon: '\u{1F6E1}️' }
    ];
    goals.forEach(function(g) {
      var cat = self._normaliseCategory(g.sp_section);
      if (!goalsByCategory[cat]) goalsByCategory[cat] = [];
      goalsByCategory[cat].push(g);
      var tasks = taskMap[g.id] || [];
      tasks.forEach(function(t) {
        var status = (t.items && t.items.status) || 'in_progress';
        totalTasks++;
        // Legacy 'done' rows (pre-Gap-4) still count as completed
        // until they're archived. New rows never reach this state.
        if (status === 'done') { completedTasks++; }
        else {
          var dd = t.items && t.items.due_date ? new Date(t.items.due_date) : null;
          if (dd && !isNaN(dd.getTime())) {
            dd.setHours(0, 0, 0, 0);
            if (dd < today) overdueTasks++;
            if (dd >= today && dd < weekEnd) dueThisWeek++;
          }
        }
        allSubtasks.push({ row: t, initName: g.initiative_name || (g.items && g.items.title) || '' });
      });
    });

    var html = '';
    categories.forEach(function(cat) {
      var entries = goalsByCategory[cat.key] || [];
      if (entries.length === 0) return;
      var goalCount = entries.length;
      var taskTotal = 0;
      entries.forEach(function(g) { taskTotal += (taskMap[g.id] || []).length; });
      var expanded = self.getExpandState('cat:' + cat.key);
      html += '<div class="expand-tile sp-ot-cat' + (expanded ? ' expanded' : '') + '" data-category="' + escHtml(cat.key) + '">' +
        '<div class="expand-tile-header">' +
          '<span class="expand-tile-icon">' + cat.icon + '</span>' +
          '<span class="expand-tile-title">' + escHtml(cat.label) + '</span>' +
          '<span class="expand-tile-count">' + goalCount + (goalCount === 1 ? ' Goal' : ' Goals') + '</span>' +
        '</div>' +
        '<div class="expand-tile-content">' +
          '<div class="sp-ot-goals">';
      entries.forEach(function(g) {
        html += self._renderOTGoalCard(g, taskMap[g.id] || []);
      });
      html += '</div></div></div>';
    });

    var listEl = document.getElementById('sp-initiatives-list');
    if (listEl) listEl.innerHTML = html;
    self.wireSubtaskPriorityLookbacks();
    self.updateOpsStats(goals.length, totalTasks, completedTasks, overdueTasks, dueThisWeek);
    self.renderOutlookView(allSubtasks, goals, taskMap);
    self.renderCategoryTiles();

    // Apply any persisted filter chip on first render.
    if (self._otCurrentFilter && self._otCurrentFilter !== 'all') {
      self._applyOTFilter();
    }
  },

  _renderOTGoalCard: function(goal, tasks) {
    var self = this;
    var done = 0;
    tasks.forEach(function(t) { if (t.items && t.items.status === 'done') done++; });
    var pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
    var sourceBadge = '';
    if (goal.source === 'bi_action') sourceBadge = ' <span class="sp-ot-task-source-badge">BI</span>';
    else if (goal.is_carried_forward) sourceBadge = ' <span class="sp-ot-task-source-badge">CF</span>';
    var description = (goal.items && goal.items.description) || '';
    var tasksHtml = tasks.length === 0
      ? '<div class="sp-ot-task" style="padding:6px 10px;color:var(--text-muted);font-style:italic">No tasks for this goal yet.</div>'
      : tasks.map(function(t) { return self._renderOTTaskRow(t); }).join('');
    return '<div class="sp-ot-goal" data-goal-id="' + escHtml(goal.id) + '">' +
      '<div class="sp-ot-goal-head">' +
        '<span class="sp-ot-goal-title">' + escHtml(goal.initiative_name || (goal.items && goal.items.title) || 'Untitled goal') + sourceBadge + '</span>' +
        '<span class="sp-ot-goal-progress">' +
          '<span class="sp-ot-goal-progress-bar"><span class="sp-ot-goal-progress-fill" style="width:' + pct + '%"></span></span>' +
          '<span>' + done + ' / ' + tasks.length + '</span>' +
        '</span>' +
      '</div>' +
      (description ? '<div class="sp-ot-goal-desc">' + escHtml(description) + '</div>' : '') +
      '<div class="sp-ot-tasks">' + tasksHtml + '</div>' +
      '<button type="button" class="btn-outline btn-sm sp-ot-add-task-btn" data-goal-id="' + escHtml(goal.id) + '">+ Add Task</button>' +
    '</div>';
  },

  _renderOTTaskRow: function(row) {
    var items = row.items || {};
    var done = items.status === 'done';
    var title = items.title || '';
    var description = items.description || '';
    var notes = items.notes || '';
    var priority = items.priority || 'Medium';
    var dueDate = items.due_date || '';
    var owner = row.owner || items.owner || 'Owner';
    var pCls = priority === 'High' ? 'sp-priority-high' : priority === 'Low' ? 'sp-priority-low' : 'sp-priority-medium';
    var sourceBadge = '';
    if (row.source === 'bi_action') sourceBadge = ' <span class="sp-ot-task-source-badge">BI</span>';
    else if (row.is_carried_forward) sourceBadge = ' <span class="sp-ot-task-source-badge">CF</span>';
    var dueDisplay = dueDate ? this._formatDate(dueDate) : 'Set date';
    var isOverdue = false;
    if (dueDate && !done) {
      var dd = new Date(dueDate);
      if (!isNaN(dd.getTime())) {
        dd.setHours(0, 0, 0, 0);
        var now = new Date(); now.setHours(0, 0, 0, 0);
        isOverdue = dd < now;
      }
    }
    var dueCls = isOverdue ? 'sp-ot-task-due sp-ot-task-overdue' : 'sp-ot-task-due';
    var prioOpts = ['High', 'Medium', 'Low'].map(function(p) {
      return '<button type="button" class="lookback-dropdown-item' + (p === priority ? ' active' : '') + '" data-value="' + p + '">' + p + '</button>';
    }).join('');
    // Tasks marked done get an Archive button next to Delete, per
    // spec §9.6 — completed but still visible until the owner
    // chooses to archive.
    var archiveBtn = done ? '<button class="sp-ot-task-action-btn sp-ot-task-archive-btn" type="button" title="Archive">Archive</button>' : '';
    return '<div class="sp-ot-task' + (done ? ' sp-ot-task-done' : '') + '" data-id="' + escHtml(row.id) + '" data-status="' + (done ? 'done' : 'in_progress') + '"' + (isOverdue ? ' data-overdue="1"' : '') + (isDueThisWeek(dueDate, done) ? ' data-due-week="1"' : '') + '>' +
      '<div class="sp-ot-task-row">' +
        '<input type="checkbox" class="sp-ot-task-check"' + (done ? ' checked' : '') + ' aria-label="Mark task complete">' +
        '<span class="sp-ot-task-title">' + escHtml(title) + sourceBadge + '</span>' +
        '<span class="' + dueCls + '" title="Click to change">' + escHtml(dueDisplay) + '</span>' +
        '<span class="lookback-dropdown-wrap sp-subtask-priority-wrap">' +
          '<button type="button" class="lookback-dropdown lookback-dropdown-field sp-subtask-priority sp-ot-task-prio ' + pCls + '" data-value="' + escHtml(priority) + '">' + escHtml(priority) + '</button>' +
          '<div class="lookback-dropdown-menu sp-subtask-priority-menu">' + prioOpts + '</div>' +
        '</span>' +
        '<span class="sp-ot-task-owner" title="Click to change">' + escHtml(owner) + '</span>' +
        '<span class="sp-ot-task-actions">' +
          archiveBtn +
          '<button class="sp-ot-task-action-btn sp-ot-task-delete-btn" type="button" title="Delete">×</button>' +
        '</span>' +
      '</div>' +
      '<div class="sp-ot-task-body">' +
        (description ? '<div class="sp-ot-task-desc">' + escHtml(description) + '</div>' : '') +
        '<div class="sp-ot-task-notes-wrap">' +
          '<label class="sp-ot-task-notes-label">Notes</label>' +
          '<textarea class="sp-ot-task-notes" placeholder="Add notes…">' + escHtml(notes) + '</textarea>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Helper closure to mark "due this week" filter.
    function isDueThisWeek(d, isDone) {
      if (!d || isDone) return false;
      var dd = new Date(d);
      if (isNaN(dd.getTime())) return false;
      dd.setHours(0, 0, 0, 0);
      var t = new Date(); t.setHours(0, 0, 0, 0);
      var w = new Date(t); w.setDate(w.getDate() + 7);
      return dd >= t && dd < w;
    }
  },

  // Map any sp_section to one of the seven category keys (spec §4).
  _normaliseCategory: function(spSection) {
    if (!spSection) return 'risk';
    var s = String(spSection).toLowerCase();
    var legacy = {
      business_foundation: 'risk',
      products_services:   'products',
      financial_position:  'financial',
      operations_capacity: 'operations',
      market_competition:  'market',
      growth_transformation: 'growth',
      risk_resilience:     'risk'
    };
    if (legacy[s]) return legacy[s];
    var valid = ['financial', 'products', 'customers', 'operations', 'market', 'growth', 'risk'];
    return valid.indexOf(s) !== -1 ? s : 'risk';
  },

  _formatDate: function(d) {
    if (!d) return '';
    var dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return d;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear();
  },

  // 7-category tile metadata. Same icons as bi-logic.js
  // _ALERT_CATEGORIES so the SP/OT/BI surfaces share one visual
  // language. Order matches spec §4.
  _SP_CAT_TILES: [
    { key: 'financial',  label: 'Financial',              icon: '\u{1F4B0}' },
    { key: 'products',   label: 'Products & Services',     icon: '\u{1F527}' },
    { key: 'customers',  label: 'Customers & Suppliers',   icon: '\u{1F465}' },
    { key: 'operations', label: 'Operations & Capacity',   icon: '\u{2699}️' },
    { key: 'market',     label: 'Market & Competition',    icon: '\u{1F4CA}' },
    { key: 'growth',     label: 'Growth & Transformation', icon: '\u{1F680}' },
    { key: 'risk',       label: 'Risk & Resilience',       icon: '\u{1F6E1}️' }
  ],

  // Render the 7 category tiles above the tab nav. Counts are
  // derived from cached _otRows (populated by loadInitiatives) so
  // tab switches re-render without an extra DB round-trip.
  //   OT tab → active scope: in-progress goals/tasks (excludes archived).
  //   SP tab → full plan scope: all goals/tasks including archived.
  renderCategoryTiles: function() {
    var self = this;
    var statsEl = document.getElementById('sp-cat-stats');
    if (!statsEl) return;
    var rows = self._otRows || [];
    if (!self._hasPlan || rows.length === 0) {
      statsEl.style.display = 'none';
      statsEl.innerHTML = '';
      return;
    }
    var isOps = self._currentTab === 'ops-plan';
    var counts = {};
    self._SP_CAT_TILES.forEach(function(c) { counts[c.key] = { goals: 0, tasks: 0 }; });
    rows.forEach(function(r) {
      var status = r.items && r.items.status;
      if (isOps && status === 'archived') return;
      var cat = self._normaliseCategory(r.sp_section);
      if (!counts[cat]) counts[cat] = { goals: 0, tasks: 0 };
      if (!r.parent_task_id) counts[cat].goals++;
      else counts[cat].tasks++;
    });
    var html = '';
    self._SP_CAT_TILES.forEach(function(c) {
      var k = c.key;
      var g = counts[k] ? counts[k].goals : 0;
      var t = counts[k] ? counts[k].tasks : 0;
      html += '<button type="button" class="sp-cat-tile" data-category="' + escHtml(k) + '">' +
        '<span class="sp-cat-tile-icon">' + c.icon + '</span>' +
        '<span class="sp-cat-tile-name">' + escHtml(c.label) + '</span>' +
        '<span class="sp-cat-tile-counts">' +
          '<span><b>' + g + '</b> Goals</span>' +
          '<span><b>' + t + '</b> Tasks</span>' +
        '</span>' +
      '</button>';
    });
    statsEl.innerHTML = html;
    statsEl.style.display = '';
  },

  // Wire click → switch to OT tab if needed, then expand and scroll
  // to the matching category accordion. SP tab has no categorised
  // body content, so clicking from there transitions to OT first.
  bindCategoryTileEvents: function() {
    var self = this;
    var statsEl = document.getElementById('sp-cat-stats');
    if (!statsEl) return;
    if (statsEl.dataset.bound === '1') return;
    statsEl.dataset.bound = '1';
    statsEl.addEventListener('click', function(e) {
      var btn = e.target.closest('.sp-cat-tile');
      if (!btn) return;
      var cat = btn.getAttribute('data-category');
      if (!cat) return;
      var doScroll = function() {
        var card = document.querySelector('.sp-ot-cat[data-category="' + cat + '"]');
        if (!card) return;
        if (!card.classList.contains('expanded')) {
          var header = card.querySelector('.expand-tile-header');
          if (header) header.click();
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      if (self._currentTab !== 'ops-plan') {
        self.switchTab('ops-plan');
        // loadInitiatives repaints async — wait one paint before scrolling.
        setTimeout(doScroll, 200);
      } else {
        doScroll();
      }
    });
  },

  // Spec §9.5 — five stats: Total Goals, Total Tasks, Tasks Complete,
  // Overdue, Due This Week.
  updateOpsStats: function(totalGoals, totalTasks, completed, overdue, dueThisWeek) {
    var statsEl = document.getElementById('sp-ops-stats');
    if (!statsEl) return;
    statsEl.innerHTML =
      '<div class="stat-card"><div class="stat-value">' + (totalGoals || 0) + '</div><div class="stat-label">Total Goals</div></div>' +
      '<div class="stat-card teal"><div class="stat-value">' + (totalTasks || 0) + '</div><div class="stat-label">Total Tasks</div></div>' +
      '<div class="stat-card green"><div class="stat-value">' + (completed || 0) + '</div><div class="stat-label">Tasks Complete</div></div>' +
      '<div class="stat-card red"><div class="stat-value">' + (overdue || 0) + '</div><div class="stat-label">Overdue</div></div>' +
      '<div class="stat-card orange"><div class="stat-value">' + (dueThisWeek || 0) + '</div><div class="stat-label">Due This Week</div></div>';
  },

  getExpandState: function(initId) {
    try {
      var states = JSON.parse(localStorage.getItem('sp_expand_states') || '{}');
      return states[initId] !== false;
    } catch (e) { return true; }
  },

  saveExpandState: function() {
    try {
      var states = {};
      document.querySelectorAll('.sp-initiative[data-init-id]').forEach(function(el) {
        states[el.dataset.initId] = el.classList.contains('expanded');
      });
      localStorage.setItem('sp_expand_states', JSON.stringify(states));
    } catch (e) { /* localStorage unavailable */ }
  },

  toggleExpandAll: function() {
    var self = this;
    var initiatives = document.querySelectorAll('.sp-initiative');
    var allExpanded = Array.from(initiatives).every(function(el) { return el.classList.contains('expanded'); });
    initiatives.forEach(function(el) {
      el.classList.toggle('expanded', !allExpanded);
    });
    var btn = document.querySelector('[data-expand]');
    if (btn) btn.textContent = allExpanded ? 'Expand All' : 'Collapse All';
    self.saveExpandState();
  },

  // Spec §9.3 — All / Active / Completed / Overdue / Due This Week.
  _applyOTFilter: function() {
    var view = this._otCurrentFilter || 'all';
    var listEl = document.getElementById('sp-initiatives-list');
    if (!listEl) return;
    listEl.querySelectorAll('.sp-ot-task').forEach(function(t) {
      var status = t.getAttribute('data-status');
      var overdue = t.getAttribute('data-overdue') === '1';
      var dueWeek = t.getAttribute('data-due-week') === '1';
      var show = true;
      if (view === 'active') show = status !== 'done';
      else if (view === 'completed') show = status === 'done';
      else if (view === 'overdue') show = overdue;
      else if (view === 'due-this-week') show = dueWeek;
      t.style.display = show ? '' : 'none';
    });
  },

  // Legacy alias — older bindOpsEvents callers still reference
  // filterInitiatives; route through to the new filter.
  filterInitiatives: function(view) {
    this._otCurrentFilter = view;
    this._applyOTFilter();
  },

  toggleOpsView: function(viewId) {
    document.querySelectorAll('[data-ops-view]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.opsView === viewId);
    });
    var listEl = document.getElementById('sp-initiatives-list');
    var outlookEl = document.getElementById('sp-outlook-view');
    var addBtn = document.getElementById('sp-add-initiative-btn');
    var expandBtn = document.querySelector('[data-expand]');
    if (viewId === 'outlook') {
      if (listEl) listEl.style.display = 'none';
      if (outlookEl) outlookEl.style.display = 'block';
      if (addBtn) addBtn.style.display = 'none';
      if (expandBtn) expandBtn.style.display = 'none';
    } else {
      if (listEl) listEl.style.display = '';
      if (outlookEl) outlookEl.style.display = 'none';
      if (addBtn) addBtn.style.display = '';
      if (expandBtn) expandBtn.style.display = '';
    }
  },

  renderOutlookView: function(allSubtasks, initiatives, subtaskMap) {
    var self = this;
    var container = document.getElementById('sp-outlook-view');
    if (!container) return;
    if (!allSubtasks || allSubtasks.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No tasks with dates to display.</p></div>';
      return;
    }
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var weeks = [];
    for (var w = 0; w < 13; w++) {
      var wStart = new Date(today);
      wStart.setDate(wStart.getDate() + (w * 7));
      var wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      weeks.push({ start: wStart, end: wEnd, label: self._formatDate(wStart).replace(/ \d{4}$/, '') });
    }
    var headerHtml = '<div class="sp-outlook-header"><div class="sp-outlook-track-label"></div>';
    weeks.forEach(function(wk, i) {
      headerHtml += '<div class="sp-outlook-week' + (i === 0 ? ' current' : '') + '">' + escHtml(wk.label) + '</div>';
    });
    headerHtml += '</div>';
    var tracksHtml = '';
    initiatives.forEach(function(init) {
      var subs = subtaskMap[init.id] || [];
      if (subs.length === 0) return;
      var initName = init.initiative_name || (init.items && init.items.title) || 'Untitled';
      tracksHtml += '<div class="sp-outlook-track"><div class="sp-outlook-track-label" title="' + escHtml(initName) + '">' + escHtml(initName) + '</div><div class="sp-outlook-cells">';
      weeks.forEach(function(wk) {
        tracksHtml += '<div class="sp-outlook-cell">';
        subs.forEach(function(sub) {
          var dd = sub.items && sub.items.due_date ? new Date(sub.items.due_date) : null;
          if (!dd || isNaN(dd.getTime())) return;
          dd.setHours(0, 0, 0, 0);
          if (dd >= wk.start && dd <= wk.end) {
            var prio = (sub.items.priority || 'medium').toLowerCase();
            var isDone = sub.items.status === 'done';
            var cls = isDone ? 'done' : prio;
            var tip = escHtml((sub.items.title || '') + ' (' + self._formatDate(dd) + ')');
            tracksHtml += '<span class="sp-outlook-dot ' + cls + '" data-task-id="' + escHtml(sub.id) + '" title="' + tip + '"></span>';
          }
        });
        tracksHtml += '</div>';
      });
      tracksHtml += '</div></div>';
    });
    var leg = '<div class="sp-outlook-legend">';
    [['red','High'],['orange','Medium'],['green','Low'],['grey','Done']].forEach(function(p) {
      leg += '<span><span class="sp-outlook-legend-dot" style="background:var(--' + p[0] + ')"></span>' + p[1] + '</span>';
    });
    container.innerHTML = '<div class="sp-outlook-wrap">' + headerHtml + tracksHtml + leg + '</div></div>';
    container.querySelectorAll('.sp-outlook-dot').forEach(function(dot) {
      dot.addEventListener('click', function() {
        var taskId = dot.dataset.taskId;
        self.toggleOpsView('list');
        setTimeout(function() {
          var taskEl = document.querySelector('.sp-subtask[data-id="' + taskId + '"]');
          if (taskEl) {
            var initEl = taskEl.closest('.sp-initiative');
            if (initEl && !initEl.classList.contains('expanded')) initEl.classList.add('expanded');
            taskEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            taskEl.style.background = 'var(--warning-light)';
            setTimeout(function() { taskEl.style.background = ''; }, 2000);
          }
        }, 100);
      });
    });
  },

  // Two-status model (Gap 4) — checkbox click opens the archive
  // confirmation; Confirm archives, Cancel reverts.
  toggleSubtask: function(taskId) {
    this._showArchiveOnCompleteModal(taskId);
  },

  _showArchiveOnCompleteModal: function(taskId) {
    var self = this;
    var modal = document.getElementById('sp-ot-archive-modal');
    if (!modal) return;
    modal.classList.add('open');
    var noBtn = document.getElementById('sp-ot-archive-no');
    var yesBtn = document.getElementById('sp-ot-archive-yes');
    var onNo, onYes, onBackdrop;
    var cleanup = function() {
      modal.classList.remove('open');
      if (noBtn) noBtn.removeEventListener('click', onNo);
      if (yesBtn) yesBtn.removeEventListener('click', onYes);
      modal.removeEventListener('click', onBackdrop);
    };
    onNo = function() {
      cleanup();
      // Cancel — the task stays In Progress. Re-render so the
      // checkbox snaps back from its optimistic checked state.
      self.loadInitiatives();
    };
    onYes = function() { cleanup(); self.archiveTask(taskId); };
    onBackdrop = function(e) { if (e.target === modal) cleanup(); };
    if (noBtn) noBtn.addEventListener('click', onNo);
    if (yesBtn) yesBtn.addEventListener('click', onYes);
    modal.addEventListener('click', onBackdrop);
  },

  // Archive screen methods (openArchiveScreen, loadArchiveScreen,
  // _renderArchiveScreen and friends, _restoreArchivedTask) live in
  // strategic-plan-archive.js so this module stays under 60K.

  // Spec §9.7 — items.status = 'archived' moves the row to Archive.
  archiveTask: function(taskId) {
    var self = this;
    if (!self._supabase || !taskId) return;
    self._supabase
      .from('action_tracker')
      .select('items')
      .eq('id', taskId)
      .single()
      .then(function(res) {
        if (res.error || !res.data) return;
        var items = res.data.items || {};
        items.status = 'archived';
        self._supabase
          .from('action_tracker')
          .update({ items: items })
          .eq('id', taskId)
          .then(function(upRes) {
            if (upRes.error) { console.error('[SP] Archive task error:', upRes.error.message); return; }
            self.loadInitiatives();
          });
      });
  },

  editSubtaskTitle: function(taskId) {
    var self = this;
    var titleEl = document.querySelector('.sp-subtask[data-id="' + taskId + '"] .sp-subtask-title');
    if (!titleEl || titleEl.querySelector('input')) return;
    var current = titleEl.textContent;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'sp-inline-edit-input';
    input.value = current;
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();

    function save() {
      var v = input.value.trim();
      if (v && v !== current) {
        self.saveTaskField(taskId, 'title', v);
      }
      self.loadInitiatives();
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') input.blur(); });
  },

  editDueDate: function(taskId, dueEl) {
    var self = this;
    if (dueEl.querySelector('input')) return;
    var current = (dueEl.textContent || '').trim();
    var input = document.createElement('input');
    input.type = 'date';
    input.className = 'sp-inline-edit-input';
    input.style.width = '150px';
    if (current && !current.startsWith('Day')) {
      input.value = current;
    }
    dueEl.textContent = '';
    dueEl.appendChild(input);
    input.focus();

    function save() {
      var v = input.value;
      if (v) {
        self.saveTaskField(taskId, 'due_date', v);
        dueEl.textContent = v;
      } else {
        dueEl.textContent = current || 'Set date';
      }
    }
    input.addEventListener('blur', save);
    input.addEventListener('change', function() { input.blur(); });
  },

  editOwner: function(taskId, ownerEl) {
    var self = this;
    if (ownerEl.querySelector('select')) return;
    var current = (ownerEl.textContent || '').trim();
    var roles = ['Owner','Admin','Office manager','Leading hand','Project manager','Estimator','Bookkeeper'];
    var select = document.createElement('select');
    select.className = 'sp-inline-edit-input';
    select.style.width = '160px';
    select.innerHTML = roles.map(function(r) {
      return '<option value="' + escHtml(r) + '"' + (r === current ? ' selected' : '') + '>' + escHtml(r) + '</option>';
    }).join('');
    ownerEl.textContent = '';
    ownerEl.appendChild(select);
    select.focus();

    function save() {
      var v = select.value;
      self.saveTaskField(taskId, 'owner', v);
      self._supabase.from('action_tracker').update({ owner: v }).eq('id', taskId).then(function() {});
      ownerEl.textContent = v;
    }
    select.addEventListener('blur', save);
    select.addEventListener('change', function() { select.blur(); });
  },

  // Spec §9.7 — Add Task inline form on each Goal card.
  showAddTaskForm: function(btn) {
    var self = this;
    var goalCard = btn.closest('.sp-ot-goal');
    if (!goalCard) return;
    if (goalCard.querySelector('.sp-ot-add-task-form')) return;
    var goalId = btn.dataset.goalId || goalCard.dataset.goalId;
    btn.style.display = 'none';
    var form = document.createElement('div');
    form.className = 'sp-ot-add-task-form';
    form.innerHTML =
      '<div class="sp-ot-add-task-row">' +
        '<input type="text" class="sp-input sp-ot-add-task-title" placeholder="Task title">' +
        '<input type="date" class="sp-input sp-ot-add-task-due" style="width:140px">' +
        '<span class="lookback-dropdown-wrap">' +
          '<button type="button" class="lookback-dropdown lookback-dropdown-field sp-ot-add-task-prio" data-value="Medium">Medium</button>' +
          '<div class="lookback-dropdown-menu sp-ot-add-task-prio-menu">' +
            '<button type="button" class="lookback-dropdown-item" data-value="High">High</button>' +
            '<button type="button" class="lookback-dropdown-item active" data-value="Medium">Medium</button>' +
            '<button type="button" class="lookback-dropdown-item" data-value="Low">Low</button>' +
          '</div>' +
        '</span>' +
        '<input type="text" class="sp-input sp-ot-add-task-owner" placeholder="Owner" value="Owner" style="width:120px">' +
      '</div>' +
      '<div class="sp-ot-add-task-row">' +
        '<textarea class="sp-input sp-ot-add-task-desc" placeholder="Description (the what and the why)" rows="2" style="flex:1;min-width:280px"></textarea>' +
      '</div>' +
      '<div class="sp-ot-add-task-actions">' +
        '<button type="button" class="btn-outline btn-sm sp-ot-add-task-cancel">Cancel</button>' +
        '<button type="button" class="btn-primary btn-sm sp-ot-add-task-submit" data-goal-id="' + escHtml(goalId) + '">Add Task</button>' +
      '</div>';
    goalCard.appendChild(form);
    self.wireLookbackDropdown(form.querySelector('.sp-ot-add-task-prio'), form.querySelector('.sp-ot-add-task-prio-menu'));
    var titleInp = form.querySelector('.sp-ot-add-task-title');
    if (titleInp) titleInp.focus();
  },

  submitAddTaskForm: function(btn) {
    var self = this;
    var form = btn.closest('.sp-ot-add-task-form');
    if (!form) return;
    var goalId = btn.dataset.goalId;
    var title = (form.querySelector('.sp-ot-add-task-title').value || '').trim();
    if (!title) { form.querySelector('.sp-ot-add-task-title').classList.add('sp-input-error'); return; }
    var dueDate = form.querySelector('.sp-ot-add-task-due').value || '';
    var priority = form.querySelector('.sp-ot-add-task-prio').getAttribute('data-value') || 'Medium';
    var owner = (form.querySelector('.sp-ot-add-task-owner').value || 'Owner').trim();
    var description = (form.querySelector('.sp-ot-add-task-desc').value || '').trim();
    if (!self._supabase || !self._userId || !goalId) return;
    self._supabase
      .from('action_tracker')
      .insert({
        user_id: self._userId,
        parent_task_id: goalId,
        items: {
          title: title,
          description: description,
          status: 'in_progress',
          priority: priority,
          due_date: dueDate || null,
          owner: owner
        },
        source: 'user_added',
        owner: owner,
        is_pending: false
      })
      .select('id')
      .single()
      .then(function(res) {
        if (res.error) { self._showError('Could not add task. Please try again.'); return; }
        self.loadInitiatives();
      });
  },

  saveTaskField: function(taskId, field, value) {
    var self = this;
    if (!self._supabase) return;
    self._supabase
      .from('action_tracker')
      .select('items')
      .eq('id', taskId)
      .single()
      .then(function(res) {
        if (res.error) return;
        var items = res.data.items || {};
        items[field] = value;
        self._supabase
          .from('action_tracker')
          .update({ items: items })
          .eq('id', taskId)
          .then(function(upRes) {
            if (upRes.error) console.error('[SP] Save task field error:', upRes.error.message);
          });
      });
  },

  confirmDeleteTask: function(taskId) {
    var self = this;
    var modal = document.getElementById('sp-confirm-modal');
    var body = document.getElementById('sp-confirm-body');
    var okBtn = document.getElementById('sp-confirm-ok');
    if (!modal || !body || !okBtn) return;

    body.textContent = 'Are you sure you want to delete this task? This cannot be undone.';
    modal.classList.add('open');

    var handler = function() {
      self.deleteTask(taskId);
      modal.classList.remove('open');
      okBtn.removeEventListener('click', handler);
    };
    okBtn.addEventListener('click', handler);
  },

  deleteTask: function(taskId) {
    var self = this;
    if (!self._supabase) return;
    self._supabase
      .from('action_tracker')
      .delete()
      .eq('id', taskId)
      .then(function(res) {
        if (!res.error) self.loadInitiatives();
      });
  },

  // showAddInitiativeModal / createInitiative removed — the spec
  // uses Add Goal via AI chat (handled in strategic-plan-review.js
  // for pending plans) instead of a manual Add Initiative.

  // Sign one storage path on demand. SP docs live in cl-assets under
  // an owner-only prefix, so getPublicUrl returns 403s — every read
  // must go through createSignedUrl. Pattern matches cl-review.js:318
  // and email-assistant-logic.js:1092. Returns '' on failure so the
  // caller can omit the link rather than render a broken anchor.
  _signSpDocPath: function(path) {
    if (!path || !this._supabase) return Promise.resolve('');
    return this._supabase.storage.from('cl-assets').createSignedUrl(path, 3600)
      .then(function(res) {
        if (res.error || !res.data || !res.data.signedUrl) {
          console.error('[SP] Sign URL error:', (res.error && res.error.message) || 'no signedUrl returned');
          return '';
        }
        return res.data.signedUrl;
      });
  },

  loadStrategicPlanView: function() {
    var self = this;
    if (!self._supabase || !self._userId) return;

    self._supabase
      .from('strategic_plans')
      .select('id, plan_name, version, created_at, is_current, document_1_url, document_2_url, swot_data')
      .eq('user_id', self._userId)
      .eq('is_current', true)
      .single()
      .then(function(res) {
        if (res.error || !res.data) return;
        var plan = res.data;

        var titleEl = document.getElementById('sp-doc-plan-title');
        if (titleEl) titleEl.textContent = (plan.plan_name || 'Strategic Plan') + ' v' + (plan.version || 1) + ' — Current Plan';

        var dateEl = document.getElementById('sp-doc-generated-date');
        if (dateEl) dateEl.textContent = 'Generated: ' + (plan.created_at ? plan.created_at.substring(0, 10) : '');

        // document_1_url / document_2_url hold storage paths — sign them
        // on demand each time the user views this tab. Both signs run
        // in parallel so the render isn't bottlenecked on the slower
        // one. If either fails the link is just omitted.
        var linksEl = document.getElementById('sp-download-links');
        if (linksEl) {
          Promise.all([
            self._signSpDocPath(plan.document_1_url),
            self._signSpDocPath(plan.document_2_url)
          ]).then(function(signed) {
            var dlHtml = '';
            if (signed[0]) {
              dlHtml += '<a href="' + escHtml(signed[0]) + '" class="btn-sp-download" download>Strategic Plan (Word)</a> ';
            }
            if (signed[1]) {
              dlHtml += '<a href="' + escHtml(signed[1]) + '" class="btn-sp-download" download>Operational Plan (Word)</a> ';
            }
            dlHtml += '<button class="btn-sp-print" type="button">Print / Save as PDF</button>';
            dlHtml += ' <button class="btn-outline btn-sm" id="sp-update-plan-btn" type="button">Update Plan</button>';
            linksEl.innerHTML = dlHtml;
          });
        }

        if (plan.swot_data) self.renderSwot(plan.swot_data);
      });

    self.loadVersionHistory();
  },

  renderSwot: function(swotData) {
    var section = document.getElementById('sp-swot-section');
    var grid = document.getElementById('sp-swot-grid');
    if (!section || !grid || !swotData) return;

    var categories = ['strengths', 'weaknesses', 'opportunities', 'threats'];
    var html = '';
    categories.forEach(function(cat) {
      var items = swotData[cat] || [];
      html += '<div class="sp-swot-card ' + cat + '">';
      html += '<div class="sp-swot-title">' + cat.charAt(0).toUpperCase() + cat.slice(1) + '</div>';
      html += '<div class="sp-swot-items">';
      if (Array.isArray(items) && items.length > 0) {
        html += items.map(function(item) { return '• ' + escHtml(item); }).join('<br>');
      } else if (typeof items === 'string') {
        html += escHtml(items);
      } else {
        html += '<em>Not available</em>';
      }
      html += '</div></div>';
    });

    grid.innerHTML = html;
    section.style.display = 'block';
  },

  loadVersionHistory: function() {
    var self = this;
    var el = document.getElementById('sp-version-history');
    if (!el || !self._supabase || !self._userId) return;
    self._supabase
      .from('strategic_plans')
      .select('id, version, plan_name, created_at, is_current, document_1_url, document_2_url')
      .eq('user_id', self._userId)
      .order('version', { ascending: false })
      .then(function(res) {
        if (res.error) { console.error('[SP] Version history error:', res.error.message); return; }
        var versions = (res.data && res.data.length > 0) ? res.data : null;
        if (!versions) return;
        // document_1_url / document_2_url hold storage paths. Sign each
        // version's pair in parallel before rendering so the row HTML
        // can stay synchronous and href values are valid signed URLs.
        var jobs = [];
        versions.forEach(function(v) {
          jobs.push(self._signSpDocPath(v.document_1_url));
          jobs.push(self._signSpDocPath(v.document_2_url));
        });
        Promise.all(jobs).then(function(signed) {
          versions.forEach(function(v, i) {
            v._doc1Signed = signed[i * 2];
            v._doc2Signed = signed[i * 2 + 1];
          });
          self.renderVersionHistory(versions, el);
        });
      });
  },

  renderVersionHistory: function(versions, el) {
    if (!el || !versions || versions.length === 0) return;
    var html = '<h3 class="sp-section-heading">Version History</h3><div class="sp-version-list">';
    versions.forEach(function(v) {
      var label = v.plan_name || ('Plan v' + v.version);
      var dateStr = v.created_at ? v.created_at.substring(0, 10) : '';
      var badge = v.is_current ? ' <span class="sp-current-badge">Current Plan</span>' : '';
      var doc1 = v._doc1Signed ? '<a href="' + escHtml(v._doc1Signed) + '" class="sp-vh-link" download>Strategic Plan</a> ' : '';
      var doc2 = v._doc2Signed ? '<a href="' + escHtml(v._doc2Signed) + '" class="sp-vh-link" download>Ops Plan</a> ' : '';
      var useBtn = v.is_current ? '' : '<button class="btn-sp-use-template" data-plan-id="' + escHtml(v.id) + '" type="button">Use as Template</button>';
      html += '<div class="sp-version-row' + (v.is_current ? ' sp-version-current' : '') + '">';
      html += '<div class="sp-vh-label">' + escHtml(label) + badge + '</div>';
      html += '<div class="sp-vh-meta">Generated: ' + escHtml(dateStr) + '</div>';
      html += '<div class="sp-vh-actions">' + doc1 + doc2 + useBtn + '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.style.display = 'block';
  },

  useAsTemplate: function(planId) {
    var self = this;
    if (!self._supabase) return;
    self._supabase
      .from('strategic_plans')
      .select('interview_data')
      .eq('id', planId)
      .single()
      .then(function(res) {
        if (res.data && res.data.interview_data) {
          self.prefillFromPreviousPlan(res.data.interview_data);
          self.switchTab('create-plan');
          self.goToSection(0);
        }
      });
  },

});
