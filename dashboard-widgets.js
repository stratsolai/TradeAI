window.DASH_WIDGETS = (function() {

  function timeAgo(d) {
    if (!d) return '';
    var s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + ' min ago';
    if (s < 86400) return Math.floor(s/3600) + ' hr ago';
    return Math.floor(s/86400) + 'd ago';
  }
  function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtShort(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  function svgBars(values, color, h) {
    color = color || '#C4622A'; h = h || 60;
    if (values.every(function(v){ return v === 0; })) return svgGhostBars(values.length, h);
    var max = Math.max.apply(null, values.concat([1]));
    var w = 100, bw = Math.floor(w / values.length) - 2;
    var bars = values.map(function(v, i) {
      var bh = Math.max(2, Math.floor((v / max) * (h - 8)));
      var x = i * (bw + 2) + 1, y = h - bh;
      var op = v === max ? '1' : '0.55';
      return '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="2" fill="' + color + '" opacity="' + op + '"/>';
    }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block;">' + bars + '</svg>';
  }

  function svgGhostBars(count, h) {
    h = h || 60; count = count || 7;
    var w = 100, bw = Math.floor(w / count) - 2, bars = [];
    for (var i = 0; i < count; i++) {
      var bh = 10 + Math.floor(Math.random() * (h - 18));
      bars.push('<rect x="' + (i*(bw+2)+1) + '" y="' + (h-bh) + '" width="' + bw + '" height="' + bh + '" rx="2" fill="#EBEBEB"/>');
    }
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block;">' + bars.join('') + '</svg>';
  }

  function svgSparkline(values, color, h) {
    color = color || '#4A6D8C'; h = h || 50;
    if (!values || values.length < 2) return svgGhostSparkline(h);
    if (values.every(function(v){ return v === 0; })) return svgGhostSparkline(h);
    var max = Math.max.apply(null, values.concat([1]));
    var min = Math.min.apply(null, values);
    var range = max - min || 1, pad = 4;
    var pts = values.map(function(v, i) {
      var x = pad + (i / (values.length - 1)) * (100 - pad * 2);
      var y = pad + ((1 - (v - min) / range) * (h - pad * 2));
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 100 ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block;"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  function svgGhostSparkline(h) {
    h = h || 50;
    return '<svg viewBox="0 0 100 ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block;"><polyline points="4,' + (h*0.6) + ' 20,' + (h*0.4) + ' 36,' + (h*0.65) + ' 52,' + (h*0.3) + ' 68,' + (h*0.5) + ' 84,' + (h*0.35) + ' 96,' + (h*0.45) + '" fill="none" stroke="#E0E0E0" stroke-width="1.5" stroke-dasharray="3 2"/></svg>';
  }

  function svgDonut(pct, color, size) {
    color = color || '#C4622A'; size = size || 100;
    var r = size * 0.38, cx = size/2, cy = size/2;
    var circ = 2 * Math.PI * r;
    var dash = (pct/100) * circ, gap = circ - dash;
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px;display:block;margin:0 auto;">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#E0E0E0" stroke-width="10"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="10" stroke-dasharray="' + dash.toFixed(1) + ' ' + gap.toFixed(1) + '" stroke-dashoffset="' + (circ*0.25).toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' +
      '<text x="' + cx + '" y="' + (cy+5) + '" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-size="' + Math.floor(size*0.2) + '" font-weight="700" fill="' + color + '">' + pct + '%</text>' +
    '</svg>';
  }

  function svgGhostDonut(size) {
    size = size || 100;
    var r = size*0.38, cx = size/2, cy = size/2;
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px;display:block;margin:0 auto;">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#E0E0E0" stroke-width="10"/>' +
      '<text x="' + cx + '" y="' + (cy+5) + '" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-size="' + Math.floor(size*0.16) + '" fill="#CCCCCC">No data</text>' +
    '</svg>';
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
      (footerLink || footerLeft ? '<div class="widget-footer"><span>' + (footerLeft||'') + '</span>' + (footerLink ? '<a href="' + footerLink + '">' + footerLinkText + '</a>' : '') + '</div>' : '') +
    '</div>';
  }

  function statTiles(tiles) {
    return '<div class="stat-tiles">' + tiles.map(function(t) {
      return '<div class="stat-tile"><div class="stat-val' + (t.small ? ' stat-val-sm' : '') + '">' + t.val + '</div><div class="stat-lbl">' + t.lbl + '</div></div>';
    }).join('') + '</div>';
  }

  function emptyBody(chartHtml, msg) {
    return chartHtml + '<div class="widget-empty" style="padding-top:8px;"><p>' + msg + '</p></div>';
  }

  async function renderEmail(userId) {
    var bodyHtml = '';
    try {
      var res = await supabaseClient.from('email_summaries')
        .select('id, sender, subject, summary, urgency, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
      var rows = res.data || [];
      var high = rows.filter(function(r){ return r.urgency==='high'; }).length;
      var med  = rows.filter(function(r){ return r.urgency==='medium'; }).length;
      if (rows.length > 0) {
        bodyHtml += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' +
          svgDonut(high > 0 ? Math.round((high/rows.length)*100) : 0, '#C62828', 100) +
          '<div>' + statTiles([{val:rows.length,lbl:'Total'},{val:high,lbl:'High Priority'},{val:med,lbl:'Medium'}]) + '</div>' +
        '</div>';
        bodyHtml += '<ul class="widget-list">';
        rows.slice(0,5).forEach(function(item) {
          var dc = item.urgency==='high' ? 'dot-red' : item.urgency==='medium' ? 'dot-amber' : 'dot-green';
          bodyHtml += '<li class="widget-list-item"><span class="dot ' + dc + '"></span><span class="widget-list-item-main"><span class="widget-list-item-sender">' + (item.sender||'') + '</span><div class="widget-list-item-subj">' + (item.subject||'') + '</div></span><span class="widget-list-item-time">' + timeAgo(item.created_at) + '</span></li>';
        });
        bodyHtml += '</ul>';
      } else {
        bodyHtml = emptyBody('<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' + svgGhostDonut(110) + '<div>' + statTiles([{val:'-',lbl:'Total'},{val:'-',lbl:'High Priority'},{val:'-',lbl:'Medium'}]) + '</div></div>', 'Connect Gmail or Outlook to see your inbox summary here.');
      }
    } catch(e) { bodyHtml = emptyBody(svgGhostDonut(110), 'Connect Gmail or Outlook to see your inbox summary here.'); }
    return panel('email', '📧', 'AI Email Assistant', bodyHtml, '', 'email-assistant.html', 'Open Email Assistant');
  }

  async function renderNews(userId) {
    var bodyHtml = '', lastUpdated = '';
    try {
      var res = await supabaseClient.from('news_digest_items')
        .select('id, headline, source, summary, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
      var rows = res.data || [];
      var counts = [0,0,0,0,0,0,0];
      rows.forEach(function(r) {
        var da = Math.floor((Date.now() - new Date(r.created_at)) / 86400000);
        if (da < 7) counts[6 - da]++;
      });
      if (rows.length > 0) {
        lastUpdated = 'Updated ' + fmtShort(rows[0].created_at);
        bodyHtml += '<div style="margin-bottom:10px;">' + svgBars(counts, '#4A6D8C', 80) + '</div><ul class="widget-list">';
        rows.forEach(function(item) {
          bodyHtml += '<li class="widget-list-item"><span class="widget-list-item-main"><div class="widget-list-item-sender">' + (item.headline||'') + '</div>' + (item.source ? '<div class="widget-list-item-subj">' + item.source + '</div>' : '') + '</span><span class="widget-list-item-time">' + timeAgo(item.created_at) + '</span></li>';
        });
        bodyHtml += '</ul>';
      } else {
        bodyHtml = emptyBody('<div style="margin-bottom:10px;">' + svgGhostBars(7, 80) + '</div>', 'Your first digest will appear here. Open News Digest to run your first scan.');
      }
    } catch(e) { bodyHtml = emptyBody('<div style="margin-bottom:10px;">' + svgGhostBars(7, 80) + '</div>', 'Your first digest will appear here. Open News Digest to run your first scan.'); }
    return panel('news-digest', '📰', 'Industry News Digest', bodyHtml, lastUpdated, 'news-digest.html', 'Open News Digest');
  }

  async function renderSocial(userId) {
    var bodyHtml = '';
    try {
      var res = await supabaseClient.from('social_posts')
        .select('id, caption, scheduled_at, status, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
      var rows = res.data || [];
      var published = rows.filter(function(r){ return r.status==='published'; });
      var pending   = rows.filter(function(r){ return r.status==='pending_review'; });
      var wkCounts = [0,0,0,0];
      published.forEach(function(r) {
        var wa = Math.floor((Date.now() - new Date(r.created_at)) / 604800000);
        if (wa < 4) wkCounts[3 - wa]++;
      });
      bodyHtml += statTiles([{val:rows.length,lbl:'This Month'},{val:published.length,lbl:'Published'},{val:pending.length,lbl:'Pending Review'}]);
      bodyHtml += '<div style="margin:10px 0 8px;">' + (rows.length > 0 ? svgBars(wkCounts, '#C4622A', 72) : svgGhostBars(4, 72)) + '</div>';
      if (pending.length > 0) {
        bodyHtml += '<div class="widget-subsection-label">Pending Review</div><ul class="widget-list">';
        pending.slice(0,3).forEach(function(p) {
          var ex = p.caption ? p.caption.substring(0,55) + (p.caption.length>55 ? '…' : '') : '';
          bodyHtml += '<li class="widget-list-item"><span class="widget-list-item-main"><div class="widget-list-item-sender">' + ex + '</div>' + (p.scheduled_at ? '<div class="widget-list-item-subj">Scheduled ' + fmtShort(p.scheduled_at) + '</div>' : '') + '</span></li>';
        });
        bodyHtml += '</ul>';
      } else if (published.length > 0) {
        var last = published[0];
        var ex = last.caption ? last.caption.substring(0,55) + (last.caption.length>55 ? '…' : '') : '';
        bodyHtml += '<div class="widget-subsection-label">Last Published</div><div style="font-size:13px;color:var(--text);">' + ex + '</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">' + fmtDate(last.created_at) + '</div>';
      } else {
        bodyHtml += '<p style="font-size:13px;color:var(--muted);">No posts yet. Open Marketing Hub to create your first post.</p>';
      }
    } catch(e) {
      bodyHtml = statTiles([{val:'-',lbl:'This Month'},{val:'-',lbl:'Published'},{val:'-',lbl:'Pending'}]) + '<div style="margin:10px 0 8px;">' + svgGhostBars(4,56) + '</div><p style="font-size:13px;color:var(--muted);">No posts yet. Open Marketing Hub to create your first post.</p>';
    }
    return panel('social', '📱', 'Marketing & Social Media', bodyHtml, '', 'social.html', 'Open Marketing Hub');
  }

  async function renderChatbot(userId) {
    var bodyHtml = '';
    try {
      var today = new Date(); today.setHours(0,0,0,0);
      var weekAgo = new Date(Date.now() - 7*86400000);
      var fortAgo = new Date(Date.now() - 14*86400000);
      var [todayRes, weekRes, recentRes, faqRes, fortRes] = await Promise.all([
        supabaseClient.from('chatbot_interactions').select('id',{count:'exact',head:true}).eq('user_id',userId).gte('created_at',today.toISOString()),
        supabaseClient.from('chatbot_interactions').select('id',{count:'exact',head:true}).eq('user_id',userId).gte('created_at',weekAgo.toISOString()),
        supabaseClient.from('chatbot_interactions').select('visitor_name,message_excerpt,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(3),
        supabaseClient.from('learned_faqs').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('status','pending'),
        supabaseClient.from('chatbot_interactions').select('created_at').eq('user_id',userId).gte('created_at',fortAgo.toISOString()).order('created_at',{ascending:true})
      ]);
      var dayCounts = [];
      for (var d = 0; d < 14; d++) dayCounts.push(0);
      (fortRes.data||[]).forEach(function(r) {
        var da = Math.floor((Date.now() - new Date(r.created_at)) / 86400000);
        if (da < 14) dayCounts[13 - da]++;
      });
      bodyHtml += statTiles([{val:todayRes.count||0,lbl:'Leads Today'},{val:weekRes.count||0,lbl:'This Week'}]);
      bodyHtml += '<div style="margin:10px 0 8px;">' + svgSparkline(dayCounts, '#C4622A', 56) + '</div>';
      if (faqRes.count && faqRes.count > 0) {
        bodyHtml += '<div style="font-size:12px;color:var(--orange);font-weight:600;margin-bottom:8px;">' + faqRes.count + ' FAQ suggestion' + (faqRes.count>1?'s':'') + ' to review</div>';
      }
      var recent = recentRes.data||[];
      if (recent.length > 0) {
        bodyHtml += '<ul class="widget-list">';
        recent.forEach(function(item) {
          bodyHtml += '<li class="widget-list-item"><span class="widget-list-item-main"><div class="widget-list-item-sender">' + (item.visitor_name||'Anonymous') + '</div>' + (item.message_excerpt ? '<div class="widget-list-item-subj">' + item.message_excerpt + '</div>' : '') + '</span><span class="widget-list-item-time">' + timeAgo(item.created_at) + '</span></li>';
        });
        bodyHtml += '</ul>';
      } else {
        bodyHtml += '<p style="font-size:13px;color:var(--muted);">Your chatbot is active. Enquiries and leads will appear here.</p>';
      }
    } catch(e) {
      bodyHtml = statTiles([{val:'-',lbl:'Leads Today'},{val:'-',lbl:'This Week'}]) + '<div style="margin:10px 0 8px;">' + svgGhostSparkline(56) + '</div><p style="font-size:13px;color:var(--muted);">Your chatbot is active. Enquiries and leads will appear here.</p>';
    }
    return panel('chatbot', '💬', 'AI Website Chatbot', bodyHtml, '', 'chatbot.html', 'Open Chatbot Settings');
  }

  async function renderStrategicPlan(userId) {
    var bodyHtml = '';
    try {
      var planRes = await supabaseClient.from('strategic_plans')
        .select('id, created_at, cycle_end_date').eq('user_id',userId)
        .order('created_at',{ascending:false}).limit(1);
      if (!planRes.data || planRes.data.length === 0) {
        bodyHtml = emptyBody(svgGhostDonut(110), 'No plan created yet. Open Strategic Plan to complete your AI-guided interview.');
      } else {
        var plan = planRes.data[0];
        var actRes = await supabaseClient.from('action_tracker')
          .select('id, title, due_date, status').eq('user_id',userId).eq('plan_id',plan.id)
          .order('due_date',{ascending:true}).limit(20);
        var actions = actRes.data || [];
        var done = actions.filter(function(a){ return a.status==='complete'; }).length;
        var pct = actions.length > 0 ? Math.round((done/actions.length)*100) : 0;
        var daysLeft = 0, daysLabel = '';
        if (plan.cycle_end_date) {
          daysLeft = Math.ceil((new Date(plan.cycle_end_date) - Date.now()) / 86400000);
          daysLabel = daysLeft > 0 ? daysLeft + ' days remaining' : 'Cycle ended ' + fmtDate(plan.cycle_end_date);
        }
        bodyHtml += '<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px;">' +
          svgDonut(pct, '#C4622A', 110) +
          '<div style="flex:1;"><div style="font-family:&quot;Barlow Condensed&quot;,sans-serif;font-size:20px;font-weight:700;color:' + (daysLeft < 14 && daysLeft > 0 ? '#C4622A' : '#666666') + ';margin-bottom:4px;">' + daysLabel + '</div>' +
          statTiles([{val:done,lbl:'Complete'},{val:actions.length-done,lbl:'Remaining'}]) + '</div></div>';
        var upcoming = actions.filter(function(a){ return a.status!=='complete'; }).slice(0,3);
        if (upcoming.length > 0) {
          bodyHtml += '<ul class="widget-list">';
          upcoming.forEach(function(a) {
            var dc = a.status==='in_progress' ? 'dot-amber' : 'dot-green';
            bodyHtml += '<li class="widget-list-item"><span class="dot ' + dc + '"></span><span class="widget-list-item-main"><div class="widget-list-item-sender">' + (a.title||'') + '</div>' + (a.due_date ? '<div class="widget-list-item-subj">Due ' + fmtDate(a.due_date) + '</div>' : '') + '</span></li>';
          });
          bodyHtml += '</ul>';
        }
      }
    } catch(e) { bodyHtml = emptyBody(svgGhostDonut(110), 'No plan created yet. Open Strategic Plan to complete your AI-guided interview.'); }
    return panel('strategic-plan', '🗺️', 'Strategic Plan', bodyHtml, '', 'strategic-plan.html', 'Open Strategic Plan');
  }

  function renderBITeaser() {
    return '<div class="widget-panel wide placeholder" id="widget-bi">' +
      '<div class="widget-header" style="opacity:0.5;"><span class="widget-icon">🧠</span><span class="widget-title">AI Business Insights</span><span class="badge badge-coming">Available</span></div>' +
      '<div class="widget-body"><div style="margin-bottom:10px;">' + svgGhostSparkline(52) + '</div>' +
        '<div class="widget-empty" style="padding-top:4px;"><p>Activate the Business Intelligence Dashboard to unlock AI-powered cross-tool insights — the more tools you activate, the smarter it gets.</p>' +
        '<a href="panel.html?tool=bi" class="btn-activate">Learn More</a></div>' +
      '</div></div>';
  }

  var WIDGET_MAP = {
    'email': renderEmail, 'news-digest': renderNews, 'social': renderSocial,
    'chatbot': renderChatbot, 'strategic-plan': renderStrategicPlan
  };

  async function render(userId, activeTools) {
    var grid = document.getElementById('widget-grid');
    if (!grid) return;
    var html = '', hasBi = activeTools.indexOf('bi') !== -1;
    if (hasBi) {
      html += '<div class="widget-panel wide" id="widget-bi"><div class="widget-header"><span class="widget-icon">🧠</span><span class="widget-title">AI Business Insights</span><span class="badge badge-live">Live</span></div>' +
        '<div class="widget-body">' + svgGhostSparkline(52) + '<div class="widget-empty"><p>AI Insights panel coming soon — requires bi_insights table setup.</p></div></div></div>';
    }
    for (var i = 0; i < activeTools.length; i++) {
      var id = activeTools[i];
      if (id === 'bi') continue;
      if (WIDGET_MAP[id]) html += await WIDGET_MAP[id](userId);
    }
    if (!hasBi) html += renderBITeaser();
    grid.innerHTML = html;
    grid.addEventListener('click', function(e) {
      var btn = e.target.closest('.widget-refresh');
      if (!btn) return;
      var wid = btn.getAttribute('data-widget');
      if (!wid || !WIDGET_MAP[wid]) return;
      var panelEl = document.getElementById('widget-' + wid);
      if (panelEl) { var b = panelEl.querySelector('.widget-body'); if (b) b.innerHTML = '<div class="widget-empty"><p>Refreshing…</p></div>'; }
      WIDGET_MAP[wid](userId).then(function(h) { if (panelEl) panelEl.outerHTML = h; });
    });
  }

  return { render: render };

})();
