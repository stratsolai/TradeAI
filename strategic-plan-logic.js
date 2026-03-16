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
  function generate() {
    var btn = document.querySelector('.btn-sp-generate');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating your plan...';
    }

    var data = collectSectionData();

    fetch('/api/strategic-plan-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
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

    loadActionTracker();
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
        .select('*')
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
    var container = document.getElementById('sp-tracker');
    if (!container) return;

    if (!tasks || tasks.length === 0) {
      container.innerHTML = '<p class="sp-tracker-empty">No tasks yet. Generate your plan to create your 90-day action tracker.</p>';
      return;
    }

    var statusOrder = { 'pending': 0, 'in-progress': 1, 'done': 2 };
    var priorityClass = { 'High': 'sp-priority-high', 'Medium': 'sp-priority-med', 'Low': 'sp-priority-low' };

    container.innerHTML = '<div class="sp-tracker-list">' +
      tasks.map(function(task) {
        var due = task.due_date ? new Date(task.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
        var pClass = priorityClass[task.priority] || 'sp-priority-low';
        var isDone = task.status === 'done';
        return '<div class="sp-task' + (isDone ? ' sp-task-done' : '') + '" data-id="' + task.id + '">' +
          '<div class="sp-task-check" onclick="SP_LOGIC.toggleTask(\'' + task.id + '\')">' +
            (isDone ? '&#10003;' : '') +
          '</div>' +
          '<div class="sp-task-body">' +
            '<div class="sp-task-title">' + task.title + '</div>' +
            (due ? '<div class="sp-task-meta">Due ' + due + ' <span class="sp-task-priority ' + pClass + '">' + (task.priority || '') + '</span></div>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // toggleTask() \u2014 marks a task done/pending in Supabase
  // ---------------------------------------------------------------------------
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
  window.SP_LOGIC = {
    init: init,
    goToSection: goToSection,
    navigate: navigate,
    toggleChip: toggleChip,
    generate: generate,
    toggleTask: toggleTask,
    loadActionTracker: loadActionTracker
  };

})();
