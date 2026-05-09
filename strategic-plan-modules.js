/**
 * strategic-plan-modules.js
 * Operational Tasks rendering, initiative/subtask CRUD, and Strategic Plan
 * view (SWOT, version history). Loaded alongside strategic-plan-logic.js
 * which holds the wizard, draft autosave, prefill, and plan generation.
 * Both files contribute methods to the same window.SP_LOGIC object.
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

  // ── BI prefill orchestrator + bucketers ──────────────────────────
  // prefillFromBIContext walks SP_SECTIONS and writes a bucketed
  // value for every fromBI:true field that has a matching apiKey in
  // the prefillValues map. Spec §8.9 wires five previously-dead
  // flags here: avgJobValue, leadConversion, jobsPerMonth,
  // industryOutlook, marketTrends.
  prefillFromBIContext: function(bi) {
    var self = this;
    if (!bi) return;
    var fin = bi.financial || {};
    var ops = bi.operations || {};
    var cust = bi.customers || {};
    var market = bi.market_signal || null;

    var prefillValues = {
      annualRevenue:    self.bucketRevenue(fin.revenue),
      revenueTrend:     self.bucketRevenueTrend(fin.revenue_trend_pct),
      grossMargin:      fin.gross_margin != null
                          ? self.bucketGrossMargin(fin.gross_margin)
                          : self.bucketGrossMargin(fin.profit_margin),
      netProfitMargin:  self.bucketNetMargin(fin.profit_margin),
      avgPaymentTime:   self.bucketDebtorDays(fin.avg_debtor_days),
      avgJobValue:      self.bucketAvgJobValue(ops.avg_job_value),
      leadConversion:   self.bucketLeadConversion(cust.conversion_rate),
      jobsPerMonth:     self.bucketJobsPerMonth(ops.jobs_per_month),
      industryOutlook:  self.bucketIndustryOutlook(market),
      marketTrends:     self.bucketMarketTrends(market)
    };

    var applied = 0;
    window.SP_SECTIONS.forEach(function(s) { (s.fields || []).forEach(function(f) {
      if (!f.fromBI) return;
      var el = document.getElementById(f.id);
      if (!el) return;
      var v = prefillValues[f.apiKey];
      if (v == null) return;
      // If the user has set a different scalar value, leave it.
      var current = self.readFieldValue(el);
      if (current && current !== v && !Array.isArray(v)) return;
      if (f.type === 'chip-single') {
        el.value = v;
        var g = document.getElementById(f.id + '-chips');
        if (g) {
          g.querySelectorAll('.filter-pill').forEach(function(c) { if (c.dataset.value === v) c.classList.add('active'); });
          g.classList.add('sp-from-bi');
        }
      } else if (f.type === 'chip-multi') {
        var vals = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(function(x){return x.trim()}).filter(Boolean) : []);
        if (vals.length === 0) return;
        var group = document.getElementById(f.id + '-chips');
        if (!group) return;
        // Don't overwrite if the user has already picked any chip.
        if (group.querySelector('.filter-pill.active')) return;
        vals.forEach(function(val) {
          var chip = group.querySelector('.filter-pill[data-value="' + val + '"]');
          if (chip) chip.classList.add('active');
        });
        group.classList.add('sp-from-bi');
        self.updateHiddenFromChips(f.id);
      } else {
        self.writeFieldValue(el, v);
        el.classList.add('sp-from-bi');
      }
      applied++;
    }); });
    console.log('[SP] BI prefill — applied sp-from-bi to ' + applied + ' field(s)');
  },

  // ── BI prefill bucketers — spec §8.9 ─────────────────────────────
  // Convert raw BI numbers / signals to the wizard's bucketed option
  // values. Pure functions, called from prefillFromBIContext in
  // strategic-plan-logic.js. Bucket boundaries match the actual
  // option lists in strategic-plan-data.js — keep them in sync if
  // the option sets change.

  bucketAvgJobValue: function(amount) {
    if (amount == null || isNaN(amount)) return null;
    if (amount < 500) return 'under-500';
    if (amount < 1000) return '500-1k';
    if (amount < 2500) return '1k-2.5k';
    if (amount < 5000) return '2.5k-5k';
    if (amount < 10000) return '5k-10k';
    if (amount < 25000) return '10k-25k';
    if (amount < 50000) return '25k-50k';
    return '50k+';
  },

  bucketLeadConversion: function(pct) {
    if (pct == null || isNaN(pct)) return null;
    if (pct >= 60) return 'excellent';
    if (pct >= 40) return 'good';
    if (pct >= 25) return 'average';
    if (pct >= 0)  return 'below-average';
    return null;
  },

  bucketJobsPerMonth: function(count) {
    if (count == null || isNaN(count) || count <= 0) return null;
    if (count <= 5) return '1-5';
    if (count <= 10) return '6-10';
    if (count <= 20) return '11-20';
    if (count <= 50) return '21-50';
    if (count <= 100) return '51-100';
    return '100+';
  },

  // Industry outlook — derived from the severity distribution of
  // cached BI market insights. Heavily-green ⇒ growth; heavily-red ⇒
  // declining; mixed amber ⇒ uncertain; otherwise stable. Returns
  // null when the user has no market insights yet so the field
  // stays unset rather than guessing.
  bucketIndustryOutlook: function(signal) {
    if (!signal || !signal.severity_counts) return null;
    var c = signal.severity_counts;
    var total = (c.red || 0) + (c.amber || 0) + (c.green || 0);
    if (total === 0) return null;
    var greenPct = (c.green || 0) / total;
    var redPct = (c.red || 0) / total;
    if (greenPct >= 0.7) return 'strong-growth';
    if (greenPct >= 0.5) return 'moderate-growth';
    if (redPct >= 0.6) return 'declining';
    if ((c.amber || 0) >= 2) return 'uncertain';
    return 'stable';
  },

  // Market trends — match each trend chip's keywords against the
  // joined market insight headlines. Returns an array of trend chip
  // values (or null when no signal). The match list is intentionally
  // conservative so we don't tag a trend off a single tangential
  // word; tweak as the chip option set evolves.
  bucketMarketTrends: function(signal) {
    if (!signal || !Array.isArray(signal.headlines) || signal.headlines.length === 0) return null;
    var lower = signal.headlines.join(' ').toLowerCase();
    var keywords = {
      'digital-transform': ['digital', 'automation', 'ai ', 'ai-', 'a.i.'],
      'sustainability':    ['sustainab', 'environment', 'esg', 'net zero'],
      'consolidation':     ['consolidat', 'merger', 'acquisition', 'roll-up'],
      'skills-shortage':   ['shortage', 'skills gap', 'labour shortage', 'recruitment'],
      'regulation':        ['regulat', 'complianc', 'legislation', 'licens'],
      'material-costs':    ['material cost', 'commodity', 'inflation', 'supply chain'],
      'customer-expect':   ['expectation', 'customer demand'],
      'new-tech':          ['technology', 'innovation', 'platform']
    };
    var matched = [];
    Object.keys(keywords).forEach(function(key) {
      var kws = keywords[key];
      for (var i = 0; i < kws.length; i++) {
        if (lower.indexOf(kws[i]) !== -1) { matched.push(key); break; }
      }
    });
    return matched.length > 0 ? matched : null;
  },

  // ── Incomplete-fields modal — spec §8.8 ──────────────────────────
  // Counts every wizard field that is user-fillable but currently
  // empty (skips readonly-pills and the BI Generated Items tab). The
  // generate() flow calls this after the required-field gate passes;
  // if the count is non-zero the user picks Review Fields (jumps to
  // the first incomplete and amber-highlights all incompletes) or
  // Generate Anyway (proceeds with the partial dataset).
  _countIncompleteFields: function() {
    var self = this;
    var sections = window.SP_SECTIONS || [];
    var incomplete = [];
    sections.forEach(function(section) {
      // BI Generated Items isn't a form. Skip it entirely.
      if (section.type === 'bi-items') return;
      (section.fields || []).forEach(function(field) {
        // readonly-pills mirror Business Profile data — the user
        // can't fill them from the wizard, so an empty value here
        // means BP itself is empty and the SP wizard isn't the right
        // place to flag it.
        if (field.type === 'readonly-pills') return;
        var el = document.getElementById(field.id);
        if (!el) return;
        var value = self.readFieldValue(el);
        if (!value || !String(value).trim()) {
          incomplete.push({ section: section, field: field });
        }
      });
    });
    return incomplete;
  },

  _showIncompleteFieldsModal: function(incomplete, data) {
    var self = this;
    var modal = document.getElementById('sp-incomplete-modal');
    if (!modal) {
      // Modal markup missing — fail open and proceed with generation
      // so the user is never left stuck.
      self._performGeneration(data);
      return;
    }
    var countEl = document.getElementById('sp-incomplete-count');
    var pluralEl = document.getElementById('sp-incomplete-plural');
    if (countEl) countEl.textContent = incomplete.length;
    if (pluralEl) pluralEl.textContent = incomplete.length === 1 ? '' : 's';
    modal.classList.add('open');

    var reviewBtn = document.getElementById('sp-incomplete-review');
    var proceedBtn = document.getElementById('sp-incomplete-proceed');
    var onReview, onProceed, onBackdrop;
    var cleanup = function() {
      modal.classList.remove('open');
      if (reviewBtn) reviewBtn.removeEventListener('click', onReview);
      if (proceedBtn) proceedBtn.removeEventListener('click', onProceed);
      modal.removeEventListener('click', onBackdrop);
    };
    onReview = function() { cleanup(); self._highlightIncomplete(incomplete); };
    onProceed = function() { cleanup(); self._performGeneration(data); };
    onBackdrop = function(e) { if (e.target === modal) cleanup(); };
    if (reviewBtn) reviewBtn.addEventListener('click', onReview);
    if (proceedBtn) proceedBtn.addEventListener('click', onProceed);
    modal.addEventListener('click', onBackdrop);
  },

  _highlightIncomplete: function(incomplete) {
    var self = this;
    // Drop any leftover highlights from a prior cycle.
    document.querySelectorAll('.sp-field.sp-field-incomplete').forEach(function(el) {
      el.classList.remove('sp-field-incomplete');
    });
    incomplete.forEach(function(entry) {
      var el = document.getElementById(entry.field.id);
      if (!el) return;
      var fieldEl = el.closest('.sp-field');
      if (fieldEl) fieldEl.classList.add('sp-field-incomplete');
    });
    if (incomplete.length === 0) return;
    // Jump to the first section that has an incomplete field. The
    // setTimeout gives goToSection's smooth-scroll a beat to land
    // before we scroll the specific field into view.
    var firstSectionId = incomplete[0].section.id;
    self.goToSection(firstSectionId);
    setTimeout(function() {
      var firstFieldEl = document.getElementById(incomplete[0].field.id);
      if (!firstFieldEl) return;
      var wrapper = firstFieldEl.closest('.sp-field');
      if (wrapper && wrapper.scrollIntoView) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 250);
  },

  // ── BI Generated Items (Tab 9) — spec §8.7 ───────────────────────
  // Loads strategic insights queued from BI (Add to Plan in the
  // dashboard set added_to_sp = true on bi_insights, with
  // is_tactical = false meaning the item needs strategic decision
  // rather than an immediate task). Renders one card per item with
  // Approve / Hold / Reject buttons. The action persists on
  // bi_insights.sp_queue_action for the SP generator to read in a
  // later phase.
  loadBIQueueItems: function() {
    var self = this;
    var listEl = document.getElementById('sp-bi-queue-list');
    if (!listEl) return;
    if (!self._supabase || !self._userId) {
      listEl.innerHTML = self._renderBIQueueEmpty();
      return;
    }
    self._supabase
      .from('bi_insights')
      .select('id, insight_data, sp_queue_action, added_to_sp_at')
      .eq('user_id', self._userId)
      .eq('added_to_sp', true)
      .eq('is_tactical', false)
      .eq('is_dismissed', false)
      .order('added_to_sp_at', { ascending: false })
      .then(function(res) {
        if (res.error) {
          console.error('[SP] BI queue load error:', res.error.message || res.error);
          listEl.innerHTML = self._renderBIQueueEmpty();
          return;
        }
        var items = res.data || [];
        if (items.length === 0) {
          listEl.innerHTML = self._renderBIQueueEmpty();
          return;
        }
        listEl.innerHTML = items.map(function(item) { return self._renderBIQueueItem(item); }).join('');
      });
  },

  _renderBIQueueEmpty: function() {
    return '<div class="sp-bi-queue-empty">' +
      '<p>No items queued from Business Intelligence.</p>' +
      '<p class="sp-label-hint">Strategic insights you add from the BI dashboard will appear here for review.</p>' +
      '</div>';
  },

  _renderBIQueueItem: function(item) {
    var d = item.insight_data || {};
    var category = (d.category || '').toLowerCase();
    var categoryLabels = {
      financial: 'Financial', products: 'Products & Services',
      customers: 'Customers & Suppliers', operations: 'Operations & Capacity',
      market: 'Market & Competition', growth: 'Growth & Transformation',
      risk: 'Risk & Resilience'
    };
    var catLabel = categoryLabels[category] || 'Other';
    var action = item.sp_queue_action || '';
    var actionBadge = '';
    if (action === 'approved') actionBadge = '<span class="badge badge-green">Approved</span>';
    else if (action === 'held') actionBadge = '<span class="badge badge-orange">Held</span>';
    else if (action === 'rejected') actionBadge = '<span class="badge badge-red">Rejected</span>';

    var headline = d.headline || 'Strategic suggestion';
    var detail = d.detail || '';
    return '<div class="sp-bi-queue-item' + (action ? ' sp-bi-queue-item-' + action : '') + '" data-id="' + escHtml(item.id) + '">' +
      '<div class="sp-bi-queue-item-head">' +
        '<span class="sp-bi-queue-item-title">' + escHtml(headline) + '</span>' +
        '<span class="badge badge-blue">' + escHtml(catLabel) + '</span>' +
        actionBadge +
      '</div>' +
      (detail ? '<div class="sp-bi-queue-item-detail">' + escHtml(detail) + '</div>' : '') +
      '<div class="sp-bi-queue-item-source">From: BI Risks &amp; Opportunities</div>' +
      '<div class="sp-bi-queue-item-actions">' +
        '<button type="button" class="review-approve-btn btn-sm" data-action="approve">Approve</button>' +
        '<button type="button" class="btn-outline btn-sm" data-action="hold">Hold</button>' +
        '<button type="button" class="btn-dismiss btn-sm" data-action="reject">Reject</button>' +
      '</div>' +
    '</div>';
  },

  bindBIQueueEvents: function() {
    var self = this;
    var listEl = document.getElementById('sp-bi-queue-list');
    if (!listEl || listEl.dataset.queueBound === '1') return;
    listEl.dataset.queueBound = '1';
    listEl.addEventListener('click', function(e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var item = btn.closest('.sp-bi-queue-item');
      if (!item) return;
      var insightId = item.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      self._setBIQueueAction(insightId, action);
    });
  },

  _setBIQueueAction: function(insightId, action) {
    var self = this;
    if (!self._supabase || !self._userId || !insightId) return;
    var actionMap = { approve: 'approved', hold: 'held', reject: 'rejected' };
    var queueAction = actionMap[action];
    if (!queueAction) return;
    var nowIso = new Date().toISOString();
    var updates = { sp_queue_action: queueAction, updated_at: nowIso };
    // Reject also dismisses the insight from the BI dashboard so the
    // owner doesn't see it on the next BI page load.
    if (queueAction === 'rejected') updates.is_dismissed = true;
    self._supabase
      .from('bi_insights')
      .update(updates)
      .eq('id', insightId)
      .eq('user_id', self._userId)
      .then(function(res) {
        if (res.error) {
          console.error('[SP] BI queue update error:', res.error.message || res.error);
          self._showError('Could not save your decision. Please try again.');
          return;
        }
        self.loadBIQueueItems();
        // The active-plan BI tile reads from the same query — refresh
        // its cache so the count updates after a Tab 9 decision.
        if (typeof self.loadBIActiveTile === 'function') self.loadBIActiveTile();
      });
  }

});
