window.DASH_WIDGETS = (function() {

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function panel(id, icon, title, bodyHtml, footerLeft, footerLink, footerLinkText, wide) {
    return '<div class="widget-panel' + (wide ? ' wide' : '') + '" id="widget-' + id + '">' +
      '<div class="widget-header">' +
        '<span class="widget-icon">' + icon + '</span>' +
        '<span class="widget-title">' + title + '</span>' +
        '<span class="badge badge-live">Live</span>' +
        '<button class="widget-refresh" data-widget="' + id + '" title="Refresh">↻</button>' +
      '</div>' +
      '<div class="widget-body">' + bodyHtml + '</div>' +
      '<div class="widget-footer">' +
        '<span>' + (footerLeft || '') + '</span>' +
        (footerLink ? '<a href="' + footerLink + '">' + footerLinkText + '</a>' : '') +
      '</div>' +
    '</div>';
  }

  function emptyState(msg) {
    return '<div class="widget-empty"><p>' + msg + '</p></div>';
  }

  async function renderEmail(userId) {
    var bodyHtml = '';
    try {
      var res = await supabase.from('email_summaries')
        .select('id, sender, subject, summary, urgency, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (res.data && res.data.length > 0) {
        bodyHtml = '<ul class="widget-list">';
        res.data.forEach(function(item) {
          var dotClass = item.urgency === 'high' ? 'dot dot-red' : (item.urgency === 'medium' ? 'dot dot-amber' : 'dot dot-green');
          bodyHtml += '<li class="widget-list-item">' +
            '<span class="' + dotClass + '"></span>' +
            '<span class="widget-list-item-main">' +
              '<span class="widget-list-item-sender">' + (item.sender || '') + '</span>' +
              '<span class="widget-list-item-subj"> — ' + (item.subject || '') + '</span>' +
              (item.summary ? '<div class="widget-list-item-subj" style="margin-top:2px;">' + item.summary + '</div>' : '') +
            '</span>' +
            '<span class="widget-list-item-time">' + timeAgo(item.created_at) + '</span>' +
          '</li>';
        });
        bodyHtml += '</ul>';
      } else {
        bodyHtml = emptyState('Connect Gmail or Outlook to see your inbox summary here.');
      }
    } catch(e) {
      bodyHtml = emptyState('Connect Gmail or Outlook to see your inbox summary here.');
    }
    return panel('email', '📧', 'AI Email Assistant', bodyHtml, '', 'email-assistant.html', 'Open Email Assistant');
  }

  async function renderNews(userId) {
    var bodyHtml = '';
    var lastUpdated = '';
    try {
      var res = await supabase.from('news_digest_items')
        .select('id, headline, source, summary, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (res.data && res.data.length > 0) {
        lastUpdated = 'Last updated ' + fmtDate(res.data[0].created_at);
        bodyHtml = '<ul class="widget-list">';
        res.data.forEach(function(item) {
          bodyHtml += '<li class="widget-list-item">' +
            '<span class="widget-list-item-main">' +
              '<div class="widget-list-item-sender">' + (item.headline || '') + '</div>' +
              (item.source ? '<div class="widget-list-item-subj">' + item.source + '</div>' : '') +
              (item.summary ? '<div class="widget-list-item-subj" style="margin-top:2px;">' + item.summary + '</div>' : '') +
            '</span>' +
            '<span class="widget-list-item-time">' + timeAgo(item.created_at) + '</span>' +
          '</li>';
        });
        bodyHtml += '</ul>';
      } else {
        bodyHtml = emptyState('Your first digest will appear here. Open News Digest to run your first scan.');
      }
    } catch(e) {
      bodyHtml = emptyState('Your first digest will appear here. Open News Digest to run your first scan.');
    }
    return panel('news-digest', '📰', 'Industry News Digest', bodyHtml, lastUpdated, 'news-digest.html', 'Open News Digest');
  }

  async function renderSocial(userId) {
    var bodyHtml = '';
    try {
      var res = await supabase.from('social_posts')
        .select('id, caption, scheduled_at, status, platform, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (res.data && res.data.length > 0) {
        var pending = res.data.filter(function(p) { return p.status === 'pending_review'; });
        var published = res.data.filter(function(p) { return p.status === 'published'; });
        bodyHtml = '';
        if (pending.length > 0) {
          bodyHtml += '<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Pending Review</div>';
          bodyHtml += '<ul class="widget-list" style="margin-bottom:12px;">';
          pending.slice(0, 3).forEach(function(p) {
            var excerpt = p.caption ? p.caption.substring(0, 60) + (p.caption.length > 60 ? '…' : '') : '';
            bodyHtml += '<li class="widget-list-item">' +
              '<span class="widget-list-item-main">' +
                '<div class="widget-list-item-sender">' + excerpt + '</div>' +
                (p.scheduled_at ? '<div class="widget-list-item-subj">Scheduled ' + fmtDate(p.scheduled_at) + '</div>' : '') +
              '</span>' +
            '</li>';
          });
          bodyHtml += '</ul>';
        }
        if (published.length > 0) {
          bodyHtml += '<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Last Published</div>';
          var last = published[0];
          var excerpt = last.caption ? last.caption.substring(0, 60) + (last.caption.length > 60 ? '…' : '') : '';
          bodyHtml += '<div style="font-size:13px;color:var(--text);">' + excerpt + '</div>';
          bodyHtml += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' + fmtDate(last.created_at) + '</div>';
        }
        if (!pending.length && !published.length) {
          bodyHtml = emptyState('No posts yet. Open Marketing Hub to create your first post.');
        }
      } else {
        bodyHtml = emptyState('No posts yet. Open Marketing Hub to create your first post.');
      }
    } catch(e) {
      bodyHtml = emptyState('No posts yet. Open Marketing Hub to create your first post.');
    }
    return panel('social', '📱', 'Marketing & Social Media', bodyHtml, '', 'social.html', 'Open Marketing Hub');
  }

  async function renderChatbot(userId) {
    var bodyHtml = '';
    try {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var todayStr = today.toISOString();
      var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      var todayRes = await supabase.from('chatbot_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', todayStr);
      var weekRes = await supabase.from('chatbot_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', weekAgo);
      var recentRes = await supabase.from('chatbot_interactions')
        .select('visitor_name, message_excerpt, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);
      var faqRes = await supabase.from('learned_faqs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending');
      var todayCount = todayRes.count || 0;
      var weekCount  = weekRes.count  || 0;
      bodyHtml = '<div class="stat-tiles">' +
        '<div class="stat-tile"><div class="stat-val">' + todayCount + '</div><div class="stat-lbl">Leads Today</div></div>' +
        '<div class="stat-tile"><div class="stat-val">' + weekCount  + '</div><div class="stat-lbl">Leads This Week</div></div>' +
      '</div>';
      if (faqRes.count && faqRes.count > 0) {
        bodyHtml += '<div style="font-size:12px;color:var(--orange);font-weight:600;margin-bottom:10px;">' + faqRes.count + ' new FAQ suggestion' + (faqRes.count > 1 ? 's' : '') + ' to review</div>';
      }
      if (recentRes.data && recentRes.data.length > 0) {
        bodyHtml += '<ul class="widget-list">';
        recentRes.data.forEach(function(item) {
          bodyHtml += '<li class="widget-list-item">' +
            '<span class="widget-list-item-main">' +
              '<div class="widget-list-item-sender">' + (item.visitor_name || 'Anonymous') + '</div>' +
              (item.message_excerpt ? '<div class="widget-list-item-subj">' + item.message_excerpt + '</div>' : '') +
            '</span>' +
            '<span class="widget-list-item-time">' + timeAgo(item.created_at) + '</span>' +
          '</li>';
        });
        bodyHtml += '</ul>';
      } else {
        bodyHtml += '<p style="font-size:13px;color:var(--muted);">Your chatbot is active. Enquiries and leads will appear here.</p>';
      }
    } catch(e) {
      bodyHtml = emptyState('Your chatbot is active. Enquiries and leads will appear here.');
    }
    return panel('chatbot', '💬', 'AI Website Chatbot', bodyHtml, '', 'chatbot.html', 'Open Chatbot Settings');
  }

  async function renderStrategicPlan(userId) {
    var bodyHtml = '';
    try {
      var planRes = await supabase.from('strategic_plans')
        .select('id, created_at, cycle_end_date')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!planRes.data || planRes.data.length === 0) {
        bodyHtml = emptyState('No plan created yet. Open Strategic Plan to complete your AI-guided interview.');
      } else {
        var plan = planRes.data[0];
        var actRes = await supabase.from('action_tracker')
          .select('id, title, due_date, status')
          .eq('user_id', userId)
          .eq('plan_id', plan.id)
          .order('due_date', { ascending: true })
          .limit(20);
        var actions = actRes.data || [];
        var done = actions.filter(function(a) { return a.status === 'complete'; }).length;
        var pct = actions.length > 0 ? Math.round((done / actions.length) * 100) : 0;
        var daysLeft = '';
        if (plan.cycle_end_date) {
          var diff = Math.ceil((new Date(plan.cycle_end_date) - Date.now()) / 86400000);
          daysLeft = diff > 0 ? diff + ' days remaining in cycle' : 'Cycle ended ' + fmtDate(plan.cycle_end_date);
        }
        bodyHtml = '<div class="progress-wrap">' +
          '<div class="progress-label"><span>90-day plan progress</span><span>' + pct + '%</span></div>' +
          '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>';
        if (daysLeft) {
          bodyHtml += '<div style="font-size:12px;color:var(--orange);font-weight:600;margin-bottom:10px;">' + daysLeft + '</div>';
        }
        var upcoming = actions.filter(function(a) { return a.status !== 'complete'; }).slice(0, 3);
        if (upcoming.length > 0) {
          bodyHtml += '<ul class="widget-list">';
          upcoming.forEach(function(a) {
            var dotClass = a.status === 'in_progress' ? 'dot dot-amber' : 'dot dot-green';
            bodyHtml += '<li class="widget-list-item">' +
              '<span class="' + dotClass + '"></span>' +
              '<span class="widget-list-item-main">' +
                '<div class="widget-list-item-sender">' + (a.title || '') + '</div>' +
                (a.due_date ? '<div class="widget-list-item-subj">Due ' + fmtDate(a.due_date) + '</div>' : '') +
              '</span>' +
            '</li>';
          });
          bodyHtml += '</ul>';
        }
      }
    } catch(e) {
      bodyHtml = emptyState('No plan created yet. Open Strategic Plan to complete your AI-guided interview.');
    }
    return panel('strategic-plan', '🗺️', 'Strategic Plan', bodyHtml, '', 'strategic-plan.html', 'Open Strategic Plan');
  }

  function renderBIPlaceholder() {
    var bodyHtml = '<div class="widget-empty">' +
      '<p>Activate the Business Intelligence Dashboard to unlock AI-powered business insights across all your tools.</p>' +
      '<a href="panel.html?tool=bi" class="btn-activate">Learn More</a>' +
    '</div>';
    return '<div class="widget-panel wide" id="widget-bi">' +
      '<div class="widget-header">' +
        '<span class="widget-icon">🧠</span>' +
        '<span class="widget-title">AI Business Insights</span>' +
        '<span class="badge badge-coming">Available</span>' +
      '</div>' +
      '<div class="widget-body">' + bodyHtml + '</div>' +
    '</div>';
  }

  var WIDGET_MAP = {
    'email':          renderEmail,
    'news-digest':    renderNews,
    'social':         renderSocial,
    'chatbot':        renderChatbot,
    'strategic-plan': renderStrategicPlan
  };

  async function render(userId, activeTools) {
    var grid = document.getElementById('widget-grid');
    if (!grid) return;
    var html = '';
    var hasBi = activeTools.indexOf('bi') !== -1;
    if (hasBi) { html += renderBIPlaceholder(); }
    for (var i = 0; i < activeTools.length; i++) {
      var toolId = activeTools[i];
      if (toolId === 'bi') continue;
      if (WIDGET_MAP[toolId]) { html += await WIDGET_MAP[toolId](userId); }
    }
    if (!hasBi) { html += renderBIPlaceholder(); }
    grid.innerHTML = html;
    grid.addEventListener('click', function(e) {
      var btn = e.target.closest('.widget-refresh');
      if (!btn) return;
      var widgetId = btn.getAttribute('data-widget');
      if (widgetId && WIDGET_MAP[widgetId]) {
        var panelEl = document.getElementById('widget-' + widgetId);
        if (panelEl) {
          var body = panelEl.querySelector('.widget-body');
          if (body) body.innerHTML = '<div class="widget-empty"><p>Refreshing…</p></div>';
        }
        WIDGET_MAP[widgetId](userId).then(function(newHtml) {
          if (panelEl) panelEl.outerHTML = newHtml;
        });
      }
    });
  }

  return { render: render };

})();
