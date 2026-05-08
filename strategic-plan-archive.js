/**
 * strategic-plan-archive.js
 * SP/OT Rebuild Spec §9.7 — Archive screen for the Operational
 * Tasks tab. Toggles in over the active OT view via the View
 * Archive link; lists archived tasks (action_tracker rows where
 * items.status = 'archived') grouped by Plan Version → Goal,
 * with keyword search across title/description/notes, a category
 * filter row, and a Restore button per task that flips the row
 * back to 'pending'. Bulk actions are out of scope for Phase 4.
 *
 * Loaded alongside strategic-plan-logic.js / -modules.js / -review.js;
 * methods Object.assign onto window.SP_LOGIC so cross-file calls
 * (e.g. loadInitiatives, _normaliseCategory, _formatDate) resolve
 * naturally on the same object.
 */
window.SP_LOGIC = window.SP_LOGIC || {};
Object.assign(window.SP_LOGIC, {

  openArchiveScreen: function() {
    var content = document.getElementById('sp-ops-content');
    var archive = document.getElementById('sp-ops-archive');
    if (content) content.style.display = 'none';
    if (archive) archive.style.display = 'block';
    this.loadArchiveScreen();
  },

  closeArchiveScreen: function() {
    var content = document.getElementById('sp-ops-content');
    var archive = document.getElementById('sp-ops-archive');
    if (archive) archive.style.display = 'none';
    if (content) content.style.display = 'block';
  },

  loadArchiveScreen: function() {
    var self = this;
    if (!self._supabase || !self._userId) return;
    var archiveEl = document.getElementById('sp-ops-archive');
    if (!archiveEl) return;
    archiveEl.innerHTML = '<div class="sp-section-loading">Loading archive…</div>';
    Promise.all([
      self._supabase
        .from('action_tracker')
        .select('id, items, parent_task_id, plan_id, sp_section, initiative_name, source, is_carried_forward')
        .eq('user_id', self._userId),
      self._supabase
        .from('strategic_plans')
        .select('id, plan_name, version')
        .eq('user_id', self._userId)
    ]).then(function(results) {
      var rowsRes = results[0];
      var plansRes = results[1];
      if (rowsRes.error) {
        console.error('[OT Archive] load error:', rowsRes.error.message);
        archiveEl.innerHTML = '<div class="sp-ot-archive-empty">Could not load archive.</div>';
        return;
      }
      self._archiveRows = rowsRes.data || [];
      self._archivePlans = (plansRes && plansRes.data) || [];
      self._archiveSearch = '';
      self._archiveCategoryFilter = 'all';
      archiveEl.innerHTML = self._renderArchiveScreen();
      self._bindArchiveEvents();
    });
  },

  _renderArchiveScreen: function() {
    var self = this;
    var rows = self._archiveRows || [];
    var plans = self._archivePlans || [];
    var planMap = {};
    plans.forEach(function(p) { planMap[p.id] = p; });
    var goalById = {};
    rows.forEach(function(r) { if (!r.parent_task_id) goalById[r.id] = r; });

    var archived = rows.filter(function(r) {
      return r.parent_task_id && r.items && r.items.status === 'archived';
    });
    var search = (self._archiveSearch || '').toLowerCase();
    var catFilter = self._archiveCategoryFilter || 'all';
    archived = archived.filter(function(t) {
      if (catFilter !== 'all') {
        var goal = goalById[t.parent_task_id];
        var cat = goal ? self._normaliseCategory(goal.sp_section) : 'risk';
        if (cat !== catFilter) return false;
      }
      if (search) {
        var hay = ((t.items.title || '') + ' ' + (t.items.description || '') + ' ' + (t.items.notes || '')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

    var grouped = {};
    archived.forEach(function(t) {
      var pid = t.plan_id || 'unplanned';
      var gid = t.parent_task_id || 'unattached';
      if (!grouped[pid]) grouped[pid] = {};
      if (!grouped[pid][gid]) grouped[pid][gid] = [];
      grouped[pid][gid].push(t);
    });

    var head =
      '<div class="sp-ot-archive-head">' +
        '<button type="button" class="btn-back" id="sp-ot-archive-back">Back to Operational Tasks</button>' +
        '<span class="sp-ot-archive-title">Archive</span>' +
        '<span class="text-muted">' + archived.length + ' archived task' + (archived.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="sp-ot-archive-controls">' +
        '<input type="text" class="form-input sp-ot-archive-search" id="sp-ot-archive-search" placeholder="Search archived tasks…" value="' + escHtml(self._archiveSearch || '') + '">' +
        self._renderArchiveCategoryChips() +
      '</div>';

    if (archived.length === 0) {
      return head + '<div class="sp-ot-archive-empty">No archived tasks match your filters.</div>';
    }

    var planIds = Object.keys(grouped).sort(function(a, b) {
      var pa = planMap[a]; var pb = planMap[b];
      return (pb ? pb.version : 0) - (pa ? pa.version : 0);
    });
    var body = planIds.map(function(pid) {
      var plan = planMap[pid];
      var planLabel = plan ? (plan.plan_name || 'Plan') + ' v' + (plan.version || 1) : 'Other';
      var goalGroups = grouped[pid];
      var goalsHtml = Object.keys(goalGroups).map(function(gid) {
        var goal = goalById[gid];
        var goalLabel = goal ? (goal.initiative_name || (goal.items && goal.items.title) || 'Goal') : 'Standalone tasks';
        var tasksHtml = goalGroups[gid].map(function(t) { return self._renderArchiveTaskRow(t); }).join('');
        return '<div class="sp-ot-goal" style="margin-bottom:10px">' +
          '<div class="sp-ot-goal-head"><span class="sp-ot-goal-title">' + escHtml(goalLabel) + '</span></div>' +
          '<div class="sp-ot-tasks">' + tasksHtml + '</div>' +
        '</div>';
      }).join('');
      return '<div class="sp-ot-archive-group">' +
        '<div class="sp-ot-archive-group-title">' + escHtml(planLabel) + '</div>' +
        goalsHtml +
      '</div>';
    }).join('');

    return head + body;
  },

  _renderArchiveCategoryChips: function() {
    var current = this._archiveCategoryFilter || 'all';
    var cats = (this._SP_REVIEW_CATEGORIES || []).slice();
    var chips = [{ key: 'all', label: 'All' }].concat(cats.map(function(c) { return { key: c.key, label: c.label }; }));
    return chips.map(function(c) {
      return '<button type="button" class="filter-pill' + (c.key === current ? ' active' : '') + '" data-archive-cat="' + escHtml(c.key) + '">' + escHtml(c.label) + '</button>';
    }).join('');
  },

  _renderArchiveTaskRow: function(t) {
    var items = t.items || {};
    var due = items.due_date ? this._formatDate(items.due_date) : '';
    return '<div class="sp-ot-task" data-id="' + escHtml(t.id) + '" style="opacity:0.85">' +
      '<div class="sp-ot-task-row">' +
        '<span class="sp-ot-task-title" style="cursor:default">' + escHtml(items.title || '') + '</span>' +
        (due ? '<span class="sp-ot-task-due">' + escHtml(due) + '</span>' : '') +
        '<span class="badge badge-grey">Archived</span>' +
        '<span class="sp-ot-task-actions">' +
          '<button class="btn-outline btn-sm sp-ot-archive-restore" type="button" data-id="' + escHtml(t.id) + '">Restore</button>' +
        '</span>' +
      '</div>' +
    '</div>';
  },

  _bindArchiveEvents: function() {
    var self = this;
    var archiveEl = document.getElementById('sp-ops-archive');
    if (!archiveEl) return;
    archiveEl.addEventListener('click', function(e) {
      var back = e.target.closest('#sp-ot-archive-back');
      if (back) { self.closeArchiveScreen(); return; }
      var cat = e.target.closest('[data-archive-cat]');
      if (cat) {
        self._archiveCategoryFilter = cat.getAttribute('data-archive-cat');
        archiveEl.innerHTML = self._renderArchiveScreen();
        return;
      }
      var restore = e.target.closest('.sp-ot-archive-restore');
      if (restore) { self._restoreArchivedTask(restore.getAttribute('data-id')); return; }
    });
    archiveEl.addEventListener('input', function(e) {
      if (e.target && e.target.id === 'sp-ot-archive-search') {
        self._archiveSearch = e.target.value || '';
        var pos = e.target.selectionStart;
        archiveEl.innerHTML = self._renderArchiveScreen();
        var inp = document.getElementById('sp-ot-archive-search');
        if (inp) { inp.focus(); if (pos != null) inp.setSelectionRange(pos, pos); }
      }
    });
  },

  _restoreArchivedTask: function(taskId) {
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
        items.status = 'pending';
        self._supabase
          .from('action_tracker')
          .update({ items: items })
          .eq('id', taskId)
          .then(function(upRes) {
            if (upRes.error) { console.error('[OT Archive] restore error:', upRes.error.message); return; }
            self.loadArchiveScreen();
            self.loadInitiatives();
          });
      });
  }

});
