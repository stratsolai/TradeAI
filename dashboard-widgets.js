window.DASH_WIDGETS = (function() {

  var _supabase, _userId;

  // Zone 2 tiles per spec — BI section parked until test data populated.
  var ZONE2_TOOLS = [
    { id: 'news-digest', icon: '📰', name: 'Industry News Digest',     render: 'renderNews' },
    { id: 'social',      icon: '📱', name: 'Marketing & Social Media', render: 'renderSocial' },
    { id: 'chatbot',     icon: '💬', name: 'Website Chatbot',          render: 'renderChatbot' }
  ];

  // Operational categories used in Strategic Plan grouping.
  // Buckets by sp_section. Falls back to 'Other' if blank.
  var SP_CATEGORY_FALLBACK = 'Other';

  function fmtShort(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  // Build daily count buckets for the last `days` days. items must have a date
  // field accessible via dateKey. Returns an array of length `days` (oldest → newest).
  function dailyBuckets(items, dateKey, days) {
    var buckets = new Array(days);
    for (var i = 0; i < days; i++) buckets[i] = 0;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    items.forEach(function(it) {
      var raw = it[dateKey];
      if (!raw) return;
      var d = new Date(raw);
      d.setHours(0, 0, 0, 0);
      var diffDays = Math.floor((now - d) / 86400000);
      if (diffDays < 0 || diffDays >= days) return;
      var idx = days - 1 - diffDays;
      buckets[idx] += 1;
    });
    return buckets;
  }

  // Sum a numeric field across items.
  function sumField(items, field) {
    var s = 0;
    items.forEach(function(it) { s += Number(it[field]) || 0; });
    return s;
  }

  // Build a small inline SVG sparkline. values: array of numbers (oldest → newest).
  function sparklineSvg(values, opts) {
    opts = opts || {};
    var width = opts.width || 120;
    var height = opts.height || 32;
    var pad = 2;
    if (!values || values.length < 2) {
      return '<svg class="dash-sparkline" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true"></svg>';
    }
    var max = Math.max.apply(null, values);
    var min = Math.min.apply(null, values);
    var range = (max - min) || 1;
    var step = (width - pad * 2) / (values.length - 1);
    var pts = values.map(function(v, i) {
      var x = pad + i * step;
      var y = height - pad - ((v - min) / range) * (height - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var stroke = opts.stroke || 'var(--blue)';
    return '<svg class="dash-sparkline" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">'
      + '<polyline fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '" />'
      + '</svg>';
  }

  // Block-style SVG arrows (16x18). Fill via currentColor so .dash-trend-arrow.up
  // (green) and .dash-trend-arrow.down (red) just need to set `color`.
  function trendArrowSvg(direction) {
    var points = direction === 'up'
      ? '8,2 16,10 11,10 11,16 5,16 5,10 0,10'
      : '8,16 16,8 11,8 11,2 5,2 5,8 0,8';
    return '<svg class="dash-trend-arrow ' + direction + '" '
      + 'width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">'
      + '<polygon points="' + points + '" fill="currentColor" />'
      + '</svg>';
  }

  // Area-chart-with-arrow trend graphic. The line traces through the values,
  // the area underneath is filled with a top-heavy gradient (0.5 → 0 alpha)
  // for clear "shaded area chart" appearance, and the line terminates in a
  // visible arrow head in the trend direction.
  //   values:    7-day series (oldest → newest)
  //   direction: 'up' or 'down'
  //   good:      true → green palette, false → red palette
  //   opts:      { width, height, pad, ahSize, stroke, klass }
  var _trendGradSeq = 0;
  function areaTrendSvg(values, direction, good, opts) {
    opts = opts || {};
    var width = opts.width || 100;
    var height = opts.height || 36;
    var pad = opts.pad || 4;
    var ahSize = opts.ahSize || 7;
    var stroke = opts.stroke || 2.5;
    var klass = opts.klass || 'dash-bigtrend-graphic';

    if (!values || !values.length) values = [0, 0];
    if (values.length === 1) values = [values[0], values[0]];

    var max = Math.max.apply(null, values);
    var min = Math.min.apply(null, values);
    var range = (max - min) || 1;
    var lineEndX = width - ahSize - 4;
    var step = values.length > 1 ? (lineEndX - pad) / (values.length - 1) : 0;

    // Polyline through the data
    var pts = [];
    for (var i = 0; i < values.length; i++) {
      var x = pad + i * step;
      // Reserve a top buffer so the line doesn't bleed into the arrowhead
      var y = (height - pad - 1) - ((values[i] - min) / range) * (height - pad * 2 - 2);
      pts.push({ x: x, y: y });
    }

    // Force trend direction visually by terminating into the arrow tip
    var tipX = width - ahSize - 2;
    var tipY = direction === 'up' ? (pad + 1) : (height - pad - 1);
    pts.push({ x: tipX, y: tipY });

    var lineD = pts.map(function(p, i) {
      return (i === 0 ? 'M' : 'L') + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
    }).join(' ');

    // Area = line + down to baseline at the right + back to baseline at the left + close
    var bottom = (height - pad).toFixed(2);
    var areaD = lineD
      + ' L' + tipX.toFixed(2) + ' ' + bottom
      + ' L' + pad.toFixed(2) + ' ' + bottom
      + ' Z';

    // Arrow head — solid filled triangle pointing in trend direction
    var ahPoints;
    if (direction === 'up') {
      ahPoints = (tipX) + ',' + (tipY - 1) + ' '
               + (tipX - ahSize) + ',' + (tipY + ahSize) + ' '
               + (tipX + ahSize) + ',' + (tipY + ahSize);
    } else {
      ahPoints = (tipX) + ',' + (tipY + 1) + ' '
               + (tipX - ahSize) + ',' + (tipY - ahSize) + ' '
               + (tipX + ahSize) + ',' + (tipY - ahSize);
    }

    // Use literal hex so the linearGradient stop-color resolves cleanly in
    // all browsers — CSS custom properties don't always resolve inside
    // <stop> attributes.
    var color = good ? '#28a745' : '#dc3545';
    var gradId = 'sg' + (++_trendGradSeq);
    return '<svg class="' + klass + '" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true" preserveAspectRatio="none">'
      + '<defs><linearGradient id="' + gradId + '" x1="0" x2="0" y1="0" y2="1">'
      + '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.5" />'
      + '<stop offset="100%" stop-color="' + color + '" stop-opacity="0" />'
      + '</linearGradient></defs>'
      + '<path d="' + areaD + '" fill="url(#' + gradId + ')" stroke="none" />'
      + '<path d="' + lineD + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round" />'
      + '<polygon points="' + ahPoints + '" fill="' + color + '" />'
      + '</svg>';
  }

  // Compact area-chart-with-arrow used in the News tile header alongside the
  // 1-2 word topic. Same visual language, scaled down for the header pill.
  function headlineTrendSvg(values, direction, good) {
    return areaTrendSvg(values, direction, good, {
      width: 56, height: 22, pad: 2, ahSize: 5, stroke: 1.8,
      klass: 'dash-headline-trend'
    });
  }

  // Backwards-compatible alias — older renderers call bigTrendSvg.
  function bigTrendSvg(values, direction, good) {
    return areaTrendSvg(values, direction, good);
  }

  // Render the trend block: sparkline + block-style SVG arrow (green up / red down).
  function trendBlockHtml(values, recentSum, priorSum, label) {
    var direction = recentSum >= priorSum ? 'up' : 'down';
    var spark = sparklineSvg(values, { width: 120, height: 32 });
    return '<div class="dash-trend-block">'
      + '<div class="dash-trend-label">' + window.escHtml(label || 'Trend') + '</div>'
      + '<div class="dash-trend-row">'
      + spark
      + trendArrowSvg(direction)
      + '</div>'
      + '</div>';
  }

  // Build a centred "big trend" cell — large graphic above value/label.
  // href makes the whole cell a link.
  function bigTrendCellHtml(values, direction, good, value, label, href) {
    var open = href ? ('<a href="' + window.escHtml(href) + '" class="dash-bigtrend-cell">') : '<div class="dash-bigtrend-cell">';
    var close = href ? '</a>' : '</div>';
    return open
      + bigTrendSvg(values, direction, good)
      + '<span class="dash-bigtrend-value">' + window.escHtml(String(value)) + '</span>'
      + '<span class="dash-bigtrend-label">' + window.escHtml(label) + '</span>'
      + close;
  }

  // Graphic-only big-trend cell — used when the trend graphic alone tells
  // the story and a numeric value would be redundant (e.g. CB Conversations).
  function bigTrendGraphicOnlyCellHtml(values, direction, good, label, href) {
    var open = href ? ('<a href="' + window.escHtml(href) + '" class="dash-bigtrend-cell">') : '<div class="dash-bigtrend-cell">';
    var close = href ? '</a>' : '</div>';
    return open
      + bigTrendSvg(values, direction, good)
      + '<span class="dash-bigtrend-label">' + window.escHtml(label) + '</span>'
      + close;
  }

  function dueLabel(dueDate) {
    if (!dueDate) return { text: 'No date', urgency: 'none' };
    var due = new Date(dueDate);
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var weekEnd = new Date(now.getTime() + 7 * 86400000);
    var text = due.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    var urgency = 'none';
    if (due < now) urgency = 'overdue';
    else if (due <= weekEnd) urgency = 'due-soon';
    return { text: text, urgency: urgency };
  }

  // ── STRATEGIC PLAN distinct section ──
  async function renderStrategicSection(activeTools) {
    var mount = document.getElementById('sp-section-mount');
    if (!mount) return;

    if (activeTools.indexOf('strategic-plan') === -1) {
      mount.innerHTML = '';
      return;
    }

    var html = '<div class="profile-section-card" id="sp-section-card">';
    html += '<div class="dash-sp-header-row">';
    html += '<a href="/strategy" class="dash-sp-header-link">';
    html += '<span class="profile-section-icon">🗺️</span>';
    html += '<span class="detail-title">Strategic Plan</span>';
    html += '</a>';
    html += '<div class="dash-sp-progress-wrap" id="sp-progress-wrap"><div class="progress-bar"><div class="progress-fill" id="sp-progress-fill" style="width:0%"></div></div><span class="dash-sp-progress-text" id="sp-progress-text">0%</span></div>';
    html += '</div>';
    html += '<div class="dash-sp-categories" id="sp-categories"></div>';
    html += '</div>';
    mount.innerHTML = html;

    await populateStrategicSection();
  }

  async function populateStrategicSection() {
    var fillEl = document.getElementById('sp-progress-fill');
    var pctEl = document.getElementById('sp-progress-text');
    var listEl = document.getElementById('sp-categories');
    if (!listEl) return;

    var plans;
    try {
      plans = await _supabase.from('strategic_plans')
        .select('id').eq('user_id', _userId)
        .order('created_at', { ascending: false }).limit(1);
      if (plans.error) { console.error('[Dashboard] SP plan query error:', plans.error.message || plans.error); return; }
    } catch (e) {
      console.error('[Dashboard] SP plan error:', e.message || e);
      return;
    }

    if (!plans.data || !plans.data.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗺️</div><h3>No plan created yet</h3><p>Open Strategic Plan to set up your roadmap.</p></div>';
      return;
    }

    var planId = plans.data[0].id;
    var rows;
    try {
      var ar = await _supabase.from('action_tracker')
        .select('id, items, parent_task_id, initiative_name, sp_section')
        .eq('user_id', _userId)
        .eq('plan_id', planId);
      if (ar.error) { console.error('[Dashboard] SP action_tracker query error:', ar.error.message || ar.error); return; }
      rows = ar.data || [];
    } catch (e) {
      console.error('[Dashboard] SP action_tracker error:', e.message || e);
      return;
    }

    // Initiatives (no parent) provide initiative_name fallback for their subtasks
    var initiativeMap = {};
    rows.forEach(function(r) {
      if (!r.parent_task_id) {
        initiativeMap[r.id] = r.initiative_name || (r.items && r.items.title) || 'Untitled';
      }
    });

    // Subtasks are the actionable rows
    var tasks = rows.filter(function(r) { return r.parent_task_id; });

    // Total/done — based on subtasks only (true actionable items)
    var totalTasks = tasks.length;
    var doneTasks = tasks.filter(function(r) { return r.items && r.items.status === 'done'; }).length;
    var pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
    if (fillEl) fillEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '% (' + doneTasks + '/' + totalTasks + ')';

    if (totalTasks === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><h3>No tasks yet</h3><p>Open Strategic Plan to add initiatives and tasks.</p></div>';
      return;
    }

    // Group tasks by category (sp_section). Fallback to initiative if blank.
    var grouped = {};
    tasks.forEach(function(t) {
      var cat = t.sp_section || initiativeMap[t.parent_task_id] || SP_CATEGORY_FALLBACK;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    });

    // Sort categories alphabetically; within each, incomplete first, then by due date
    var categoryNames = Object.keys(grouped).sort();
    categoryNames.forEach(function(cat) {
      grouped[cat].sort(function(a, b) {
        var aDone = a.items && a.items.status === 'done';
        var bDone = b.items && b.items.status === 'done';
        if (aDone !== bDone) return aDone ? 1 : -1;
        var aDue = a.items && a.items.due_date ? new Date(a.items.due_date).getTime() : Infinity;
        var bDue = b.items && b.items.due_date ? new Date(b.items.due_date).getTime() : Infinity;
        return aDue - bDue;
      });
    });

    var html = '';
    categoryNames.forEach(function(cat) {
      var groupTasks = grouped[cat];
      var groupHtml = '<div class="dash-sp-category" data-category="' + window.escHtml(cat) + '">';
      groupHtml += '<div class="dash-sp-category-header">';
      groupHtml += '<span><span class="dash-sp-category-name">' + window.escHtml(cat) + '</span> <span class="text-muted">' + groupTasks.length + ' task' + (groupTasks.length === 1 ? '' : 's') + '</span></span>';
      groupHtml += '<span class="dash-sp-category-arrow">▾</span>';
      groupHtml += '</div>';
      groupHtml += '<div class="dash-sp-tasks collapsed-list">';
      groupTasks.forEach(function(t, idx) {
        var hidden = idx >= 2 ? ' hidden' : '';
        groupHtml += taskRowHtml(t, initiativeMap, hidden);
      });
      groupHtml += '</div>';
      groupHtml += '</div>';
      html += groupHtml;
    });

    listEl.innerHTML = html;
    wireSPCategoryToggles();
    wireSPTaskCheckboxes();
    wireSPTaskOpen();
  }

  function taskRowHtml(t, initiativeMap, hiddenClass) {
    var items = t.items || {};
    var done = items.status === 'done';
    var title = items.title || 'Untitled task';
    var initName = t.initiative_name || initiativeMap[t.parent_task_id] || '';
    var due = dueLabel(items.due_date);
    var badgeColour = due.urgency === 'overdue' ? 'red' : (due.urgency === 'due-soon' ? 'orange' : 'grey');

    var html = '<div class="dash-sp-task' + (done ? ' done' : '') + (hiddenClass || '') + '" data-task-id="' + window.escHtml(t.id) + '">';
    html += '<button type="button" class="dash-sp-task-check' + (done ? ' done' : '') + '" data-task-id="' + window.escHtml(t.id) + '" aria-label="Mark task ' + (done ? 'incomplete' : 'complete') + '"></button>';
    html += '<div class="dash-sp-task-body" data-task-id="' + window.escHtml(t.id) + '">';
    if (initName) html += '<div class="section-label">' + window.escHtml(initName) + '</div>';
    html += '<div class="dash-sp-task-title">' + window.escHtml(title) + '</div>';
    html += '</div>';
    html += '<span class="badge badge-' + badgeColour + '">' + window.escHtml(due.text) + '</span>';
    html += '</div>';
    return html;
  }

  function wireSPCategoryToggles() {
    document.querySelectorAll('.dash-sp-category-header').forEach(function(h) {
      h.addEventListener('click', function() {
        var cat = h.closest('.dash-sp-category');
        if (!cat) return;
        var taskList = cat.querySelector('.dash-sp-tasks');
        var isOpen = cat.classList.toggle('open');
        if (taskList) {
          if (isOpen) taskList.classList.remove('collapsed-list');
          else taskList.classList.add('collapsed-list');
        }
      });
    });
  }

  function wireSPTaskCheckboxes() {
    document.querySelectorAll('.dash-sp-task-check').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var taskId = btn.getAttribute('data-task-id');
        if (!taskId) return;
        try {
          var res = await _supabase.from('action_tracker').select('items').eq('id', taskId).single();
          if (res.error) { console.error('[Dashboard] SP task fetch error:', res.error.message || res.error); return; }
          var items = res.data && res.data.items ? res.data.items : {};
          items.status = items.status === 'done' ? 'pending' : 'done';
          var up = await _supabase.from('action_tracker').update({ items: items }).eq('id', taskId);
          if (up.error) { console.error('[Dashboard] SP task update error:', up.error.message || up.error); window.showModalError('Could not update task. Please try again.'); return; }
          await populateStrategicSection();
        } catch (err) {
          console.error('[Dashboard] SP task toggle error:', err.message || err);
          window.showModalError('Could not update task. Please try again.');
        }
      });
    });
  }

  function wireSPTaskOpen() {
    document.querySelectorAll('.dash-sp-task-body').forEach(function(body) {
      body.addEventListener('click', function() {
        var taskId = body.getAttribute('data-task-id');
        if (!taskId) { window.location.href = '/strategy'; return; }
        window.location.href = '/strategy#task-' + taskId;
      });
    });
  }

  // ── ZONE 2 tile builder ──
  // headerExtraHtml lets a tile inject extra content into the right side of
  // the header row (e.g. the News tile's dynamic headline + trend graphic).
  function tileShell(toolId, icon, name, headerHref, statusChipHtml, summaryHtml, detailHtml, headerExtraHtml) {
    var html = '<div class="tile-card" data-tool-id="' + window.escHtml(toolId) + '">';
    html += '<a href="' + window.escHtml(headerHref) + '" class="dash-tile-header">';
    html += '<span class="profile-section-icon">' + icon + '</span>';
    html += '<span class="profile-section-title" style="flex:1">' + window.escHtml(name) + '</span>';
    if (headerExtraHtml) html += headerExtraHtml;
    if (statusChipHtml) html += statusChipHtml;
    html += '</a>';
    html += '<div class="dash-tile-summary">' + summaryHtml + '</div>';
    html += '<div class="dash-tile-detail">' + detailHtml + '</div>';
    html += '<button type="button" class="dash-tile-toggle" aria-label="Expand details" title="Expand">▾</button>';
    html += '</div>';
    return html;
  }

  function rowHtml(value, label, href) {
    var open = href ? ('<a href="' + window.escHtml(href) + '" class="dash-tile-row">') : '<div class="dash-tile-row">';
    var close = href ? '</a>' : '</div>';
    return open
      + '<span class="dash-tile-row-value">' + window.escHtml(String(value)) + '</span>'
      + '<span class="dash-tile-row-label">' + window.escHtml(label) + '</span>'
      + close;
  }

  function emptyHtml(text) {
    return '<div class="list-empty">' + window.escHtml(text) + '</div>';
  }

  function tagRowHtml(tag, label, href) {
    var open = href ? ('<a href="' + window.escHtml(href) + '" class="dash-tile-row">') : '<div class="dash-tile-row">';
    var close = href ? '</a>' : '</div>';
    return open
      + '<span class="badge badge-grey">' + window.escHtml(tag) + '</span>'
      + '<span class="dash-tile-row-label">' + window.escHtml(label) + '</span>'
      + close;
  }

  // 7-day week strip used by the Social tile. Buckets `posts` (each with
  // a `scheduled_at` ISO string) into the next 7 days starting today and
  // renders a horizontal strip. Days with posts are highlighted and link
  // to the Scheduled tab filtered to that date.
  function weekStripHtml(posts) {
    var WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var buckets = [0,0,0,0,0,0,0];
    var dates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(today.getTime() + i * 86400000);
      dates.push(d);
    }
    (posts || []).forEach(function(p) {
      if (!p.scheduled_at) return;
      var d = new Date(p.scheduled_at); d.setHours(0, 0, 0, 0);
      var diffDays = Math.floor((d - today) / 86400000);
      if (diffDays >= 0 && diffDays < 7) buckets[diffDays] += 1;
    });
    var html = '<div class="dash-week-strip" aria-label="Scheduled posts this week">';
    for (var j = 0; j < 7; j++) {
      var dt = dates[j];
      var iso = dt.getFullYear() + '-'
              + String(dt.getMonth() + 1).padStart(2, '0') + '-'
              + String(dt.getDate()).padStart(2, '0');
      var count = buckets[j];
      var hasPosts = count > 0;
      var classes = 'dash-week-day';
      if (j === 0) classes += ' is-today';
      if (hasPosts) classes += ' has-posts';
      var label = WEEKDAY[dt.getDay()];
      var indicator = hasPosts
        ? '<span class="dash-week-day-count">' + count + '</span>'
        : '<span class="dash-week-day-empty-dot" aria-hidden="true"></span>';
      var href = hasPosts ? ('/social?date=' + iso + '#scheduled') : '/social#scheduled';
      html += '<a href="' + href + '" class="' + classes + '" title="' + label + ' ' + dt.getDate()
            + (hasPosts ? ' — ' + count + ' scheduled' : ' — none scheduled') + '">';
      html += '<span class="dash-week-day-name">' + label + '</span>';
      html += '<span class="dash-week-day-num">' + dt.getDate() + '</span>';
      html += indicator;
      html += '</a>';
    }
    html += '</div>';
    return html;
  }

  // Pill row with a coloured dot inside the badge. dotColour: 'red' or 'green'.
  function pillRowHtml(label, headline, href, dotColour) {
    var open = href ? ('<a href="' + window.escHtml(href) + '" class="dash-tile-row">') : '<div class="dash-tile-row">';
    var close = href ? '</a>' : '</div>';
    var dot = '<span class="dash-pill-dot ' + (dotColour || 'green') + '"></span>';
    return open
      + '<span class="badge badge-grey">' + dot + window.escHtml(label) + '</span>'
      + '<span class="dash-tile-row-label">' + window.escHtml(headline) + '</span>'
      + close;
  }

  // Decide whether a category's content reads as risk/warning (red) or
  // opportunity/positive (green). Falls back to category default when
  // no briefing text is available.
  var NEWS_CATEGORY_DEFAULT_TONE = {
    'regulatory': 'red',
    'industry-news': 'green',
    'suppliers': 'green',
    'economic': 'red',
    'technology': 'green',
    'grants-tenders': 'green'
  };
  var NEWS_RISK_RX = /(risk|warn|fail|breach|fine|penalty|increas|rise|rising|surge|delay|shortage|cost|inflation|recession|decline|drop|fall|cut|tighten|restrict|threat|concern|crisis)/i;
  var NEWS_GOOD_RX = /(opportunit|grant|tender|growth|expansion|innovat|hir|employ|boost|gain|launch|rebate|incentive|approve|partner)/i;

  function categoryTone(briefing, categoryId) {
    if (!briefing) return NEWS_CATEGORY_DEFAULT_TONE[categoryId] || 'green';
    var bullets = Array.isArray(briefing.bullets) ? briefing.bullets.join(' ') : '';
    var text = (briefing.headline || '') + ' ' + bullets;
    var risky = NEWS_RISK_RX.test(text);
    var good = NEWS_GOOD_RX.test(text);
    if (risky && !good) return 'red';
    if (good && !risky) return 'green';
    return NEWS_CATEGORY_DEFAULT_TONE[categoryId] || 'green';
  }

  // Determine arrow direction (up/down) and good/bad outcome from briefing text.
  function headlineTrend(briefing, categoryId) {
    var bullets = (briefing && Array.isArray(briefing.bullets)) ? briefing.bullets.join(' ') : '';
    var text = ((briefing && briefing.headline) || '') + ' ' + bullets;
    var upRx = /\b(rise|rising|rises|increas|surge|grow|growth|gain|jump|climb|up\b|expand|boost)/i;
    var downRx = /\b(fall|falling|falls|decreas|decline|drop|cut|ease|easing|reduce|down\b|shrink|contract)/i;
    var dirUp = upRx.test(text);
    var dirDown = downRx.test(text);
    var direction = dirDown && !dirUp ? 'down' : 'up';

    var topicBad = NEWS_RISK_RX.test(text) && !NEWS_GOOD_RX.test(text);
    if (!topicBad) {
      // category-default polarity
      topicBad = (NEWS_CATEGORY_DEFAULT_TONE[categoryId] === 'red');
    }
    // Bad topic up = bad outcome (red). Bad topic down = good (green).
    // Good topic up = good (green). Good topic down = bad (red).
    var good = topicBad ? (direction === 'down') : (direction === 'up');
    return { direction: direction, good: good };
  }

  // Pull a 1-2 word topic out of a headline so the News tile header can show
  // a tight indicator like "Inflation ↑" instead of the full sentence.
  // Strategy: prefer a known economic/regulatory keyword if the headline
  // contains one; otherwise fall back to the first 1-2 capitalised words.
  var NEWS_TOPIC_KEYWORDS = [
    ['Material Costs', /\bmaterial(s)?\b.*\bcost|cost\b.*\bmaterial/i],
    ['Material Costs', /\bsteel|timber|concrete|cement|copper|aluminium\b/i],
    ['Inflation',      /\binflation|cpi\b/i],
    ['Interest Rates', /\binterest rate|rba|cash rate\b/i],
    ['Employment',     /\bemploy|jobs|hiring|unemployment\b/i],
    ['Wages',          /\bwage|pay rise|enterprise agreement\b/i],
    ['Housing',        /\bhousing|home build|dwelling|residential\b/i],
    ['Construction',   /\bconstruction|builder|trade\b/i],
    ['Compliance',     /\bcomplian|regulation|standard|code\b/i],
    ['Safety',         /\bsafe|swms|whs\b/i],
    ['Grants',         /\bgrant|rebate|incentive\b/i],
    ['Tenders',        /\btender|procurement|rfx\b/i],
    ['Supply Chain',   /\bsupply|shortage|delay|logistic\b/i],
    ['Energy',         /\benergy|electricity|gas|fuel|petrol\b/i],
    ['Technology',     /\btechnology|software|ai\b/i]
  ];

  function extractTopic(headline) {
    if (!headline) return '';
    for (var i = 0; i < NEWS_TOPIC_KEYWORDS.length; i++) {
      if (NEWS_TOPIC_KEYWORDS[i][1].test(headline)) return NEWS_TOPIC_KEYWORDS[i][0];
    }
    // Fallback: first 1-2 leading words of the headline (cap length 18 chars)
    var clean = String(headline).replace(/[^A-Za-z0-9 \-&]/g, '').trim();
    var words = clean.split(/\s+/).slice(0, 2).join(' ');
    if (words.length > 18) words = words.substring(0, 18);
    return words || 'News';
  }

  // ── Industry News Digest tile ──
  // Header row carries a dynamic 1-2 word topic and a small trend graphic
  // (e.g. "Inflation ↑" with a red area chart) on the right of the heading.
  // Collapsed body: 3-stat trio + top 2 category pills.
  // Expanded: remaining category pills.
  async function renderNews() {
    var ND_CATEGORIES = [
      { id: 'regulatory',     label: 'Rules' },
      { id: 'industry-news',  label: 'News' },
      { id: 'suppliers',      label: 'Supply' },
      { id: 'economic',       label: 'Markets' },
      { id: 'technology',     label: 'Tech' },
      { id: 'grants-tenders', label: 'Tenders' }
    ];

    var lastRefreshed = '', briefings = [], tenderCount = 0;
    var briefingByCat = {};
    var newsItems = [];

    try {
      var briefRes = await _supabase.from('news_digest_briefings')
        .select('id, category, headline, bullets')
        .eq('user_id', _userId);
      if (briefRes.error) console.error('[Dashboard] News briefings error:', briefRes.error.message || briefRes.error);
      briefings = briefRes.data || [];
      briefings.forEach(function(b) { if (b.category) briefingByCat[b.category] = b; });

      var tendRes = await _supabase.from('news_digest_tenders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', _userId);
      if (tendRes.error) console.error('[Dashboard] News tenders error:', tendRes.error.message || tendRes.error);
      tenderCount = tendRes.count || 0;

      var setRes = await _supabase.from('news_digest_settings')
        .select('summary_generated_at')
        .eq('user_id', _userId).maybeSingle();
      if (setRes.error) console.error('[Dashboard] News settings error:', setRes.error.message || setRes.error);
      if (setRes.data && setRes.data.summary_generated_at) {
        lastRefreshed = fmtShort(setRes.data.summary_generated_at);
      }

      // 7-day volume — items in content_library tagged news-digest, by created_at.
      var weekAgo = new Date(Date.now() - 7 * 86400000);
      var clRes = await _supabase.from('content_library')
        .select('id, created_at')
        .eq('user_id', _userId)
        .contains('tool_tags', ['news-digest'])
        .gte('created_at', weekAgo.toISOString());
      if (clRes.error) console.error('[Dashboard] News volume error:', clRes.error.message || clRes.error);
      newsItems = clRes.data || [];
    } catch (e) {
      console.error('[Dashboard] News render error:', e.message || e);
    }

    var withHeadlines = ND_CATEGORIES
      .map(function(cat) {
        var b = briefingByCat[cat.id];
        if (!b || !b.headline) return null;
        var count = Array.isArray(b.bullets) ? b.bullets.length : 0;
        return { cat: cat, briefing: b, count: count };
      })
      .filter(function(x) { return !!x; });

    withHeadlines.sort(function(a, b) { return b.count - a.count; });
    var briefingCount = withHeadlines.length;

    // Daily news volume drives the small header trend graphic (line shape) —
    // direction & colour come from headlineTrend(top briefing).
    var dailyVolume = dailyBuckets(newsItems, 'created_at', 7);
    var top = withHeadlines[0];
    var headerExtraHtml = '';
    if (top) {
      var trend = headlineTrend(top.briefing, top.cat.id);
      var topicText = extractTopic(top.briefing.headline);
      var trendSvg = headlineTrendSvg(dailyVolume, trend.direction, trend.good);
      headerExtraHtml = '<span class="dash-header-trend" title="' + window.escHtml(top.briefing.headline) + '">'
        + '<span class="dash-header-trend-text">' + window.escHtml(topicText) + '</span>'
        + trendSvg
        + '</span>';
    }

    // Click actions: Last Refreshed + Categories Updated → /news, Tenders → grants-tenders tab
    var summary = '';
    summary += '<div class="dash-stat-trio">';
    summary += '<a href="/news" class="dash-stat-trio-cell" style="text-decoration:none;color:inherit"><span class="dash-stat-trio-label">Last Refreshed</span><span class="dash-stat-trio-value">' + window.escHtml(lastRefreshed || '—') + '</span></a>';
    summary += '<a href="/news" class="dash-stat-trio-cell" style="text-decoration:none;color:inherit"><span class="dash-stat-trio-label">Categories Updated</span><span class="dash-stat-trio-value">' + briefingCount + '</span></a>';
    summary += '<a href="/news#grants-tenders" class="dash-stat-trio-cell" style="text-decoration:none;color:inherit"><span class="dash-stat-trio-label">Open Tenders</span><span class="dash-stat-trio-value">' + tenderCount + '</span></a>';
    summary += '</div>';

    var topTwo = withHeadlines.slice(0, 2);
    if (topTwo.length) {
      summary += '<div class="dash-tile-divider"></div>';
      topTwo.forEach(function(x) {
        var dot = categoryTone(x.briefing, x.cat.id);
        summary += pillRowHtml(x.cat.label, x.briefing.headline, '/news#' + x.cat.id, dot);
      });
    }

    // Expanded: remaining category headlines
    var detail = '';
    var rest = withHeadlines.slice(2);
    if (rest.length) {
      rest.forEach(function(x) {
        var dot2 = categoryTone(x.briefing, x.cat.id);
        detail += pillRowHtml(x.cat.label, x.briefing.headline, '/news#' + x.cat.id, dot2);
      });
    } else if (withHeadlines.length === 0) {
      detail = emptyHtml('No headlines yet — check back after the next digest run.');
    } else {
      detail = emptyHtml('No additional categories to show.');
    }

    return tileShell('news-digest', '📰', 'Industry News Digest', '/news', '', summary, detail, headerExtraHtml);
  }

  // ── Marketing & Social Media tile ──
  // Collapsed: 7-day reach sparkline + trend arrow vs prior 7 days, plus
  // Reach / Engagement / Engagement Rate stats.
  // Expanded: scheduled posts, recent post performance, drafts to review,
  // platforms connected.
  async function renderSocial() {
    var draftCount = 0, scheduled = [], scheduledNext7 = [];
    var weekPosts = [], priorPosts = [];
    var fbConnected = false, igConnected = false;

    try {
      var draftRes = await _supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', _userId).eq('status', 'draft');
      if (draftRes.error) console.error('[Dashboard] Social drafts error:', draftRes.error.message || draftRes.error);
      draftCount = draftRes.count || 0;

      var weekAgo = new Date(Date.now() - 7 * 86400000);
      var twoWeeksAgo = new Date(Date.now() - 14 * 86400000);

      var weekRes = await _supabase.from('social_posts')
        .select('id, caption, reach, engagement, clicks, published_at, campaign_id')
        .eq('user_id', _userId).eq('status', 'published')
        .gte('published_at', weekAgo.toISOString())
        .order('published_at', { ascending: false });
      if (weekRes.error) console.error('[Dashboard] Social week error:', weekRes.error.message || weekRes.error);
      weekPosts = weekRes.data || [];

      var priorRes = await _supabase.from('social_posts')
        .select('reach, published_at')
        .eq('user_id', _userId).eq('status', 'published')
        .gte('published_at', twoWeeksAgo.toISOString())
        .lt('published_at', weekAgo.toISOString());
      if (priorRes.error) console.error('[Dashboard] Social prior error:', priorRes.error.message || priorRes.error);
      priorPosts = priorRes.data || [];

      var schedRes = await _supabase.from('social_posts')
        .select('id, caption, scheduled_at')
        .eq('user_id', _userId).eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true }).limit(3);
      if (schedRes.error) console.error('[Dashboard] Social scheduled error:', schedRes.error.message || schedRes.error);
      scheduled = schedRes.data || [];

      // All scheduled posts in the next 7 days — drives the week-strip
      var weekStartIso = (function() {
        var d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
      })();
      var weekEndIso = (function() {
        var d = new Date(); d.setHours(0, 0, 0, 0);
        d.setTime(d.getTime() + 7 * 86400000);
        return d.toISOString();
      })();
      var sched7 = await _supabase.from('social_posts')
        .select('id, scheduled_at')
        .eq('user_id', _userId).eq('status', 'scheduled')
        .gte('scheduled_at', weekStartIso)
        .lt('scheduled_at', weekEndIso);
      if (sched7.error) console.error('[Dashboard] Social week-strip error:', sched7.error.message || sched7.error);
      scheduledNext7 = sched7.data || [];

      var setRes = await _supabase.from('social_settings')
        .select('meta_connected, instagram_account_id')
        .eq('user_id', _userId).maybeSingle();
      if (setRes.error) console.error('[Dashboard] Social settings error:', setRes.error.message || setRes.error);
      if (setRes.data) {
        fbConnected = !!setRes.data.meta_connected;
        igConnected = !!setRes.data.instagram_account_id;
      }
    } catch (e) {
      console.error('[Dashboard] Social render error:', e.message || e);
    }

    var connectedCount = (fbConnected ? 1 : 0) + (igConnected ? 1 : 0);

    // Build trend (daily reach + engagement last 7 days)
    var dailyReach = [0,0,0,0,0,0,0];
    var dailyEngagement = [0,0,0,0,0,0,0];
    var dailyRate = [0,0,0,0,0,0,0];
    (function() {
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      weekPosts.forEach(function(p) {
        if (!p.published_at) return;
        var d = new Date(p.published_at);
        d.setHours(0, 0, 0, 0);
        var diffDays = Math.floor((now - d) / 86400000);
        if (diffDays < 0 || diffDays >= 7) return;
        var idx = 6 - diffDays;
        dailyReach[idx] += Number(p.reach) || 0;
        dailyEngagement[idx] += Number(p.engagement) || 0;
      });
      for (var i = 0; i < 7; i++) {
        dailyRate[i] = dailyReach[i] > 0 ? (dailyEngagement[i] / dailyReach[i]) * 100 : 0;
      }
    })();

    var weekReach = sumField(weekPosts, 'reach');
    var weekEngagement = sumField(weekPosts, 'engagement');
    var priorReach = sumField(priorPosts, 'reach');
    var priorEngagement = sumField(priorPosts, 'engagement');
    var engagementRate = weekReach > 0 ? Math.round((weekEngagement / weekReach) * 100) : 0;
    var priorEngagementRate = priorReach > 0 ? (priorEngagement / priorReach) * 100 : 0;

    // For social: up = good, down = bad (more reach/engagement is better)
    var reachDir = weekReach >= priorReach ? 'up' : 'down';
    var reachGood = reachDir === 'up';
    var engRateDir = engagementRate >= priorEngagementRate ? 'up' : 'down';
    var engRateGood = engRateDir === 'up';

    // Collapsed view: Reach (with trend), Engagement (value only), Engagement
    // Rate (with trend). Drafts and Platforms intentionally excluded — they
    // surface in the expanded Workspace section below.
    var summary = '';
    summary += '<div class="dash-bigtrend-wrap">';
    summary += bigTrendCellHtml(dailyReach, reachDir, reachGood, weekReach, 'Reach', '/social?range=7d');
    summary += '<div class="dash-bigtrend-cell">'
      + '<span class="dash-bigtrend-value-only">' + window.escHtml(String(weekEngagement)) + '</span>'
      + '<span class="dash-bigtrend-label">Engagement</span>'
      + '</div>';
    summary += bigTrendCellHtml(dailyRate, engRateDir, engRateGood, engagementRate + '%', 'Engagement Rate', '/social?range=7d');
    summary += '</div>';

    // 7-day week strip showing scheduled posts. Each day in the next 7 days
    // is a cell — empty cells are subtle; days with posts are highlighted
    // and link to the Scheduled tab pre-filtered to that date.
    summary += weekStripHtml(scheduledNext7);

    // Expanded: campaign activity + scheduled + drafts/platforms
    var detail = '';
    detail += '<div class="section-label" style="margin:6px 0 4px">Upcoming Scheduled</div>';
    if (scheduled.length) {
      scheduled.forEach(function(s) {
        var caption = (s.caption || '').slice(0, 60);
        detail += tagRowHtml(fmtShort(s.scheduled_at), caption, '/social?id=' + s.id);
      });
    } else {
      detail += emptyHtml('Nothing scheduled.');
    }

    detail += '<div class="section-label" style="margin:10px 0 4px">Recent Post Performance</div>';
    if (weekPosts.length) {
      weekPosts.slice(0, 3).forEach(function(p) {
        var stats = (p.reach || 0) + ' Reach · ' + (p.engagement || 0) + ' Engaged · ' + (p.clicks || 0) + ' Clicks';
        var dateLabel = fmtShort(p.published_at) || 'Post';
        detail += tagRowHtml(dateLabel, stats, '/social?id=' + p.id);
      });
    } else {
      detail += emptyHtml('No published posts in the last 7 days.');
    }

    detail += '<div class="section-label" style="margin:10px 0 4px">Workspace</div>';
    detail += rowHtml(draftCount, 'Draft' + (draftCount === 1 ? '' : 's') + ' to Review', '/social#drafts');
    detail += rowHtml(connectedCount, 'Platform' + (connectedCount === 1 ? '' : 's') + ' Connected', '/social-settings.html');

    return tileShell('social', '📱', 'Marketing & Social Media', '/social', '', summary, detail);
  }

  // ── Website Chatbot tile ──
  // Collapsed: 7-day conversation count sparkline + trend arrow vs prior 7 days,
  // Booking Requests (leads + appointments), Unanswered Questions.
  // Expanded: this-week breakdown plus performance metrics.
  async function renderChatbot() {
    var weekRows = [], priorRows = [];

    try {
      var weekAgo = new Date(Date.now() - 7 * 86400000);
      var twoWeeksAgo = new Date(Date.now() - 14 * 86400000);

      var weekRes = await _supabase.from('chatbot_conversations')
        .select('id, is_lead, appointment_requested, unanswered_questions, created_at')
        .eq('user_id', _userId)
        .gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: false });
      if (weekRes.error) console.error('[Dashboard] Chatbot week error:', weekRes.error.message || weekRes.error);
      weekRows = weekRes.data || [];

      var priorRes = await _supabase.from('chatbot_conversations')
        .select('id, created_at')
        .eq('user_id', _userId)
        .gte('created_at', twoWeeksAgo.toISOString())
        .lt('created_at', weekAgo.toISOString());
      if (priorRes.error) console.error('[Dashboard] Chatbot prior error:', priorRes.error.message || priorRes.error);
      priorRows = priorRes.data || [];
    } catch (e) {
      console.error('[Dashboard] Chatbot render error:', e.message || e);
    }

    // Today snapshot
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var todayRows = weekRows.filter(function(r) { return new Date(r.created_at) >= todayStart; });
    var todayLeads = todayRows.filter(function(r) { return r.is_lead; }).length;
    var todayAppointments = todayRows.filter(function(r) { return r.appointment_requested; }).length;
    var todayBookingRequests = todayLeads + todayAppointments;
    var todayUnanswered = 0;
    todayRows.forEach(function(r) {
      if (Array.isArray(r.unanswered_questions)) todayUnanswered += r.unanswered_questions.length;
    });

    // Pending unanswered = questions logged in the last 7 days that have NOT
    // been resolved (i.e. not yet added to the knowledge base). The
    // chatbot-logic _markResolved flow stores resolved=true on each item.
    var isPending = function(q) {
      if (q && typeof q === 'object') return q.resolved !== true;
      return true; // legacy string entries are always pending
    };
    var pendingUnanswered = 0;
    var dailyPending = [0,0,0,0,0,0,0];
    var nowMid = new Date(); nowMid.setHours(0, 0, 0, 0);
    weekRows.forEach(function(r) {
      if (!Array.isArray(r.unanswered_questions)) return;
      var pendingInConv = r.unanswered_questions.filter(isPending).length;
      pendingUnanswered += pendingInConv;
      if (!pendingInConv) return;
      var d = new Date(r.created_at); d.setHours(0, 0, 0, 0);
      var diffDays = Math.floor((nowMid - d) / 86400000);
      if (diffDays < 0 || diffDays >= 7) return;
      dailyPending[6 - diffDays] += pendingInConv;
    });
    var priorPendingUnanswered = 0;
    priorRows.forEach(function(r) {
      if (!Array.isArray(r.unanswered_questions)) return;
      priorPendingUnanswered += r.unanswered_questions.filter(isPending).length;
    });

    // Daily conversation counts → Conversations trend
    var dailyConvs = dailyBuckets(weekRows, 'created_at', 7);
    var weekTotal = weekRows.length;
    var priorTotal = priorRows.length;

    // Trend directions / colour outcomes.
    // Conversations: up = good, down = bad.
    var convDir = weekTotal >= priorTotal ? 'up' : 'down';
    var convGood = convDir === 'up';
    // Pending unanswered: up = bad (red), down = good (green).
    var unansDir = pendingUnanswered >= priorPendingUnanswered ? 'up' : 'down';
    var unansGood = unansDir === 'down';

    // 7-day totals used by the expanded performance metrics (kept for
    // Lead Conversion Rate / Answered Rate calculations).
    var weekLeads = weekRows.filter(function(r) { return r.is_lead; }).length;
    var leadRate = weekTotal > 0 ? Math.round((weekLeads / weekTotal) * 100) : 0;
    var answeredCount = weekRows.filter(function(r) {
      return !Array.isArray(r.unanswered_questions) || r.unanswered_questions.length === 0;
    }).length;
    var answeredRate = weekTotal > 0 ? Math.round((answeredCount / weekTotal) * 100) : 0;

    var statusChipHtml = '<span class="badge badge-green">Online</span>';

    // Collapsed: Conversations (graphic only — no number), Booking Requests
    // (today's count), Unanswered (pending, with reversed-colour trend).
    var summary = '';
    summary += '<div class="dash-bigtrend-wrap">';
    summary += bigTrendGraphicOnlyCellHtml(dailyConvs, convDir, convGood, 'Conversations', '/chatbot#conversations');
    summary += '<a href="/chatbot#leads" class="dash-bigtrend-cell" style="text-decoration:none">'
      + '<span class="dash-bigtrend-value-only">' + window.escHtml(String(todayBookingRequests)) + '</span>'
      + '<span class="dash-bigtrend-label">Booking Requests Today</span>'
      + '</a>';
    summary += bigTrendCellHtml(dailyPending, unansDir, unansGood, pendingUnanswered, 'Unanswered', '/chatbot#unanswered');
    summary += '</div>';

    var detail = '';
    detail += '<div class="section-label" style="margin:6px 0 4px">Today</div>';
    detail += rowHtml(todayRows.length, 'Conversation' + (todayRows.length === 1 ? '' : 's') + ' Today', '/chatbot#conversations');
    detail += rowHtml(todayLeads, 'Lead' + (todayLeads === 1 ? '' : 's') + ' Captured Today', '/chatbot#leads');
    detail += rowHtml(todayUnanswered, 'Unanswered Question' + (todayUnanswered === 1 ? '' : 's') + ' Today', '/chatbot#unanswered');

    // 7-Day Performance — keep only the rate metrics (counts already shown
    // in the Today section / collapsed view).
    detail += '<div class="section-label" style="margin:10px 0 4px">7-Day Performance</div>';
    detail += rowHtml(leadRate + '%', 'Lead Conversion Rate', '/chatbot#leads');
    detail += rowHtml(answeredRate + '%', 'Answered Rate', '/chatbot#unanswered');

    return tileShell('chatbot', '💬', 'Website Chatbot', '/chatbot', statusChipHtml, summary, detail);
  }

  // Tile expand/collapse is handled by document-level delegation in dashboard-data.js
  // (wireTileToggles), so no per-render wiring is needed here.

  // ── RENDER ALL ──
  async function renderAll(supabase, userId, activeTools) {
    _supabase = supabase;
    _userId = userId;

    await renderStrategicSection(activeTools);

    var container = document.getElementById('zone-2');
    if (!container) return;

    var renders = {
      renderNews: renderNews,
      renderSocial: renderSocial,
      renderChatbot: renderChatbot
    };

    var activeTiles = ZONE2_TOOLS.filter(function(t) { return activeTools.indexOf(t.id) !== -1; });

    if (activeTiles.length === 0) {
      container.innerHTML = '<div class="empty-state">'
        + '<div class="empty-state-icon">📊</div>'
        + '<h3>No active tools yet</h3>'
        + '<p>Activate tools below to see your overview here.</p>'
        + '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < activeTiles.length; i++) {
      var renderFn = renders[activeTiles[i].render];
      if (renderFn) html += await renderFn();
    }

    container.innerHTML = html;
  }

  return { renderAll: renderAll };

})();
