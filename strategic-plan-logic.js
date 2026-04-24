// strategic-plan-logic.js — SP tool logic. Reads window.SP_SECTIONS for form rendering.
(function() {

  var currentSection = 0;
  var currentTab = 'create-plan';
  var planData = {};
  var userProfile = null;
  var previousPlan = null;
  var hasPlan = false;
  var _supabase = null;
  var _userId = null;
  var _currentPlanData = null;

  function _esc(s) { return window.escHtml ? window.escHtml(s) : (s || ''); }

  function _showError(message) {
    var modal = document.getElementById('sp-error-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = message;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  }

  // ── TAB NAVIGATION ───────────────────────────────────────────────────

  function switchTab(tabId) {
    if (!hasPlan && (tabId === 'ops-plan' || tabId === 'strat-plan')) return;

    currentTab = tabId;

    document.querySelectorAll('#sp-tab-nav .ptab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    document.querySelectorAll('#page-wrap > .ptab-content').forEach(function(panel) {
      panel.classList.toggle('active', panel.id === 'tab-' + tabId);
    });

    if (tabId === 'ops-plan' && hasPlan) {
      loadOperationalPlan();
    } else if (tabId === 'strat-plan' && hasPlan) {
      loadStrategicPlanView();
    }
  }

  function updateTabStates() {
    var tabs = document.querySelectorAll('#sp-tab-nav .ptab');
    tabs.forEach(function(tab) {
      var id = tab.dataset.tab;
      if (id === 'ops-plan' || id === 'strat-plan') {
        tab.classList.toggle('sp-tab-disabled', !hasPlan);
      }
    });

    var opsLocked = document.getElementById('sp-ops-locked');
    var opsContent = document.getElementById('sp-ops-content');
    var docLocked = document.getElementById('sp-doc-locked');
    var docContent = document.getElementById('sp-doc-content');

    if (hasPlan) {
      if (opsLocked) opsLocked.style.display = 'none';
      if (opsContent) opsContent.style.display = 'block';
      if (docLocked) docLocked.style.display = 'none';
      if (docContent) docContent.style.display = 'block';
    } else {
      if (opsLocked) opsLocked.style.display = 'block';
      if (opsContent) opsContent.style.display = 'none';
      if (docLocked) docLocked.style.display = 'block';
      if (docContent) docContent.style.display = 'none';
    }
  }

  function bindTabEvents() {
    var tabNav = document.getElementById('sp-tab-nav');
    if (!tabNav) return;
    tabNav.addEventListener('click', function(e) {
      var tab = e.target.closest('.ptab');
      if (!tab || tab.classList.contains('sp-tab-disabled')) return;
      switchTab(tab.dataset.tab);
    });
  }

  // ── RENDER SECTIONS (Tab 3 form) ──

  function renderSections() {
    var sections = window.SP_SECTIONS;
    if (!sections || !sections.length) return;

    var navHtml = sections.map(function(s, i) {
      var shortTitle = s.title.split('. ')[1] || s.title;
      return '<button class="profile-nav-chip" data-section="' + i + '">' + (i + 1) + '. ' + _esc(shortTitle) + '</button>';
    }).join('');
    var navEl = document.getElementById('sp-section-nav');
    if (navEl) navEl.innerHTML = navHtml;

    var container = document.getElementById('sp-sections-container');
    if (!container) return;

    container.innerHTML = sections.map(function(s) {
      var fieldsHtml = s.fields.map(function(field) {
        return renderField(field);
      }).join('');

      var infoBox = s.infoBox
        ? '<div class="sp-info-box"><span class="sp-info-icon">&#x1F4A1;</span> ' + _esc(s.infoBox) + '</div>'
        : '';

      var backBtn = s.id > 0
        ? '<button class="btn-outline" data-nav="-1">Back</button>'
        : '<span></span>';

      var hasProfileFields = s.fields.some(function(f) { return f.fromProfile; });
      var profileNote = hasProfileFields
        ? '<span class="sp-profile-note">Shaded fields are populated from your Business Profile. To update them, edit your Business Profile in the Content Library.</span>'
        : '';

      var nextBtn = '';
      if (s.id < sections.length - 1) {
        nextBtn = '<button class="btn-primary" data-nav="1">Next</button>';
      } else {
        nextBtn = '<button class="btn-primary btn-sp-generate">Generate My Plan</button>';
      }

      return '<div class="profile-section-card" id="section-' + s.id + '" style="display:none;">' +
        '<div class="profile-section-header">' +
          '<span class="profile-section-icon">' + s.icon + '</span>' +
          '<div>' +
            '<h2 class="profile-section-title">' + _esc(s.title) + '</h2>' +
            '<p class="profile-section-subtitle">' + _esc(s.subtitle) + '</p>' +
          '</div>' +
        '</div>' +
        infoBox +
        '<div class="sp-fields">' + fieldsHtml + '</div>' +
        '<div class="sp-nav-buttons">' +
          '<div class="sp-nav-left">' + backBtn + '</div>' +
          '<div class="sp-nav-centre">' + profileNote + '</div>' +
          '<div class="sp-nav-right">' + nextBtn + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    bindFormEvents();
  }

  function renderField(field) {
    var reqMark = field.required ? ' <span style="color:var(--red)">*</span>' : '';
    var label = '<label class="sp-field-label" for="' + field.id + '">' +
      _esc(field.label) + reqMark +
      (field.labelHint ? ' <span class="sp-label-hint">' + _esc(field.labelHint) + '</span>' : '') +
      '</label>';

    var helpText = field.helpText
      ? '<p class="sp-field-help">' + _esc(field.helpText) + '</p>'
      : '';

    var errorEl = field.required
      ? '<span class="sp-field-error" id="err-' + field.id + '">This field is required</span>'
      : '';

    var input = '';

    if (field.type === 'text') {
      input = '<input type="text" id="' + field.id + '" class="sp-input" placeholder="' + _esc(field.placeholder || '') + '">';
    } else if (field.type === 'textarea') {
      input = '<textarea id="' + field.id + '" class="sp-textarea" placeholder="' + _esc(field.placeholder || '') + '" rows="4"></textarea>';
    } else if (field.type === 'select') {
      var opts = (field.options || []).map(function(o) {
        return '<option value="' + _esc(o.value) + '">' + _esc(o.label) + '</option>';
      }).join('');
      input = '<select id="' + field.id + '" class="sp-select">' + opts + '</select>';
    } else if (field.type === 'select-or-text') {
      var sOpts = (field.options || []).map(function(o) {
        return '<option value="' + _esc(o.value) + '">' + _esc(o.label) + '</option>';
      }).join('');
      sOpts += '<option value="__other__">Other (specify)</option>';
      input = '<select id="' + field.id + '-select" class="sp-select sp-select-or-text" data-target="' + field.id + '">' + sOpts + '</select>';
      input += '<input type="text" id="' + field.id + '-other" class="sp-input sp-other-input" placeholder="' + _esc(field.placeholder || '') + '" style="display:none;margin-top:8px">';
      input += '<input type="hidden" id="' + field.id + '" value="">';
    } else if (field.type === 'chip-single' || field.type === 'chip-multi') {
      var chips = (field.options || []).map(function(o) {
        return '<div class="filter-pill" data-value="' + _esc(o.value) + '" data-group="' + field.id + '" data-multi="' + (field.type === 'chip-multi') + '">' + _esc(o.label) + '</div>';
      }).join('');
      if (field.allowOther) {
        chips += '<div class="filter-pill sp-other-pill" data-value="__other__" data-group="' + field.id + '" data-multi="true">Other</div>';
      }
      input = '<div class="sp-chip-group" id="' + field.id + '-chips">' + chips + '</div>';
      if (field.allowOther) {
        input += '<input type="text" id="' + field.id + '-other" class="sp-input sp-other-input" placeholder="Add your own (comma-separated)" style="display:none;margin-top:8px">';
      }
      input += '<input type="hidden" id="' + field.id + '" value="">';
    }

    return '<div class="sp-field">' + label + helpText + input + errorEl + '</div>';
  }

  // ── EVENT DELEGATION ──────────────────────────────────────────────────

  function bindFormEvents() {
    var navEl = document.getElementById('sp-section-nav');
    if (navEl) {
      navEl.addEventListener('click', function(e) {
        var chip = e.target.closest('.profile-nav-chip');
        if (chip && chip.dataset.section !== undefined) {
          goToSection(parseInt(chip.dataset.section, 10));
        }
      });
    }

    var container = document.getElementById('sp-sections-container');
    if (container) {
      container.addEventListener('click', function(e) {
        var chip = e.target.closest('.filter-pill');
        if (chip) {
          toggleChip(chip, chip.dataset.group, chip.dataset.multi === 'true');
          return;
        }
        var navBtn = e.target.closest('[data-nav]');
        if (navBtn) {
          navigate(parseInt(navBtn.dataset.nav, 10));
          return;
        }
        var genBtn = e.target.closest('.btn-sp-generate');
        if (genBtn) {
          generate();
          return;
        }
      });

      container.addEventListener('change', function(e) {
        var sel = e.target.closest('.sp-select-or-text');
        if (sel) {
          var targetId = sel.dataset.target;
          var otherInput = document.getElementById(targetId + '-other');
          var hidden = document.getElementById(targetId);
          if (sel.value === '__other__') {
            if (otherInput) { otherInput.style.display = 'block'; otherInput.focus(); }
            if (hidden) hidden.value = '';
          } else {
            if (otherInput) { otherInput.style.display = 'none'; otherInput.value = ''; }
            if (hidden) hidden.value = sel.value;
          }
          return;
        }
      });

      container.addEventListener('input', function(e) {
        var otherInput = e.target.closest('.sp-other-input');
        if (otherInput) {
          var fieldId = otherInput.id.replace('-other', '');
          var hidden = document.getElementById(fieldId);
          var selectEl = document.getElementById(fieldId + '-select');
          if (hidden && selectEl) {
            hidden.value = otherInput.value.trim();
          }
          if (hidden && !selectEl) {
            updateChipHiddenWithOther(fieldId);
          }
        }
      });
    }
  }

  function updateChipHiddenWithOther(fieldId) {
    var group = document.getElementById(fieldId + '-chips');
    var hidden = document.getElementById(fieldId);
    var otherInput = document.getElementById(fieldId + '-other');
    if (!group || !hidden) return;

    var selected = Array.from(group.querySelectorAll('.filter-pill.active'))
      .map(function(c) { return c.getAttribute('data-value'); })
      .filter(function(v) { return v !== '__other__'; });

    if (otherInput && otherInput.value.trim()) {
      var customs = otherInput.value.split(',').map(function(v) { return v.trim(); }).filter(Boolean);
      selected = selected.concat(customs);
    }

    hidden.value = selected.join(',');
  }

  function bindOpsEvents() {
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
        filterInitiatives(viewPill.dataset.view);
        return;
      }

      // Expand all toggle
      var expandBtn = e.target.closest('[data-expand]');
      if (expandBtn) {
        toggleExpandAll();
        return;
      }

      // Initiative header (expand/collapse)
      var initHeader = e.target.closest('.sp-initiative-header');
      if (initHeader) {
        var initiative = initHeader.closest('.sp-initiative');
        if (initiative) {
          initiative.classList.toggle('expanded');
          saveExpandState();
        }
        return;
      }

      // Sub-task checkbox
      var checkbox = e.target.closest('.sp-subtask-check');
      if (checkbox) {
        var subtask = checkbox.closest('.sp-subtask');
        if (subtask) toggleSubtask(subtask.dataset.id);
        return;
      }

      // Sub-task edit
      var editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        var subtask = editBtn.closest('.sp-subtask');
        if (subtask) editSubtaskTitle(subtask.dataset.id);
        return;
      }

      // Sub-task delete
      var deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        var subtask = deleteBtn.closest('.sp-subtask');
        if (subtask) confirmDeleteTask(subtask.dataset.id);
        return;
      }

      // Due date click
      var dueEl = e.target.closest('.sp-subtask-due');
      if (dueEl) {
        var subtask = dueEl.closest('.sp-subtask');
        if (subtask) editDueDate(subtask.dataset.id, dueEl);
        return;
      }

      // Owner click
      var ownerEl = e.target.closest('.sp-subtask-owner');
      if (ownerEl) {
        var subtask = ownerEl.closest('.sp-subtask');
        if (subtask) editOwner(subtask.dataset.id, ownerEl);
        return;
      }

      // Notes toggle
      var notesBtn = e.target.closest('.sp-notes-toggle');
      if (notesBtn) {
        var notesEl = notesBtn.closest('.sp-subtask').querySelector('.sp-subtask-notes');
        if (notesEl) notesEl.style.display = notesEl.style.display === 'none' ? 'block' : 'none';
        return;
      }

      // Add task within initiative — show inline form
      var addTaskBtn = e.target.closest('.btn-sp-add-task');
      if (addTaskBtn) {
        showAddTaskForm(addTaskBtn);
        return;
      }

      // Add task form submit
      var addTaskSubmit = e.target.closest('.sp-add-task-submit');
      if (addTaskSubmit) {
        submitAddTaskForm(addTaskSubmit);
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
        showAddInitiativeModal();
        return;
      }

      // Cycle banner buttons
      var newCycleBtn = e.target.closest('.btn-sp-new-cycle');
      if (newCycleBtn) {
        startNewCycle();
        return;
      }
      var dismissBtn = e.target.closest('[data-dismiss-banner]');
      if (dismissBtn) {
        var banner = document.getElementById('sp-cycle-banner');
        if (banner) banner.style.display = 'none';
        return;
      }
    });

    opsContent.addEventListener('change', function(e) {
      // Priority change
      var prioritySel = e.target.closest('.sp-subtask-priority');
      if (prioritySel) {
        var subtask = prioritySel.closest('.sp-subtask');
        if (subtask) saveTaskField(subtask.dataset.id, 'priority', prioritySel.value);
        return;
      }
    });
  }

  function bindDocEvents() {
    var docContent = document.getElementById('sp-doc-content');
    if (!docContent) return;

    docContent.addEventListener('click', function(e) {
      var templateBtn = e.target.closest('.btn-sp-use-template');
      if (templateBtn) {
        useAsTemplate(templateBtn.dataset.planId);
        return;
      }
      var printBtn = e.target.closest('.btn-sp-print');
      if (printBtn) {
        window.print();
        return;
      }
      var updateBtn = e.target.closest('#sp-update-plan-btn');
      if (updateBtn) {
        switchTab('create-plan');
        return;
      }
    });
  }

  function bindModalEvents() {
    // Confirm modal
    var confirmCancel = document.getElementById('sp-confirm-cancel');
    if (confirmCancel) {
      confirmCancel.addEventListener('click', function() {
        document.getElementById('sp-confirm-modal').classList.remove('open');
      });
    }

    // Add initiative modal
    var addInitCancel = document.getElementById('sp-add-init-cancel');
    if (addInitCancel) {
      addInitCancel.addEventListener('click', function() {
        document.getElementById('sp-add-init-modal').classList.remove('open');
      });
    }

    var addInitConfirm = document.getElementById('sp-add-init-confirm');
    if (addInitConfirm) {
      addInitConfirm.addEventListener('click', function() {
        createInitiative();
      });
    }

    // Close modals on overlay click
    document.querySelectorAll('.perm-modal-overlay').forEach(function(overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
  }

  // ── CHIP TOGGLE ───────────────────────────────────────────────────────

  function toggleChip(el, groupId, isMulti) {
    var group = document.getElementById(groupId + '-chips');
    if (!group) return;

    var isOther = el.getAttribute('data-value') === '__other__';

    if (!isMulti) {
      group.querySelectorAll('.filter-pill').forEach(function(c) { c.classList.remove('active'); });
      el.classList.add('active');
    } else {
      el.classList.toggle('active');
    }

    if (isOther) {
      var otherInput = document.getElementById(groupId + '-other');
      if (otherInput) {
        if (el.classList.contains('active')) {
          otherInput.style.display = 'block';
          otherInput.focus();
        } else {
          otherInput.style.display = 'none';
          otherInput.value = '';
        }
      }
    }

    var selected = Array.from(group.querySelectorAll('.filter-pill.active'))
      .map(function(c) { return c.getAttribute('data-value'); })
      .filter(function(v) { return v !== '__other__'; });

    var otherInput = document.getElementById(groupId + '-other');
    if (otherInput && otherInput.value.trim() && el.closest('.sp-chip-group').querySelector('.sp-other-pill.active')) {
      var customs = otherInput.value.split(',').map(function(v) { return v.trim(); }).filter(Boolean);
      selected = selected.concat(customs);
    }

    var hidden = document.getElementById(groupId);
    if (hidden) hidden.value = selected.join(',');
  }

  // ── SECTION NAVIGATION (Tab 3 form) ──────────────────────────────────

  function goToSection(index) {
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

    currentSection = index;

    document.querySelectorAll('.profile-nav-chip').forEach(function(c, i) {
      c.classList.toggle('active', i === index);
    });

    updateProgress(index);
  }

  function navigate(direction) {
    goToSection(currentSection + direction);
  }

  function updateProgress(index) {
    var bar = document.getElementById('sp-progress-bar');
    if (!bar) return;
    var total = window.SP_SECTIONS.length;
    bar.innerHTML = window.SP_SECTIONS.map(function(s, i) {
      var cls = i < index ? 'sp-progress-done' : i === index ? 'sp-progress-current' : 'sp-progress-pending';
      return '<div class="sp-progress-seg ' + cls + '"></div>';
    }).join('');

    var label = document.getElementById('sp-progress-label');
    if (label) label.textContent = 'Section ' + (index + 1) + ' of ' + total + ' \u2014 ' + window.SP_SECTIONS[index].title;
  }

  // ── PROFILE PREFILL ───────────────────────────────────────────────────

  function loadProfile() {
    if (!_supabase || !_userId) return;
    _supabase
      .from('profiles')
      .select('*')
      .eq('id', _userId)
      .single()
      .then(function(res) {
        if (res.data) {
          userProfile = res.data;
          prefillFromProfile(res.data);
        }
      });
  }

  function prefillFromProfile(profile) {
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        var val = null;

        if (field.profileKeys && Array.isArray(field.profileKeys)) {
          var parts = field.profileKeys.map(function(k) { return profile[k] || ''; }).filter(Boolean);
          val = parts.join(', ');
        } else if (field.profileKey) {
          var raw = profile[field.profileKey];
          if (field.profileKey === 'website_urls' && Array.isArray(raw)) {
            val = raw[0] || '';
          } else {
            val = raw;
          }
        }

        var el = document.getElementById(field.id);
        if (!el) return;

        if (val) el.value = val;

        if (field.fromProfile) {
          el.readOnly = true;
          el.disabled = (el.tagName === 'SELECT');
          el.classList.add('sp-from-profile');
        }
      });
    });
  }

  // ── BI CONTEXT LOAD ────────────────────────────────────────────────────

  function loadBIContext() {
    _getJwt().then(function(jwt) {
      if (!jwt) return;
      fetch('/api/bi-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt }
      }).then(function(r) {
        if (!r.ok) return;
        return r.json();
      }).then(function(data) {
        if (data && data.context) prefillFromBIContext(data.context);
      }).catch(function() { /* BI context is optional */ });
    });
  }

  // ── PREFILL FROM PREVIOUS PLAN ────────────────────────────────────────

  function prefillFromPreviousPlan(interviewData) {
    if (!interviewData) return;

    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        var key = field.apiKey || field.id;
        var val = interviewData[key];
        if (val === undefined || val === null) return;

        var el = document.getElementById(field.id);
        if (!el || el.classList.contains('sp-from-profile')) return;

        if (field.type === 'chip-single' || field.type === 'chip-multi') {
          var values = Array.isArray(val) ? val : (typeof val === 'string' ? val.split(',').map(function(v) { return v.trim(); }).filter(Boolean) : []);
          el.value = values.join(',');
          var group = document.getElementById(field.id + '-chips');
          if (group) {
            group.querySelectorAll('.filter-pill').forEach(function(chip) {
              var chipVal = chip.getAttribute('data-value');
              if (chipVal !== '__other__' && values.indexOf(chipVal) !== -1) {
                chip.classList.add('active');
              }
            });
          }
        } else if (field.type === 'select-or-text') {
          var selectEl = document.getElementById(field.id + '-select');
          if (selectEl) {
            var matchedOption = false;
            Array.from(selectEl.options).forEach(function(opt) {
              if (opt.value === val) { matchedOption = true; }
            });
            if (matchedOption) {
              selectEl.value = val;
              el.value = val;
            } else if (val) {
              selectEl.value = '__other__';
              var otherInput = document.getElementById(field.id + '-other');
              if (otherInput) { otherInput.value = val; otherInput.style.display = 'block'; }
              el.value = val;
            }
          }
        } else {
          el.value = typeof val === 'object' ? JSON.stringify(val) : val;
        }
      });
    });
  }

  // ── PREFILL FROM BI CONTEXT ───────────────────────────────────────────

  function prefillFromBIContext(biContext) {
    if (!biContext) return;
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        if (!field.fromBI) return;
        var key = field.apiKey;
        var val = biContext[key];
        if (val === undefined || val === null) return;

        var el = document.getElementById(field.id);
        if (!el || el.value) return;

        if (field.type === 'chip-single') {
          el.value = val;
          var group = document.getElementById(field.id + '-chips');
          if (group) {
            group.querySelectorAll('.filter-pill').forEach(function(chip) {
              if (chip.getAttribute('data-value') === val) chip.classList.add('active');
            });
          }
        } else {
          el.value = val;
        }
      });
    });
  }

  // ── DATA COLLECTION (uses apiKey + valueType) ─────────────────────────

  function collectSectionData() {
    var data = {};
    var valid = true;

    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        var el = document.getElementById(field.id);
        var raw = el ? (el.value || '').trim() : '';

        if (field.required && !raw) {
          valid = false;
          if (el) el.classList.add('sp-input-error');
          var errEl = document.getElementById('err-' + field.id);
          if (errEl) errEl.style.display = 'block';
        } else {
          if (el) el.classList.remove('sp-input-error');
          var errEl = document.getElementById('err-' + field.id);
          if (errEl) errEl.style.display = 'none';
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
          var val = el ? (el.value || '').trim() : '';
          if (val) decisions[field.decisionId] = val;
        }
      });
    });
    data._decisions = decisions;

    planData = data;
    return valid ? data : null;
  }

  // ── GENERATE ──────────────────────────────────────────────────────────

  async function generate() {
    var data = collectSectionData();
    if (!data) {
      _showError('Please complete the required fields before generating your plan.');
      var sections = window.SP_SECTIONS;
      for (var i = 0; i < sections.length; i++) {
        var hasError = sections[i].fields.some(function(f) {
          return f.required && !(document.getElementById(f.id) || {}).value;
        });
        if (hasError) { goToSection(i); break; }
      }
      return;
    }

    var btn = document.querySelector('.btn-sp-generate');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating your plan...';
    }

    var clContext = null;
    var biInsights = null;
    var cycleEndDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

    try {
      var jwt = await _getJwt();
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
    } catch (e) { /* context load is optional */ }

    try {
      var jwt = await _getJwt();
      var r = await fetch('/api/strategic-plan-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (jwt || '')
        },
        body: JSON.stringify({
          planData: data,
          clContext: clContext,
          biInsights: biInsights,
          cycleEndDate: cycleEndDate
        })
      });
      var result;
      try { result = await r.json(); } catch (parseErr) {
        var rawText = await r.text().catch(function() { return ''; });
        throw new Error('Server returned status ' + r.status + ': ' + rawText.substring(0, 200));
      }
      if (result.error) throw new Error(result.error);
      onPlanGenerated(result);
    } catch (err) {
      console.error('[SP] Generate error:', err);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate My Plan';
      }
      _showError(err.message || 'Something went wrong generating your plan. Please try again.');
    }
  }

  async function _getJwt() {
    if (!_supabase) return null;
    var sess = await _supabase.auth.getSession();
    return (sess && sess.data && sess.data.session) ? sess.data.session.access_token : null;
  }

  // ── POST-GENERATION ───────────────────────────────────────────────────

  function onPlanGenerated(result) {
    hasPlan = true;
    _currentPlanData = result;
    updateTabStates();
    switchTab('ops-plan');
  }

  // ── TAB 1: OPERATIONAL PLAN ───────────────────────────────────────────

  function loadOperationalPlan() {
    if (!_supabase || !_userId) return;

    _supabase
      .from('strategic_plans')
      .select('id, plan_name, version, created_at, interview_data, swot_data')
      .eq('user_id', _userId)
      .eq('is_current', true)
      .single()
      .then(function(res) {
        if (res.error || !res.data) return;
        var plan = res.data;

        var titleEl = document.getElementById('sp-ops-plan-title');
        if (titleEl) titleEl.textContent = (plan.plan_name || 'Strategic Plan') + ' v' + (plan.version || 1);

        var cycleStart = new Date(plan.created_at);
        var cycleEnd = new Date(cycleStart.getTime() + 90 * 24 * 60 * 60 * 1000);
        var today = new Date();
        var dayNum = Math.max(1, Math.ceil((today - cycleStart) / (1000 * 60 * 60 * 24)));
        var cycleEl = document.getElementById('sp-ops-cycle');
        if (cycleEl) cycleEl.textContent = '90-Day Cycle: Day ' + Math.min(dayNum, 90) + ' of 90';

        checkCycleRenewal(cycleEnd);
        loadInitiatives();
      });
  }

  function loadInitiatives() {
    if (!_supabase || !_userId) return;

    _supabase
      .from('action_tracker')
      .select('id, items, month_group, is_carried_forward, owner, plan_id, parent_task_id, initiative_name, sp_section, source, bi_insight_id')
      .eq('user_id', _userId)
      .order('created_at', { ascending: true })
      .then(function(res) {
        if (res.error) { console.error('[SP] Load initiatives error:', res.error); return; }
        renderInitiatives(res.data || []);
      });
  }

  function renderInitiatives(rows) {
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
      renderFlatTracker(rows);
      return;
    }

    if (initiatives.length === 0) {
      var listEl = document.getElementById('sp-initiatives-list');
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1F4CB;</div>' +
          '<h3>No initiatives yet</h3><p>Generate your plan or add an initiative to get started.</p></div>';
      }
      updateOpsStats(0, 0, 0, 0);
      return;
    }

    var totalTasks = 0;
    var completedTasks = 0;
    var overdueTasks = 0;
    var dueThisWeek = 0;

    var html = '';
    initiatives.forEach(function(init) {
      var subs = subtaskMap[init.id] || [];
      var done = 0;
      subs.forEach(function(s) {
        var status = (s.items && s.items.status) || 'pending';
        totalTasks++;
        if (status === 'done') { done++; completedTasks++; }
      });
      var pct = subs.length > 0 ? Math.round((done / subs.length) * 100) : 0;

      var statusClass = '';
      if (subs.length > 0) {
        if (pct === 100) statusClass = 'status-green';
        else if (done < subs.length * 0.5) statusClass = 'status-amber';
      }

      var spBadge = init.sp_section
        ? ' <span class="badge badge-blue">' + _esc(formatSectionName(init.sp_section)) + '</span>'
        : '';

      var sourceBadge = '';
      if (init.source === 'bi_action') sourceBadge = ' <span class="badge badge-orange">BI Recommendation</span>';
      else if (init.is_carried_forward) sourceBadge = ' <span class="badge badge-orange">Carried Forward</span>';

      var expanded = getExpandState(init.id);

      html += '<div class="sp-initiative' + (statusClass ? ' ' + statusClass : '') + (expanded ? ' expanded' : '') + '" data-init-id="' + _esc(init.id) + '">';
      html += '<div class="sp-initiative-header">';
      html += '<span class="sp-initiative-name">' + _esc(init.initiative_name || (init.items && init.items.title) || 'Untitled Initiative') + spBadge + sourceBadge + '</span>';
      html += '<div class="sp-initiative-progress"><div class="sp-initiative-progress-fill" style="width:' + pct + '%"></div></div>';
      html += '<span class="sp-initiative-count">' + done + ' of ' + subs.length + ' tasks</span>';
      html += '<span class="sp-initiative-chevron">&#9660;</span>';
      html += '</div>';

      html += '<div class="sp-initiative-body">';
      subs.forEach(function(sub) {
        html += renderSubtaskRow(sub);
      });
      html += '<div class="sp-add-task-row"><button class="btn-sp-add-task" data-parent-id="' + _esc(init.id) + '" type="button">+ Add Task</button></div>';
      html += '</div></div>';
    });

    var listEl = document.getElementById('sp-initiatives-list');
    if (listEl) listEl.innerHTML = html;

    var overallPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    var fillEl = document.getElementById('sp-ops-progress-fill');
    if (fillEl) fillEl.style.width = overallPct + '%';
    var pctLabel = document.getElementById('sp-ops-progress-pct');
    if (pctLabel) pctLabel.textContent = overallPct + '% complete';

    updateOpsStats(initiatives.length, completedTasks, overdueTasks, dueThisWeek);
  }

  function renderFlatTracker(rows) {
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
      var heading = g === 1 ? 'Month 1 (Days 1\u201330)' : g === 2 ? 'Month 2 (Days 31\u201360)' : g === 3 ? 'Month 3 (Days 61\u201390)' : 'General Tasks';
      html += '<div class="sp-initiative expanded" data-month-group="' + g + '">';
      html += '<div class="sp-initiative-header"><span class="sp-initiative-name">' + _esc(heading) + '</span><span class="sp-initiative-chevron">&#9660;</span></div>';
      html += '<div class="sp-initiative-body">';
      groups[g].forEach(function(row) { html += renderSubtaskRow(row); });
      html += '</div></div>';
    });

    var listEl = document.getElementById('sp-initiatives-list');
    if (listEl) listEl.innerHTML = html;
    var pct = rows.length > 0 ? Math.round((completedTasks / rows.length) * 100) : 0;
    var fillEl = document.getElementById('sp-ops-progress-fill');
    if (fillEl) fillEl.style.width = pct + '%';
    var pctLabel = document.getElementById('sp-ops-progress-pct');
    if (pctLabel) pctLabel.textContent = pct + '% complete';
    updateOpsStats(0, completedTasks, 0, 0);
  }

  function renderSubtaskRow(row) {
    var items = row.items || {};
    var done = items.status === 'done';
    var title = items.title || '';
    var priority = items.priority || 'Medium';
    var dueDate = items.due_date || '';
    var owner = row.owner || items.owner || '';
    var notes = items.notes || '';

    var priorityBg = priority === 'High' ? 'background:var(--badge-red-bg);color:var(--badge-red-text)' :
                     priority === 'Low' ? 'background:var(--badge-green-bg);color:var(--badge-green-text)' :
                     'background:var(--badge-orange-bg);color:var(--badge-orange-text)';

    var sourceBadge = '';
    if (row.source === 'bi_action') sourceBadge = ' <span class="badge badge-orange">BI Recommendation</span>';
    else if (row.is_carried_forward) sourceBadge = ' <span class="badge badge-orange">Carried Forward</span>';

    var html = '<div class="sp-subtask' + (done ? ' sp-subtask-done' : '') + '" data-id="' + _esc(row.id) + '">';
    html += '<input type="checkbox" class="sp-subtask-check"' + (done ? ' checked' : '') + '>';
    html += '<div class="sp-subtask-body">';
    html += '<span class="sp-subtask-title">' + _esc(title) + '</span>' + sourceBadge;
    html += '<div class="sp-subtask-meta">';
    html += '<span class="sp-subtask-due" title="Click to change">' + _esc(dueDate || 'Set date') + '</span>';
    html += '<span class="sp-subtask-owner" title="Click to change">' + _esc(owner || 'Owner') + '</span>';
    html += '<select class="sp-subtask-priority" style="' + priorityBg + '">';
    ['High', 'Medium', 'Low'].forEach(function(p) {
      html += '<option value="' + p + '"' + (priority === p ? ' selected' : '') + '>' + p + '</option>';
    });
    html += '</select>';
    if (notes) html += '<button class="sp-notes-toggle" type="button">Notes</button>';
    html += '</div>';
    if (notes) html += '<div class="sp-subtask-notes" style="display:none;font-size:var(--label-font-size);color:var(--text-muted);margin-top:6px;line-height:var(--note-line-height)">' + _esc(notes) + '</div>';
    html += '</div>';
    html += '<div class="sp-subtask-actions">';
    html += '<button class="sp-subtask-action-btn edit-btn" type="button" title="Edit">&#9998;</button>';
    html += '<button class="sp-subtask-action-btn delete-btn" type="button" title="Delete">&#10005;</button>';
    html += '</div></div>';
    return html;
  }

  function updateOpsStats(initiatives, completed, overdue, dueThisWeek) {
    var statsEl = document.getElementById('sp-ops-stats');
    if (!statsEl) return;
    statsEl.innerHTML =
      '<div class="stat-card"><div class="stat-value">' + initiatives + '</div><div class="stat-label">Initiatives</div></div>' +
      '<div class="stat-card green"><div class="stat-value">' + completed + '</div><div class="stat-label">Tasks Complete</div></div>' +
      '<div class="stat-card orange"><div class="stat-value">' + overdue + '</div><div class="stat-label">Overdue</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + dueThisWeek + '</div><div class="stat-label">Due This Week</div></div>';
  }

  function formatSectionName(key) {
    var map = {
      'business_foundation': 'Business Foundation',
      'products_services': 'Products & Services',
      'financial_position': 'Financial Position',
      'operations_capacity': 'Operations & Capacity',
      'market_competition': 'Market & Competition',
      'growth_transformation': 'Growth & Transformation',
      'risk_resilience': 'Risk & Resilience'
    };
    return map[key] || key;
  }

  // ── EXPAND/COLLAPSE STATE ─────────────────────────────────────────────

  function getExpandState(initId) {
    try {
      var states = JSON.parse(localStorage.getItem('sp_expand_states') || '{}');
      return states[initId] !== false;
    } catch (e) { return true; }
  }

  function saveExpandState() {
    try {
      var states = {};
      document.querySelectorAll('.sp-initiative[data-init-id]').forEach(function(el) {
        states[el.dataset.initId] = el.classList.contains('expanded');
      });
      localStorage.setItem('sp_expand_states', JSON.stringify(states));
    } catch (e) { /* localStorage unavailable */ }
  }

  function toggleExpandAll() {
    var initiatives = document.querySelectorAll('.sp-initiative');
    var allExpanded = Array.from(initiatives).every(function(el) { return el.classList.contains('expanded'); });
    initiatives.forEach(function(el) {
      el.classList.toggle('expanded', !allExpanded);
    });
    var btn = document.querySelector('[data-expand]');
    if (btn) btn.textContent = allExpanded ? 'Expand All' : 'Collapse All';
    saveExpandState();
  }

  function filterInitiatives(view) {
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
  }

  // ── SUBTASK OPERATIONS ────────────────────────────────────────────────

  function toggleSubtask(taskId) {
    if (!_supabase) return;
    _supabase
      .from('action_tracker')
      .select('items')
      .eq('id', taskId)
      .single()
      .then(function(res) {
        if (res.error) return;
        var items = res.data.items || {};
        items.status = items.status === 'done' ? 'pending' : 'done';
        _supabase
          .from('action_tracker')
          .update({ items: items })
          .eq('id', taskId)
          .then(function(upRes) {
            if (!upRes.error) loadInitiatives();
          });
      });
  }

  function editSubtaskTitle(taskId) {
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
        saveTaskField(taskId, 'title', v);
      }
      loadInitiatives();
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') input.blur(); });
  }

  function editDueDate(taskId, dueEl) {
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
        saveTaskField(taskId, 'due_date', v);
        dueEl.textContent = v;
      } else {
        dueEl.textContent = current || 'Set date';
      }
    }
    input.addEventListener('blur', save);
    input.addEventListener('change', function() { input.blur(); });
  }

  function editOwner(taskId, ownerEl) {
    if (ownerEl.querySelector('select')) return;
    var current = (ownerEl.textContent || '').trim();
    var roles = ['Owner', 'Admin', 'Office manager', 'Leading hand', 'Project manager', 'Estimator', 'Business development', 'Bookkeeper'];
    var select = document.createElement('select');
    select.className = 'sp-inline-edit-input';
    select.style.width = '160px';
    select.innerHTML = roles.map(function(r) {
      return '<option value="' + _esc(r) + '"' + (r === current ? ' selected' : '') + '>' + _esc(r) + '</option>';
    }).join('');
    ownerEl.textContent = '';
    ownerEl.appendChild(select);
    select.focus();

    function save() {
      var v = select.value;
      saveTaskField(taskId, 'owner', v);
      _supabase.from('action_tracker').update({ owner: v }).eq('id', taskId).then(function() {});
      ownerEl.textContent = v;
    }
    select.addEventListener('blur', save);
    select.addEventListener('change', function() { select.blur(); });
  }

  function showAddTaskForm(btn) {
    var row = btn.closest('.sp-add-task-row');
    if (!row || row.querySelector('.sp-add-task-form')) return;
    btn.style.display = 'none';
    var parentId = btn.dataset.parentId;
    var form = document.createElement('div');
    form.className = 'sp-add-task-form';
    form.innerHTML =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
        '<div style="flex:1;min-width:200px">' +
          '<label class="sp-field-label" style="font-size:var(--label-font-size);margin-bottom:4px">Task Title</label>' +
          '<input type="text" class="sp-input sp-add-task-title" placeholder="What needs to be done?">' +
        '</div>' +
        '<div style="width:130px">' +
          '<label class="sp-field-label" style="font-size:var(--label-font-size);margin-bottom:4px">Priority</label>' +
          '<select class="sp-select sp-add-task-priority"><option value="High">High</option><option value="Medium" selected>Medium</option><option value="Low">Low</option></select>' +
        '</div>' +
        '<div style="width:150px">' +
          '<label class="sp-field-label" style="font-size:var(--label-font-size);margin-bottom:4px">Due Date</label>' +
          '<input type="date" class="sp-input sp-add-task-due">' +
        '</div>' +
        '<div style="width:150px">' +
          '<label class="sp-field-label" style="font-size:var(--label-font-size);margin-bottom:4px">Owner</label>' +
          '<select class="sp-select sp-add-task-owner"><option value="Owner">Owner</option><option value="Admin">Admin</option><option value="Office manager">Office manager</option><option value="Leading hand">Leading hand</option><option value="Project manager">Project manager</option><option value="Other">Other</option></select>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button class="btn-primary btn-sm sp-add-task-submit" data-parent-id="' + _esc(parentId) + '" type="button">Add Task</button>' +
        '<button class="btn-outline btn-sm sp-add-task-cancel" type="button">Cancel</button>' +
      '</div>';
    row.appendChild(form);
    form.querySelector('.sp-add-task-title').focus();
  }

  function submitAddTaskForm(btn) {
    var form = btn.closest('.sp-add-task-form');
    if (!form) return;
    var parentId = btn.dataset.parentId;
    var title = (form.querySelector('.sp-add-task-title').value || '').trim();
    if (!title) {
      form.querySelector('.sp-add-task-title').classList.add('sp-input-error');
      return;
    }
    var priority = form.querySelector('.sp-add-task-priority').value;
    var dueDate = form.querySelector('.sp-add-task-due').value;
    var owner = form.querySelector('.sp-add-task-owner').value;

    if (!_supabase || !_userId) return;
    _supabase
      .from('action_tracker')
      .insert({
        user_id: _userId,
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
          _showError('Could not add task. Please try again.');
          return;
        }
        loadInitiatives();
      });
  }

  function saveTaskField(taskId, field, value) {
    if (!_supabase) return;
    _supabase
      .from('action_tracker')
      .select('items')
      .eq('id', taskId)
      .single()
      .then(function(res) {
        if (res.error) return;
        var items = res.data.items || {};
        items[field] = value;
        _supabase
          .from('action_tracker')
          .update({ items: items })
          .eq('id', taskId)
          .then(function() {});
      });
  }

  function confirmDeleteTask(taskId) {
    var modal = document.getElementById('sp-confirm-modal');
    var body = document.getElementById('sp-confirm-body');
    var okBtn = document.getElementById('sp-confirm-ok');
    if (!modal || !body || !okBtn) return;

    body.textContent = 'Are you sure you want to delete this task? This cannot be undone.';
    modal.classList.add('open');

    var handler = function() {
      deleteTask(taskId);
      modal.classList.remove('open');
      okBtn.removeEventListener('click', handler);
    };
    okBtn.addEventListener('click', handler);
  }

  function deleteTask(taskId) {
    if (!_supabase) return;
    _supabase
      .from('action_tracker')
      .delete()
      .eq('id', taskId)
      .then(function(res) {
        if (!res.error) loadInitiatives();
      });
  }


  // ── INITIATIVE OPERATIONS ─────────────────────────────────────────────

  function showAddInitiativeModal() {
    var modal = document.getElementById('sp-add-init-modal');
    if (!modal) return;
    document.getElementById('sp-new-init-name').value = '';
    document.getElementById('sp-new-init-section').value = '';
    modal.classList.add('open');
  }

  function createInitiative() {
    var name = (document.getElementById('sp-new-init-name').value || '').trim();
    var section = document.getElementById('sp-new-init-section').value;
    if (!name) {
      _showError('Please enter an initiative name.');
      return;
    }
    if (!_supabase || !_userId) return;

    _supabase
      .from('action_tracker')
      .insert({
        user_id: _userId,
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
          _showError('Could not create initiative. Please try again.');
          return;
        }
        document.getElementById('sp-add-init-modal').classList.remove('open');
        loadInitiatives();
      });
  }

  // ── TAB 2: STRATEGIC PLAN VIEW ────────────────────────────────────────

  function loadStrategicPlanView() {
    if (!_supabase || !_userId) return;

    _supabase
      .from('strategic_plans')
      .select('id, plan_name, version, created_at, is_current, document_1_url, document_2_url, swot_data')
      .eq('user_id', _userId)
      .eq('is_current', true)
      .single()
      .then(function(res) {
        if (res.error || !res.data) return;
        var plan = res.data;

        var titleEl = document.getElementById('sp-doc-plan-title');
        if (titleEl) titleEl.textContent = (plan.plan_name || 'Strategic Plan') + ' v' + (plan.version || 1) + ' \u2014 Current Plan';

        var dateEl = document.getElementById('sp-doc-generated-date');
        if (dateEl) dateEl.textContent = 'Generated: ' + (plan.created_at ? plan.created_at.substring(0, 10) : '');

        var linksEl = document.getElementById('sp-download-links');
        if (linksEl) {
          var dlHtml = '';
          if (plan.document_1_url) {
            dlHtml += '<a href="' + _esc(plan.document_1_url) + '" class="btn-sp-download" download>Strategic Plan (Word)</a> ';
          }
          if (plan.document_2_url) {
            dlHtml += '<a href="' + _esc(plan.document_2_url) + '" class="btn-sp-download" download>Operational Plan (Word)</a> ';
          }
          dlHtml += '<button class="btn-sp-print" type="button">Print / Save as PDF</button>';
          dlHtml += ' <button class="btn-outline btn-sm" id="sp-update-plan-btn" type="button">Update Plan</button>';
          linksEl.innerHTML = dlHtml;
        }

        if (plan.swot_data) renderSwot(plan.swot_data);
      });

    loadVersionHistory();
  }

  function renderSwot(swotData) {
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
        html += items.map(function(item) { return '\u2022 ' + _esc(item); }).join('<br>');
      } else if (typeof items === 'string') {
        html += _esc(items);
      } else {
        html += '<em>Not available</em>';
      }
      html += '</div></div>';
    });

    grid.innerHTML = html;
    section.style.display = 'block';
  }

  // ── VERSION HISTORY ───────────────────────────────────────────────────

  function loadVersionHistory() {
    var el = document.getElementById('sp-version-history');
    if (!el || !_supabase || !_userId) return;
    _supabase
      .from('strategic_plans')
      .select('id, version, plan_name, created_at, is_current, document_1_url, document_2_url')
      .eq('user_id', _userId)
      .order('version', { ascending: false })
      .then(function(res) {
        if (res.data && res.data.length > 0) renderVersionHistory(res.data, el);
      });
  }

  function renderVersionHistory(versions, el) {
    if (!el || !versions || versions.length === 0) return;
    var html = '<h3 style="font-family:var(--heading-font);font-size:var(--heading-lg-size);font-weight:var(--heading-lg-weight);color:var(--text);margin-bottom:16px">Version History</h3><div class="sp-version-list">';
    versions.forEach(function(v) {
      var label = v.plan_name || ('Plan v' + v.version);
      var dateStr = v.created_at ? v.created_at.substring(0, 10) : '';
      var badge = v.is_current ? ' <span class="sp-current-badge">Current Plan</span>' : '';
      var doc1 = v.document_1_url ? '<a href="' + _esc(v.document_1_url) + '" class="sp-vh-link" download>Strategic Plan</a> ' : '';
      var doc2 = v.document_2_url ? '<a href="' + _esc(v.document_2_url) + '" class="sp-vh-link" download>Ops Plan</a> ' : '';
      var useBtn = v.is_current ? '' : '<button class="btn-sp-use-template" data-plan-id="' + _esc(v.id) + '" type="button">Use as Template</button>';
      html += '<div class="sp-version-row' + (v.is_current ? ' sp-version-current' : '') + '">';
      html += '<div class="sp-vh-label">' + _esc(label) + badge + '</div>';
      html += '<div class="sp-vh-meta">Generated: ' + _esc(dateStr) + '</div>';
      html += '<div class="sp-vh-actions">' + doc1 + doc2 + useBtn + '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.style.display = 'block';
  }

  function useAsTemplate(planId) {
    if (!_supabase) return;
    _supabase
      .from('strategic_plans')
      .select('interview_data')
      .eq('id', planId)
      .single()
      .then(function(res) {
        if (res.data && res.data.interview_data) {
          prefillFromPreviousPlan(res.data.interview_data);
          switchTab('create-plan');
          goToSection(0);
        }
      });
  }

  // ── CYCLE RENEWAL ─────────────────────────────────────────────────────

  function checkCycleRenewal(cycleEnd) {
    if (!cycleEnd) return;
    var daysLeft = Math.ceil((cycleEnd - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 14) {
      var banner = document.getElementById('sp-cycle-banner');
      if (banner) {
        banner.className = 'sp-cycle-renewal-banner';
        banner.innerHTML = 'Your current 90-day plan cycle ends on ' + _esc(cycleEnd.toISOString().substring(0, 10)) +
          '. Ready to plan your next quarter? ' +
          '<button class="btn-sp-new-cycle" type="button">Start New Cycle</button> ' +
          '<button data-dismiss-banner type="button" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-family:var(--body-font)">Dismiss</button>';
        banner.style.display = 'flex';
      }
    }
  }

  function startNewCycle() {
    if (!_supabase || !_userId) return;
    _supabase
      .from('strategic_plans')
      .select('interview_data')
      .eq('user_id', _userId)
      .eq('is_current', true)
      .single()
      .then(function(res) {
        if (res.data && res.data.interview_data) {
          prefillFromPreviousPlan(res.data.interview_data);
          switchTab('create-plan');
          goToSection(0);
        }
      });
  }

  // ── CHECK IF PLAN EXISTS ──────────────────────────────────────────────

  function checkPlanExists() {
    if (!_supabase || !_userId) return Promise.resolve(false);
    return _supabase
      .from('strategic_plans')
      .select('id, interview_data')
      .eq('user_id', _userId)
      .eq('is_current', true)
      .single()
      .then(function(res) {
        if (res.data) {
          hasPlan = true;
          if (res.data.interview_data) {
            prefillFromPreviousPlan(res.data.interview_data);
          }
          return true;
        }
        hasPlan = false;
        return false;
      });
  }

  // ── INIT ──────────────────────────────────────────────────────────────

  function init() {
    _supabase = window.supabaseClient;
    if (!_supabase) {
      renderSections();
      goToSection(0);
      return;
    }

    _supabase.auth.getUser().then(function(r) {
      var user = r.data && r.data.user;
      if (user) _userId = user.id;

      renderSections();
      goToSection(0);
      bindTabEvents();
      bindOpsEvents();
      bindDocEvents();
      bindModalEvents();
      loadProfile();
      loadBIContext();

      checkPlanExists().then(function(exists) {
        updateTabStates();
        if (exists) {
          switchTab('ops-plan');
        } else {
          switchTab('create-plan');
        }
      });
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────

  window.SP_LOGIC = {
    init: init,
    switchTab: switchTab,
    goToSection: goToSection,
    generate: generate,
    loadInitiatives: loadInitiatives,
    loadVersionHistory: loadVersionHistory
  };

})();
