// strategic-plan-logic.js
// All JavaScript logic for the Strategic Plan & 90-Day Ops tool.
// Reads window.SP_SECTIONS (defined in strategic-plan-data.js) to render the interview.
// No hardcoded field IDs, section content, or chip options in this file.

(function() {

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var currentSection = 0;
  var planData = {};
  var userProfile = null;
  var previousPlan = null;

  // ---------------------------------------------------------------------------
  // renderSections() \u2014 builds all 6 section forms from SP_SECTIONS config
  // ---------------------------------------------------------------------------
  function renderSections() {
    var sections = window.SP_SECTIONS;
    if (!sections || !sections.length) return;

    // Build progress nav chips
    var navHtml = sections.map(function(s, i) {
      var chipColors = ['c-blue','c-orange','c-green','c-purple','c-teal','c-red'];
      return '<button class="sp-nav-chip ' + (chipColors[i] || 'c-blue') + '" data-section="' + i + '" onclick="SP_LOGIC.goToSection(' + i + ')">' + (i + 1) + '. ' + s.title.split('. ')[1] + '</button>';
    }).join('');
    var navEl = document.getElementById('sp-section-nav');
    if (navEl) navEl.innerHTML = navHtml;

    // Build each section form
    var container = document.getElementById('sp-sections-container');
    if (!container) return;

    container.innerHTML = sections.map(function(s) {
      var fieldsHtml = s.fields.map(function(field) {
        return renderField(field);
      }).join('');

      var infoBox = s.infoBox
        ? '<div class="sp-info-box"><span class="sp-info-icon">\u{1F4A1}</span> ' + s.infoBox + '</div>'
        : '';

      return '<div class="sp-section" id="section-' + s.id + '" style="display:none;">' +
        '<div class="sp-section-header">' +
          '<span class="sp-section-icon">' + s.icon + '</span>' +
          '<div>' +
            '<h2 class="sp-section-title">' + s.title + '</h2>' +
            '<p class="sp-section-subtitle">' + s.subtitle + '</p>' +
          '</div>' +
        '</div>' +
        infoBox +
        '<div class="sp-fields">' + fieldsHtml + '</div>' +
        '<div class="sp-nav-buttons">' +
          (s.id > 0 ? '<button class="btn-sp-back" onclick="SP_LOGIC.navigate(-1)">Back</button>' : '') +
          (s.id < sections.length - 1
            ? '<button class="btn-sp-next" onclick="SP_LOGIC.navigate(1)">Next: ' + sections[s.id + 1].title.split('. ')[1] + '</button>'
            : '<button class="btn-sp-generate" onclick="SP_LOGIC.generate()">Generate My Plan</button>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // renderField() \u2014 renders a single field based on its type
  // ---------------------------------------------------------------------------
  function renderField(field) {
    var label = '<label class="sp-field-label" for="' + field.id + '">' +
      field.label +
      (field.labelHint ? ' <span class="sp-label-hint">' + field.labelHint + '</span>' : '') +
      '</label>';

    var helpText = field.helpText
      ? '<p class="sp-field-help">' + field.helpText + '</p>'
      : '';

    var input = '';

    if (field.type === 'text') {
      input = '<input type="text" id="' + field.id + '" class="sp-input" placeholder="' + (field.placeholder || '') + '">';

    } else if (field.type === 'textarea') {
      input = '<textarea id="' + field.id + '" class="sp-textarea" placeholder="' + (field.placeholder || '') + '" rows="4"></textarea>';

    } else if (field.type === 'select') {
      var opts = (field.options || []).map(function(o) {
        return '<option value="' + o.value + '">' + o.label + '</option>';
      }).join('');
      input = '<select id="' + field.id + '" class="sp-select">' + opts + '</select>';

    } else if (field.type === 'chip-single' || field.type === 'chip-multi') {
      var multi = field.type === 'chip-multi';
      var chips = (field.options || []).map(function(o) {
        return '<div class="sp-chip" data-value="' + o.value + '" data-group="' + field.id + '" onclick="SP_LOGIC.toggleChip(this, \'' + field.id + '\', ' + multi + ')">' + o.label + '</div>';
      }).join('');
      input = '<div class="sp-chip-group" id="' + field.id + '-chips">' + chips + '</div>';
      // Hidden input to store value
      input += '<input type="hidden" id="' + field.id + '" value="">';
    }

    return '<div class="sp-field">' + label + helpText + input + '</div>';
  }

  // ---------------------------------------------------------------------------
  // toggleChip() \u2014 handles chip selection (single or multi)
  // ---------------------------------------------------------------------------
  function toggleChip(el, groupId, isMulti) {
    var group = document.getElementById(groupId + '-chips');
    if (!group) return;
    var chips = group.querySelectorAll('.sp-chip');

    if (!isMulti) {
      // Single select \u2014 deselect all others
      chips.forEach(function(c) { c.classList.remove('sp-chip-active'); });
      el.classList.add('sp-chip-active');
    } else {
      // Multi select \u2014 toggle this one
      el.classList.toggle('sp-chip-active');
    }

    // Update hidden input
    var selected = Array.from(group.querySelectorAll('.sp-chip-active'))
      .map(function(c) { return c.getAttribute('data-value'); });
    var hidden = document.getElementById(groupId);
    if (hidden) hidden.value = selected.join(',');
  }

  // ---------------------------------------------------------------------------
  // goToSection() / navigate() \u2014 section navigation
  // ---------------------------------------------------------------------------
  function goToSection(index) {
    var sections = window.SP_SECTIONS;
    if (index < 0 || index >= sections.length) return;

    // Hide all sections
    sections.forEach(function(s) {
      var el = document.getElementById('section-' + s.id);
      if (el) el.style.display = 'none';
    });

    // Show target
    var target = document.getElementById('section-' + index);
    if (target) {
      target.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    currentSection = index;

    // Update nav chips
    var chips = document.querySelectorAll('.sp-nav-chip');
    chips.forEach(function(c, i) {
      c.classList.toggle('sp-nav-chip-active', i === index);
      c.classList.toggle('sp-nav-chip-done', i < index);
    });

    // Update progress bar
    updateProgress(index);
  }

  function navigate(direction) {
    goToSection(currentSection + direction);
  }

  // ---------------------------------------------------------------------------
  // updateProgress() \u2014 updates the segmented progress bar
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // loadProfile() \u2014 loads user profile from Supabase and prefills section 0
  // ---------------------------------------------------------------------------
  function loadProfile() {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.getUser().then(function(result) {
      var user = result.data && result.data.user;
      if (!user) return;
      window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(function(res) {
          if (res.data) {
            userProfile = res.data;
            prefillFromProfile(res.data);
          }
        });
    });
  }

  // ---------------------------------------------------------------------------
  // loadPreviousPlan() \u2014 loads most recent plan for this user
  // ---------------------------------------------------------------------------
  function loadPreviousPlan() {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.getUser().then(function(result) {
      var user = result.data && result.data.user;
      if (!user) return;
      window.supabaseClient
        .from('strategic_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(function(res) {
          if (res.data && res.data.length > 0) {
            previousPlan = res.data[0];
          }
        });
    });
  }

  // ---------------------------------------------------------------------------
  // prefillFromProfile() \u2014 sets field values from profile data
  // ---------------------------------------------------------------------------
  function prefillFromProfile(profile) {
    // Reads profileKey from SP_SECTIONS — no hardcoded field IDs in this file
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        if (field.profileKey && profile[field.profileKey]) {
          var el = document.getElementById(field.id);
          if (el) el.value = profile[field.profileKey];
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // collectSectionData() \u2014 collects all field values and calls the API
  // ---------------------------------------------------------------------------
  function collectSectionData() {
    var data = {};
    window.SP_SECTIONS.forEach(function(section) {
      section.fields.forEach(function(field) {
        var el = document.getElementById(field.id);
        if (el) data[field.id] = el.value || '';
      });
    });
    planData = data;
    return data;
  }

  // ---------------------------------------------------------------------------
  // generate() \u2014 collects data and calls the API
  // ---------------------------------------------------------------------------
  async function generate() {
    var btn = document.querySelector('.btn-sp-generate');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating your plan...';
    }

    var clContext = null;
    var biInsights = null;
    var cycleEndDate = new Date(Date.now() + 90*24*60*60*1000).toISOString().substring(0,10);
    try {
      var _sess = window.supabaseClient ? await window.supabaseClient.auth.getSession() : null;
      var _jwt = _sess && _sess.data && _sess.data.session ? _sess.data.session.access_token : null;
      if (_jwt) {
        var _cr = await fetch('/api/strategic-plan-load-context', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt } });
        if (_cr.ok) { var _cd = await _cr.json(); clContext = _cd.clContext || null; biInsights = _cd.biInsights || null; }
      }
    } catch(e) { /* context load is optional */ }
    var data = collectSectionData();

    fetch('/api/strategic-plan-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planData: data, clContext: clContext, biInsights: biInsights, cycleEndDate: cycleEndDate })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      if (result.error) throw new Error(result.error);
      showResults(result);
    })
    .catch(function(err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate My Plan';
      }
      var errEl = document.getElementById('sp-error');
      if (errEl) {
        errEl.textContent = 'Something went wrong generating your plan. Please try again.';
        errEl.style.display = 'block';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // showResults() \u2014 displays download links after generation
  // ---------------------------------------------------------------------------
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
      if (linksEl && result.documents) {
        linksEl.innerHTML = result.documents.map(function(doc) {
          return '<a href="' + doc.url + '" class="btn-sp-download" download>' + doc.name + '</a>';
        }).join('');
      }
    }
    if (result.planId) window._currentPlanId = result.planId;
    if (result.strategyUrl || result.opsUrl) {
      var linksEl = document.getElementById('sp-download-links');
      if (linksEl) {
        var dlHtml = '';
        if (result.strategyUrl) dlHtml += '<a href="' + result.strategyUrl + '" class="btn-sp-download" download>Strategic Plan (Word)</a> ';
        if (result.opsUrl) dlHtml += '<a href="' + result.opsUrl + '" class="btn-sp-download" download>90-Day Ops Plan (Word)</a> <button class="btn-sp-print" onclick="window.print()" type="button">Print / Save as PDF</button>';
        linksEl.innerHTML = dlHtml;
      }
    }
    var regenEl = document.getElementById('sp-regen-note');
    if (!regenEl) {
      regenEl = document.createElement('div');
      regenEl.id = 'sp-regen-note';
      regenEl.className = 'sp-regen-guidance';
      regenEl.innerHTML = 'Not happy with the output? Adjust your answers and regenerate at any time. Your previous version is always saved. <a href="#sp-version-history" onclick="SP_LOGIC.loadVersionHistory()">View version history</a>';
      var resultsEl = document.getElementById('sp-results');
      if (resultsEl) resultsEl.appendChild(regenEl);
    }
    loadActionTracker();
    loadVersionHistory();
    checkCycleRenewal();
  }

  // ---------------------------------------------------------------------------
  // loadActionTracker() \u2014 loads tasks from Supabase for this user
  // ---------------------------------------------------------------------------
  function loadActionTracker() {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.getUser().then(function(result) {
      var user = result.data && result.data.user;
      if (!user) return;
      window.supabaseClient
        .from('action_tracker')
        .select('id, title, due_date, status, priority, month_group, is_carried_forward, owner, plan_id')
        .eq('user_id', user.id)
        .order('due_date', { ascending: true })
        .then(function(res) {
          if (res.data) renderTracker(res.data);
        });
    });
  }

  // ---------------------------------------------------------------------------
  // renderTracker() \u2014 renders the 90-day action tracker UI
  // ---------------------------------------------------------------------------
  function renderTracker(tasks) {
    var el = document.getElementById('sp-tracker');
    if (!el) return;
    if (!tasks || tasks.length === 0) { el.innerHTML = '<p class="sp-empty">No tasks yet. Generate your plan to populate the 90-day action tracker.</p>'; return; }
    var groups = { 1: [], 2: [], 3: [], 0: [] };
    tasks.forEach(function(t) { var g = t.month_group || 0; if (!groups[g]) groups[g] = []; groups[g].push(t); });
    var html = '';
    [1, 2, 3, 0].forEach(function(g) {
      if (!groups[g] || groups[g].length === 0) return;
      var heading = g === 1 ? 'Month 1 (Days 1-30)' : g === 2 ? 'Month 2 (Days 31-60)' : g === 3 ? 'Month 3 (Days 61-90)' : 'General Tasks';
      html += '<div class="sp-month-group" data-month="' + g + '"><h4 class="sp-month-heading">' + heading + '</h4>';
      groups[g].forEach(function(task) {
        var done = task.status === 'done';
        var cf = task.is_carried_forward ? ' <span class="sp-cf-badge">Carried Forward</span>' : '';
        html += '<div class="sp-task' + (done ? ' sp-task-done' : '') + '" data-id="' + task.id + '">';
        html += '<input type="checkbox" class="sp-task-check"' + (done ? ' checked' : '') + ' onchange="SP_LOGIC.toggleTask(\'' + task.id + '\')">';
        html += '<span class="sp-task-title" onclick="SP_LOGIC.editTaskTitle(\'' + task.id + '\')">' + (task.title || '') + '</span>' + cf;
        html += '<div class="sp-task-meta">';
        if (task.owner) html += '<span class="sp-task-owner">' + task.owner + '</span>';
        if (task.due_date) html += '<span class="sp-task-due">' + task.due_date + '</span>';
        html += '<select class="sp-task-priority" onchange="SP_LOGIC.saveTaskField(\'' + task.id + '\', \'priority\', this.value)">';
        ['High', 'Medium', 'Low'].forEach(function(p) { html += '<option value="' + p + '"' + (task.priority === p ? ' selected' : '') + '>' + p + '</option>'; });
        html += '</select>';
        html += '<button class="sp-task-delete" onclick="SP_LOGIC.deleteTask(\'' + task.id + '\')" type="button">Delete</button>';
        html += '</div></div>';
      });
      html += '<button class="btn-sp-add-task" onclick="SP_LOGIC.addTask(' + g + ')" type="button">+ Add Task</button></div>';
    });
    el.innerHTML = html;
  }
  function toggleTask(taskId) {
    if (!window.supabaseClient) return;
    var taskEl = document.querySelector('[data-id="' + taskId + '"]');
    var isDone = taskEl && taskEl.classList.contains('sp-task-done');
    var newStatus = isDone ? 'pending' : 'done';

    window.supabaseClient
      .from('action_tracker')
      .update({ status: newStatus })
      .eq('id', taskId)
      .then(function() {
        loadActionTracker();
      });
  }

  // ---------------------------------------------------------------------------
  // init() \u2014 called on DOMContentLoaded
  // ---------------------------------------------------------------------------
  function init() {
    renderSections();
    goToSection(0);
    loadProfile();
    loadPreviousPlan();
    loadActionTracker();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function loadVersionHistory() {
    var el = document.getElementById('sp-version-history');
    if (!el || !window.supabaseClient) return;
    window.supabaseClient.auth.getUser().then(function(r) {
      var user = r.data && r.data.user;
      if (!user) return;
      window.supabaseClient.from('strategic_plans').select('id, version, plan_name, cycle_end_date, created_at, is_current, document_1_url, document_2_url').eq('user_id', user.id).order('version', { ascending: false }).then(function(res) {
        if (res.data) renderVersionHistory(res.data);
      });
    });
  }

  function renderVersionHistory(versions) {
    var el = document.getElementById('sp-version-history');
    if (!el || !versions || versions.length === 0) return;
    var html = '<div class="sp-version-list">';
    versions.forEach(function(v) {
      var label = v.plan_name || ('Plan v' + v.version);
      var dateStr = v.created_at ? v.created_at.substring(0, 10) : '';
      var cycleStr = v.cycle_end_date ? ' | Cycle ends: ' + v.cycle_end_date : '';
      var badge = v.is_current ? ' <span class="sp-current-badge">Current Plan</span>' : '';
      var doc1 = v.document_1_url ? '<a href="' + v.document_1_url + '" class="sp-vh-link" download>Strategic Plan</a> ' : '';
      var doc2 = v.document_2_url ? '<a href="' + v.document_2_url + '" class="sp-vh-link" download>Ops Plan</a> ' : '';
      var useBtn = v.is_current ? '' : '<button class="btn-sp-use-template" onclick="SP_LOGIC.useAsTemplate(\'' + v.id + '\')" type="button">Use as Template</button>';
      html += '<div class="sp-version-row' + (v.is_current ? ' sp-version-current' : '') + '">';
      html += '<div class="sp-vh-label">' + label + badge + '</div>';
      html += '<div class="sp-vh-meta">Generated: ' + dateStr + cycleStr + '</div>';
      html += '<div class="sp-vh-actions">' + doc1 + doc2 + useBtn + '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.style.display = 'block';
  }

  function useAsTemplate(planId) {
    if (!window.supabaseClient) return;
    window.supabaseClient.from('strategic_plans').select('interview_data').eq('id', planId).single().then(function(res) {
      if (res.data && res.data.interview_data) {
        Object.keys(res.data.interview_data).forEach(function(key) { var el = document.getElementById(key); if (el) el.value = res.data.interview_data[key]; });
        var iv = document.getElementById('sp-interview');
        if (iv) iv.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  function checkCycleRenewal() {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.getUser().then(function(r) {
      var user = r.data && r.data.user;
      if (!user) return;
      window.supabaseClient.from('strategic_plans').select('cycle_end_date, interview_data').eq('user_id', user.id).eq('is_current', true).single().then(function(res) {
        if (!res.data || !res.data.cycle_end_date) return;
        var daysLeft = Math.ceil((new Date(res.data.cycle_end_date) - new Date()) / (1000*60*60*24));
        if (daysLeft <= 14) {
          var banner = document.getElementById('sp-cycle-banner');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'sp-cycle-banner';
            banner.className = 'sp-cycle-renewal-banner';
            banner.innerHTML = 'Your current 90-day plan cycle ends on ' + res.data.cycle_end_date + '. Ready to plan your next quarter? <button class="btn-sp-new-cycle" onclick="SP_LOGIC.startNewCycle()" type="button">Start New Cycle</button> <button onclick="this.parentNode.style.display=\'none\'" type="button">Dismiss</button>';
            var iv = document.getElementById('sp-interview');
            if (iv) iv.parentNode.insertBefore(banner, iv);
          }
          banner.style.display = 'block';
        }
      });
    });
  }

  function startNewCycle() {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.getUser().then(function(r) {
      var user = r.data && r.data.user;
      if (!user) return;
      window.supabaseClient.from('strategic_plans').select('interview_data').eq('user_id', user.id).eq('is_current', true).single().then(function(res) {
        if (res.data && res.data.interview_data) {
          Object.keys(res.data.interview_data).forEach(function(key) { var el = document.getElementById(key); if (el) el.value = res.data.interview_data[key]; });
          var iv = document.getElementById('sp-interview');
          if (iv) iv.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  function editTaskTitle(taskId) {
    var titleEl = document.querySelector('.sp-task[data-id="' + taskId + '"] .sp-task-title');
    if (!titleEl || titleEl.querySelector('input')) return;
    var current = titleEl.textContent;
    titleEl.innerHTML = '<input type="text" class="sp-task-title-input" value="' + current.replace(/"/g, '&quot;') + '">';
    var input = titleEl.querySelector('input');
    input.focus();
    function save() { var v = input.value.trim(); if (v && v !== current) { saveTaskField(taskId, 'title', v); titleEl.textContent = v; } else { titleEl.textContent = current; } }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') input.blur(); });
  }

  function saveTaskField(taskId, field, value) {
    if (!window.supabaseClient) return;
    var update = {};
    update[field] = value;
    window.supabaseClient.from('action_tracker').update(update).eq('id', taskId).then(function(res) {
      if (!res.error) {
        var el = document.querySelector('.sp-task[data-id="' + taskId + '"]');
        if (el) { el.classList.add('sp-task-saved'); setTimeout(function() { el.classList.remove('sp-task-saved'); }, 1200); }
      }
    });
  }

  function deleteTask(taskId) {
    var btn = document.querySelector('.sp-task[data-id="' + taskId + '"] .sp-task-delete');
    if (btn && btn.dataset.confirm !== 'true') {
      btn.dataset.confirm = 'true'; btn.textContent = 'Confirm';
      setTimeout(function() { if (btn.dataset.confirm === 'true') { btn.dataset.confirm = ''; btn.textContent = 'Delete'; } }, 3000);
      return;
    }
    if (!window.supabaseClient) return;
    window.supabaseClient.from('action_tracker').delete().eq('id', taskId).then(function(res) {
      if (!res.error) { var el = document.querySelector('.sp-task[data-id="' + taskId + '"]'); if (el) el.remove(); }
    });
  }

  function addTask(monthGroup) {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.getUser().then(function(r) {
      var user = r.data && r.data.user;
      if (!user) return;
      window.supabaseClient.from('action_tracker').insert({ user_id: user.id, title: 'New task', status: 'pending', priority: 'Medium', month_group: monthGroup || null, plan_id: window._currentPlanId || null, is_carried_forward: false }).select().single().then(function(res) {
        if (!res.error) loadActionTracker();
      });
    });
  }

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
    addTask: addTask,
  };

})();
