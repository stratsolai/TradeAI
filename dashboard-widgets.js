window.DASH_WIDGETS = (function() {

  var _supabase;

  // Tools with Zone 2 presence (per spec Section 4b)
  // Email Assistant and Design Visualiser excluded
  var ZONE2_TOOLS = [
    { id: 'strategic-plan', icon: '\ud83d\uddfa\ufe0f', name: 'Strategic Plan' },
    { id: 'news-digest',    icon: '\ud83d\udcf0', name: 'Industry News Digest' },
    { id: 'chatbot',        icon: '\ud83d\udcac', name: 'Website Chatbot' },
    { id: 'social',         icon: '\ud83d\udcf1', name: 'Marketing & Social Media' },
    { id: 'bi',             icon: '\ud83e\udde0', name: 'Business Intelligence' }
  ];

  // ── HELPERS ──
  function fmtShort(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  function truncate(s, max) {
    if (!s) return '';
    return s.length > max ? s.substring(0, max) + '\u2026' : s;
  }

  // ── TILE BUILDER ──
  function tileStart(icon, name) {
    return '<div class="dash-overview-tile">'
      + '<div class="dash-overview-tile-header">'
      + '<span class="dash-overview-tile-icon">' + icon + '</span>'
      + '<span class="dash-overview-tile-name">' + window.escHtml(name) + '</span>'
      + '</div>';
  }

  function tileEnd() {
    return '</div>';
  }

  function linkRow(value, label, href) {
    return '<a href="' + href + '" class="dash-overview-link">'
      + '<span class="dash-overview-link-value">' + window.escHtml(String(value)) + '</span>'
      + '<span class="dash-overview-link-label">' + window.escHtml(label) + '</span>'
      + '</a>';
  }

  function emptyRow(text) {
    return '<div class="dash-overview-empty">' + window.escHtml(text) + '</div>';
  }

  // ── STRATEGIC PLAN TILE ──
  async function renderStrategic(userId) {
    var html = tileStart('\ud83d\uddfa\ufe0f', 'Strategic Plan');
    try {
      var pr = await _supabase.from('strategic_plans')
        .select('id').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(1);

      if (pr.data && pr.data.length) {
        var planId = pr.data[0].id;
        var now = new Date();
        var weekEnd = new Date(now.getTime() + 7 * 86400000);

        var ar = await _supabase.from('action_tracker')
          .select('id, title, due_date, status')
          .eq('user_id', userId).eq('plan_id', planId)
          .order('due_date', { ascending: true }).limit(50);

        var acts = ar.data || [];
        var done = acts.filter(function(a) { return a.status === 'complete'; }).length;
        var due = acts.filter(function(a) {
          return a.status !== 'complete' && a.due_date && new Date(a.due_date) <= weekEnd;
        }).length;
        var pct = acts.length ? Math.round((done / acts.length) * 100) : 0;

        html += linkRow(due, 'task' + (due !== 1 ? 's' : '') + ' due this week', '/strategy#action-tracker');
        html += linkRow(pct + '%', 'plan progress (' + done + '/' + acts.length + ')', '/strategy#plan');
      } else {
        html += emptyRow('No plan created yet');
      }
    } catch (e) {
      html += emptyRow('Could not load plan data');
    }
    html += tileEnd();
    return html;
  }

  // ── NEWS DIGEST TILE ──
  async function renderNews(userId) {
    var html = tileStart('\ud83d\udcf0', 'Industry News Digest');
    try {
      var res = await _supabase.from('news_digest_items')
        .select('id, headline, source, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(3);

      var items = res.data || [];
      if (items.length) {
        items.forEach(function(item) {
          var label = truncate(item.headline, 50);
          if (item.source) label += ' \u2014 ' + window.escHtml(item.source);
          html += linkRow(fmtShort(item.created_at), truncate(item.headline, 50), '/news');
        });
      } else {
        html += emptyRow('No digest items yet');
      }
    } catch (e) {
      html += emptyRow('Could not load news data');
    }
    html += tileEnd();
    return html;
  }

  // ── CHATBOT TILE ──
  async function renderChatbot(userId) {
    var html = tileStart('\ud83d\udcac', 'Website Chatbot');
    try {
      var today = new Date();
      today.setHours(0, 0, 0, 0);

      var convResult = await _supabase.from('chatbot_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', today.toISOString());

      var faqResult = await _supabase.from('learned_faqs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'pending');

      var convCount = (convResult.count) || 0;
      var faqCount = (faqResult.count) || 0;

      html += linkRow(convCount, 'conversation' + (convCount !== 1 ? 's' : '') + ' today', '/chatbot#conversations');
      if (faqCount > 0) {
        html += linkRow(faqCount, 'unanswered question' + (faqCount !== 1 ? 's' : ''), '/chatbot#unanswered');
      }
    } catch (e) {
      html += emptyRow('Could not load chatbot data');
    }
    html += tileEnd();
    return html;
  }

  // ── SOCIAL TILE ──
  async function renderSocial(userId) {
    var html = tileStart('\ud83d\udcf1', 'Marketing & Social Media');
    try {
      var pendResult = await _supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'pending_review');

      var monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      var pubResult = await _supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'published')
        .gte('created_at', monthStart.toISOString());

      var pendCount = (pendResult.count) || 0;
      var pubCount = (pubResult.count) || 0;

      html += linkRow(pendCount, 'post' + (pendCount !== 1 ? 's' : '') + ' pending', '/social#drafts');
      html += linkRow(pubCount, 'published this month', '/social#published');
    } catch (e) {
      html += emptyRow('Could not load social data');
    }
    html += tileEnd();
    return html;
  }

  // ── BI TILE ──
  async function renderBI(userId) {
    var html = tileStart('\ud83e\udde0', 'Business Intelligence');
    try {
      var pr = await _supabase.from('profiles')
        .select('activated_tools').eq('id', userId).single();
      var toolCount = (pr.data && Array.isArray(pr.data.activated_tools)) ? pr.data.activated_tools.length : 0;

      html += linkRow(toolCount, 'tool' + (toolCount !== 1 ? 's' : '') + ' feeding insights', '/bi.html');
      html += emptyRow('Open tool for latest recommendations');
    } catch (e) {
      html += emptyRow('Could not load BI data');
    }
    html += tileEnd();
    return html;
  }

  // ── RENDER ALL ──
  async function renderAll(supabase, userId, activeTools) {
    _supabase = supabase;
    var container = document.getElementById('zone-2');
    if (!container) return;

    var renders = {
      'strategic-plan': renderStrategic,
      'news-digest': renderNews,
      'chatbot': renderChatbot,
      'social': renderSocial,
      'bi': renderBI
    };

    var activeTiles = ZONE2_TOOLS.filter(function(t) {
      return activeTools.indexOf(t.id) !== -1;
    });

    if (activeTiles.length === 0) {
      container.innerHTML = '<div class="empty-state">'
        + '<div class="empty-state-icon">\ud83d\udcca</div>'
        + '<h3>No active tools yet</h3>'
        + '<p>Activate tools below to see your overview here.</p>'
        + '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < activeTiles.length; i++) {
      var renderFn = renders[activeTiles[i].id];
      if (renderFn) {
        html += await renderFn(userId);
      }
    }

    container.innerHTML = html;
  }

  return { renderAll: renderAll };

})();
