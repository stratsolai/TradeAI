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

  // Render the trend block: sparkline + arrow indicator (green ↑ / red ↓).
  function trendBlockHtml(values, recentSum, priorSum, label) {
    var direction = recentSum >= priorSum ? 'up' : 'down';
    var arrow = direction === 'up' ? '↑' : '↓';
    var arrowClass = 'dash-trend-arrow ' + direction;
    var spark = sparklineSvg(values, { width: 120, height: 32 });
    return '<div class="dash-trend-block">'
      + '<div class="dash-trend-label">' + window.escHtml(label || 'Trend') + '</div>'
      + '<div class="dash-trend-row">'
      + spark
      + '<span class="' + arrowClass + '">' + arrow + '</span>'
      + '</div>'
      + '</div>';
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
  function tileShell(toolId, icon, name, headerHref, statusChipHtml, summaryHtml, detailHtml) {
    var html = '<div class="tile-card" data-tool-id="' + window.escHtml(toolId) + '">';
    html += '<a href="' + window.escHtml(headerHref) + '" class="dash-tile-header">';
    html += '<span class="profile-section-icon">' + icon + '</span>';
    html += '<span class="profile-section-title" style="flex:1">' + window.escHtml(name) + '</span>';
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

  // ── Industry News Digest tile ──
  // Collapsed: 3-stat trio (Last Refreshed | Categories Updated | Open Tenders)
  // followed by the top 2 category briefings ranked by bullet count.
  // Expanded: remaining category briefings.
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

    // Collapsed: 3-stat trio + top 2 category headlines
    var summary = '';
    summary += '<div class="dash-stat-trio">';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Last Refreshed</span><span class="dash-stat-trio-value">' + window.escHtml(lastRefreshed || '—') + '</span></div>';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Categories Updated</span><span class="dash-stat-trio-value">' + briefingCount + '</span></div>';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Open Tenders</span><span class="dash-stat-trio-value">' + tenderCount + '</span></div>';
    summary += '</div>';

    var topTwo = withHeadlines.slice(0, 2);
    if (topTwo.length) {
      summary += '<div class="dash-tile-divider"></div>';
      topTwo.forEach(function(x) {
        summary += tagRowHtml(x.cat.label, x.briefing.headline, '/news#' + x.cat.id);
      });
    }

    // Expanded: remaining category headlines
    var detail = '';
    var rest = withHeadlines.slice(2);
    if (rest.length) {
      rest.forEach(function(x) {
        detail += tagRowHtml(x.cat.label, x.briefing.headline, '/news#' + x.cat.id);
      });
    } else if (withHeadlines.length === 0) {
      detail = emptyHtml('No headlines yet — check back after the next digest run.');
    } else {
      detail = emptyHtml('No additional categories to show.');
    }

    return tileShell('news-digest', '📰', 'Industry News Digest', '/news', '', summary, detail);
  }

  // ── Marketing & Social Media tile ──
  // Collapsed: 7-day reach sparkline + trend arrow vs prior 7 days, plus
  // Reach / Engagement / Engagement Rate stats.
  // Expanded: scheduled posts, recent post performance, drafts to review,
  // platforms connected.
  async function renderSocial() {
    var draftCount = 0, scheduled = [], campaignActivity = [];
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

    // Build trend (sparkline of daily reach last 7 days)
    var dailyReach = (function() {
      var buckets = [0,0,0,0,0,0,0];
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      weekPosts.forEach(function(p) {
        if (!p.published_at) return;
        var d = new Date(p.published_at);
        d.setHours(0, 0, 0, 0);
        var diffDays = Math.floor((now - d) / 86400000);
        if (diffDays < 0 || diffDays >= 7) return;
        buckets[6 - diffDays] += Number(p.reach) || 0;
      });
      return buckets;
    })();

    var weekReach = sumField(weekPosts, 'reach');
    var weekEngagement = sumField(weekPosts, 'engagement');
    var priorReach = sumField(priorPosts, 'reach');
    var engagementRate = weekReach > 0 ? Math.round((weekEngagement / weekReach) * 100) : 0;

    // Collapsed: trend block + 3 perf metrics
    var summary = '';
    summary += trendBlockHtml(dailyReach, weekReach, priorReach, '7-Day Reach Trend');
    summary += '<div class="dash-stat-trio">';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Reach</span><span class="dash-stat-trio-value">' + weekReach + '</span></div>';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Engagement</span><span class="dash-stat-trio-value">' + weekEngagement + '</span></div>';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Engagement Rate</span><span class="dash-stat-trio-value">' + engagementRate + '%</span></div>';
    summary += '</div>';

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

    // Collapsed metrics
    var weekLeads = weekRows.filter(function(r) { return r.is_lead; }).length;
    var weekAppointments = weekRows.filter(function(r) { return r.appointment_requested; }).length;
    var weekUnanswered = 0;
    weekRows.forEach(function(r) {
      if (Array.isArray(r.unanswered_questions)) weekUnanswered += r.unanswered_questions.length;
    });
    var bookingRequests = weekLeads + weekAppointments;

    // Trend (daily conversation count last 7 days vs prior 7)
    var dailyConvs = dailyBuckets(weekRows, 'created_at', 7);
    var weekTotal = weekRows.length;
    var priorTotal = priorRows.length;

    var statusChipHtml = '<span class="badge badge-green">Online</span>';

    var summary = '';
    summary += trendBlockHtml(dailyConvs, weekTotal, priorTotal, '7-Day Conversation Trend');
    summary += '<div class="dash-stat-trio">';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Conversations</span><span class="dash-stat-trio-value">' + weekTotal + '</span></div>';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Booking Requests</span><span class="dash-stat-trio-value">' + bookingRequests + '</span></div>';
    summary += '<div class="dash-stat-trio-cell"><span class="dash-stat-trio-label">Unanswered</span><span class="dash-stat-trio-value">' + weekUnanswered + '</span></div>';
    summary += '</div>';

    // Today breakdown
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayRows = weekRows.filter(function(r) { return new Date(r.created_at) >= today; });
    var todayLeads = todayRows.filter(function(r) { return r.is_lead; }).length;
    var todayUnanswered = 0;
    todayRows.forEach(function(r) {
      if (Array.isArray(r.unanswered_questions)) todayUnanswered += r.unanswered_questions.length;
    });

    // Performance metrics — share of conversations that converted to a lead or
    // appointment, plus answered share. (Resolution metrics not stored in schema.)
    var leadRate = weekTotal > 0 ? Math.round((weekLeads / weekTotal) * 100) : 0;
    var answeredCount = weekRows.filter(function(r) {
      return !Array.isArray(r.unanswered_questions) || r.unanswered_questions.length === 0;
    }).length;
    var answeredRate = weekTotal > 0 ? Math.round((answeredCount / weekTotal) * 100) : 0;

    var detail = '';
    detail += '<div class="section-label" style="margin:6px 0 4px">Today</div>';
    detail += rowHtml(todayRows.length, 'Conversation' + (todayRows.length === 1 ? '' : 's') + ' Today', '/chatbot#conversations');
    detail += rowHtml(todayLeads, 'Lead' + (todayLeads === 1 ? '' : 's') + ' Captured Today', '/chatbot#leads');
    detail += rowHtml(todayUnanswered, 'Unanswered Question' + (todayUnanswered === 1 ? '' : 's') + ' Today', '/chatbot#unanswered');

    detail += '<div class="section-label" style="margin:10px 0 4px">7-Day Performance</div>';
    detail += rowHtml(weekAppointments, 'Appointment' + (weekAppointments === 1 ? '' : 's') + ' Requested', '/chatbot#conversations');
    detail += rowHtml(leadRate + '%', 'Lead Conversion Rate', null);
    detail += rowHtml(answeredRate + '%', 'Answered Rate', null);

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
