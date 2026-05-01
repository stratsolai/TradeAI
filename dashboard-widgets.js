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
  // Sources: news_digest_briefings (one per category), news_digest_tenders (separate table),
  // news_digest_settings.summary_generated_at for the last refresh timestamp.
  // Categories match news-digest-logic.js CATEGORIES + grants-tenders.
  async function renderNews() {
    var ND_CATEGORIES = [
      { id: 'regulatory',     label: 'Rules' },
      { id: 'industry-news',  label: 'News' },
      { id: 'suppliers',      label: 'Supply' },
      { id: 'economic',       label: 'Markets' },
      { id: 'technology',     label: 'Tech' }
    ];

    var lastRefreshed = '', briefings = [], tenderCount = 0;
    var briefingByCat = {};

    try {
      var briefRes = await _supabase.from('news_digest_briefings')
        .select('id, category, headline')
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

    var briefingCount = briefings.filter(function(b) { return !!b.headline; }).length;

    var summary = '';
    summary += rowHtml(lastRefreshed || '—', 'last refreshed', '/news');
    summary += rowHtml(briefingCount, 'categor' + (briefingCount === 1 ? 'y' : 'ies') + ' updated', '/news');
    summary += rowHtml(tenderCount, 'open tender' + (tenderCount === 1 ? '' : 's'), '/news#grants-tenders');

    var detail = '';
    var anyHeadlines = false;
    ND_CATEGORIES.forEach(function(cat) {
      var b = briefingByCat[cat.id];
      if (!b || !b.headline) return;
      anyHeadlines = true;
      detail += tagRowHtml(cat.label, b.headline, '/news#' + cat.id);
    });
    var gt = briefingByCat['grants-tenders'];
    if (gt && gt.headline) {
      anyHeadlines = true;
      detail += '<a href="/news#grants-tenders" class="dash-tile-row">';
      detail += '<span class="badge badge-grey">Tenders</span>';
      detail += '<span class="dash-tile-row-label">' + window.escHtml(gt.headline) + '</span>';
      detail += '</a>';
    }
    if (!anyHeadlines) {
      detail = emptyHtml('No headlines yet — check back after the next digest run.');
    }

    return tileShell('news-digest', '📰', 'Industry News Digest', '/news', '', summary, detail);
  }

  // ── Marketing & Social Media tile ──
  // social_posts statuses (per panel-data-social.js): draft, in_progress, scheduled, published.
  // Metrics columns (per social-metrics-refresh.js): reach, engagement, clicks. No likes/comments/platform columns.
  // Connections live on social_settings as flags (meta_connected, instagram_account_id).
  async function renderSocial() {
    var draftCount = 0, publishedCount = 0, scheduled = [], recent = [];
    var fbConnected = false, igConnected = false;

    try {
      var draftRes = await _supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', _userId).eq('status', 'draft');
      if (draftRes.error) console.error('[Dashboard] Social drafts error:', draftRes.error.message || draftRes.error);
      draftCount = draftRes.count || 0;

      var monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      var pubRes = await _supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', _userId).eq('status', 'published')
        .gte('published_at', monthStart.toISOString());
      if (pubRes.error) console.error('[Dashboard] Social published error:', pubRes.error.message || pubRes.error);
      publishedCount = pubRes.count || 0;

      var schedRes = await _supabase.from('social_posts')
        .select('id, caption, scheduled_at, connections')
        .eq('user_id', _userId).eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true }).limit(3);
      if (schedRes.error) console.error('[Dashboard] Social scheduled error:', schedRes.error.message || schedRes.error);
      scheduled = schedRes.data || [];

      var recRes = await _supabase.from('social_posts')
        .select('id, caption, reach, engagement, clicks, published_at, metadata')
        .eq('user_id', _userId).eq('status', 'published')
        .order('published_at', { ascending: false }).limit(3);
      if (recRes.error) console.error('[Dashboard] Social recent error:', recRes.error.message || recRes.error);
      recent = recRes.data || [];

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

    var summary = '';
    summary += rowHtml(draftCount, 'draft' + (draftCount === 1 ? '' : 's') + ' to review', '/social#drafts');
    summary += rowHtml(publishedCount, 'published this month', '/social#published');
    summary += rowHtml(connectedCount, 'platform' + (connectedCount === 1 ? '' : 's') + ' connected', '/social-settings.html');

    var detail = '';
    detail += '<div class="section-label" style="margin:8px 0 4px">Upcoming scheduled</div>';
    if (scheduled.length) {
      scheduled.forEach(function(s) {
        var caption = (s.caption || '').slice(0, 60);
        detail += tagRowHtml(fmtShort(s.scheduled_at), caption, '/social?id=' + s.id);
      });
    } else {
      detail += emptyHtml('Nothing scheduled.');
    }
    detail += '<div class="section-label" style="margin:12px 0 4px">Recent post performance</div>';
    if (recent.length) {
      recent.forEach(function(p) {
        var stats = (p.reach || 0) + ' reach · ' + (p.engagement || 0) + ' engaged · ' + (p.clicks || 0) + ' clicks';
        var dateLabel = fmtShort(p.published_at) || 'Post';
        detail += tagRowHtml(dateLabel, stats, '/social?id=' + p.id);
      });
    } else {
      detail += emptyHtml('No published posts yet.');
    }

    return tileShell('social', '📱', 'Marketing & Social Media', '/social', '', summary, detail);
  }

  // ── Website Chatbot tile ──
  // Single table chatbot_conversations with columns:
  // is_lead, appointment_requested, unanswered_questions (array), created_at, started_at.
  // Unanswered questions are array entries, not a separate table.
  async function renderChatbot() {
    var conversationsToday = 0, leadsCount = 0, unansweredCount = 0;
    var weekConversations = 0, weekLeads = 0, weekAppointments = 0, weekUnanswered = 0;

    try {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var weekAgo = new Date(Date.now() - 7 * 86400000);

      var convRes = await _supabase.from('chatbot_conversations')
        .select('id, is_lead, appointment_requested, unanswered_questions, created_at')
        .eq('user_id', _userId)
        .gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: false });
      if (convRes.error) console.error('[Dashboard] Chatbot convo error:', convRes.error.message || convRes.error);
      var rows = convRes.data || [];
      weekConversations = rows.length;

      rows.forEach(function(r) {
        if (new Date(r.created_at) >= today) {
          conversationsToday++;
          if (r.is_lead) leadsCount++;
          if (Array.isArray(r.unanswered_questions)) unansweredCount += r.unanswered_questions.length;
        }
        if (r.is_lead) weekLeads++;
        if (r.appointment_requested) weekAppointments++;
        if (Array.isArray(r.unanswered_questions)) weekUnanswered += r.unanswered_questions.length;
      });
    } catch (e) {
      console.error('[Dashboard] Chatbot render error:', e.message || e);
    }

    var statusChipHtml = '<span class="badge badge-green">Online</span>';

    var summary = '';
    summary += rowHtml(conversationsToday, 'conversation' + (conversationsToday === 1 ? '' : 's') + ' today', '/chatbot#conversations');
    summary += rowHtml(leadsCount, 'lead' + (leadsCount === 1 ? '' : 's') + ' captured today', '/chatbot#leads');
    summary += rowHtml(unansweredCount, 'unanswered question' + (unansweredCount === 1 ? '' : 's') + ' today', '/chatbot#unanswered');

    var detail = '';
    detail += rowHtml(weekConversations, 'conversations this week', '/chatbot#conversations');
    detail += rowHtml(weekLeads, 'lead' + (weekLeads === 1 ? '' : 's') + ' this week', '/chatbot#leads');
    detail += rowHtml(weekAppointments, 'appointment' + (weekAppointments === 1 ? '' : 's') + ' requested', '/chatbot#conversations');
    detail += rowHtml(weekUnanswered, 'unanswered this week', '/chatbot#unanswered');

    return tileShell('chatbot', '💬', 'Website Chatbot', '/chatbot', statusChipHtml, summary, detail);
  }

  // Wire toggle buttons inside Zone 2 tiles
  function wireToggles(container) {
    container.querySelectorAll('.dash-tile-toggle').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var tile = btn.closest('.dash-tile');
        if (!tile) return;
        var isOpen = btn.classList.toggle('open');
        btn.setAttribute('aria-label', isOpen ? 'Collapse details' : 'Expand details');
        btn.setAttribute('title', isOpen ? 'Collapse' : 'Expand');
        var detail = tile.querySelector('.dash-tile-detail');
        if (detail) {
          if (isOpen) detail.classList.add('open'); else detail.classList.remove('open');
        }
      });
    });
  }

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
    wireToggles(container);
  }

  return { renderAll: renderAll };

})();
