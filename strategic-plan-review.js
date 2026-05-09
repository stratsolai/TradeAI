/**
 * strategic-plan-review.js
 * SP Review & Approval screen — spec §6. Renders the draft plan
 * after generation: editable plan name, DRAFT banner, Executive
 * Summary, SWOT, category accordions of Goals + Tasks, plus the
 * Discard / Approve flow. Loaded alongside strategic-plan-logic.js
 * and strategic-plan-modules.js; all three contribute methods to
 * the same window.SP_LOGIC object so methods cross-call freely.
 */
window.SP_LOGIC = window.SP_LOGIC || {};
Object.assign(window.SP_LOGIC, {

  // Category metadata shared with the Review screen renders. Order
  // matches spec §4. Display labels and icons end up in section
  // headers on the Review screen and in chip rows where applicable.
  _SP_REVIEW_CATEGORIES: [
    { key: 'financial',  label: 'Financial',              icon: '\u{1F4B0}' },
    { key: 'products',   label: 'Products & Services',     icon: '\u{1F527}' },
    { key: 'customers',  label: 'Customers & Suppliers',   icon: '\u{1F465}' },
    { key: 'operations', label: 'Operations & Capacity',   icon: '⚙'    },
    { key: 'market',     label: 'Market & Competition',    icon: '\u{1F4CA}' },
    { key: 'growth',     label: 'Growth & Transformation', icon: '\u{1F680}' },
    { key: 'risk',       label: 'Risk & Resilience',       icon: '\u{1F6E1}️' }
  ],

  // Loads a pending_approval plan from strategic_plans and renders
  // the Review screen. Called from init when checkPlanExists finds
  // a pending plan, and from onPlanGenerated immediately after a
  // fresh generate succeeds.
  loadReviewScreen: function(planId) {
    var self = this;
    if (!self._supabase || !self._userId || !planId) return;
    self._pendingPlanId = planId;
    var reviewEl = document.getElementById('sp-doc-review');
    if (reviewEl) reviewEl.style.display = 'block';
    self._supabase
      .from('strategic_plans')
      .select('id, plan_name, version, status, created_at, plan_data, swot_data')
      .eq('id', planId)
      .eq('user_id', self._userId)
      .single()
      .then(function(res) {
        if (res.error || !res.data) {
          console.error('[SP Review] load error:', res.error && res.error.message);
          return;
        }
        self._pendingPlanData = res.data.plan_data || {};
        self._pendingPlanRow = res.data;
        self.renderReviewScreen(res.data);
      });
  },

  renderReviewScreen: function(plan) {
    var self = this;
    var content = plan.plan_data || {};
    var headerEl = document.getElementById('sp-review-header');
    var summaryEl = document.getElementById('sp-review-summary');
    var swotEl = document.getElementById('sp-review-swot');
    var categoriesEl = document.getElementById('sp-review-categories');
    if (headerEl) headerEl.innerHTML = self.renderReviewHeader(plan);
    if (summaryEl) summaryEl.innerHTML = self.renderReviewSummary(content);
    if (swotEl) swotEl.innerHTML = self.renderReviewSwot(content, plan);
    if (categoriesEl) categoriesEl.innerHTML = self.renderReviewCategories(content);
    self.bindReviewHeaderEvents();
    self.bindReviewCategoryEvents();
    self.loadReviewBIBanner();
  },

  // ── BI Suggestions banner — spec §6.2 ────────────────────────────
  // Reads bi_insights for strategic queued items the owner hasn't
  // decided on yet (added_to_sp = true, is_tactical = false,
  // sp_queue_action IS NULL, not dismissed). When the count is non-
  // zero, a banner mounts above the Executive Summary inviting the
  // owner to Review. The Review modal lists each item with Approve
  // / Hold / Reject; Approve appends a placeholder Goal the owner
  // can refine via Discuss with AI before approving the plan.
  loadReviewBIBanner: function() {
    var self = this;
    var bannerEl = document.getElementById('sp-review-bi-banner');
    if (!bannerEl || !self._supabase || !self._userId) return;
    self._supabase
      .from('bi_insights')
      .select('id, insight_data, sp_queue_action, added_to_sp_at')
      .eq('user_id', self._userId)
      .eq('added_to_sp', true)
      .eq('is_tactical', false)
      .eq('is_dismissed', false)
      .is('sp_queue_action', null)
      .then(function(res) {
        if (res.error) {
          console.error('[SP Review] BI banner load error:', res.error.message || res.error);
          bannerEl.style.display = 'none';
          return;
        }
        var items = res.data || [];
        self._biBannerItems = items;
        if (items.length === 0) {
          bannerEl.style.display = 'none';
          bannerEl.innerHTML = '';
          return;
        }
        var label = items.length + ' new item' + (items.length === 1 ? '' : 's') + ' suggested from Business Intelligence';
        bannerEl.innerHTML =
          '<span class="sp-review-bi-banner-text">' + escHtml(label) + '</span>' +
          '<button type="button" class="btn-outline btn-sm" id="sp-review-bi-banner-review">Review</button>';
        bannerEl.style.display = 'flex';
        var btn = document.getElementById('sp-review-bi-banner-review');
        if (btn) btn.addEventListener('click', function() { self._openReviewBIModal(); });
      });
  },

  _openReviewBIModal: function() {
    var self = this;
    var modal = document.getElementById('sp-review-bi-modal');
    var body = document.getElementById('sp-review-bi-modal-body');
    if (!modal || !body) return;
    body.innerHTML = self._renderReviewBIList();
    modal.classList.add('open');
    self._bindReviewBIModalEvents();
  },

  _closeReviewBIModal: function() {
    var modal = document.getElementById('sp-review-bi-modal');
    if (modal) modal.classList.remove('open');
  },

  _renderReviewBIList: function() {
    var self = this;
    var items = self._biBannerItems || [];
    if (items.length === 0) {
      return '<div class="sp-review-empty">No queued items.</div>';
    }
    var labels = self._CHAT_CATEGORY_LABELS || {};
    return '<div class="sp-review-bi-list">' + items.map(function(item) {
      var d = item.insight_data || {};
      var category = (d.category || '').toLowerCase();
      var catLabel = labels[category] || 'Other';
      var headline = d.headline || 'Strategic suggestion';
      var detail = d.detail || '';
      var action = item.sp_queue_action || '';
      var actionCls = action ? ' sp-review-bi-' + action : '';
      var actionBadge = '';
      if (action === 'approved') actionBadge = '<span class="badge badge-green">Approved</span>';
      else if (action === 'held') actionBadge = '<span class="badge badge-orange">Held</span>';
      return '<div class="sp-review-bi-item' + actionCls + '" data-id="' + escHtml(item.id) + '">' +
        '<div class="sp-review-bi-item-head">' +
          '<span class="sp-review-bi-item-title">' + escHtml(headline) + '</span>' +
          '<span class="badge badge-blue">' + escHtml(catLabel) + '</span>' +
          actionBadge +
        '</div>' +
        (detail ? '<div class="sp-review-bi-item-detail">' + escHtml(detail) + '</div>' : '') +
        '<div class="sp-review-bi-item-source">From: BI Risks &amp; Opportunities</div>' +
        '<div class="sp-review-bi-item-actions">' +
          '<button type="button" class="review-approve-btn btn-sm" data-action="approve">Approve</button>' +
          '<button type="button" class="btn-outline btn-sm" data-action="hold">Hold</button>' +
          '<button type="button" class="btn-dismiss btn-sm" data-action="reject">Reject</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  },

  _bindReviewBIModalEvents: function() {
    var self = this;
    var modal = document.getElementById('sp-review-bi-modal');
    var closeBtn = document.getElementById('sp-review-bi-modal-close');
    var body = document.getElementById('sp-review-bi-modal-body');
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = '1';
      modal.addEventListener('click', function(e) { if (e.target === modal) self._closeReviewBIModal(); });
    }
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', function() { self._closeReviewBIModal(); });
    }
    if (body && !body.dataset.bound) {
      body.dataset.bound = '1';
      body.addEventListener('click', function(e) {
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var item = btn.closest('.sp-review-bi-item');
        if (!item) return;
        self._setReviewBIAction(item.getAttribute('data-id'), btn.getAttribute('data-action'));
      });
    }
  },

  _setReviewBIAction: function(insightId, action) {
    var self = this;
    if (!self._supabase || !self._userId || !insightId) return;
    var actionMap = { approve: 'approved', hold: 'held', reject: 'rejected' };
    var queueAction = actionMap[action];
    if (!queueAction) return;
    var nowIso = new Date().toISOString();
    var updates = { sp_queue_action: queueAction, updated_at: nowIso };
    if (queueAction === 'rejected') updates.is_dismissed = true;

    // For Approve, append a placeholder Goal to the draft plan so
    // the owner can refine it via Discuss with AI before approving.
    // The placeholder pulls headline / detail / category from the
    // insight and seeds a single suggestion task.
    if (queueAction === 'approved' && self._pendingPlanData) {
      var insight = (self._biBannerItems || []).find(function(i) { return i.id === insightId; });
      if (insight) {
        var d = insight.insight_data || {};
        var category = (d.category || 'risk').toLowerCase();
        if (!Array.isArray(self._pendingPlanData.goals)) self._pendingPlanData.goals = [];
        self._pendingPlanData.goals.push({
          category: category,
          title: (d.headline || 'BI suggestion').substring(0, 60),
          description: (d.detail || d.suggestion || '').substring(0, 240),
          tasks: d.suggestion ? [{
            title: d.suggestion.substring(0, 80),
            description: d.detail || '',
            dueRelative: 'Month 1',
            priority: d.severity === 'red' ? 'High' : d.severity === 'green' ? 'Low' : 'Medium',
            owner: 'Owner'
          }] : []
        });
        self._reviewSavePlanData();
      }
    }

    self._supabase
      .from('bi_insights')
      .update(updates)
      .eq('id', insightId)
      .eq('user_id', self._userId)
      .then(function(res) {
        if (res.error) {
          console.error('[SP Review] BI action error:', res.error.message || res.error);
          self._showError('Could not save your decision. Please try again.');
          return;
        }
        // Rebuild the list-in-memory and the UI.
        var items = self._biBannerItems || [];
        var idx = items.findIndex(function(i) { return i.id === insightId; });
        if (idx !== -1) {
          items[idx].sp_queue_action = queueAction;
          if (queueAction === 'rejected') items[idx].is_dismissed = true;
        }
        self._biBannerItems = items;
        // Re-render the modal body with the updated states.
        var body = document.getElementById('sp-review-bi-modal-body');
        if (body) body.innerHTML = self._renderReviewBIList();
        // Refresh the banner count and re-render category cards if
        // we just appended a Goal.
        self.loadReviewBIBanner();
        if (queueAction === 'approved') self._reviewRerenderCategories();
      });
  },

  // Category accordions — spec §6.5. One .expand-tile per category
  // in the unified 7-category structure. Each tile carries the
  // category summary (read-only, AI-generated) and the Goal cards
  // tagged with that category, plus an Add Goal button. Default
  // state is .expanded so the owner can scan the whole plan
  // without clicking through every section.
  renderReviewCategories: function(content) {
    var self = this;
    var summaries = (content && content.categorySummaries) || {};
    var goals = Array.isArray(content && content.goals) ? content.goals : [];
    var goalsByCategory = {};
    goals.forEach(function(goal, idx) {
      var cat = (goal && goal.category) || 'risk';
      if (!goalsByCategory[cat]) goalsByCategory[cat] = [];
      // Stash the original index so renders can map back to
      // self._pendingPlanData.goals for edit / delete.
      goalsByCategory[cat].push({ goal: goal, idx: idx });
    });
    var html = '';
    self._SP_REVIEW_CATEGORIES.forEach(function(cat, ci) {
      var entries = goalsByCategory[cat.key] || [];
      var summary = summaries[cat.key] || '';
      var summaryHtml = summary
        ? String(summary).split(/\n\n+/).map(function(p) { return '<p>' + escHtml(p.trim()) + '</p>'; }).join('')
        : '<p class="sp-review-empty">No category summary generated.</p>';
      var goalsHtml = entries.length === 0
        ? '<div class="sp-review-empty sp-review-empty-goals">No goals in this category yet.</div>'
        : entries.map(function(e) { return self.renderReviewGoalCard(e.goal, e.idx); }).join('');
      html += '<div class="expand-tile expanded sp-review-cat" data-category="' + escHtml(cat.key) + '">' +
        '<div class="expand-tile-header">' +
          '<span class="expand-tile-icon">' + cat.icon + '</span>' +
          '<span class="expand-tile-title">' + escHtml(cat.label) + '</span>' +
          '<span class="expand-tile-count">' + entries.length + (entries.length === 1 ? ' Goal' : ' Goals') + '</span>' +
        '</div>' +
        '<div class="expand-tile-content">' +
          '<div class="sp-review-cat-summary">' + summaryHtml + '</div>' +
          '<div class="sp-review-goals">' + goalsHtml + '</div>' +
          '<button type="button" class="btn-outline btn-sm sp-review-add-goal" data-category="' + escHtml(cat.key) + '">+ Add Goal</button>' +
        '</div>' +
      '</div>';
    });
    return html;
  },

  // Goal card — spec §6.6. Title and description are read-only
  // (edit via the AI chat panel landing in commit 5); tasks are
  // directly editable inline.
  renderReviewGoalCard: function(goal, goalIdx) {
    var self = this;
    if (!goal) return '';
    var tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
    var tasksHtml = tasks.length === 0
      ? '<div class="sp-review-empty sp-review-empty-tasks">No tasks for this goal yet.</div>'
      : tasks.map(function(task, ti) { return self.renderReviewTaskRow(task, goalIdx, ti); }).join('');
    return '<div class="sp-review-goal" data-goal-idx="' + goalIdx + '">' +
      '<div class="sp-review-goal-header">' +
        '<div class="sp-review-goal-title">' + escHtml(goal.title || 'Untitled goal') + '</div>' +
        '<div class="sp-review-goal-actions">' +
          '<button type="button" class="btn-outline btn-sm sp-review-discuss-btn" data-goal-idx="' + goalIdx + '">Discuss with AI</button>' +
          '<button type="button" class="btn-dismiss btn-sm sp-review-delete-goal-btn" data-goal-idx="' + goalIdx + '">Delete Goal</button>' +
        '</div>' +
      '</div>' +
      (goal.description ? '<div class="sp-review-goal-desc">' + escHtml(goal.description) + '</div>' : '') +
      '<div class="sp-review-tasks">' + tasksHtml + '</div>' +
      '<button type="button" class="btn-outline btn-sm sp-review-add-task-btn" data-goal-idx="' + goalIdx + '">+ Add Task</button>' +
    '</div>';
  },

  // Task row — spec §6.7. Title, description, due (relative
  // timeframe), priority, owner are all editable inline. Delete
  // button removes the task. The relative timeframe stays as a
  // string until Approve, where api/strategic-plan-approve.js
  // converts it to an absolute calendar date.
  renderReviewTaskRow: function(task, goalIdx, taskIdx) {
    if (!task) task = {};
    var title = task.title || '';
    var desc = task.description || task.notes || '';
    var due = task.dueRelative || task.due_date || task.dueDate || '';
    var priority = task.priority || 'Medium';
    var owner = task.owner || 'Owner';
    var pCls = priority === 'High' ? 'sp-priority-high' : priority === 'Low' ? 'sp-priority-low' : 'sp-priority-medium';
    var dueOptions = ['Week 1','Week 2','Week 3','Month 1','Month 2','Month 3'];
    var dueOptHtml = dueOptions.map(function(d) {
      return '<button type="button" class="lookback-dropdown-item' + (d === due ? ' active' : '') + '" data-value="' + escHtml(d) + '">' + escHtml(d) + '</button>';
    }).join('');
    var prioOptHtml = ['High','Medium','Low'].map(function(p) {
      return '<button type="button" class="lookback-dropdown-item' + (p === priority ? ' active' : '') + '" data-value="' + p + '">' + p + '</button>';
    }).join('');
    return '<div class="sp-review-task" data-goal-idx="' + goalIdx + '" data-task-idx="' + taskIdx + '">' +
      '<div class="sp-review-task-row1">' +
        '<span contenteditable="true" class="sp-review-task-title" data-field="title" placeholder="Task title">' + escHtml(title) + '</span>' +
        '<span class="lookback-dropdown-wrap sp-review-task-due-wrap">' +
          '<button type="button" class="lookback-dropdown lookback-dropdown-field sp-review-task-due" data-field="dueRelative" data-value="' + escHtml(due) + '">' + escHtml(due || 'Set due') + '</button>' +
          '<div class="lookback-dropdown-menu sp-review-task-due-menu">' + dueOptHtml + '</div>' +
        '</span>' +
        '<span class="lookback-dropdown-wrap sp-review-task-prio-wrap">' +
          '<button type="button" class="lookback-dropdown lookback-dropdown-field sp-review-task-prio ' + pCls + '" data-field="priority" data-value="' + escHtml(priority) + '">' + escHtml(priority) + '</button>' +
          '<div class="lookback-dropdown-menu sp-review-task-prio-menu">' + prioOptHtml + '</div>' +
        '</span>' +
        '<span contenteditable="true" class="sp-review-task-owner" data-field="owner" placeholder="Owner">' + escHtml(owner) + '</span>' +
        '<button type="button" class="sp-review-task-delete" title="Delete task" aria-label="Delete task">×</button>' +
      '</div>' +
      '<div class="sp-review-task-row2">' +
        '<span contenteditable="true" class="sp-review-task-desc" data-field="description" placeholder="Add a description (the what and the why)">' + escHtml(desc) + '</span>' +
      '</div>' +
    '</div>';
  },

  bindReviewCategoryEvents: function() {
    var self = this;
    var container = document.getElementById('sp-review-categories');
    if (!container || container.dataset.bound === '1') return;
    container.dataset.bound = '1';

    // Click delegation for the .expand-tile category accordions plus
    // every button inside them. Clicks inside .expand-tile-content
    // shouldn't collapse the parent — same pattern as the BI cards.
    container.addEventListener('click', function(e) {
      // Add Task
      var addTaskBtn = e.target.closest('.sp-review-add-task-btn');
      if (addTaskBtn) { e.stopPropagation(); self._reviewAddTask(parseInt(addTaskBtn.dataset.goalIdx, 10)); return; }
      // Delete Goal
      var delGoalBtn = e.target.closest('.sp-review-delete-goal-btn');
      if (delGoalBtn) { e.stopPropagation(); self._reviewDeleteGoal(parseInt(delGoalBtn.dataset.goalIdx, 10)); return; }
      // Delete Task
      var delTaskBtn = e.target.closest('.sp-review-task-delete');
      if (delTaskBtn) {
        e.stopPropagation();
        var taskEl = delTaskBtn.closest('.sp-review-task');
        if (taskEl) self._reviewDeleteTask(parseInt(taskEl.dataset.goalIdx, 10), parseInt(taskEl.dataset.taskIdx, 10));
        return;
      }
      // Discuss with AI — open chat panel in edit mode for this goal.
      var discussBtn = e.target.closest('.sp-review-discuss-btn');
      if (discussBtn) {
        e.stopPropagation();
        self.openGoalChat({ mode: 'edit', goalIdx: parseInt(discussBtn.dataset.goalIdx, 10) });
        return;
      }
      // Add Goal — open chat panel in create mode for the category.
      var addGoalBtn = e.target.closest('.sp-review-add-goal');
      if (addGoalBtn) {
        e.stopPropagation();
        self.openGoalChat({ mode: 'create', category: addGoalBtn.dataset.category });
        return;
      }

      // Accordion toggle — click anywhere on the tile that ISN'T
      // inside the content area.
      var tile = e.target.closest('.sp-review-cat');
      if (!tile) return;
      if (e.target.closest('.expand-tile-content')) return;
      tile.classList.toggle('expanded');
    });

    // Inline task edits — title / desc / owner via contenteditable,
    // due / priority via the lookback dropdowns. blur saves; the
    // dropdowns wire onSelect callbacks for click-to-set.
    container.addEventListener('blur', function(e) {
      var editable = e.target && e.target.closest && e.target.closest('[contenteditable="true"][data-field]');
      if (!editable) return;
      var taskEl = editable.closest('.sp-review-task');
      if (!taskEl) return;
      var goalIdx = parseInt(taskEl.dataset.goalIdx, 10);
      var taskIdx = parseInt(taskEl.dataset.taskIdx, 10);
      var field = editable.dataset.field;
      var value = (editable.textContent || '').trim();
      self._reviewUpdateTask(goalIdx, taskIdx, field, value);
    }, true);

    // Wire each due / priority lookback as it's encountered. Idempotent
    // through the wireLookbackDropdown dataset guard.
    container.querySelectorAll('.sp-review-task-due').forEach(function(btn) {
      var menu = btn.parentNode.querySelector('.sp-review-task-due-menu');
      self.wireLookbackDropdown(btn, menu, function(value) {
        var taskEl = btn.closest('.sp-review-task');
        if (!taskEl) return;
        self._reviewUpdateTask(parseInt(taskEl.dataset.goalIdx, 10), parseInt(taskEl.dataset.taskIdx, 10), 'dueRelative', value);
      });
    });
    container.querySelectorAll('.sp-review-task-prio').forEach(function(btn) {
      var menu = btn.parentNode.querySelector('.sp-review-task-prio-menu');
      self.wireLookbackDropdown(btn, menu, function(value) {
        btn.classList.remove('sp-priority-high', 'sp-priority-medium', 'sp-priority-low');
        btn.classList.add(value === 'High' ? 'sp-priority-high' : value === 'Low' ? 'sp-priority-low' : 'sp-priority-medium');
        var taskEl = btn.closest('.sp-review-task');
        if (!taskEl) return;
        self._reviewUpdateTask(parseInt(taskEl.dataset.goalIdx, 10), parseInt(taskEl.dataset.taskIdx, 10), 'priority', value);
      });
    });
  },

  // ── Plan-data mutation helpers ───────────────────────────────────
  // All edits go through these helpers so plan_data and the persisted
  // strategic_plans row stay in sync. Save is debounced — multiple
  // fast edits coalesce into one PATCH.
  _reviewUpdateTask: function(goalIdx, taskIdx, field, value) {
    var self = this;
    if (!self._pendingPlanData) return;
    var goals = self._pendingPlanData.goals;
    if (!Array.isArray(goals) || !goals[goalIdx]) return;
    var tasks = goals[goalIdx].tasks;
    if (!Array.isArray(tasks) || !tasks[taskIdx]) return;
    var current = tasks[taskIdx][field];
    if (current === value) return;
    tasks[taskIdx][field] = value;
    self._reviewSavePlanData();
  },

  _reviewAddTask: function(goalIdx) {
    var self = this;
    if (!self._pendingPlanData) return;
    var goals = self._pendingPlanData.goals;
    if (!Array.isArray(goals) || !goals[goalIdx]) return;
    if (!Array.isArray(goals[goalIdx].tasks)) goals[goalIdx].tasks = [];
    goals[goalIdx].tasks.push({
      title: '',
      description: '',
      dueRelative: 'Month 1',
      priority: 'Medium',
      owner: 'Owner'
    });
    self._reviewSavePlanData();
    self._reviewRerenderCategories();
  },

  _reviewDeleteTask: function(goalIdx, taskIdx) {
    var self = this;
    if (!self._pendingPlanData) return;
    var goals = self._pendingPlanData.goals;
    if (!Array.isArray(goals) || !goals[goalIdx]) return;
    var tasks = goals[goalIdx].tasks;
    if (!Array.isArray(tasks) || !tasks[taskIdx]) return;
    tasks.splice(taskIdx, 1);
    self._reviewSavePlanData();
    self._reviewRerenderCategories();
  },

  _reviewDeleteGoal: function(goalIdx) {
    var self = this;
    if (!self._pendingPlanData) return;
    var goals = self._pendingPlanData.goals;
    if (!Array.isArray(goals) || !goals[goalIdx]) return;
    var goalTitle = goals[goalIdx].title || 'this goal';
    var taskCount = (goals[goalIdx].tasks || []).length;
    // Platform perm-modal — uses the shared sp-confirm-modal so the
    // delete confirmation matches the rest of the platform's modal
    // styling and respects the platform's overlay / focus behaviour.
    var modal = document.getElementById('sp-confirm-modal');
    var titleEl = document.getElementById('sp-confirm-title');
    var bodyEl = document.getElementById('sp-confirm-body');
    var okBtn = document.getElementById('sp-confirm-ok');
    var cancelBtn = document.getElementById('sp-confirm-cancel');
    if (!modal || !titleEl || !bodyEl || !okBtn) {
      // Markup missing — fall back to the older path so the action is
      // never silently swallowed.
      goals.splice(goalIdx, 1);
      self._reviewSavePlanData();
      self._reviewRerenderCategories();
      return;
    }
    titleEl.textContent = 'Delete this Goal?';
    var msg = 'Delete "' + goalTitle + '". This cannot be undone.';
    if (taskCount > 0) {
      msg += ' This Goal has ' + taskCount + ' associated task' + (taskCount === 1 ? '' : 's') + ' that will also be removed.';
    }
    bodyEl.textContent = msg;
    modal.classList.add('open');
    var onConfirm, onCancel, onBackdrop;
    var cleanup = function() {
      modal.classList.remove('open');
      okBtn.removeEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
    };
    onConfirm = function() {
      cleanup();
      goals.splice(goalIdx, 1);
      self._reviewSavePlanData();
      self._reviewRerenderCategories();
    };
    onCancel = function() { cleanup(); };
    onBackdrop = function(e) { if (e.target === modal) cleanup(); };
    okBtn.addEventListener('click', onConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
  },

  _reviewRerenderCategories: function() {
    var el = document.getElementById('sp-review-categories');
    if (!el || !this._pendingPlanData) return;
    el.innerHTML = this.renderReviewCategories(this._pendingPlanData);
    // Reset the bound flag so bindReviewCategoryEvents rewires the
    // newly-rendered nodes.
    el.dataset.bound = '';
    this.bindReviewCategoryEvents();
  },

  _reviewSavePlanData: function() {
    var self = this;
    if (!self._supabase || !self._userId || !self._pendingPlanId || !self._pendingPlanData) return;
    if (self._reviewSaveTimer) clearTimeout(self._reviewSaveTimer);
    self._reviewSaveTimer = setTimeout(function() {
      self._supabase
        .from('strategic_plans')
        .update({ plan_data: self._pendingPlanData, updated_at: new Date().toISOString() })
        .eq('id', self._pendingPlanId)
        .eq('user_id', self._userId)
        .then(function(res) {
          if (res.error) console.error('[SP Review] save error:', res.error.message || res.error);
        });
    }, 400);
  },

  // Header — editable plan name, DRAFT banner, Discard / Approve.
  renderReviewHeader: function(plan) {
    var name = plan.plan_name || 'Strategic Plan';
    var generated = plan.created_at ? plan.created_at.substring(0, 10) : '';
    return '<div class="sp-review-header-row">' +
        '<div class="sp-review-header-left">' +
          '<input type="text" id="sp-review-plan-name" class="sp-review-plan-name" value="' + escHtml(name) + '" maxlength="120" />' +
          '<div class="sp-review-meta">' +
            '<span class="badge badge-orange">DRAFT — Not yet approved</span>' +
            (generated ? '<span class="sp-review-meta-date">Generated ' + escHtml(generated) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="sp-review-header-actions">' +
          '<button type="button" class="btn-back" id="sp-review-discard-btn">Discard Draft</button>' +
          '<button type="button" class="btn-primary" id="sp-review-approve-btn">Approve Plan</button>' +
        '</div>' +
      '</div>';
  },

  // Executive Summary — read-only narrative. Spec §6.3 — to change
  // the wording the owner regenerates the plan.
  renderReviewSummary: function(content) {
    var summary = (content && content.executiveSummary) || '';
    if (!summary) {
      return '<div class="sp-review-empty">Executive summary unavailable for this draft.</div>';
    }
    var paragraphs = String(summary).split(/\n\n+/).map(function(p) {
      return '<p>' + escHtml(p.trim()) + '</p>';
    }).join('');
    return '<h2 class="sp-review-section-title">Executive Summary</h2>' +
      '<div class="sp-review-readonly-note">Read-only — to change this, update your wizard answers and regenerate.</div>' +
      '<div class="sp-review-summary-body">' + paragraphs + '</div>';
  },

  // SWOT — 4-quadrant grid of dot points. Spec §6.4 — max 10 words
  // per point. Pulls from plan_data.swotPoints (the new structured
  // form) first, then falls back to swot_data (legacy shape) and
  // finally plain-text swotAnalysis if nothing structured is
  // available. The 10-word cap is enforced cosmetically by the
  // prompt; the renderer trusts what it gets.
  renderReviewSwot: function(content, plan) {
    var quadrants = [
      { key: 'strengths',     label: 'Strengths',     css: 'strengths' },
      { key: 'weaknesses',    label: 'Weaknesses',    css: 'weaknesses' },
      { key: 'opportunities', label: 'Opportunities', css: 'opportunities' },
      { key: 'threats',       label: 'Threats',       css: 'threats' }
    ];
    var points = (content && content.swotPoints) || (plan && plan.swot_data) || null;
    if (!points || typeof points !== 'object') {
      return '<h2 class="sp-review-section-title">SWOT Analysis</h2>' +
        '<div class="sp-review-empty">SWOT points unavailable for this draft.</div>';
    }
    var html = '<h2 class="sp-review-section-title">SWOT Analysis</h2>' +
      '<div class="sp-review-swot-grid">';
    quadrants.forEach(function(q) {
      var items = Array.isArray(points[q.key]) ? points[q.key] : [];
      html += '<div class="sp-review-swot-card sp-review-swot-' + q.css + '">' +
        '<div class="sp-review-swot-card-title">' + q.label + '</div>';
      if (items.length === 0) {
        html += '<div class="sp-review-swot-empty">No points generated.</div>';
      } else {
        html += '<ul class="sp-review-swot-list">';
        items.forEach(function(p) {
          html += '<li>' + escHtml(String(p).trim()) + '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  },

  bindReviewHeaderEvents: function() {
    var self = this;
    var nameInput = document.getElementById('sp-review-plan-name');
    if (nameInput && !nameInput.dataset.bound) {
      nameInput.dataset.bound = '1';
      nameInput.addEventListener('blur', function() {
        var name = nameInput.value.trim();
        if (!name || !self._pendingPlanId || !self._supabase || !self._userId) return;
        if (self._pendingPlanRow && self._pendingPlanRow.plan_name === name) return;
        self._supabase
          .from('strategic_plans')
          .update({ plan_name: name, updated_at: new Date().toISOString() })
          .eq('id', self._pendingPlanId)
          .eq('user_id', self._userId)
          .then(function(res) {
            if (res.error) console.error('[SP Review] rename error:', res.error.message);
            else if (self._pendingPlanRow) self._pendingPlanRow.plan_name = name;
          });
      });
    }
    var approveBtn = document.getElementById('sp-review-approve-btn');
    if (approveBtn && !approveBtn.dataset.bound) {
      approveBtn.dataset.bound = '1';
      approveBtn.addEventListener('click', function() { self._reviewOpenApproveModal(); });
    }
    var discardBtn = document.getElementById('sp-review-discard-btn');
    if (discardBtn && !discardBtn.dataset.bound) {
      discardBtn.dataset.bound = '1';
      discardBtn.addEventListener('click', function() { self._reviewOpenDiscardModal(); });
    }
  },

  // ── Approve flow — spec §5.1 step 5 / §6.1 ───────────────────────
  _reviewOpenApproveModal: function() {
    var self = this;
    var modal = document.getElementById('sp-review-approve-modal');
    if (!modal) return;
    modal.classList.add('open');
    var cancel = document.getElementById('sp-review-approve-cancel');
    var confirm = document.getElementById('sp-review-approve-confirm');
    var onCancel, onConfirm, onBackdrop;
    var cleanup = function() {
      modal.classList.remove('open');
      if (cancel) cancel.removeEventListener('click', onCancel);
      if (confirm) confirm.removeEventListener('click', onConfirm);
      modal.removeEventListener('click', onBackdrop);
    };
    onCancel = function() { cleanup(); };
    onConfirm = function() { cleanup(); self._reviewApprovePlan(); };
    onBackdrop = function(e) { if (e.target === modal) cleanup(); };
    if (cancel) cancel.addEventListener('click', onCancel);
    if (confirm) confirm.addEventListener('click', onConfirm);
    modal.addEventListener('click', onBackdrop);
  },

  _reviewApprovePlan: async function() {
    var self = this;
    if (!self._supabase || !self._userId || !self._pendingPlanId) return;
    var approveBtn = document.getElementById('sp-review-approve-btn');
    if (approveBtn) { approveBtn.disabled = true; approveBtn.textContent = 'Approving…'; }
    try {
      // Make sure the latest in-memory edits hit the row before we
      // approve — _reviewSavePlanData debounces writes, so a quick
      // edit before Approve might still be in flight.
      if (self._pendingPlanData) {
        await self._supabase
          .from('strategic_plans')
          .update({ plan_data: self._pendingPlanData, updated_at: new Date().toISOString() })
          .eq('id', self._pendingPlanId)
          .eq('user_id', self._userId);
      }
      var sess = await self._supabase.auth.getSession();
      var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (!token) throw new Error('Not signed in');
      var resp = await fetch('/api/strategic-plan-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ planId: self._pendingPlanId })
      });
      var json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || 'Approve failed');

      // Plan is now active. Clear pending state, clear the wizard
      // draft (we kept it across pending_approval so Discard could
      // bounce the owner back), refresh the OT tab, route there.
      self._pendingPlanId = null;
      self._pendingPlanData = null;
      self._pendingPlanRow = null;
      self._hasPlan = true;
      if (typeof self.clearDraft === 'function') self.clearDraft();
      self.updateTabStates();
      self.switchTab('ops-plan');
      if (typeof self.loadOperationalPlan === 'function') self.loadOperationalPlan();
    } catch (err) {
      console.error('[SP Review] approve error:', err && err.message);
      if (approveBtn) { approveBtn.disabled = false; approveBtn.textContent = 'Approve Plan'; }
      self._showError(err && err.message ? err.message : 'Could not approve plan. Please try again.');
    }
  },

  // ── Discard flow ─────────────────────────────────────────────────
  _reviewOpenDiscardModal: function() {
    var self = this;
    var modal = document.getElementById('sp-review-discard-modal');
    if (!modal) return;
    modal.classList.add('open');
    var cancel = document.getElementById('sp-review-discard-cancel');
    var confirm = document.getElementById('sp-review-discard-confirm');
    var onCancel, onConfirm, onBackdrop;
    var cleanup = function() {
      modal.classList.remove('open');
      if (cancel) cancel.removeEventListener('click', onCancel);
      if (confirm) confirm.removeEventListener('click', onConfirm);
      modal.removeEventListener('click', onBackdrop);
    };
    onCancel = function() { cleanup(); };
    onConfirm = function() { cleanup(); self._reviewDiscardPlan(); };
    onBackdrop = function(e) { if (e.target === modal) cleanup(); };
    if (cancel) cancel.addEventListener('click', onCancel);
    if (confirm) confirm.addEventListener('click', onConfirm);
    modal.addEventListener('click', onBackdrop);
  },

  // ── AI chat panel — spec §6.8 / §6.9 ─────────────────────────────
  // Slide-in panel on the right (.slide-panel.right.wide) that
  // hosts a back-and-forth conversation with Claude about a single
  // Goal. Two modes: 'edit' refines an existing Goal, 'create'
  // shapes a new Goal in a category. The panel keeps the
  // conversation in memory; api/sp-goal-chat.js returns a reply
  // each turn plus an optional proposedGoal once Claude has enough
  // alignment to commit to a shape.
  _CHAT_CATEGORY_LABELS: {
    financial: 'Financial', products: 'Products & Services',
    customers: 'Customers & Suppliers', operations: 'Operations & Capacity',
    market: 'Market & Competition', growth: 'Growth & Transformation',
    risk: 'Risk & Resilience'
  },

  openGoalChat: function(opts) {
    var self = this;
    var panel = document.getElementById('sp-goal-chat-panel');
    var backdrop = document.getElementById('sp-goal-chat-backdrop');
    if (!panel) return;
    self._chatState = {
      mode: opts.mode || 'edit',
      goalIdx: typeof opts.goalIdx === 'number' ? opts.goalIdx : null,
      category: opts.category || null,
      messages: [],
      proposedGoal: null
    };
    var goal = null;
    if (self._chatState.mode === 'edit' && self._pendingPlanData && Array.isArray(self._pendingPlanData.goals)) {
      goal = self._pendingPlanData.goals[self._chatState.goalIdx] || null;
      if (goal) self._chatState.category = goal.category || self._chatState.category;
    }
    var titleEl = document.getElementById('sp-goal-chat-title');
    var contextEl = document.getElementById('sp-goal-chat-context');
    var msgsEl = document.getElementById('sp-goal-chat-messages');
    var proposalEl = document.getElementById('sp-goal-chat-proposal');
    var inputEl = document.getElementById('sp-goal-chat-input');
    if (titleEl) titleEl.textContent = self._chatState.mode === 'edit' ? 'Discuss with AI' : 'Add a Goal with AI';
    var catLabel = self._CHAT_CATEGORY_LABELS[self._chatState.category] || 'Other';
    var contextText = self._chatState.mode === 'edit'
      ? 'Editing: ' + (goal && goal.title ? goal.title : 'this goal') + ' (' + catLabel + ')'
      : 'New goal in ' + catLabel;
    if (contextEl) contextEl.textContent = contextText;
    if (msgsEl) msgsEl.innerHTML = '';
    if (proposalEl) { proposalEl.style.display = 'none'; proposalEl.innerHTML = ''; }
    if (inputEl) inputEl.value = '';

    panel.classList.remove('closed');
    panel.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    self._bindChatPanelEvents();

    // Seed the conversation with an opening assistant turn so the
    // user sees a prompt rather than an empty pane. For create mode
    // we ask what they want; for edit mode we acknowledge the goal
    // and invite a change.
    var seed = self._chatState.mode === 'create'
      ? 'What goal would you like to add to ' + catLabel + '?'
      : 'What would you like to change about this goal? I can adjust the wording, regenerate the tasks, split or merge with another goal, suggest a different category, or recommend deletion.';
    self._chatAppendMessage('assistant', seed);
    if (inputEl) inputEl.focus();
  },

  closeGoalChat: function() {
    var panel = document.getElementById('sp-goal-chat-panel');
    var backdrop = document.getElementById('sp-goal-chat-backdrop');
    if (panel) { panel.classList.remove('open'); panel.classList.add('closed'); }
    if (backdrop) backdrop.classList.remove('open');
    this._chatState = null;
  },

  _bindChatPanelEvents: function() {
    var self = this;
    var panel = document.getElementById('sp-goal-chat-panel');
    var backdrop = document.getElementById('sp-goal-chat-backdrop');
    if (panel && !panel.dataset.bound) {
      panel.dataset.bound = '1';
      var closeBtn = document.getElementById('sp-goal-chat-close');
      var cancelBtn = document.getElementById('sp-goal-chat-cancel');
      var sendBtn = document.getElementById('sp-goal-chat-send');
      var inputEl = document.getElementById('sp-goal-chat-input');
      if (closeBtn) closeBtn.addEventListener('click', function() { self.closeGoalChat(); });
      // Spec §6.8 — explicit Cancel as a peer of Accept / Keep
      // Discussing. Discards any in-flight proposal and closes the
      // panel; the × button does the same thing but the spec calls
      // for a labelled Cancel control too.
      if (cancelBtn) cancelBtn.addEventListener('click', function() { self.closeGoalChat(); });
      if (sendBtn) sendBtn.addEventListener('click', function() { self._chatSend(); });
      if (inputEl) inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self._chatSend(); }
      });
      var proposalEl = document.getElementById('sp-goal-chat-proposal');
      if (proposalEl) {
        proposalEl.addEventListener('click', function(e) {
          var accept = e.target.closest('[data-chat-accept]');
          if (accept) { self._chatAcceptProposal(); return; }
          var keep = e.target.closest('[data-chat-keep]');
          if (keep) {
            // Hide the proposal and continue conversing — handy if
            // the owner wants tweaks before accepting.
            proposalEl.style.display = 'none';
            proposalEl.innerHTML = '';
            self._chatState.proposedGoal = null;
            return;
          }
          var cancel = e.target.closest('[data-chat-cancel]');
          if (cancel) { self.closeGoalChat(); return; }
        });
      }
    }
    if (backdrop && !backdrop.dataset.bound) {
      backdrop.dataset.bound = '1';
      backdrop.addEventListener('click', function() { self.closeGoalChat(); });
    }
  },

  _chatAppendMessage: function(role, content) {
    var msgsEl = document.getElementById('sp-goal-chat-messages');
    if (!msgsEl) return;
    var div = document.createElement('div');
    div.className = 'sp-goal-chat-msg ' + (role === 'user' ? 'user' : 'assistant');
    div.textContent = content;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  },

  _chatSend: async function() {
    var self = this;
    if (!self._chatState) return;
    var inputEl = document.getElementById('sp-goal-chat-input');
    if (!inputEl) return;
    var text = (inputEl.value || '').trim();
    if (!text) return;
    inputEl.value = '';
    self._chatAppendMessage('user', text);
    self._chatState.messages.push({ role: 'user', content: text });

    // Show a thinking placeholder while Claude responds.
    var msgsEl = document.getElementById('sp-goal-chat-messages');
    var thinking = null;
    if (msgsEl) {
      thinking = document.createElement('div');
      thinking.className = 'sp-goal-chat-msg assistant thinking';
      thinking.textContent = 'Thinking…';
      msgsEl.appendChild(thinking);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    try {
      var sess = await self._supabase.auth.getSession();
      var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (!token) throw new Error('Not signed in');
      var resp = await fetch('/api/sp-goal-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          mode: self._chatState.mode,
          planId: self._pendingPlanId,
          goalIdx: self._chatState.goalIdx,
          category: self._chatState.category,
          messages: self._chatState.messages
        })
      });
      var json = await resp.json();
      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);
      if (!resp.ok) throw new Error(json.error || 'Chat failed');
      var reply = json.reply || '';
      if (reply) {
        self._chatAppendMessage('assistant', reply);
        self._chatState.messages.push({ role: 'assistant', content: reply });
      }
      if (json.proposedGoal) {
        self._chatState.proposedGoal = json.proposedGoal;
        self._renderChatProposal(json.proposedGoal);
      }
    } catch (err) {
      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);
      console.error('[SP Review] chat error:', err && err.message);
      self._chatAppendMessage('assistant', 'Sorry — I could not reach the AI just then. Please try sending again.');
    }
  },

  _renderChatProposal: function(goal) {
    var proposalEl = document.getElementById('sp-goal-chat-proposal');
    if (!proposalEl) return;
    var tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
    var tasksHtml = tasks.map(function(t) {
      var bits = [];
      if (t.dueRelative) bits.push(t.dueRelative);
      if (t.priority) bits.push(t.priority);
      if (t.owner) bits.push(t.owner);
      var meta = bits.length ? ' <span class="text-muted">(' + escHtml(bits.join(' · ')) + ')</span>' : '';
      return '<li>' + escHtml(t.title || '') + meta + '</li>';
    }).join('');
    proposalEl.innerHTML = '<div class="sp-goal-chat-proposal-title">Proposed: ' + escHtml(goal.title || '') + '</div>' +
      (goal.description ? '<div class="sp-goal-chat-proposal-desc">' + escHtml(goal.description) + '</div>' : '') +
      '<ul class="sp-goal-chat-proposal-tasks">' + tasksHtml + '</ul>' +
      '<div class="sp-goal-chat-proposal-actions">' +
        '<button type="button" class="btn-primary btn-sm" data-chat-accept>Accept</button>' +
        '<button type="button" class="btn-outline btn-sm" data-chat-keep>Keep discussing</button>' +
        '<button type="button" class="btn-dismiss btn-sm" data-chat-cancel>Cancel</button>' +
      '</div>';
    proposalEl.style.display = 'block';
  },

  _chatAcceptProposal: function() {
    var self = this;
    if (!self._chatState || !self._chatState.proposedGoal) return;
    if (!self._pendingPlanData) return;
    if (!Array.isArray(self._pendingPlanData.goals)) self._pendingPlanData.goals = [];
    var proposed = self._chatState.proposedGoal;
    // Coerce category to the chat target if missing.
    if (!proposed.category) proposed.category = self._chatState.category;
    if (self._chatState.mode === 'edit' && typeof self._chatState.goalIdx === 'number') {
      self._pendingPlanData.goals[self._chatState.goalIdx] = proposed;
    } else {
      self._pendingPlanData.goals.push(proposed);
    }
    self._reviewSavePlanData();
    self._reviewRerenderCategories();
    self.closeGoalChat();
  },

  _reviewDiscardPlan: async function() {
    var self = this;
    if (!self._supabase || !self._userId || !self._pendingPlanId) return;
    var discardBtn = document.getElementById('sp-review-discard-btn');
    if (discardBtn) { discardBtn.disabled = true; discardBtn.textContent = 'Discarding…'; }
    try {
      var pendingId = self._pendingPlanId;
      // Drop the is_pending action_tracker rows tied to this plan
      // first so no orphans are left if the row delete races. Then
      // delete the strategic_plans row itself.
      await self._supabase
        .from('action_tracker')
        .delete()
        .eq('user_id', self._userId)
        .eq('plan_id', pendingId)
        .eq('is_pending', true);
      var planRes = await self._supabase
        .from('strategic_plans')
        .delete()
        .eq('id', pendingId)
        .eq('user_id', self._userId)
        .eq('status', 'pending_approval');
      if (planRes.error) throw new Error(planRes.error.message || 'Delete failed');
      self._pendingPlanId = null;
      self._pendingPlanData = null;
      self._pendingPlanRow = null;
      self.updateTabStates();
      // Route based on whether an active plan still exists. If yes,
      // back to Strategic Plan view; otherwise back to Create.
      self.switchTab(self._hasPlan ? 'strat-plan' : 'create-plan');
    } catch (err) {
      console.error('[SP Review] discard error:', err && err.message);
      if (discardBtn) { discardBtn.disabled = false; discardBtn.textContent = 'Discard Draft'; }
      self._showError('Could not discard the draft. Please try again.');
    }
  }

});
