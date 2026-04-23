// strategic-plan-logic.js
// All JavaScript logic for the Strategic Plan & 90-Day Ops tool.
// Reads window.SP_SECTIONS (defined in strategic-plan-data.js) to render the interview.
// Uses field.apiKey and field.valueType to build the correct API payload.

(function() {

  var currentSection = 0;
  var planData = {};
  var userProfile = null;
  var previousPlan = null;
  var _supabase = null;
  var _userId = null;
  var _jwt = null;

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

  // ── RENDER SECTIONS ───────────────────────────────────────────────────

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
        '<div class="sp-nav-buttons">' + backBtn + nextBtn + '</div>' +
      '</div>';
    }).join('');

    bindSectionEvents();
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
    } else if (field.type === 'chip-single' || field.type === 'chip-multi') {
      var chips = (field.options || []).map(function(o) {
        return '<div class="filter-pill" data-value="' + _esc(o.value) + '" data-group="' + field.id + '" data-multi="' + (field.type === 'chip-multi') + '">' + _esc(o.label) + '</div>';
      }).join('');
      input = '<div class="sp-chip-group" id="' + field.id + '-chips">' + chips + '</div>';
      input += '<input type="hidden" id="' + field.id + '" value="">';
    }

    return '<div class="sp-field">' + label + helpText + input + errorEl + '</div>';
  }

  // ── EVENT DELEGATION ──────────────────────────────────────────────────

  function bindSectionEvents() {
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
    }
  }

  function bindTrackerEvents() {
    var tracker = document.getElementById('sp-tracker');
    if (!tracker) return;

    tracker.addEventListener('click', function(e) {
      var taskEl = e.target.closest('.sp-task');

      var deleteBtn = e.target.closest('.sp-task-delete');
      if (deleteBtn && taskEl) {
        deleteTask(taskEl.dataset.id, deleteBtn);
        return;
      }

      var addBtn = e.target.closest('.btn-sp-add-task');
      if (addBtn) {
        addTask(parseInt(addBtn.dataset.month, 10));
        return;
      }

      var titleEl = e.target.closest('.sp-task-title');
      if (titleEl && taskEl && !titleEl.querySelector('input')) {
        editTaskTitle(taskEl.dataset.id);
        return;
      }
    });

    tracker.addEventListener('change', function(e) {
      var checkbox = e.target.closest('.sp-task-check');
      if (checkbox) {
        var taskEl = checkbox.closest('.sp-task');
        if (taskEl) toggleTask(taskEl.dataset.id);
        return;
      }

      var prioritySel = e.target.closest('.sp-task-priority');
      if (prioritySel) {
        var taskEl = prioritySel.closest('.sp-task');
        if (taskEl) saveTaskField(taskEl.dataset.id, 'priority', prioritySel.value);
        return;
      }
    });
  }

  function bindResultsEvents() {
    var results = document.getElementById('sp-results');
    if (!results) return;

    results.addEventListener('click', function(e) {
      var templateBtn = e.target.closest('.btn-sp-use-template');
      if (templateBtn) {
        useAsTemplate(templateBtn.dataset.planId);
        return;
      }
      var newCycleBtn = e.target.closest('.btn-sp-new-cycle');
      if (newCycleBtn) {
        startNewCycle();
        return;
      }
      var printBtn = e.target.closest('.btn-sp-print');
      if (printBtn) {
        window.print();
        return;
      }
      var dismissBtn = e.target.closest('[data-dismiss-banner]');
      if (dismissBtn) {
        var banner = document.getElementById('sp-cycle-banner');
        if (banner) banner.style.display = 'none';
        return;
      }
    });
  }

  // ── CHIP TOGGLE ───────────────────────────────────────────────────────

  function toggleChip(el, groupId, isMulti) {
    var group = document.getElementById(groupId + '-chips');
    if (!group) return;

    if (!isMulti) {
      group.querySelectorAll('.filter-pill').forEach(function(c) { c.classList.remove('active'); });
      el.classList.add('active');
    } else {
      el.classList.toggle('active');
    }

    var selected = Array.from(group.querySelectorAll('.filter-pill.active'))
      .map(function(c) { return c.getAttribute('data-value'); });
    var hidden = document.getElementById(groupId);
    if (hidden) hidden.value = selected.join(',');
  }

  // ── SECTION NAVIGATION ────────────────────────────────────────────────

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

  function loadPreviousPlan() {
    if (!_supabase || !_userId) return;
    _supabase
      .from('strategic_plans')
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(function(res) {
        if (res.data && res.data.length > 0) {
          previousPlan = res.data[0];
        }
      });
  }

  function prefillFromProfile(profile) {
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        if (field.profileKey && profile[field.profileKey]) {
          var el = document.getElementById(field.id);
          if (el) el.value = profile[field.profileKey];
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

    planData = data;
    return valid ? data : null;
  }

  // ── GENERATE ──────────────────────────────────────────────────────────

  async function generate() {
    var data = collectSectionData();
    if (!data) {
      _showError('Please complete the required fields before generating your plan.');
      goToSection(0);
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
      var result = await r.json();
      if (result.error) throw new Error(result.error);
      showResults(result);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate My Plan';
      }
      _showError('Something went wrong generating your plan. Please try again.');
    }
  }

  async function _getJwt() {
    if (!_supabase) return null;
    var sess = await _supabase.auth.getSession();
    return (sess && sess.data && sess.data.session) ? sess.data.session.access_token : null;
  }

  // ── SHOW RESULTS ──────────────────────────────────────────────────────

  function showResults(result) {
    var container = document.getElementById('sp-sections-container');
    if (container) container.style.display = 'none';
    var nav = document.getElementById('sp-section-nav');
    if (nav) nav.style.display = 'none';
    var progress = document.getElementById('sp-progress-container');
    if (progress) progress.style.display = 'none';

    var results = document.getElementById('sp-results');
    if (results) {
      results.style.display = 'block';

      var linksEl = document.getElementById('sp-download-links');
      if (linksEl) {
        var dlHtml = '';
        if (result.strategyUrl) {
          dlHtml += '<a href="' + _esc(result.strategyUrl) + '" class="btn-sp-download" download>Strategic Plan (Word)</a> ';
        }
        if (result.opsUrl) {
          dlHtml += '<a href="' + _esc(result.opsUrl) + '" class="btn-sp-download" download>90-Day Ops Plan (Word)</a> ';
          dlHtml += '<button class="btn-sp-print" type="button">Print / Save as PDF</button>';
        }
        linksEl.innerHTML = dlHtml;
      }
    }

    if (result.planId) window._currentPlanId = result.planId;

    var regenEl = document.getElementById('sp-regen-note');
    if (!regenEl && results) {
      regenEl = document.createElement('div');
      regenEl.id = 'sp-regen-note';
      regenEl.className = 'sp-regen-guidance';
      regenEl.textContent = 'Not happy with the output? Adjust your answers and regenerate at any time. Your previous version is always saved.';
      results.appendChild(regenEl);
    }

    loadActionTracker();
    loadVersionHistory();
    checkCycleRenewal();
  }

  // ── ACTION TRACKER (uses items jsonb column) ──────────────────────────

  function loadActionTracker() {
    if (!_supabase || !_userId) return;
    _supabase
      .from('action_tracker')
      .select('id, items, month_group, is_carried_forward, owner, plan_id')
      .eq('user_id', _userId)
      .order('month_group', { ascending: true })
      .then(function(res) {
        if (res.data) renderTracker(res.data);
      });
  }

  function _extractTask(row) {
    var items = row.items || {};
    return {
      id: row.id,
      title: items.title || '',
      due_date: items.due_date || '',
      status: items.status || 'pending',
      priority: items.priority || 'Medium',
      month_group: row.month_group || 0,
      is_carried_forward: row.is_carried_forward || false,
      owner: row.owner || items.owner || '',
      plan_id: row.plan_id
    };
  }

  function renderTracker(rows) {
    var el = document.getElementById('sp-tracker');
    if (!el) return;

    var tasks = rows.map(_extractTask);

    if (!tasks || tasks.length === 0) {
      el.innerHTML = '<p class="sp-empty">No tasks yet. Generate your plan to populate the 90-day action tracker.</p>';
      return;
    }

    var groups = { 1: [], 2: [], 3: [], 0: [] };
    tasks.forEach(function(t) {
      var g = t.month_group || 0;
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    });

    var html = '';
    [1, 2, 3, 0].forEach(function(g) {
      if (!groups[g] || groups[g].length === 0) return;
      var heading = g === 1 ? 'Month 1 (Days 1\u201330)' : g === 2 ? 'Month 2 (Days 31\u201360)' : g === 3 ? 'Month 3 (Days 61\u201390)' : 'General Tasks';
      html += '<div class="sp-month-group" data-month="' + g + '"><h4 class="sp-month-heading">' + _esc(heading) + '</h4>';

      groups[g].forEach(function(task) {
        var done = task.status === 'done';
        var cf = task.is_carried_forward ? ' <span class="sp-cf-badge">Carried Forward</span>' : '';
        html += '<div class="sp-task' + (done ? ' sp-task-done' : '') + '" data-id="' + _esc(task.id) + '">';
        html += '<input type="checkbox" class="sp-task-check"' + (done ? ' checked' : '') + '>';
        html += '<div class="sp-task-body">';
        html += '<span class="sp-task-title">' + _esc(task.title) + '</span>' + cf;
        html += '<div class="sp-task-meta">';
        if (task.owner) html += '<span class="sp-task-owner">' + _esc(task.owner) + '</span>';
        if (task.due_date) html += '<span class="sp-task-due">' + _esc(task.due_date) + '</span>';
        html += '<select class="sp-task-priority">';
        ['High', 'Medium', 'Low'].forEach(function(p) {
          html += '<option value="' + p + '"' + (task.priority === p ? ' selected' : '') + '>' + p + '</option>';
        });
        html += '</select>';
        html += '<button class="sp-task-delete" type="button">Delete</button>';
        html += '</div></div></div>';
      });

      html += '<button class="btn-sp-add-task" data-month="' + g + '" type="button">+ Add Task</button></div>';
    });

    el.innerHTML = html;
  }

  function toggleTask(taskId) {
    if (!_supabase) return;
    var taskEl = document.querySelector('.sp-task[data-id="' + taskId + '"]');
    var isDone = taskEl && taskEl.classList.contains('sp-task-done');
    var newStatus = isDone ? 'pending' : 'done';

    _supabase
      .from('action_tracker')
      .select('items')
      .eq('id', taskId)
      .single()
      .then(function(res) {
        if (res.error) return;
        var items = res.data.items || {};
        items.status = newStatus;
        _supabase
          .from('action_tracker')
          .update({ items: items })
          .eq('id', taskId)
          .then(function() { loadActionTracker(); });
      });
  }

  function editTaskTitle(taskId) {
    var titleEl = document.querySelector('.sp-task[data-id="' + taskId + '"] .sp-task-title');
    if (!titleEl || titleEl.querySelector('input')) return;
    var current = titleEl.textContent;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'sp-task-title-input';
    input.value = current;
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();

    function save() {
      var v = input.value.trim();
      if (v && v !== current) {
        saveTaskField(taskId, 'title', v);
        titleEl.textContent = v;
      } else {
        titleEl.textContent = current;
      }
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') input.blur(); });
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
          .then(function(upRes) {
            if (!upRes.error) {
              var el = document.querySelector('.sp-task[data-id="' + taskId + '"]');
              if (el) {
                el.classList.add('sp-task-saved');
                setTimeout(function() { el.classList.remove('sp-task-saved'); }, 1200);
              }
            }
          });
      });
  }

  function deleteTask(taskId, btn) {
    if (btn && btn.dataset.confirm !== 'true') {
      btn.dataset.confirm = 'true';
      btn.textContent = 'Confirm';
      setTimeout(function() {
        if (btn.dataset.confirm === 'true') {
          btn.dataset.confirm = '';
          btn.textContent = 'Delete';
        }
      }, 3000);
      return;
    }
    if (!_supabase) return;
    _supabase
      .from('action_tracker')
      .delete()
      .eq('id', taskId)
      .then(function(res) {
        if (!res.error) {
          var el = document.querySelector('.sp-task[data-id="' + taskId + '"]');
          if (el) el.remove();
        }
      });
  }

  function addTask(monthGroup) {
    if (!_supabase || !_userId) return;
    _supabase
      .from('action_tracker')
      .insert({
        user_id: _userId,
        items: { title: 'New task', status: 'pending', priority: 'Medium' },
        month_group: monthGroup || null,
        plan_id: window._currentPlanId || null,
        is_carried_forward: false
      })
      .select()
      .single()
      .then(function(res) {
        if (!res.error) loadActionTracker();
      });
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
    var html = '<h3 class="sp-tracker-heading">Version History</h3><div class="sp-version-list">';
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
          Object.keys(res.data.interview_data).forEach(function(key) {
            var el = document.getElementById(key);
            if (el) el.value = res.data.interview_data[key];
          });
          var container = document.getElementById('sp-sections-container');
          if (container) {
            container.style.display = 'block';
            var nav = document.getElementById('sp-section-nav');
            if (nav) nav.style.display = 'flex';
            var progress = document.getElementById('sp-progress-container');
            if (progress) progress.style.display = 'block';
            var results = document.getElementById('sp-results');
            if (results) results.style.display = 'none';
            goToSection(0);
          }
        }
      });
  }

  // ── CYCLE RENEWAL ─────────────────────────────────────────────────────

  function checkCycleRenewal() {
    if (!_supabase || !_userId) return;
    _supabase
      .from('strategic_plans')
      .select('interview_data, created_at')
      .eq('user_id', _userId)
      .eq('is_current', true)
      .single()
      .then(function(res) {
        if (!res.data || !res.data.created_at) return;
        var cycleEnd = new Date(new Date(res.data.created_at).getTime() + 90 * 24 * 60 * 60 * 1000);
        var daysLeft = Math.ceil((cycleEnd - new Date()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 14) {
          var banner = document.getElementById('sp-cycle-banner');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'sp-cycle-banner';
            banner.className = 'sp-cycle-renewal-banner';
            banner.innerHTML = 'Your current 90-day plan cycle ends on ' + _esc(cycleEnd.toISOString().substring(0, 10)) +
              '. Ready to plan your next quarter? ' +
              '<button class="btn-sp-new-cycle" type="button">Start New Cycle</button> ' +
              '<button data-dismiss-banner type="button" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-family:var(--body-font)">Dismiss</button>';
            var results = document.getElementById('sp-results');
            if (results) results.insertBefore(banner, results.firstChild);
          }
          banner.style.display = 'flex';
        }
      });
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
          Object.keys(res.data.interview_data).forEach(function(key) {
            var el = document.getElementById(key);
            if (el) el.value = res.data.interview_data[key];
          });
          var container = document.getElementById('sp-sections-container');
          if (container) {
            container.style.display = 'block';
            var nav = document.getElementById('sp-section-nav');
            if (nav) nav.style.display = 'flex';
            var progress = document.getElementById('sp-progress-container');
            if (progress) progress.style.display = 'block';
            var results = document.getElementById('sp-results');
            if (results) results.style.display = 'none';
            goToSection(0);
          }
        }
      });
  }

  // ── INIT ──────────────────────────────────────────────────────────────

  function init() {
    _supabase = window.supabaseClient;
    if (_supabase) {
      _supabase.auth.getUser().then(function(r) {
        var user = r.data && r.data.user;
        if (user) _userId = user.id;
        renderSections();
        goToSection(0);
        bindTrackerEvents();
        bindResultsEvents();
        loadProfile();
        loadPreviousPlan();
        loadActionTracker();
      });
    } else {
      renderSections();
      goToSection(0);
    }
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────

  window.SP_LOGIC = {
    init: init,
    goToSection: goToSection,
    navigate: navigate,
    toggleChip: toggleChip,
    generate: generate,
    toggleTask: toggleTask,
    loadActionTracker: loadActionTracker,
    loadVersionHistory: loadVersionHistory,
    useAsTemplate: useAsTemplate,
    startNewCycle: startNewCycle,
    editTaskTitle: editTaskTitle,
    saveTaskField: saveTaskField,
    deleteTask: deleteTask,
    addTask: addTask
  };

})();
