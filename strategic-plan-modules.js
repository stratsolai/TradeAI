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

    opsContent.addEventListener('click', function(e) {
      // View filter pills
      var viewPill = e.target.closest('[data-view]');
      if (viewPill) {
        document.querySelectorAll('#sp-ops-controls [data-view]').forEach(function(p) {
          p.classList.remove('active');
        });
        viewPill.classList.add('active');
        self.filterInitiatives(viewPill.dataset.view);
        return;
      }

      // Expand all toggle
      var expandBtn = e.target.closest('[data-expand]');
      if (expandBtn) {
        self.toggleExpandAll();
        return;
      }

      // Initiative header (expand/collapse)
      var initHeader = e.target.closest('.sp-initiative-header');
      if (initHeader) {
        var initiative = initHeader.closest('.sp-initiative');
        if (initiative) {
          initiative.classList.toggle('expanded');
          self.saveExpandState();
        }
        return;
      }

      // Sub-task checkbox
      var checkbox = e.target.closest('.sp-subtask-check');
      if (checkbox) {
        var subtask = checkbox.closest('.sp-subtask');
        if (subtask) self.toggleSubtask(subtask.dataset.id);
        return;
      }

      // Sub-task edit
      var editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        var subtask = editBtn.closest('.sp-subtask');
        if (subtask) self.editSubtaskTitle(subtask.dataset.id);
        return;
      }

      // Sub-task delete
      var deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        var subtask = deleteBtn.closest('.sp-subtask');
        if (subtask) self.confirmDeleteTask(subtask.dataset.id);
        return;
      }

      // Due date click
      var dueEl = e.target.closest('.sp-subtask-due');
      if (dueEl) {
        var subtask = dueEl.closest('.sp-subtask');
        if (subtask) self.editDueDate(subtask.dataset.id, dueEl);
        return;
      }

      // Owner click
      var ownerEl = e.target.closest('.sp-subtask-owner');
      if (ownerEl) {
        var subtask = ownerEl.closest('.sp-subtask');
        if (subtask) self.editOwner(subtask.dataset.id, ownerEl);
        return;
      }

      // Notes toggle
      var notesBtn = e.target.closest('.sp-notes-toggle');
      if (notesBtn) {
        var notesEl = notesBtn.closest('.sp-subtask').querySelector('.sp-subtask-notes-text');
        if (notesEl) notesEl.style.display = notesEl.style.display === 'none' ? 'block' : 'none';
        return;
      }

      // Add task within initiative — show inline form
      var addTaskBtn = e.target.closest('.btn-sp-add-task');
      if (addTaskBtn) {
        self.showAddTaskForm(addTaskBtn);
        return;
      }

      // Add task form submit
      var addTaskSubmit = e.target.closest('.sp-add-task-submit');
      if (addTaskSubmit) {
        self.submitAddTaskForm(addTaskSubmit);
        return;
      }

      // Add task form cancel
      var addTaskCancel = e.target.closest('.sp-add-task-cancel');
      if (addTaskCancel) {
        var form = addTaskCancel.closest('.sp-add-task-form');
        if (form) form.remove();
        var btn = addTaskCancel.closest('.sp-add-task-row').querySelector('.btn-sp-add-task');
        if (btn) btn.style.display = '';
        return;
      }

      // Add initiative button
      var addInitBtn = e.target.closest('#sp-add-initiative-btn');
      if (addInitBtn) {
        self.showAddInitiativeModal();
        return;
      }

      // View toggle (list / outlook)
      var viewBtn = e.target.closest('[data-ops-view]');
      if (viewBtn) {
        self.toggleOpsView(viewBtn.dataset.opsView);
        return;
      }
    });

    // Priority change is now handled by the lookback's onSelect
    // callback bound in wireSubtaskPriorityLookbacks — native change
    // events no longer fire from the converted button widget.
  },

  bindDocEvents: function() {
    var self = this;
    var docContent = document.getElementById('sp-doc-content');
    if (!docContent) return;

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
        self.renderInitiatives(res.data || []);
      });
  },

  renderInitiatives: function(rows) {
    var self = this;
    var initiatives = [];
    var subtaskMap = {};

    rows.forEach(function(row) {
      if (!row.parent_task_id) {
        initiatives.push(row);
        subtaskMap[row.id] = [];
      }
    });

    rows.forEach(function(row) {
      if (row.parent_task_id && subtaskMap[row.parent_task_id]) {
        subtaskMap[row.parent_task_id].push(row);
      }
    });

    // If no hierarchical data yet, fall back to flat task rendering
    if (initiatives.length === 0 && rows.length > 0) {
      self.renderFlatTracker(rows);
      return;
    }

    if (initiatives.length === 0) {
      var listEl = document.getElementById('sp-initiatives-list');
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1F4CB;</div>' +
          '<h3>No initiatives yet</h3><p>Generate your plan or add an initiative to get started.</p></div>';
      }
      self.updateOpsStats(0, 0, 0, 0);
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

    var html = '';
    initiatives.forEach(function(init) {
      var subs = subtaskMap[init.id] || [];
      var done = 0;
      subs.forEach(function(s) {
        var status = (s.items && s.items.status) || 'pending';
        totalTasks++;
        if (status === 'done') { done++; completedTasks++; }
        else {
          var dd = s.items && s.items.due_date ? new Date(s.items.due_date) : null;
          if (dd) {
            dd.setHours(0, 0, 0, 0);
            if (dd < today) overdueTasks++;
            if (dd >= today && dd < weekEnd) dueThisWeek++;
          }
        }
        allSubtasks.push({ row: s, initName: init.initiative_name || (init.items && init.items.title) || '' });
      });
      var pct = subs.length > 0 ? Math.round((done / subs.length) * 100) : 0;

      var statusClass = '';
      if (subs.length > 0) {
        if (pct === 100) statusClass = 'status-green';
        else if (done < subs.length * 0.5) statusClass = 'status-amber';
      }

      var spBadge = init.sp_section ? ' <span class="badge badge-blue">' + escHtml(self.formatSectionName(init.sp_section)) + '</span>' : '';
      var sourceBadge = init.source === 'bi_action' ? ' <span class="badge badge-orange">BI</span>' : init.is_carried_forward ? ' <span class="badge badge-orange">CF</span>' : '';

      var expanded = self.getExpandState(init.id);

      html += '<div class="sp-initiative' + (statusClass ? ' ' + statusClass : '') + (expanded ? ' expanded' : '') + '" data-init-id="' + escHtml(init.id) + '">';
      html += '<div class="sp-initiative-header">';
      html += '<span class="sp-initiative-name">' + escHtml(init.initiative_name || (init.items && init.items.title) || 'Untitled Initiative') + spBadge + sourceBadge + '</span>';
      html += '<div class="sp-initiative-progress"><div class="sp-initiative-progress-fill" style="width:' + pct + '%"></div></div>';
      html += '<span class="sp-initiative-count">' + done + ' of ' + subs.length + ' tasks</span>';
      html += '<span class="sp-initiative-chevron">&#9660;</span>';
      html += '</div>';

      html += '<div class="sp-initiative-body">';
      subs.forEach(function(sub) {
        html += self.renderSubtaskRow(sub);
      });
      html += '<div class="sp-add-task-row"><button class="btn-sp-add-task" data-parent-id="' + escHtml(init.id) + '" type="button">+ Add Task</button></div>';
      html += '</div></div>';
    });

    var listEl = document.getElementById('sp-initiatives-list');
    if (listEl) listEl.innerHTML = html;
    self.wireSubtaskPriorityLookbacks();

    var overallPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    var fillEl = document.getElementById('sp-ops-progress-fill');
    if (fillEl) fillEl.style.width = overallPct + '%';
    var pctLabel = document.getElementById('sp-ops-progress-pct');
    if (pctLabel) pctLabel.textContent = overallPct + '% complete';

    self.updateOpsStats(initiatives.length, completedTasks, overdueTasks, dueThisWeek);
    self.renderOutlookView(allSubtasks, initiatives, subtaskMap);
  },

  renderFlatTracker: function(rows) {
    var self = this;
    var completedTasks = 0;
    var groups = { 1: [], 2: [], 3: [], 0: [] };
    rows.forEach(function(row) {
      var g = row.month_group || 0;
      if (!groups[g]) groups[g] = [];
      groups[g].push(row);
      if (row.items && row.items.status === 'done') completedTasks++;
    });

    var html = '';
    [1, 2, 3, 0].forEach(function(g) {
      if (!groups[g] || groups[g].length === 0) return;
      var heading = g === 1 ? 'Month 1 (Days 1–30)' : g === 2 ? 'Month 2 (Days 31–60)' : g === 3 ? 'Month 3 (Days 61–90)' : 'General Tasks';
      html += '<div class="sp-initiative expanded" data-month-group="' + g + '">';
      html += '<div class="sp-initiative-header"><span class="sp-initiative-name">' + escHtml(heading) + '</span><span class="sp-initiative-chevron">&#9660;</span></div>';
      html += '<div class="sp-initiative-body">';
      groups[g].forEach(function(row) { html += self.renderSubtaskRow(row); });
      html += '</div></div>';
    });

    var listEl = document.getElementById('sp-initiatives-list');
    if (listEl) listEl.innerHTML = html;
    self.wireSubtaskPriorityLookbacks();
    var pct = rows.length > 0 ? Math.round((completedTasks / rows.length) * 100) : 0;
    var fillEl = document.getElementById('sp-ops-progress-fill');
    if (fillEl) fillEl.style.width = pct + '%';
    var pctLabel = document.getElementById('sp-ops-progress-pct');
    if (pctLabel) pctLabel.textContent = pct + '% complete';
    self.updateOpsStats(0, completedTasks, 0, 0);
  },

  _formatDate: function(d) {
    if (!d) return '';
    var dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return d;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear();
  },

  renderSubtaskRow: function(row) {
    var self = this;
    var items = row.items || {};
    var done = items.status === 'done';
    var title = items.title || '';
    var priority = items.priority || 'Medium';
    var dueDate = items.due_date || '';
    var owner = row.owner || items.owner || '';
    var notes = items.notes || '';

    var priorityClass = priority === 'High' ? 'sp-priority-high' :
                        priority === 'Low' ? 'sp-priority-low' :
                        'sp-priority-medium';

    var sourceBadge = row.source === 'bi_action' ? ' <span class="badge badge-orange">BI</span>' : row.is_carried_forward ? ' <span class="badge badge-orange">CF</span>' : '';

    var html = '<div class="sp-subtask' + (done ? ' sp-subtask-done' : '') + '" data-id="' + escHtml(row.id) + '">';
    html += '<input type="checkbox" class="sp-subtask-check"' + (done ? ' checked' : '') + '>';
    html += '<div class="sp-subtask-body">';
    html += '<span class="sp-subtask-title">' + escHtml(title) + '</span>' + sourceBadge;
    html += '<div class="sp-subtask-meta">';
    var dueDateDisplay = dueDate ? self._formatDate(dueDate) : 'Set date';
    var isOverdue = false;
    if (dueDate && !done) {
      var dd = new Date(dueDate); dd.setHours(0,0,0,0);
      var now = new Date(); now.setHours(0,0,0,0);
      isOverdue = dd < now;
    }
    html += '<span class="sp-subtask-due' + (isOverdue ? ' sp-subtask-overdue' : '') + '" title="Click to change">' + escHtml(dueDateDisplay) + '</span>';
    html += '<span class="sp-subtask-owner" title="Click to change">' + escHtml(owner || 'Owner') + '</span>';
    var displayPriority = priority || 'Medium';
    html += '<span class="lookback-dropdown-wrap sp-subtask-priority-wrap">'
         +   '<button type="button" class="lookback-dropdown lookback-dropdown-field sp-subtask-priority ' + priorityClass + '" data-value="' + escHtml(displayPriority) + '">' + escHtml(displayPriority) + '</button>'
         +   '<div class="lookback-dropdown-menu sp-subtask-priority-menu">'
         +     ['High', 'Medium', 'Low'].map(function(p) {
                 return '<button type="button" class="lookback-dropdown-item' + (p === displayPriority ? ' active' : '') + '" data-value="' + p + '">' + p + '</button>';
              }).join('')
         +   '</div>'
         + '</span>';
    if (notes) html += '<button class="sp-notes-toggle" type="button">Notes</button>';
    html += '</div>';
    if (notes) html += '<div class="sp-subtask-notes sp-subtask-notes-text">' + escHtml(notes) + '</div>';
    html += '</div>';
    html += '<div class="sp-subtask-actions">';
    html += '<button class="sp-subtask-action-btn edit-btn" type="button" title="Edit">&#9998;</button>';
    html += '<button class="sp-subtask-action-btn delete-btn" type="button" title="Delete">&#10005;</button>';
    html += '</div></div>';
    return html;
  },

  updateOpsStats: function(initiatives, completed, overdue, dueThisWeek) {
    var statsEl = document.getElementById('sp-ops-stats');
    if (!statsEl) return;
    statsEl.innerHTML =
      '<div class="stat-card"><div class="stat-value">' + initiatives + '</div><div class="stat-label">Initiatives</div></div>' +
      '<div class="stat-card green"><div class="stat-value">' + completed + '</div><div class="stat-label">Tasks Complete</div></div>' +
      '<div class="stat-card orange"><div class="stat-value">' + overdue + '</div><div class="stat-label">Overdue</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + dueThisWeek + '</div><div class="stat-label">Due This Week</div></div>';
  },

  formatSectionName: function(k) {
    return {business_foundation:'Foundation',products_services:'Products',financial_position:'Financial',operations_capacity:'Operations',market_competition:'Market',growth_transformation:'Growth',risk_resilience:'Risk'}[k]||k;
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

  filterInitiatives: function(view) {
    var initiatives = document.querySelectorAll('.sp-initiative');
    initiatives.forEach(function(el) {
      if (view === 'all') {
        el.style.display = '';
      } else if (view === 'completed') {
        var isComplete = el.classList.contains('status-green');
        el.style.display = isComplete ? '' : 'none';
      } else if (view === 'active') {
        var isComplete = el.classList.contains('status-green');
        el.style.display = isComplete ? 'none' : '';
      }
    });
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

  toggleSubtask: function(taskId) {
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
        items.status = items.status === 'done' ? 'pending' : 'done';
        self._supabase
          .from('action_tracker')
          .update({ items: items })
          .eq('id', taskId)
          .then(function(upRes) {
            if (upRes.error) { console.error('[SP] Toggle subtask update error:', upRes.error.message); return; }
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

  showAddTaskForm: function(btn) {
    var self = this;
    var row = btn.closest('.sp-add-task-row');
    if (!row || row.querySelector('.sp-add-task-form')) return;
    btn.style.display = 'none';
    var parentId = btn.dataset.parentId;
    var form = document.createElement('div');
    form.className = 'sp-add-task-form';
    var f = '<div class="sp-add-task-grid">';
    f += '<div class="sp-add-task-col-title"><input type="text" class="sp-input sp-add-task-title" placeholder="Task title"></div>';
    f += '<div class="sp-add-task-col-sm">'
       + '<span class="lookback-dropdown-wrap">'
       + '<button type="button" class="lookback-dropdown lookback-dropdown-field sp-add-task-priority" data-value="Medium">Medium</button>'
       + '<div class="lookback-dropdown-menu sp-add-task-priority-menu">'
       + '<button type="button" class="lookback-dropdown-item" data-value="High">High</button>'
       + '<button type="button" class="lookback-dropdown-item active" data-value="Medium">Medium</button>'
       + '<button type="button" class="lookback-dropdown-item" data-value="Low">Low</button>'
       + '</div></span></div>';
    f += '<div class="sp-add-task-col-md"><input type="date" class="sp-input sp-add-task-due"></div>';
    f += '<div class="sp-add-task-col-md">'
       + '<span class="lookback-dropdown-wrap">'
       + '<button type="button" class="lookback-dropdown lookback-dropdown-field sp-add-task-owner" data-value="Owner">Owner</button>'
       + '<div class="lookback-dropdown-menu sp-add-task-owner-menu">'
       + '<button type="button" class="lookback-dropdown-item active" data-value="Owner">Owner</button>'
       + '<button type="button" class="lookback-dropdown-item" data-value="Admin">Admin</button>'
       + '<button type="button" class="lookback-dropdown-item" data-value="Office manager">Office mgr</button>'
       + '<button type="button" class="lookback-dropdown-item" data-value="Project manager">Project mgr</button>'
       + '<button type="button" class="lookback-dropdown-item" data-value="Other">Other</button>'
       + '</div></span></div>';
    f += '</div><div class="sp-add-task-buttons">';
    f += '<button class="btn-primary btn-sm sp-add-task-submit" data-parent-id="' + escHtml(parentId) + '" type="button">Add</button>';
    f += '<button class="btn-outline btn-sm sp-add-task-cancel" type="button">Cancel</button></div>';
    form.innerHTML = f;
    row.appendChild(form);
    // Wire the two lookback-dropdowns by element reference rather than
    // ID — multiple Add Task forms can exist simultaneously (one per
    // initiative the user has expanded), so unique IDs would clash.
    self.wireLookbackDropdown(form.querySelector('.sp-add-task-priority'), form.querySelector('.sp-add-task-priority-menu'));
    self.wireLookbackDropdown(form.querySelector('.sp-add-task-owner'), form.querySelector('.sp-add-task-owner-menu'));
    form.querySelector('.sp-add-task-title').focus();
  },

  submitAddTaskForm: function(btn) {
    var self = this;
    var form = btn.closest('.sp-add-task-form');
    if (!form) return;
    var parentId = btn.dataset.parentId;
    var title = (form.querySelector('.sp-add-task-title').value || '').trim();
    if (!title) {
      form.querySelector('.sp-add-task-title').classList.add('sp-input-error');
      return;
    }
    var priority = form.querySelector('.sp-add-task-priority').getAttribute('data-value') || 'Medium';
    var dueDate = form.querySelector('.sp-add-task-due').value;
    var owner = form.querySelector('.sp-add-task-owner').getAttribute('data-value') || 'Owner';

    if (!self._supabase || !self._userId) return;
    self._supabase
      .from('action_tracker')
      .insert({
        user_id: self._userId,
        items: { title: title, status: 'pending', priority: priority, due_date: dueDate || null },
        parent_task_id: parentId,
        source: 'user_added',
        owner: owner,
        plan_id: null
      })
      .select()
      .single()
      .then(function(res) {
        if (res.error) {
          self._showError('Could not add task. Please try again.');
          return;
        }
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

  showAddInitiativeModal: function() {
    var self = this;
    var modal = document.getElementById('sp-add-init-modal');
    if (!modal) return;
    document.getElementById('sp-new-init-name').value = '';
    self.resetLookbackDropdown('sp-new-init-section', 'sp-new-init-section-menu');
    modal.classList.add('open');
  },

  createInitiative: function() {
    var self = this;
    var name = (document.getElementById('sp-new-init-name').value || '').trim();
    var section = document.getElementById('sp-new-init-section').getAttribute('data-value') || '';
    if (!name) {
      self._showError('Please enter an initiative name.');
      return;
    }
    if (!self._supabase || !self._userId) return;

    self._supabase
      .from('action_tracker')
      .insert({
        user_id: self._userId,
        items: { title: name, status: 'pending' },
        initiative_name: name,
        sp_section: section || null,
        source: 'user_added',
        parent_task_id: null
      })
      .select()
      .single()
      .then(function(res) {
        if (res.error) {
          self._showError('Could not create initiative. Please try again.');
          return;
        }
        document.getElementById('sp-add-init-modal').classList.remove('open');
        self.loadInitiatives();
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

        var linksEl = document.getElementById('sp-download-links');
        if (linksEl) {
          var dlHtml = '';
          if (plan.document_1_url) {
            dlHtml += '<a href="' + escHtml(plan.document_1_url) + '" class="btn-sp-download" download>Strategic Plan (Word)</a> ';
          }
          if (plan.document_2_url) {
            dlHtml += '<a href="' + escHtml(plan.document_2_url) + '" class="btn-sp-download" download>Operational Plan (Word)</a> ';
          }
          dlHtml += '<button class="btn-sp-print" type="button">Print / Save as PDF</button>';
          dlHtml += ' <button class="btn-outline btn-sm" id="sp-update-plan-btn" type="button">Update Plan</button>';
          linksEl.innerHTML = dlHtml;
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
        if (res.data && res.data.length > 0) self.renderVersionHistory(res.data, el);
      });
  },

  renderVersionHistory: function(versions, el) {
    if (!el || !versions || versions.length === 0) return;
    var html = '<h3 class="sp-section-heading">Version History</h3><div class="sp-version-list">';
    versions.forEach(function(v) {
      var label = v.plan_name || ('Plan v' + v.version);
      var dateStr = v.created_at ? v.created_at.substring(0, 10) : '';
      var badge = v.is_current ? ' <span class="sp-current-badge">Current Plan</span>' : '';
      var doc1 = v.document_1_url ? '<a href="' + escHtml(v.document_1_url) + '" class="sp-vh-link" download>Strategic Plan</a> ' : '';
      var doc2 = v.document_2_url ? '<a href="' + escHtml(v.document_2_url) + '" class="sp-vh-link" download>Ops Plan</a> ' : '';
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
      });
  }

});
