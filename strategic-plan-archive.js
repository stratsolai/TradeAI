/**
 * strategic-plan-archive.js
 * SP/OT Rebuild Spec §9.7 — Archive screen for the Operational
 * Tasks tab. Toggles in over the active OT view via the View
 * Archive link; lists archived tasks (action_tracker rows where
 * items.status = 'archived') grouped by Plan Version → Goal,
 * with keyword search across title/description/notes, category /
 * date-range / Goal filters, bulk-select with permanent delete,
 * and a Restore button per task that flips the row back to the
 * platform's active status ('in_progress').
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
        .select('id, items, parent_task_id, plan_id, sp_section, initiative_name, source, is_carried_forward, updated_at')
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
      self._archiveSearch = self._archiveSearch || '';
      self._archiveCategoryFilter = self._archiveCategoryFilter || 'all';
      self._archiveGoalFilter = self._archiveGoalFilter || 'all';
      self._archiveDateFrom = self._archiveDateFrom || '';
      self._archiveDateTo = self._archiveDateTo || '';
      self._archiveSelected = self._archiveSelected || {};
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
    var goalFilter = self._archiveGoalFilter || 'all';
    var fromTs = self._archiveDateFrom ? new Date(self._archiveDateFrom).getTime() : null;
    var toTs = self._archiveDateTo ? new Date(self._archiveDateTo).getTime() + (24 * 60 * 60 * 1000 - 1) : null;
    archived = archived.filter(function(t) {
      if (catFilter !== 'all') {
        var goal = goalById[t.parent_task_id];
        var cat = goal ? self._normaliseCategory(goal.sp_section) : 'risk';
        if (cat !== catFilter) return false;
      }
      if (goalFilter !== 'all' && t.parent_task_id !== goalFilter) return false;
      if (fromTs || toTs) {
        var ts = t.updated_at ? new Date(t.updated_at).getTime() : null;
        if (ts == null || isNaN(ts)) return false;
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts > toTs) return false;
      }
      if (search) {
        var hay = ((t.items.title || '') + ' ' + (t.items.description || '') + ' ' + (t.items.notes || '')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

    // Prune stale selections so a checkbox referencing a now-filtered-
    // out task can't survive the next bulk action.
    var visibleIds = {};
    archived.forEach(function(t) { visibleIds[t.id] = true; });
    Object.keys(self._archiveSelected || {}).forEach(function(id) {
      if (!visibleIds[id]) delete self._archiveSelected[id];
    });
    var selectedCount = Object.keys(self._archiveSelected || {}).length;

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
      '</div>' +
      '<div class="sp-ot-archive-controls">' +
        '<label class="text-muted" style="font-size:var(--label-font-size)">From <input type="date" class="form-input sp-ot-archive-date-from" id="sp-ot-archive-date-from" value="' + escHtml(self._archiveDateFrom || '') + '" style="width:150px"></label>' +
        '<label class="text-muted" style="font-size:var(--label-font-size)">To <input type="date" class="form-input sp-ot-archive-date-to" id="sp-ot-archive-date-to" value="' + escHtml(self._archiveDateTo || '') + '" style="width:150px"></label>' +
        self._renderArchiveGoalSelect(goalById, rows) +
      '</div>' +
      '<div class="sp-ot-archive-controls" id="sp-ot-archive-bulkbar">' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:var(--label-font-size)"><input type="checkbox" id="sp-ot-archive-select-all"' + (selectedCount > 0 && selectedCount === archived.length ? ' checked' : '') + '> Select all visible</label>' +
        '<span class="text-muted" style="font-size:var(--label-font-size)">' + selectedCount + ' selected</span>' +
        '<button type="button" class="btn-dismiss btn-sm" id="sp-ot-archive-bulk-delete"' + (selectedCount === 0 ? ' disabled' : '') + '>Delete permanently</button>' +
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

  // Lists every Goal that has at least one archived task so the
  // owner can scope the archive to a single goal. Distinct by goal id;
  // skips orphan tasks whose parent goal has been deleted.
  _renderArchiveGoalSelect: function(goalById, rows) {
    var current = this._archiveGoalFilter || 'all';
    var goalIdsWithArchived = {};
    rows.forEach(function(r) {
      if (r.parent_task_id && r.items && r.items.status === 'archived') {
        goalIdsWithArchived[r.parent_task_id] = true;
      }
    });
    var goals = Object.keys(goalIdsWithArchived).map(function(id) {
      var g = goalById[id];
      return { id: id, label: g ? (g.initiative_name || (g.items && g.items.title) || 'Goal') : 'Goal' };
    }).sort(function(a, b) { return a.label.localeCompare(b.label); });
    var opts = '<option value="all"' + (current === 'all' ? ' selected' : '') + '>All goals</option>' +
      goals.map(function(g) {
        return '<option value="' + escHtml(g.id) + '"' + (g.id === current ? ' selected' : '') + '>' + escHtml(g.label) + '</option>';
      }).join('');
    return '<label class="text-muted" style="font-size:var(--label-font-size)">Goal <select class="form-input sp-ot-archive-goal" id="sp-ot-archive-goal" style="width:220px">' + opts + '</select></label>';
  },

  _renderArchiveTaskRow: function(t) {
    var items = t.items || {};
    var due = items.due_date ? this._formatDate(items.due_date) : '';
    var checked = (this._archiveSelected || {})[t.id] ? ' checked' : '';
    return '<div class="sp-ot-task" data-id="' + escHtml(t.id) + '" style="opacity:0.85">' +
      '<div class="sp-ot-task-row">' +
        '<input type="checkbox" class="sp-ot-archive-select" data-id="' + escHtml(t.id) + '"' + checked + ' aria-label="Select for bulk action">' +
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
      var bulkDel = e.target.closest('#sp-ot-archive-bulk-delete');
      if (bulkDel && !bulkDel.disabled) { self._confirmArchiveBulkDelete(); return; }
    });
    archiveEl.addEventListener('input', function(e) {
      if (e.target && e.target.id === 'sp-ot-archive-search') {
        self._archiveSearch = e.target.value || '';
        var pos = e.target.selectionStart;
        archiveEl.innerHTML = self._renderArchiveScreen();
        self._bindArchiveEvents();
        var inp = document.getElementById('sp-ot-archive-search');
        if (inp) { inp.focus(); if (pos != null) inp.setSelectionRange(pos, pos); }
      }
    });
    archiveEl.addEventListener('change', function(e) {
      if (e.target && e.target.id === 'sp-ot-archive-date-from') {
        self._archiveDateFrom = e.target.value || '';
        archiveEl.innerHTML = self._renderArchiveScreen();
        self._bindArchiveEvents();
        return;
      }
      if (e.target && e.target.id === 'sp-ot-archive-date-to') {
        self._archiveDateTo = e.target.value || '';
        archiveEl.innerHTML = self._renderArchiveScreen();
        self._bindArchiveEvents();
        return;
      }
      if (e.target && e.target.id === 'sp-ot-archive-goal') {
        self._archiveGoalFilter = e.target.value || 'all';
        archiveEl.innerHTML = self._renderArchiveScreen();
        self._bindArchiveEvents();
        return;
      }
      var sel = e.target && e.target.classList && e.target.classList.contains('sp-ot-archive-select') ? e.target : null;
      if (sel) {
        var id = sel.getAttribute('data-id');
        if (sel.checked) self._archiveSelected[id] = true;
        else delete self._archiveSelected[id];
        // Re-render the bulk bar only — the row checkboxes already
        // reflect their checked state through the DOM, so a full
        // re-render isn't needed.
        var bar = document.getElementById('sp-ot-archive-bulkbar');
        if (bar) {
          var count = Object.keys(self._archiveSelected).length;
          bar.querySelector('.text-muted').textContent = count + ' selected';
          var btn = document.getElementById('sp-ot-archive-bulk-delete');
          if (btn) btn.disabled = count === 0;
        }
        return;
      }
      if (e.target && e.target.id === 'sp-ot-archive-select-all') {
        var visible = archiveEl.querySelectorAll('.sp-ot-archive-select');
        if (e.target.checked) {
          visible.forEach(function(cb) { cb.checked = true; self._archiveSelected[cb.getAttribute('data-id')] = true; });
        } else {
          visible.forEach(function(cb) { cb.checked = false; delete self._archiveSelected[cb.getAttribute('data-id')]; });
        }
        var bar2 = document.getElementById('sp-ot-archive-bulkbar');
        if (bar2) {
          var count2 = Object.keys(self._archiveSelected).length;
          bar2.querySelector('.text-muted').textContent = count2 + ' selected';
          var btn2 = document.getElementById('sp-ot-archive-bulk-delete');
          if (btn2) btn2.disabled = count2 === 0;
        }
        return;
      }
    });
  },

  _confirmArchiveBulkDelete: function() {
    var self = this;
    var ids = Object.keys(self._archiveSelected || {});
    if (ids.length === 0) return;
    var modal = document.getElementById('sp-confirm-modal');
    var titleEl = document.getElementById('sp-confirm-title');
    var body = document.getElementById('sp-confirm-body');
    var okBtn = document.getElementById('sp-confirm-ok');
    if (!modal || !body || !okBtn) return;
    if (titleEl) titleEl.textContent = 'Delete archived tasks permanently?';
    body.textContent = ids.length === 1
      ? 'This will permanently delete 1 archived task. This cannot be undone.'
      : 'This will permanently delete ' + ids.length + ' archived tasks. This cannot be undone.';
    modal.classList.add('open');
    var handler = function() {
      okBtn.removeEventListener('click', handler);
      modal.classList.remove('open');
      self._performArchiveBulkDelete(ids);
    };
    okBtn.addEventListener('click', handler);
  },

  _performArchiveBulkDelete: function(ids) {
    var self = this;
    if (!self._supabase || !ids || ids.length === 0) return;
    self._supabase
      .from('action_tracker')
      .delete()
      .in('id', ids)
      .eq('user_id', self._userId)
      .then(function(res) {
        if (res.error) { console.error('[OT Archive] bulk delete error:', res.error.message); self._showError('Could not delete the selected tasks. Please try again.'); return; }
        self._archiveSelected = {};
        self.loadArchiveScreen();
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
        items.status = 'in_progress';
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
