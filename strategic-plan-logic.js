/**
 * strategic-plan-logic.js
 * Wizard rendering, draft autosave, profile + BI prefill, plan generation,
 * tab routing, init, and shared lookback-dropdown helpers. Pairs with
 * strategic-plan-modules.js which holds Operational Tasks rendering,
 * initiative/subtask CRUD, and the Strategic Plan view (SWOT / version
 * history). Both files contribute methods to the same window.SP_LOGIC
 * object so methods cross-reference each other freely.
 */
window.SP_LOGIC = window.SP_LOGIC || {};
Object.assign(window.SP_LOGIC, {

  // ── State ────────────────────────────────────────────────────────
  _currentSection: 0,
  _currentTab: 'create-plan',
  _planData: {},
  _userProfile: null,
  _previousPlan: null,
  _hasPlan: false,
  _supabase: null,
  _userId: null,
  _currentPlanData: null,
  // Spec §6 — pending_approval plan; non-null = Review screen.
  _pendingPlanId: null,
  _pendingPlanData: null,
  _pendingPlanRow: null,

  // Financial Position id (spec §8.1 restructure moved it from 2 to
  // 3). Renders only after the BI fetch returns so prefilled fields
  // don't render-then-flicker; the flags below coordinate that.
  _SECTION_3_ID: 3,
  _cachedSavedPlanData: null,
  _cachedDraftData: null,
  _cachedBIData: null,
  _section3Rendered: false,
  _draftTimer: null,
  // Set true on the first user interaction inside the SP container.
  // Init-time prefill cascades can debounce-fire an autosave that
  // otherwise flashes Saved ✓ before the user has done anything —
  // we still write the draft, but skip the indicator until they've
  // actually interacted.
  _userInteracted: false,

  // ── Error display ────────────────────────────────────────────────
  _showError: function(message) {
    var modal = document.getElementById('sp-error-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = message;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  },

  // ── Tabs ─────────────────────────────────────────────────────────
  switchTab: function(tabId) {
    var self = this;
    self._currentTab = tabId;

    document.querySelectorAll('#sp-tab-nav .ptab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    document.querySelectorAll('#page-wrap > .ptab-content').forEach(function(panel) {
      panel.classList.toggle('active', panel.id === 'tab-' + tabId);
    });

    if (tabId === 'ops-plan' && self._hasPlan) {
      self.loadOperationalPlan();
    } else if (tabId === 'strat-plan' && self._hasPlan) {
      self.loadStrategicPlanView();
    }
  },

  updateTabStates: function() {
    // SP tab states: locked / review / content. OT stays locked
    // unless an active plan exists (pending plan's tasks hidden
    // until Approve).
    var opsLocked = document.getElementById('sp-ops-locked');
    var opsContent = document.getElementById('sp-ops-content');
    var docLocked = document.getElementById('sp-doc-locked');
    var docContent = document.getElementById('sp-doc-content');
    var docReview = document.getElementById('sp-doc-review');

    if (this._pendingPlanId) {
      if (opsLocked) opsLocked.style.display = this._hasPlan ? 'none' : 'block';
      if (opsContent) opsContent.style.display = this._hasPlan ? 'block' : 'none';
      if (docLocked) docLocked.style.display = 'none';
      if (docContent) docContent.style.display = 'none';
      if (docReview) docReview.style.display = 'block';
    } else if (this._hasPlan) {
      if (opsLocked) opsLocked.style.display = 'none';
      if (opsContent) opsContent.style.display = 'block';
      if (docLocked) docLocked.style.display = 'none';
      if (docContent) docContent.style.display = 'block';
      if (docReview) docReview.style.display = 'none';
    } else {
      if (opsLocked) opsLocked.style.display = 'block';
      if (opsContent) opsContent.style.display = 'none';
      if (docLocked) docLocked.style.display = 'block';
      if (docContent) docContent.style.display = 'none';
      if (docReview) docReview.style.display = 'none';
    }
  },

  bindTabEvents: function() {
    var self = this;
    var tabNav = document.getElementById('sp-tab-nav');
    if (!tabNav) return;
    tabNav.addEventListener('click', function(e) {
      var tab = e.target.closest('.ptab');
      if (!tab) return;
      self.switchTab(tab.dataset.tab);
    });
  },

  // ── Wizard rendering ─────────────────────────────────────────────
  renderSections: function() {
    var self = this;
    var sections = window.SP_SECTIONS;
    if (!sections || !sections.length) return;

    var navHtml = sections.map(function(s, i) {
      var label = s.chipLabel || s.title.split('. ')[1] || s.title;
      return '<button class="profile-nav-chip" data-section="' + i + '">' + (i + 1) + '. ' + escHtml(label) + '</button>';
    }).join('');
    var navEl = document.getElementById('sp-section-nav');
    if (navEl) navEl.innerHTML = navHtml;

    var container = document.getElementById('sp-sections-container');
    if (!container) return;

    container.innerHTML = sections.map(function(s) {
      // Render branches: BI Items (Tab 9 §8.7) → async queue list;
      // Financial Position → loading placeholder until BI fetch
      // returns (see renderSection3Body); everything else → fields.
      var fieldsHtml;
      if (s.type === 'bi-items') {
        fieldsHtml = '<div id="sp-bi-queue-list" class="sp-bi-queue-list">' +
          '<div class="sp-section-loading">Loading queued items…</div>' +
        '</div>';
      } else if (s.id === self._SECTION_3_ID && !self._section3Rendered) {
        fieldsHtml = '<div class="sp-section-loading">Loading from your accounting system…</div>';
      } else {
        fieldsHtml = s.fields.map(function(field) { return self.renderField(field); }).join('');
      }

      var infoBox = s.infoBox
        ? '<div class="sp-section-info"><span class="info-note"><span class="info-note-icon">&#x1F4A1;</span>' + escHtml(s.infoBox) + '</span></div>'
        : '';

      var backBtn = s.id > 0
        ? '<button class="btn-back" data-nav="-1">Back</button>'
        : '<span></span>';

      var savedIndicator = '<span id="sp-saved-' + s.id + '" class="sp-saved-indicator" ' +
        'style="color:var(--text-secondary);font-size:13px;opacity:0;transition:opacity 0.3s;margin-left:12px">' +
        'Saved ✓</span>';

      var hasProfileFields = s.fields.some(function(f) { return f.fromProfile; });
      var profileNote = hasProfileFields
        ? '<span class="info-note"><span class="info-note-icon">&#x1F4A1;</span>Shaded fields are populated from your Business Profile. To update them, edit your Business Profile in the Content Library.</span>'
        : '';

      var nextBtn = '';
      if (s.id < sections.length - 1) {
        nextBtn = '<button class="btn-back" data-nav="1">Next</button>';
      } else {
        nextBtn = '<button class="btn-primary btn-sp-generate">Generate My Plan</button>';
      }

      return '<div class="profile-section-card" id="section-' + s.id + '" style="display:none;">' +
        '<div class="profile-section-header">' +
          '<span class="profile-section-icon">' + s.icon + '</span>' +
          '<div>' +
            '<h2 class="profile-section-title">' + escHtml(s.title) + '</h2>' +
            '<p class="profile-section-subtitle">' + escHtml(s.subtitle) + '</p>' +
          '</div>' +
        '</div>' +
        infoBox +
        '<div class="sp-fields">' + fieldsHtml + '</div>' +
        '<div class="sp-nav-buttons">' +
          '<div class="sp-nav-left">' + backBtn + savedIndicator + '</div>' +
          '<div class="sp-nav-centre">' + profileNote + '</div>' +
          '<div class="sp-nav-right">' + nextBtn + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    self.bindFormEvents();
  },

  renderField: function(field) {
    var reqMark = field.required ? ' <span class="sp-required">*</span>' : '';
    var label = '<label class="sp-field-label" for="' + field.id + '">' +
      escHtml(field.label) + reqMark +
      (field.labelHint ? ' <span class="sp-label-hint">' + escHtml(field.labelHint) + '</span>' : '') +
      '</label>';

    var helpText = field.helpText
      ? '<p class="sp-field-help">' + escHtml(field.helpText) + '</p>'
      : '';

    var errorEl = field.required
      ? '<span class="sp-field-error" id="err-' + field.id + '">This field is required</span>'
      : '';

    var input = '';

    if (field.type === 'text') {
      input = '<input type="text" id="' + field.id + '" class="sp-input" placeholder="' + escHtml(field.placeholder || '') + '">';
    } else if (field.type === 'textarea') {
      input = '<textarea id="' + field.id + '" class="sp-textarea" placeholder="' + escHtml(field.placeholder || '') + '" rows="4"></textarea>';
    } else if (field.type === 'select') {
      // First option is the placeholder (default active). Rendered as a
      // lookback-dropdown trigger button (id={field.id}) plus a sibling
      // menu (id={field.id}-menu). Field reads/writes go through
      // readFieldValue/writeFieldValue so the rest of the form code can
      // stay element-type agnostic. Dynamic-from-profile selects render
      // with a Loading placeholder until prefillFromProfile populates.
      var firstOpt = (field.options && field.options[0]) || null;
      var initialValue = firstOpt ? firstOpt.value : '';
      var initialLabel = firstOpt ? firstOpt.label : (field.dynamicFromProfile ? 'Loading…' : '');
      var menuItems = (field.options || []).map(function(o, i) {
        return '<button type="button" class="lookback-dropdown-item' + (i === 0 ? ' active' : '') + '" data-value="' + escHtml(o.value) + '">' + escHtml(o.label) + '</button>';
      }).join('');
      if (!menuItems && field.dynamicFromProfile) {
        menuItems = '<button type="button" class="lookback-dropdown-item active" data-value="">Loading…</button>';
      }
      input = '<span class="lookback-dropdown-wrap">'
        + '<button type="button" class="lookback-dropdown lookback-dropdown-field" id="' + field.id + '" data-value="' + escHtml(initialValue) + '">' + escHtml(initialLabel) + '</button>'
        + '<div class="lookback-dropdown-menu" id="' + field.id + '-menu">' + menuItems + '</div>'
        + '</span>';
    } else if (field.type === 'chip-single' || field.type === 'chip-multi') {
      var chips = (field.options || []).map(function(o) {
        return '<div class="filter-pill" data-value="' + escHtml(o.value) + '" data-group="' + field.id + '" data-multi="' + (field.type === 'chip-multi') + '">' + escHtml(o.label) + '</div>';
      }).join('');
      input = '<div class="sp-chip-group" id="' + field.id + '-chips">' + chips + '</div>';
      if (field.allowOther) {
        // BP-style "Add" pattern: type a value, click Add, becomes a
        // removable chip. Replaces the older "Other" pill + comma-
        // separated text input. Custom chips render with × remove.
        input += '<div class="sp-add-other" style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
          '<input type="text" id="' + field.id + '-other-input" class="sp-input sp-add-other-input" data-target="' + field.id + '" placeholder="Add your own" style="flex:1">' +
          '<button type="button" class="btn-outline btn-sm" data-action="sp-add-other" data-target="' + field.id + '">+ Add</button>' +
        '</div>';
      }
      input += '<input type="hidden" id="' + field.id + '" value="">';
    } else if (field.type === 'readonly-pills') {
      // Readonly display of BP-sourced data — pills mirror the
      // Source Review Tagged Categories component (same container
      // class .review-tool-pills, same per-pill classes). Pills are
      // rendered into the empty container by prefillFromProfile,
      // and the hidden input carries the underlying value into
      // collectSectionData so the AI prompt still receives it.
      input = '<div class="review-tool-pills" id="' + field.id + '-pills"></div>';
      input += '<input type="hidden" id="' + field.id + '" value="">';
    }

    return '<div class="sp-field">' + label + helpText + input + errorEl + '</div>';
  },

  bindFormEvents: function() {
    var self = this;
    self.wireInterviewSelects();
    var navEl = document.getElementById('sp-section-nav');
    if (navEl) {
      navEl.addEventListener('click', function(e) {
        var chip = e.target.closest('.profile-nav-chip');
        if (chip && chip.dataset.section !== undefined) {
          self.goToSection(parseInt(chip.dataset.section, 10));
        }
      });
    }

    var container = document.getElementById('sp-sections-container');
    if (container) {
      container.addEventListener('click', function(e) {
        // Custom-chip × must be checked first — it sits inside a
        // .filter-pill, so otherwise the chip-toggle path would steal
        // the click and just toggle the chip instead of removing it.
        var rmBtn = e.target.closest('[data-action="sp-remove-custom"]');
        if (rmBtn) {
          self.removeCustomChip(rmBtn);
          return;
        }
        var addBtn = e.target.closest('[data-action="sp-add-other"]');
        if (addBtn) {
          self.addCustomChip(addBtn.dataset.target);
          return;
        }
        var chip = e.target.closest('.filter-pill');
        if (chip) {
          self.toggleChip(chip, chip.dataset.group, chip.dataset.multi === 'true');
          return;
        }
        var navBtn = e.target.closest('[data-nav]');
        if (navBtn) {
          self.navigate(parseInt(navBtn.dataset.nav, 10));
          return;
        }
        var genBtn = e.target.closest('.btn-sp-generate');
        if (genBtn) {
          self.generate();
          return;
        }
      });

      container.addEventListener('input', function() {
        // Autosave-on-keystroke for text / textarea fields. Lookback-
        // dropdown selections schedule via the wireInterviewSelects
        // callback (no native change event); chip groups schedule via
        // their own click handlers.
        self.scheduleDraftSave();
      });

      // Catch every other input change in the section container so
      // autosave fires whether the user is typing or blurring a text
      // input. Lookback-dropdowns and chip groups schedule via their
      // own click handlers.
      container.addEventListener('change', function() {
        self.scheduleDraftSave();
      });
      container.addEventListener('click', function(e) {
        if (e.target.closest('.filter-pill') || e.target.closest('[data-nav]')) {
          self.scheduleDraftSave();
        }
      });
      container.addEventListener('blur', function() { self.scheduleDraftSave(); }, true);

      // First genuine user interaction inside the SP container —
      // unlocks the Saved ✓ flash. Capture phase + once so each
      // listener runs at most once.
      var markInteracted = function() { self._userInteracted = true; };
      container.addEventListener('pointerdown', markInteracted, { capture: true, once: true });
      container.addEventListener('keydown', markInteracted, { capture: true, once: true });
    }
  },

  // ── Draft autosave ───────────────────────────────────────────────
  // Autosave the in-progress interview answers to the
  // strategic_plan_drafts Supabase table so the draft follows the
  // user across devices/sessions. RLS on the table restricts each
  // user to their own row; one row per user (UNIQUE on user_id).
  // Migration: migrations/strategic-plan-drafts.sql.
  scheduleDraftSave: function() {
    var self = this;
    if (self._draftTimer) clearTimeout(self._draftTimer);
    self._draftTimer = setTimeout(function() {
      self.saveDraftNow();
      // Clear spec §8.8 incomplete highlights as fields fill.
      document.querySelectorAll('.sp-field.sp-field-incomplete').forEach(function(fieldEl) {
        var input = fieldEl.querySelector('[id]');
        if (!input) return;
        var v = self.readFieldValue(input);
        if (v && String(v).trim()) fieldEl.classList.remove('sp-field-incomplete');
      });
    }, 500);
  },

  saveDraftNow: function() {
    var self = this;
    if (!self._supabase || !self._userId) return;
    var data = self.collectFieldValuesForDraft();
    self._supabase
      .from('strategic_plan_drafts')
      .upsert({ user_id: self._userId, draft_data: data }, { onConflict: 'user_id' })
      .then(function(res) {
        if (res.error) {
          console.error('[SP] draft save error:', res.error.message || res.error);
          return;
        }
        self.flashSavedIndicator(self._currentSection);
      });
  },

  collectFieldValuesForDraft: function() {
    var self = this;
    var data = {};
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        var el = document.getElementById(field.id);
        if (!el) return;
        var raw = (self.readFieldValue(el) || '').trim();
        if (!raw) return;
        var key = field.apiKey || field.id;
        if (field.valueType === 'array') {
          data[key] = raw.split(',').map(function(v) { return v.trim(); }).filter(Boolean);
        } else if (field.valueType === 'number') {
          data[key] = parseFloat(raw);
        } else {
          data[key] = raw;
        }
      });
    });
    return data;
  },

  // Returns a Promise so init can chain BI prefill after the draft
  // restore — that way prefillFromBIContext sees the post-draft
  // field state and decides shading correctly. Also caches the
  // draft data so renderSection3Body can re-apply it once Section 3
  // fields finally render.
  loadDraft: function() {
    var self = this;
    if (!self._supabase || !self._userId) return Promise.resolve();
    return self._supabase
      .from('strategic_plan_drafts')
      .select('draft_data')
      .eq('user_id', self._userId)
      .maybeSingle()
      .then(function(res) {
        if (res.error) {
          console.error('[SP] draft load error:', res.error.message || res.error);
          return;
        }
        if (res.data && res.data.draft_data) {
          self._cachedDraftData = res.data.draft_data;
          // Apply to all currently-rendered sections. Section 3 is
          // a loading placeholder at this point, so its fields are
          // skipped here and re-applied later from the cached data
          // inside renderSection3Body.
          self.prefillFromPreviousPlan(res.data.draft_data);
        }
      });
  },

  clearDraft: function() {
    var self = this;
    if (!self._supabase || !self._userId) return;
    self._supabase
      .from('strategic_plan_drafts')
      .delete()
      .eq('user_id', self._userId)
      .then(function(res) {
        if (res.error) console.error('[SP] draft clear error:', res.error.message || res.error);
      });
  },

  flashSavedIndicator: function(sectionId) {
    if (!this._userInteracted) return;
    var el = document.getElementById('sp-saved-' + sectionId);
    if (!el) return;
    el.style.opacity = '1';
    if (el._fadeTimer) clearTimeout(el._fadeTimer);
    el._fadeTimer = setTimeout(function() { el.style.opacity = '0'; }, 2000);
  },

  // ── Lookback dropdown helpers ────────────────────────────────────
  // Wire every per-task priority lookback after a render. The
  // onSelect callback swaps the badge colour class on the trigger and
  // persists the new priority. Runs after each render of the
  // initiatives list (both the by-initiative and by-month-group
  // groupings call this).
  wireSubtaskPriorityLookbacks: function() {
    var self = this;
    var listEl = document.getElementById('sp-initiatives-list');
    if (!listEl) return;
    listEl.querySelectorAll('.sp-subtask-priority').forEach(function(btn) {
      var menu = btn.parentNode.querySelector('.sp-subtask-priority-menu');
      if (!menu) return;
      self.wireLookbackDropdown(btn, menu, function(value) {
        btn.classList.remove('sp-priority-high', 'sp-priority-medium', 'sp-priority-low');
        btn.classList.add(value === 'High' ? 'sp-priority-high'
          : value === 'Low' ? 'sp-priority-low'
          : 'sp-priority-medium');
        var subtask = btn.closest('.sp-subtask');
        if (subtask) self.saveTaskField(subtask.dataset.id, 'priority', value);
      });
    });
  },

  bindModalEvents: function() {
    var self = this;
    // Confirm modal
    var confirmCancel = document.getElementById('sp-confirm-cancel');
    if (confirmCancel) {
      confirmCancel.addEventListener('click', function() {
        document.getElementById('sp-confirm-modal').classList.remove('open');
      });
    }

    // Close modals on overlay click
    document.querySelectorAll('.perm-modal-overlay').forEach(function(overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
  },

  // Wire a lookback-dropdown trigger / menu pair: trigger toggles the
  // menu, item-click sets the trigger's data-value + label and closes
  // the menu, document-level click closes when clicking outside.
  // Idempotent — safe to call repeatedly. Event delegation on the
  // menu means dynamically-added items pick up the click handler.
  wireLookbackDropdown: function(triggerOrId, menuOrId, onSelect) {
    var btn = typeof triggerOrId === 'string' ? document.getElementById(triggerOrId) : triggerOrId;
    var menu = typeof menuOrId === 'string' ? document.getElementById(menuOrId) : menuOrId;
    if (!btn || !menu) return;
    if (btn.dataset.lookbackBound === '1') return;
    btn.dataset.lookbackBound = '1';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    menu.addEventListener('click', function(e) {
      var item = e.target.closest('.lookback-dropdown-item');
      if (!item) return;
      menu.querySelectorAll('.lookback-dropdown-item').forEach(function(i) { i.classList.remove('active'); });
      item.classList.add('active');
      btn.setAttribute('data-value', item.getAttribute('data-value'));
      btn.textContent = item.textContent;
      menu.classList.remove('open');
      if (typeof onSelect === 'function') onSelect(item.getAttribute('data-value'), item.textContent);
    });
    document.addEventListener('click', function() { menu.classList.remove('open'); });
  },

  // Reset a lookback-dropdown to its first item (or to a specific
  // value if provided). Mirrors the .value='' reset that <select>
  // forms use to clear state when re-opening a modal.
  resetLookbackDropdown: function(triggerId, menuId, value) {
    var btn = document.getElementById(triggerId);
    var menu = document.getElementById(menuId);
    if (!btn || !menu) return;
    var items = menu.querySelectorAll('.lookback-dropdown-item');
    var target = null;
    if (value !== undefined) {
      items.forEach(function(i) { if (i.getAttribute('data-value') === value) target = i; });
    }
    if (!target) target = items[0];
    if (!target) return;
    items.forEach(function(i) { i.classList.remove('active'); });
    target.classList.add('active');
    btn.setAttribute('data-value', target.getAttribute('data-value'));
    btn.textContent = target.textContent;
  },

  // ── Field value read/write + chip handling ───────────────────────
  // Element-type-agnostic value read. Lookback-dropdown trigger
  // buttons stash their selection in data-value; everything else
  // (text input, textarea, hidden input) uses .value. Lets the rest
  // of the interview-form code read fields without caring whether
  // they happen to be selects.
  readFieldValue: function(el) {
    if (!el) return '';
    if (el.classList && el.classList.contains('lookback-dropdown')) {
      return el.getAttribute('data-value') || '';
    }
    return el.value || '';
  },

  // Element-type-agnostic value write. For lookback-dropdowns this
  // looks up the matching menu item, sets data-value + label + active
  // class. If no item matches (saved draft value falls outside the
  // current option set, e.g. dynamicFromProfile hasn't populated yet),
  // the value is still stashed on the button so a later re-population
  // can resolve it; the raw value is shown as a fallback label.
  writeFieldValue: function(el, value) {
    if (!el) return;
    if (el.classList && el.classList.contains('lookback-dropdown')) {
      var menu = document.getElementById(el.id + '-menu');
      if (!menu) return;
      var items = menu.querySelectorAll('.lookback-dropdown-item');
      var target = null;
      var v = String(value);
      items.forEach(function(i) { if (i.getAttribute('data-value') === v) target = i; });
      if (target) {
        items.forEach(function(i) { i.classList.remove('active'); });
        target.classList.add('active');
        el.setAttribute('data-value', target.getAttribute('data-value'));
        el.textContent = target.textContent;
      } else {
        el.setAttribute('data-value', v);
        if (v) el.textContent = v;
      }
    } else {
      el.value = value;
    }
  },

  // Wire every interview-form lookback-dropdown after a section is
  // rendered. The onSelect callback drops sp-from-bi shading (any
  // user-set value is no longer "from BI") and schedules a draft save.
  wireInterviewSelects: function(scope) {
    var self = this;
    var root = scope || document.getElementById('sp-sections-container');
    if (!root) return;
    root.querySelectorAll('.lookback-dropdown').forEach(function(btn) {
      var menu = document.getElementById(btn.id + '-menu');
      if (!menu) return;
      self.wireLookbackDropdown(btn, menu, function() {
        btn.classList.remove('sp-from-bi');
        self.scheduleDraftSave();
      });
    });
  },

  toggleChip: function(el, groupId, isMulti) {
    var self = this;
    var group = document.getElementById(groupId + '-chips');
    if (!group) return;
    if (!isMulti) {
      // Single-select: clicking the already-active chip deselects it
      // in one click, matching standard chip-toggle behaviour. Without
      // this, an active chip would re-activate on click and need a
      // second action (selecting another chip) to clear.
      var wasActive = el.classList.contains('active');
      group.querySelectorAll('.filter-pill').forEach(function(c) { c.classList.remove('active'); });
      if (!wasActive) el.classList.add('active');
    } else {
      // Multi-select with an exclusive value (e.g. Key Roles "Just Me"):
      // selecting the exclusive chip clears every other chip; selecting
      // any other chip clears the exclusive one. Falls through to the
      // normal toggle for fields without an exclusiveValue.
      var field = self.findFieldById(groupId);
      var exclusive = field && field.exclusiveValue;
      if (exclusive) {
        var clickedValue = el.getAttribute('data-value');
        if (clickedValue === exclusive) {
          group.querySelectorAll('.filter-pill').forEach(function(c) {
            if (c !== el) c.classList.remove('active');
          });
        } else {
          group.querySelectorAll('.filter-pill').forEach(function(c) {
            if (c.getAttribute('data-value') === exclusive) c.classList.remove('active');
          });
        }
      }
      el.classList.toggle('active');
    }
    // User has edited the value — drop the BI-prefill shading so the
    // group reads as user-set, not auto-populated. No-op if the
    // class wasn't there.
    group.classList.remove('sp-from-bi');
    self.updateHiddenFromChips(groupId);
  },

  // Sets the hidden input value from the active chips in the group —
  // shared between toggleChip, addCustomChip, removeCustomChip, and
  // the prefill paths so all writers go through one source of truth.
  updateHiddenFromChips: function(fieldId) {
    var group = document.getElementById(fieldId + '-chips');
    var hidden = document.getElementById(fieldId);
    if (!group || !hidden) return;
    var values = Array.from(group.querySelectorAll('.filter-pill.active'))
      .map(function(c) { return c.getAttribute('data-value'); })
      .filter(Boolean);
    hidden.value = values.join(',');
  },

  findFieldById: function(fieldId) {
    var sections = window.SP_SECTIONS || [];
    for (var s = 0; s < sections.length; s++) {
      var fields = sections[s].fields || [];
      for (var f = 0; f < fields.length; f++) {
        if (fields[f].id === fieldId) return fields[f];
      }
    }
    return null;
  },

  // Build a removable custom chip in the BP "Add Phone" style — appended
  // to the group with × that triggers data-action="sp-remove-custom".
  appendCustomChip: function(group, field, value, isActive) {
    var chip = document.createElement('div');
    chip.className = 'filter-pill sp-custom-pill' + (isActive ? ' active' : '');
    chip.setAttribute('data-value', value);
    chip.setAttribute('data-group', field.id);
    chip.setAttribute('data-custom', '1');
    chip.setAttribute('data-multi', field.type === 'chip-multi' ? 'true' : 'false');
    chip.innerHTML = escHtml(value) + ' <span class="sp-pill-remove" data-action="sp-remove-custom" data-target="' + escHtml(field.id) + '" style="margin-left:6px;cursor:pointer">×</span>';
    group.appendChild(chip);
    return chip;
  },

  addCustomChip: function(fieldId) {
    var self = this;
    var field = self.findFieldById(fieldId);
    if (!field || !field.allowOther) return;
    var input = document.getElementById(fieldId + '-other-input');
    var group = document.getElementById(fieldId + '-chips');
    if (!input || !group) return;
    var raw = input.value.trim();
    if (!raw) return;

    // Split on commas so "Lawyer, advisor" creates two chips.
    var values = raw.split(',').map(function(v) { return v.trim(); }).filter(Boolean);

    // Skip duplicates against any existing chip (standard or custom).
    var existing = {};
    Array.from(group.querySelectorAll('.filter-pill')).forEach(function(c) {
      var v = c.getAttribute('data-value');
      if (v) existing[v] = true;
    });
    var newValues = values.filter(function(v) { return !existing[v]; });
    if (newValues.length === 0) { input.value = ''; return; }

    // chip-single is exclusive — clear active state so only the last
    // newly-added chip ends up selected.
    if (field.type === 'chip-single') {
      group.querySelectorAll('.filter-pill.active').forEach(function(c) { c.classList.remove('active'); });
    }

    // chip-multi with an exclusiveValue (e.g. Key Roles "Just Me"):
    // adding a non-exclusive chip should deselect the exclusive one
    // so the same mutual-exclusivity rule from toggleChip applies to
    // custom +Add chips too.
    if (field.type === 'chip-multi' && field.exclusiveValue) {
      group.querySelectorAll('.filter-pill').forEach(function(c) {
        if (c.getAttribute('data-value') === field.exclusiveValue) c.classList.remove('active');
      });
    }

    newValues.forEach(function(val, idx) {
      var isActive = field.type === 'chip-single'
        ? idx === newValues.length - 1
        : true;
      self.appendCustomChip(group, field, val, isActive);
    });

    input.value = '';
    self.updateHiddenFromChips(fieldId);
    self.scheduleDraftSave();
  },

  removeCustomChip: function(btn) {
    var self = this;
    var chip = btn.closest('.filter-pill');
    if (!chip) return;
    var fieldId = chip.getAttribute('data-group');
    if (chip.parentNode) chip.parentNode.removeChild(chip);
    if (fieldId) self.updateHiddenFromChips(fieldId);
    self.scheduleDraftSave();
  },

  // ── Section navigation ───────────────────────────────────────────
  goToSection: function(index) {
    var self = this;
    var sections = window.SP_SECTIONS;
    if (!sections || index < 0 || index >= sections.length) return;

    sections.forEach(function(s) {
      var el = document.getElementById('section-' + s.id);
      if (el) el.style.display = 'none';
    });

    var target = document.getElementById('section-' + index);
    if (target) {
      target.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    self._currentSection = index;

    document.querySelectorAll('.profile-nav-chip').forEach(function(c, i) {
      c.classList.toggle('active', i === index);
    });
  },

  navigate: function(direction) {
    this.goToSection(this._currentSection + direction);
  },

  // ── Profile + BI prefill ─────────────────────────────────────────
  loadProfile: function() {
    var self = this;
    if (!self._supabase || !self._userId) return;
    self._supabase
      .from('profiles')
      .select('*')
      .eq('id', self._userId)
      .single()
      .then(function(res) {
        if (res.error) { console.error('[SP] Profile load error:', res.error.message); return; }
        if (res.data) {
          self._userProfile = res.data;
          self.prefillFromProfile(res.data);
        }
      });
  },

  prefillFromProfile: function(profile) {
    var self = this;
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        var val = null;
        var pillItems = null;

        if (field.profileKeys && Array.isArray(field.profileKeys)) {
          var parts = field.profileKeys.map(function(k) { return profile[k] || ''; }).filter(Boolean);
          val = parts.join(', ');
        } else if (field.profileKey) {
          var raw = profile[field.profileKey];
          if (field.profileKey === 'website_urls' && Array.isArray(raw)) {
            val = raw[0] || '';
          } else if (field.profileTransform === 'svc_list' && Array.isArray(raw)) {
            pillItems = raw.map(function(item) { return item.name || ''; }).filter(Boolean);
            val = pillItems.join(', ');
          } else if (Array.isArray(raw)) {
            pillItems = raw.slice().filter(Boolean);
            val = pillItems.join(', ');
          } else {
            val = raw;
          }
        }

        // Dynamic select options sourced from a BP service list — used
        // by Tab 2 "Most Profitable Service" so the dropdown reflects
        // whatever Core Services the user has in Business Profile. If
        // BP has no services, fall back to a disabled placeholder so
        // the field stays visible but unusable until BP is filled in.
        if (field.type === 'select' && field.dynamicFromProfile) {
          var srcRaw = profile[field.dynamicFromProfile];
          var srcNames = Array.isArray(srcRaw)
            ? srcRaw.map(function(item) { return (item && item.name) || ''; }).filter(Boolean)
            : [];
          var btn = document.getElementById(field.id);
          var menu = document.getElementById(field.id + '-menu');
          if (btn && menu) {
            if (srcNames.length === 0) {
              btn.disabled = true;
              btn.setAttribute('data-value', '');
              btn.textContent = field.emptyMessage || 'No options available';
              menu.innerHTML = '<button type="button" class="lookback-dropdown-item active" data-value="">' + escHtml(field.emptyMessage || 'No options available') + '</button>';
            } else {
              btn.disabled = false;
              btn.setAttribute('data-value', '');
              btn.textContent = 'Select…';
              menu.innerHTML = '<button type="button" class="lookback-dropdown-item active" data-value="">Select…</button>' +
                srcNames.map(function(n) {
                  return '<button type="button" class="lookback-dropdown-item" data-value="' + escHtml(n) + '">' + escHtml(n) + '</button>';
                }).join('');
            }
          }
        }

        // readonly-pills: render each item as a tagged pill mirroring
        // Source Review's Tagged Categories component. Falls back to
        // the field's emptyHint when nothing came through.
        if (field.type === 'readonly-pills') {
          var pillsEl = document.getElementById(field.id + '-pills');
          if (pillsEl) {
            var items = Array.isArray(pillItems) ? pillItems : (val ? String(val).split(',').map(function(s) { return s.trim(); }).filter(Boolean) : []);
            if (items.length === 0) {
              pillsEl.innerHTML = '<span class="sp-label-hint">' + escHtml(field.emptyHint || 'No data in your Business Profile yet.') + '</span>';
            } else {
              // Use a <div> with the same .filter-pill base as the
              // selectable and custom chips so every pill in SP
              // renders at exactly the same height — buttons pick up
              // browser-default font/line-height that diverges from
              // div, even when padding matches. The page-scoped
              // override in strategic-plan.html switches the colour/
              // cursor to the readonly BP-prefilled look.
              pillsEl.innerHTML = items.map(function(item) {
                return '<div class="filter-pill sp-readonly-pill">' + escHtml(item) + '</div>';
              }).join('');
            }
          }
        }

        var el = document.getElementById(field.id);
        if (!el) return;

        if (val !== null && val !== undefined && val !== '') self.writeFieldValue(el, val);

        if (field.fromProfile) {
          // readonly-pills uses a hidden input — readOnly/disabled
          // are no-ops there. The sp-from-profile marker still goes
          // on so prefillFromPreviousPlan skips overwriting it.
          if (field.type !== 'readonly-pills') {
            // Lookback-dropdown trigger buttons accept disabled directly;
            // text/textarea use readOnly. tagName check kept so the
            // identity field-set still behaves correctly for inputs.
            if (el.classList.contains('lookback-dropdown')) {
              el.disabled = true;
            } else {
              el.readOnly = true;
            }
          }
          el.classList.add('sp-from-profile');
        }
      });
    });
  },

  loadBIContext: function() {
    var self = this;
    var doneLoading = function(biData) {
      if (biData) self._cachedBIData = biData;
      // Section 3's render is gated on this fetch — render now (with
      // BI data if we have it, without if we don't or it failed).
      self.renderSection3Body();
    };
    self._getJwt().then(function(jwt) {
      if (!jwt) { doneLoading(null); return; }
      fetch('/api/bi-context', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt} })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) { doneLoading(d && d.data ? d.data : null); })
        .catch(function(err) {
          console.error('[SP] BI context fetch error:', err.message || err);
          doneLoading(null);
        });
    });
  },

  // Replaces the Section 3 loading placeholder with the actual fields
  // and applies the cached draft + BI data synchronously so the user
  // sees one final state (correct values + correct shading) on first
  // paint of Section 3, with no render-then-flicker.
  renderSection3Body: function() {
    var self = this;
    if (self._section3Rendered) return;
    var sectionEl = document.getElementById('section-' + self._SECTION_3_ID);
    if (!sectionEl) return;
    var section = (window.SP_SECTIONS || []).find(function(s) { return s.id === self._SECTION_3_ID; });
    if (!section) return;
    var fieldsContainer = sectionEl.querySelector('.sp-fields');
    if (!fieldsContainer) return;
    fieldsContainer.innerHTML = section.fields.map(function(field) { return self.renderField(field); }).join('');
    self._section3Rendered = true;
    // Wire the lookback-dropdowns Section 3 just added — wireInterviewSelects
    // is idempotent so calling it again won't double-bind earlier sections.
    self.wireInterviewSelects();
    // Apply prefills synchronously — runs in the same frame as the
    // innerHTML write above so the user never sees an empty Section 3.
    // Priority order matches the rest of init: saved plan first
    // (baseline), draft on top (most recent user state), BI fills
    // remaining empties and decides shading.
    if (self._cachedSavedPlanData) self.prefillFromPreviousPlan(self._cachedSavedPlanData, self._SECTION_3_ID);
    if (self._cachedDraftData) self.prefillFromPreviousPlan(self._cachedDraftData, self._SECTION_3_ID);
    if (self._cachedBIData) self.prefillFromBIContext(self._cachedBIData);
  },

  // BI Generated Items (Tab 9, spec §8.7) — methods live in
  // strategic-plan-modules.js: loadBIQueueItems, _renderBIQueueEmpty,
  // _renderBIQueueItem, bindBIQueueEvents, _setBIQueueAction.

  prefillFromPreviousPlan: function(d, sectionFilter) {
    var self = this;
    if (!d) return;
    window.SP_SECTIONS.forEach(function(s) {
      if (sectionFilter !== undefined && s.id !== sectionFilter) return;
      s.fields.forEach(function(f) {
      var v = d[f.apiKey || f.id]; if (v == null) return;
      var el = document.getElementById(f.id); if (!el || el.classList.contains('sp-from-profile')) return;
      if (f.type === 'chip-single' || f.type === 'chip-multi') {
        var vals = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(function(x){return x.trim()}).filter(Boolean) : []);
        var g = document.getElementById(f.id + '-chips');
        if (g) {
          var standardSet = {};
          g.querySelectorAll('.filter-pill').forEach(function(c) { standardSet[c.dataset.value] = true; });
          // Activate standard chips that match a saved value.
          g.querySelectorAll('.filter-pill').forEach(function(c) {
            if (vals.indexOf(c.dataset.value) !== -1) c.classList.add('active');
          });
          // Saved values that don't match any standard option — recreate
          // them as custom chips so the user sees what they typed last.
          if (f.allowOther) {
            vals.forEach(function(val) {
              if (!standardSet[val]) self.appendCustomChip(g, f, val, true);
            });
          }
          self.updateHiddenFromChips(f.id);
        } else {
          el.value = vals.join(',');
        }
      } else { self.writeFieldValue(el, typeof v === 'object' ? JSON.stringify(v) : v); }
    }); });
  },

  // Section 3 bucketing — converts raw BI numbers to the option values
  // defined in strategic-plan-data.js. Boundaries match the actual form
  // options (verified at build time); the BI Prefill spec's proposed
  // boundaries differed for revenue, gross margin, and net margin.
  bucketRevenue: function(amount) {
    if (amount == null || isNaN(amount)) return null;
    if (amount < 100000) return 'under-100k';
    if (amount < 250000) return '100k-250k';
    if (amount < 500000) return '250k-500k';
    if (amount < 1000000) return '500k-1m';
    if (amount < 2000000) return '1m-2m';
    if (amount < 5000000) return '2m-5m';
    return '5m+';
  },

  bucketRevenueTrend: function(pctChange) {
    if (pctChange == null || isNaN(pctChange)) return null;
    if (pctChange >= 20) return 'growing-strongly';
    if (pctChange >= 5) return 'growing';
    if (pctChange >= -5) return 'stable';
    return 'declining';
  },

  // Form options for gross margin: under-10 / 10-20 / 20-30 / 30-40 /
  // 40-50 / 50+. All non-negative — a negative result (rare) maps to
  // under-10 so the field still prefills with the closest available
  // bucket rather than staying blank.
  bucketGrossMargin: function(pct) {
    if (pct == null || isNaN(pct)) return null;
    if (pct < 10) return 'under-10';
    if (pct < 20) return '10-20';
    if (pct < 30) return '20-30';
    if (pct < 40) return '30-40';
    if (pct < 50) return '40-50';
    return '50+';
  },

  // Form options for net margin: loss / break-even / 1-5 / 5-10 / 10-15
  // / 15-20 / 20+.
  bucketNetMargin: function(pct) {
    if (pct == null || isNaN(pct)) return null;
    if (pct < 0) return 'loss';
    if (pct < 1) return 'break-even';
    if (pct < 5) return '1-5';
    if (pct < 10) return '5-10';
    if (pct < 15) return '10-15';
    if (pct < 20) return '15-20';
    return '20+';
  },

  bucketDebtorDays: function(days) {
    if (days == null || isNaN(days)) return null;
    if (days <= 7) return 'same-day';
    if (days <= 14) return '7-days';
    if (days <= 30) return '14-30-days';
    if (days <= 60) return '30-60-days';
    return '60+-days';
  },

  // prefillFromBIContext lives in strategic-plan-modules.js — keeps
  // logic.js under the 60K platform ceiling and groups the prefill
  // code with the bucketers it depends on.

  // ── Plan generation ──────────────────────────────────────────────
  collectSectionData: function() {
    var self = this;
    var data = {};
    var valid = true;

    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        var el = document.getElementById(field.id);
        var raw = el ? (self.readFieldValue(el) || '').trim() : '';

        if (field.required && !raw) {
          valid = false;
          if (el) el.classList.add('sp-input-error');
          var errEl = document.getElementById('err-' + field.id);
          if (errEl) errEl.style.display = 'block';
        } else {
          if (el) el.classList.remove('sp-input-error');
          var errEl2 = document.getElementById('err-' + field.id);
          if (errEl2) errEl2.style.display = 'none';
        }

        var key = field.apiKey || field.id;

        if (field.valueType === 'array') {
          data[key] = raw ? raw.split(',').map(function(v) { return v.trim(); }).filter(Boolean) : [];
        } else if (field.valueType === 'number') {
          data[key] = raw ? parseFloat(raw) : null;
        } else {
          data[key] = raw;
        }
      });
    });

    // Collect strategic decisions for tracking
    var decisions = {};
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        if (field.isDecision && field.decisionId) {
          var el = document.getElementById(field.id);
          var val = el ? (self.readFieldValue(el) || '').trim() : '';
          if (val) decisions[field.decisionId] = val;
        }
      });
    });
    data._decisions = decisions;

    self._planData = data;
    return valid ? data : null;
  },

  generate: async function() {
    var self = this;
    var data = self.collectSectionData();
    if (!data) {
      // Required-field gate — the spec §8.8 modal only fires when
      // required fields pass but optional fields are still empty.
      self._showError('Please complete the required fields before generating your plan.');
      var sections = window.SP_SECTIONS;
      for (var i = 0; i < sections.length; i++) {
        var hasError = sections[i].fields.some(function(f) {
          var fEl = document.getElementById(f.id);
          return f.required && !self.readFieldValue(fEl);
        });
        if (hasError) { self.goToSection(i); break; }
      }
      return;
    }

    var incomplete = self._countIncompleteFields();
    if (incomplete.length > 0) {
      self._showIncompleteFieldsModal(incomplete, data);
      return;
    }
    await self._performGeneration(data);
  },

  _performGeneration: async function(data) {
    var self = this;
    var btn = document.querySelector('.btn-sp-generate');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating Your Plan...';
    }

    var clContext = null;
    var biInsights = null;
    try {
      var jwt = await self._getJwt();
      if (jwt) {
        var cr = await fetch('/api/strategic-plan-load-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt }
        });
        if (cr.ok) {
          var cd = await cr.json();
          clContext = cd.clContext || null;
          biInsights = cd.biInsights || null;
        }
      }
    } catch (e) { console.error('[SP] Context load error:', e.message || e); }

    try {
      var jwt2 = await self._getJwt();
      var r = await fetch('/api/strategic-plan-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (jwt2 || '')
        },
        body: JSON.stringify({
          planData: data,
          clContext: clContext,
          biInsights: biInsights
        })
      });
      if (!r.ok) {
        var errText = await r.text().catch(function() { return ''; });
        throw new Error('Server returned status ' + r.status + ': ' + errText.substring(0, 200));
      }
      var result = await r.json();
      if (result.error) throw new Error(result.error);
      self.onPlanGenerated(result);
    } catch (err) {
      console.error('[SP] Generate error:', err);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate My Plan';
      }
      self._showError(err.message || 'Something went wrong generating your plan. Please try again.');
    }
  },

  _getJwt: async function() {
    if (!this._supabase) return null;
    var sess = await this._supabase.auth.getSession();
    return (sess && sess.data && sess.data.session) ? sess.data.session.access_token : null;
  },

  onPlanGenerated: function(result) {
    var self = this;
    self._currentPlanData = result;
    // Spec §6 — keep the wizard draft alive until Approve so a
    // Discard returns the owner to a still-populated Create tab.
    if (result && result.planId) {
      self._pendingPlanId = result.planId;
      self._pendingPlanData = result.planData || null;
      self.updateTabStates();
      self.switchTab('strat-plan');
      if (typeof self.loadReviewScreen === 'function') {
        self.loadReviewScreen(result.planId);
      }
    } else {
      self._hasPlan = true;
      self.clearDraft();
      self.updateTabStates();
      self.switchTab('ops-plan');
    }
  },

  // ── Misc ─────────────────────────────────────────────────────────
  highlightDecisionSection: function(decisionId) {
    var self = this;
    var sec = -1;
    window.SP_SECTIONS.forEach(function(s) { s.fields.forEach(function(f) { if (f.decisionId === decisionId) sec = s.id; }); });
    if (sec >= 0) {
      self.goToSection(sec);
      setTimeout(function() {
        window.SP_SECTIONS[sec].fields.forEach(function(f) {
          if (f.decisionId === decisionId) {
            var c = (document.getElementById(f.id) || {}).closest && document.getElementById(f.id).closest('.sp-field');
            if (c) { c.style.cssText = 'background:var(--warning-light);border:1px solid var(--warning);border-radius:var(--btn-radius);padding:12px'; c.scrollIntoView({behavior:'smooth',block:'center'}); }
          }
        });
      }, 300);
    }
  },

  checkPlanExists: function() {
    var self = this;
    if (!self._supabase || !self._userId) return Promise.resolve(false);
    // Pull active + pending plans in one trip. Review screen wins
    // if a pending plan exists; active.interview_data still prefills
    // the wizard for an Update flow.
    return self._supabase
      .from('strategic_plans')
      .select('id, status, interview_data, plan_data')
      .eq('user_id', self._userId)
      .in('status', ['active', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(2)
      .then(function(res) {
        var rows = (res && res.data) || [];
        var active = rows.find(function(p) { return p.status === 'active'; }) || null;
        var pending = rows.find(function(p) { return p.status === 'pending_approval'; }) || null;
        if (active) {
          self._hasPlan = true;
          if (active.interview_data) {
            self._cachedSavedPlanData = active.interview_data;
            self.prefillFromPreviousPlan(active.interview_data);
          }
        } else {
          self._hasPlan = false;
        }
        if (pending) {
          self._pendingPlanId = pending.id;
          self._pendingPlanData = pending.plan_data || null;
        } else {
          self._pendingPlanId = null;
          self._pendingPlanData = null;
        }
        return !!active;
      });
  },

  // ── Init ─────────────────────────────────────────────────────────
  init: async function(supabase, user) {
    var self = this;
    self._supabase = supabase;
    self._userId = user ? user.id : null;

    if (!self._supabase || !self._userId) {
      self.renderSections();
      self.goToSection(0);
      return;
    }
    if (!(await window.checkToolAccess('strategic-plan', supabase, user))) return;

    self.renderSections();
    self.goToSection(0);
    self.bindTabEvents();
    self.bindOpsEvents();
    self.bindDocEvents();
    self.bindModalEvents();
    self.bindBIQueueEvents();
    self.loadProfile();
    self.loadBIQueueItems();

    self.checkPlanExists().then(function(exists) {
      self.updateTabStates();

      // Sequence: load the Supabase-backed draft first so any in-
      // progress values are in place, then load BI context. BI
      // prefill reads each field's current value to decide whether
      // to keep or clear the optimistic .sp-from-bi shading, so it
      // must run AFTER the draft restore — otherwise BI's shading
      // decisions race with the draft's value-set.
      self.loadDraft().then(function() { self.loadBIContext(); });

      var params = new URLSearchParams(window.location.search);
      if (params.get('rewrite') === 'true' && exists) {
        self.switchTab('create-plan');
        var decisionId = params.get('decision');
        if (decisionId) {
          self.highlightDecisionSection(decisionId);
        }
        window.history.replaceState({}, '', window.location.pathname);
      } else if (self._pendingPlanId) {
        // Spec §6 — a draft awaits Approve / Discard. Route to the
        // Strategic Plan tab and unfold the Review screen.
        self.switchTab('strat-plan');
        if (typeof self.loadReviewScreen === 'function') {
          self.loadReviewScreen(self._pendingPlanId);
        }
      } else if (exists) {
        self.switchTab('ops-plan');
      } else {
        self.switchTab('create-plan');
      }
    });
  }

});
