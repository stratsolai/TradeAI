window.DASH_WIDGETS = (function() {

  // ── HELPERS ──
  function ago(d) {
    if (!d) return '';
    var s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }
  function fmtShort(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  // ── SVG BUILDERS ──
  function svgBars(values, color, h) {
    h = h || 80;
    if (!values || !values.length) return svgGhostBars(7, h);
    if (values.every(function(v){ return v===0; })) return svgGhostBars(values.length, h);
    var max = Math.max.apply(null, values.concat([1]));
    var bw = Math.floor(100 / values.length) - 2;
    var bars = values.map(function(v, i) {
      var bh = Math.max(2, Math.floor((v/max)*(h-6)));
      return '<rect x="'+(i*(bw+2)+1)+'" y="'+(h-bh)+'" width="'+bw+'" height="'+bh+'" rx="2" fill="'+color+'" opacity="'+(v===max?'1':'0.6')+'"/>';
    }).join('');
    return '<svg viewBox="0 0 100 '+h+'" preserveAspectRatio="none" style="width:100%;height:'+h+'px;display:block;">'+bars+'</svg>';
  }
  function svgGhostBars(n, h) {
    h = h || 80; n = n || 7;
    var bw = Math.floor(100/n)-2, bars = [];
    for (var i=0;i<n;i++) {
      var bh = 12 + Math.floor(Math.random()*(h-20));
      bars.push('<rect x="'+(i*(bw+2)+1)+'" y="'+(h-bh)+'" width="'+bw+'" height="'+bh+'" rx="2" fill="#E0E0E0"/>');
    }
    return '<svg viewBox="0 0 100 '+h+'" preserveAspectRatio="none" style="width:100%;height:'+h+'px;display:block;">'+bars.join('')+'</svg>';
  }
  function svgSparkline(values, color, h) {
    h = h || 70;
    if (!values||values.length<2) return svgGhostSparkline(h);
    if (values.every(function(v){ return v===0; })) return svgGhostSparkline(h);
    var max = Math.max.apply(null,values.concat([1])), min = Math.min.apply(null,values), range = max-min||1, pad = 4;
    var pts = values.map(function(v,i){
      var x = pad+(i/(values.length-1))*(100-pad*2);
      var y = pad+((1-(v-min)/range)*(h-pad*2));
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 100 '+h+'" preserveAspectRatio="none" style="width:100%;height:'+h+'px;display:block;"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function svgGhostSparkline(h) {
    h = h || 70;
    var pts = ['4,'+(h*0.6),' 14,'+(h*0.4),' 26,'+(h*0.55),' 38,'+(h*0.3),' 50,'+(h*0.5),' 62,'+(h*0.35),' 74,'+(h*0.45),' 86,'+(h*0.3),' 96,'+(h*0.42)].join(' ');
    return '<svg viewBox="0 0 100 '+h+'" preserveAspectRatio="none" style="width:100%;height:'+h+'px;display:block;"><polyline points="'+pts+'" fill="none" stroke="#D0D0D0" stroke-width="1.8" stroke-dasharray="3 2"/></svg>';
  }
  function svgDonut(pct, color, size) {
    size = size || 100;
    var r = size*0.36, cx = size/2, cy = size/2;
    var circ = 2*Math.PI*r, dash = (pct/100)*circ, gap = circ-dash;
    return '<svg viewBox="0 0 '+size+' '+size+'" style="width:'+size+'px;height:'+size+'px;display:block;margin:auto;">'
      +'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#E0E0E0" stroke-width="11"/>'
      +'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="11" stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-dashoffset="'+(circ*0.25).toFixed(1)+'" stroke-linecap="round" transform="rotate(-90 '+cx+' '+cy+')"/>'
      +'<text x="'+cx+'" y="'+(cy+6)+'" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-size="'+(size*0.22)+'" font-weight="700" fill="'+color+'">'+pct+'%</text>'
      +'</svg>';
  }
  function svgGhostDonut(size) {
    size = size || 100;
    var r = size*0.36, cx = size/2, cy = size/2;
    return '<svg viewBox="0 0 '+size+' '+size+'" style="width:'+size+'px;height:'+size+'px;display:block;margin:auto;">'
      +'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#E0E0E0" stroke-width="11"/>'
      +'<text x="'+cx+'" y="'+(cy+5)+'" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-size="'+(size*0.15)+'" fill="#CCCCCC">No data</text>'
      +'</svg>';
  }

  // ── PANEL BUILDER ──
  function buildPanel(id, icon, name, price, isActive, toolUrl, lastUpdated, kpisHtml, chartLabel, chartHtml, secondaryHtml) {
    var badge = isActive
      ? '<span class="badge badge-live">Live</span>'
      : '<span class="badge badge-inactive">Not Activated</span>';
    var headerRight = isActive
      ? '<button class="widget-refresh" data-panel="'+id+'" title="Refresh">&#8635;</button>'
          + ' <a href="'+toolUrl+'" style="color:var(--orange);font-size:12px;font-weight:600;text-decoration:none;">Open Tool</a>'
      : '<a href="panel-auth.html?tool='+id+'" class="btn-activate-header">Learn More</a><button class="btn-activate-header btn-activate-cta" data-toolid="'+id+'">Activate</button>';
    var banner = '<div class="sample-banner">\ud83d\udd14 Sample data &mdash; activate this tool to see your live results</div>';
    var footer = isActive
      ? '<div class="widget-footer"><span>'+(lastUpdated||'')+'</span><a href="'+toolUrl+'">Open Tool</a></div>'
      : '<div class="widget-footer"><span></span></div>';
    return '<div class="widget-header">'
        +'<span class="widget-icon">'+icon+'</span>'
        +'<span class="widget-title">'+name+'</span>'
        +badge
        +'<span style="margin-left:auto;display:flex;align-items:center;gap:8px;">'+headerRight+'</span>'
      +'</div>'
      +banner
      +'<div class="widget-body">'
        +'<div class="panel-kpis">'+kpisHtml+'</div>'
        +'<div class="panel-chart">'
          +'<div class="chart-label">'+chartLabel+'</div>'
          +'<div class="chart-wrap">'+chartHtml+'</div>'
        +'</div>'
        +'<div class="panel-secondary">'+secondaryHtml+'</div>'
      +'</div>'
      +footer;
  }

  function kpi(val, lbl) {
    return '<div class="kpi-tile"><div class="kpi-val">'+val+'</div><div class="kpi-lbl">'+lbl+'</div></div>';
  }
  function secLabel(text) {
    return '<div class="secondary-label">'+text+'</div>';
  }
  function secRow(dotClass, primary, sub, time) {
    return '<div class="sec-row">'
      +(dotClass ? '<span class="dot '+dotClass+'"></span>' : '')
      +'<span class="sec-row-main">'
        +'<div class="sec-row-primary">'+primary+'</div>'
        +(sub ? '<div class="sec-row-sub">'+sub+'</div>' : '')
      +'</span>'
      +(time ? '<span class="sec-row-time">'+time+'</span>' : '')
    +'</div>';
  }

  // ── SAMPLE DATA ──
  var SAMPLE = {
    social: {
      stats: { thisMonth: 14, published: 11, pending: 3 },
      chart: [2, 3, 4, 5],
      rows: [
        { text: 'New season pool heating install...', sub: 'Tomorrow 9am' },
        { text: 'Calling all pool owners \u2014 summer...', sub: 'Wed 10am' },
        { text: 'New outdoor area just completed...', sub: 'Fri 2pm' },
      ]
    },
    email: {
      stats: { total: 47, high: 8, actioned: 5 },
      urgencyPct: 17,
      rows: [
        { urgency: 'high',   sender: 'Reece Plumbing Supplies', subject: 'Price increase \u2014 effective 1 April' },
        { urgency: 'medium', sender: 'ATO',                     subject: 'BAS statement now available' },
        { urgency: 'medium', sender: 'Jim\'s Plumbing Geelong', subject: 'RE: Subcontractor availability' },
        { urgency: 'low',    sender: 'Trade Licence Board',     subject: 'Annual renewal reminder' },
        { urgency: 'low',    sender: 'Reece Plumbing Supplies', subject: 'New product catalogue' },
      ]
    },
    chatbot: {
      stats: { today: 4, week: 23, faq: 2 },
      chart: [1,2,3,1,4,2,3,5,2,4,3,2,4,3],
      rows: [
        { name: 'Sarah M.',  excerpt: 'Do you service Tarneit?', time: '2h ago' },
        { name: 'Anonymous', excerpt: 'What\'s your call-out fee on weekends?', time: '4h ago' },
        { name: 'Dave K.',   excerpt: 'Quote for full rewire?', time: 'Yesterday' },
      ]
    },
    newsDigest: {
      stats: { week: 12, lastDigest: '14 Mar 2026', sources: 6 },
      chart: [2,1,3,2,4,1,2],
      rows: [
        { headline: 'Copper pipe shortage warning from MBA Vic', source: 'MBA Vic' },
        { headline: 'New waterproofing compliance from 1 July', source: 'ABCB' },
        { headline: 'Reece announces 8% copper fittings increase', source: 'Reece Trade' },
        { headline: 'Apprentice wage rates updated', source: 'Fair Work' },
        { headline: '240 new lots approved in Tarneit estate', source: 'Wyndham Council' },
      ]
    },
    bi: {
      stats: { insights: 8, tools: 5, lastAnalysis: '13 Mar 2026' },
      chart: [1,2,1,3,2,1,2,3,2,4,3,2,3,4,3,2,3,4,5,4,3,4,5,4,3,4,5,6,5,4],
      insight: { headline: '3 competitors reduced pricing this month', summary: 'Consider a targeted promotion before Easter.' },
    },
    strategic: {
      stats: { pct: 68, done: 17, total: 25, daysLeft: 34 },
      actions: [
        { status: 'in_progress', title: 'Update website services page', due: '18 Mar' },
        { status: 'not_started', title: 'Submit tender for council contract', due: '22 Mar' },
        { status: 'not_started', title: 'Renew trade insurance', due: '31 Mar' },
      ]
    }
  };

  // ── WIDGET RENDERS ──

  async function renderSocial(userId, isActive) {
    var s, rows, chart;
    if (isActive) {
      try {
        var res = await supabaseClient.from('social_posts')
          .select('id, caption, scheduled_at, status, created_at')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
        var all = res.data || [];
        var pub = all.filter(function(r){ return r.status==='published'; });
        var pend = all.filter(function(r){ return r.status==='pending_review'; });
        var wk = [0,0,0,0];
        pub.forEach(function(r){ var w=Math.floor((Date.now()-new Date(r.created_at))/604800000); if(w<4) wk[3-w]++; });
        s = { thisMonth: all.length, published: pub.length, pending: pend.length };
        chart = wk;
        rows = pend.slice(0,3).map(function(p){
          return { text: p.caption ? p.caption.substring(0,40)+(p.caption.length>40?'\u2026':'') : '(no caption)', sub: p.scheduled_at ? fmtShort(p.scheduled_at) : '' };
        });
        if (!rows.length && pub.length) {
          rows = [{ text: pub[0].caption ? pub[0].caption.substring(0,40)+'\u2026' : '(published)', sub: 'Last published '+fmtShort(pub[0].created_at) }];
        }
      } catch(e) { s = SAMPLE.social.stats; chart = SAMPLE.social.chart; rows = SAMPLE.social.rows; }
    } else { s = SAMPLE.social.stats; chart = SAMPLE.social.chart; rows = SAMPLE.social.rows; }

    var kpis = kpi(s.thisMonth,'This Month') + kpi(s.published,'Published') + kpi(s.pending,'Pending');
    var chartHtml = svgBars(chart, '#C4622A', 90);
    var sec = secLabel('Pending Review') + (rows.length ? rows.map(function(r){ return secRow('dot-orange','<span style="font-size:11px;color:var(--text);">'+r.text+'</span>','<span style="font-size:10px;color:var(--muted);">'+r.sub+'</span>',''); }).join('') : '<div class="sec-row" style="font-size:12px;color:var(--muted);">No posts pending</div>');

    var el = document.getElementById('panel-social');
    if (!el) return;
    if (!isActive) el.classList.add('inactive');
    el.innerHTML = buildPanel('social','\ud83d\udcf1','Marketing & Social Media','$79',isActive,'social.html','','',kpis,'Posts/week',chartHtml,sec);
  }

  async function renderEmail(userId, isActive) {
    var s, rows, pct;
    if (isActive) {
      try {
        var res = await supabaseClient.from('email_summaries')
          .select('id, sender, subject, urgency, created_at')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
        var all = res.data || [];
        var high = all.filter(function(r){ return r.urgency==='high'; });
        s = { total: all.length, high: high.length, actioned: 0 };
        pct = all.length ? Math.round((high.length/all.length)*100) : 0;
        rows = all.slice(0,5).map(function(r){ return { urgency: r.urgency, sender: r.sender||'', subject: r.subject||'' }; });
        if (!all.length) { s = SAMPLE.email.stats; pct = SAMPLE.email.urgencyPct; rows = SAMPLE.email.rows; }
      } catch(e) { s = SAMPLE.email.stats; pct = SAMPLE.email.urgencyPct; rows = SAMPLE.email.rows; }
    } else { s = SAMPLE.email.stats; pct = SAMPLE.email.urgencyPct; rows = SAMPLE.email.rows; }

    var kpis = kpi(s.total,'Total Emails') + kpi(s.high,'High Priority') + kpi(s.actioned,'Actioned Today');
    var chartHtml = '<div class="donut-wrap">'+svgDonut(pct,'#C62828',110)+'</div>';
    var sec = secLabel('Recent Emails') + rows.slice(0,5).map(function(r){
      var dc = r.urgency==='high' ? 'dot-red' : r.urgency==='medium' ? 'dot-amber' : 'dot-green';
      var s2 = r.sender.length > 18 ? r.sender.substring(0,18)+'\u2026' : r.sender;
      return secRow(dc, s2, r.subject.length>28?r.subject.substring(0,28)+'\u2026':r.subject, '');
    }).join('');

    var el = document.getElementById('panel-email');
    if (!el) return;
    if (!isActive) el.classList.add('inactive');
    el.innerHTML = buildPanel('email','\ud83d\udce7','AI Email Assistant','$59',isActive,'email-assistant.html','','',kpis,'Urgency breakdown',chartHtml,sec);
  }

  async function renderChatbot(userId, isActive) {
    var s, chart, rows;
    if (isActive) {
      try {
        var today = new Date(); today.setHours(0,0,0,0);
        var wkAgo = new Date(Date.now()-7*86400000);
        var ftAgo = new Date(Date.now()-14*86400000);
        var [tr,wr,rr,fr,dr] = await Promise.all([
          supabaseClient.from('chatbot_interactions').select('id',{count:'exact',head:true}).eq('user_id',userId).gte('created_at',today.toISOString()),
          supabaseClient.from('chatbot_interactions').select('id',{count:'exact',head:true}).eq('user_id',userId).gte('created_at',wkAgo.toISOString()),
          supabaseClient.from('chatbot_interactions').select('visitor_name,message_excerpt,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(3),
          supabaseClient.from('learned_faqs').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('status','pending'),
          supabaseClient.from('chatbot_interactions').select('created_at').eq('user_id',userId).gte('created_at',ftAgo.toISOString())
        ]);
        var dc = []; for(var d=0;d<14;d++) dc.push(0);
        (dr.data||[]).forEach(function(r){ var da=Math.floor((Date.now()-new Date(r.created_at))/86400000); if(da<14) dc[13-da]++; });
        s = { today: tr.count||0, week: wr.count||0, faq: fr.count||0 };
        chart = dc;
        rows = (rr.data||[]).map(function(r){ return { name: r.visitor_name||'Anonymous', excerpt: r.message_excerpt||'', time: ago(r.created_at) }; });
        if (!tr.count && !wr.count) { s=SAMPLE.chatbot.stats; chart=SAMPLE.chatbot.chart; rows=SAMPLE.chatbot.rows; }
      } catch(e) { s=SAMPLE.chatbot.stats; chart=SAMPLE.chatbot.chart; rows=SAMPLE.chatbot.rows; }
    } else { s=SAMPLE.chatbot.stats; chart=SAMPLE.chatbot.chart; rows=SAMPLE.chatbot.rows; }

    var kpis = kpi(s.today,'Leads Today') + kpi(s.week,'This Week') + kpi(s.faq,'FAQ Pending');
    var chartHtml = svgSparkline(chart,'#C4622A',90);
    var sec = secLabel('Recent Enquiries') + (rows.length ? rows.map(function(r){
      return secRow('dot-blue', r.name, r.excerpt.length>28?r.excerpt.substring(0,28)+'\u2026':r.excerpt, r.time);
    }).join('') : '<div class="sec-row" style="font-size:12px;color:var(--muted);">No enquiries yet</div>');

    var el = document.getElementById('panel-chatbot');
    if (!el) return;
    if (!isActive) el.classList.add('inactive');
    el.innerHTML = buildPanel('chatbot','\ud83d\udcac','AI Website Chatbot','$79',isActive,'chatbot.html','','',kpis,'14-day lead trend',chartHtml,sec);
  }

  async function renderNews(userId, isActive) {
    var s, chart, rows;
    if (isActive) {
      try {
        var res = await supabaseClient.from('news_digest_items')
          .select('id, headline, source, created_at')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
        var all = res.data || [];
        var dc = [0,0,0,0,0,0,0];
        all.forEach(function(r){ var da=Math.floor((Date.now()-new Date(r.created_at))/86400000); if(da<7) dc[6-da]++; });
        var wkCount = dc.reduce(function(a,b){ return a+b; }, 0);
        s = { week: wkCount, lastDigest: all.length ? fmtShort(all[0].created_at) : '—', sources: 6 };
        chart = dc;
        rows = all.slice(0,5).map(function(r){ return { headline: r.headline||'', source: r.source||'' }; });
        if (!all.length) { s=SAMPLE.newsDigest.stats; chart=SAMPLE.newsDigest.chart; rows=SAMPLE.newsDigest.rows; }
      } catch(e) { s=SAMPLE.newsDigest.stats; chart=SAMPLE.newsDigest.chart; rows=SAMPLE.newsDigest.rows; }
    } else { s=SAMPLE.newsDigest.stats; chart=SAMPLE.newsDigest.chart; rows=SAMPLE.newsDigest.rows; }

    var kpis = kpi(s.week,'This Week') + kpi(s.lastDigest,'Last Digest') + kpi(s.sources,'Sources');
    var chartHtml = svgBars(chart,'#4A6D8C',90);
    var sec = secLabel('Latest Stories') + rows.slice(0,5).map(function(r){
      var hl = r.headline.length>32 ? r.headline.substring(0,32)+'\u2026' : r.headline;
      return secRow('','<span style="font-size:11px;">'+hl+'</span>','<span style="font-size:10px;color:var(--muted);">'+r.source+'</span>','');
    }).join('');

    var el = document.getElementById('panel-news-digest');
    if (!el) return;
    if (!isActive) el.classList.add('inactive');
    el.innerHTML = buildPanel('news-digest','\ud83d\udcf0','Industry News Digest','$59',isActive,'news-digest.html','','',kpis,'Stories per day (7 days)',chartHtml,sec);
  }

  async function renderBI(userId, isActive) {
    var s, chart, insight;
    s = SAMPLE.bi.stats; chart = SAMPLE.bi.chart; insight = SAMPLE.bi.insight;
    if (isActive) {
      try {
        var pr = await supabaseClient.from('profiles').select('active_tools').eq('id',userId).single();
        var toolCount = (pr.data && pr.data.active_tools) ? pr.data.active_tools.length : s.tools;
        s = { insights: s.insights, tools: toolCount, lastAnalysis: s.lastAnalysis };
      } catch(e) {}
    }

    var kpis = kpi(s.insights,'Insights/Month') + kpi(s.tools,'Tools Active') + kpi(s.lastAnalysis,'Last Analysis');
    var chartHtml = svgSparkline(chart,'#4A6D8C',90);
    var sec = secLabel('Latest Insight')
      + '<div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.3;margin-bottom:4px;">'+insight.headline+'</div>'
      + '<div style="font-size:11px;color:var(--muted);line-height:1.4;">'+insight.summary+'</div>';

    var el = document.getElementById('panel-bi');
    if (!el) return;
    if (!isActive) el.classList.add('inactive');
    el.innerHTML = buildPanel('bi','\ud83e\udde0','Business Intelligence Dashboard','$89',isActive,'dashboard.html','','',kpis,'30-day insight activity',chartHtml,sec);
  }

  async function renderStrategic(userId, isActive) {
    var s, actions;
    if (isActive) {
      try {
        var pr = await supabaseClient.from('strategic_plans').select('id,cycle_end_date').eq('user_id',userId).order('created_at',{ascending:false}).limit(1);
        if (pr.data && pr.data.length) {
          var plan = pr.data[0];
          var ar = await supabaseClient.from('action_tracker').select('id,title,due_date,status').eq('user_id',userId).eq('plan_id',plan.id).order('due_date',{ascending:true}).limit(20);
          var acts = ar.data || [];
          var done = acts.filter(function(a){ return a.status==='complete'; }).length;
          var daysLeft = plan.cycle_end_date ? Math.max(0,Math.ceil((new Date(plan.cycle_end_date)-Date.now())/86400000)) : SAMPLE.strategic.stats.daysLeft;
          s = { pct: acts.length?Math.round((done/acts.length)*100):0, done:done, total:acts.length, daysLeft:daysLeft };
          actions = acts.filter(function(a){ return a.status!=='complete'; }).slice(0,3).map(function(a){ return { status:a.status, title:a.title, due:fmtShort(a.due_date) }; });
          if (!acts.length) { s=SAMPLE.strategic.stats; actions=SAMPLE.strategic.actions; }
        } else { s=SAMPLE.strategic.stats; actions=SAMPLE.strategic.actions; }
      } catch(e) { s=SAMPLE.strategic.stats; actions=SAMPLE.strategic.actions; }
    } else { s=SAMPLE.strategic.stats; actions=SAMPLE.strategic.actions; }

    var kpis = kpi(s.pct+'%','Complete') + kpi(s.done+' / '+s.total,'Actions') + kpi(s.daysLeft,'Days Left');
    var chartHtml = '<div class="donut-wrap">'+(isActive && s.total>0 ? svgDonut(s.pct,'#C4622A',110) : svgDonut(s.pct,'#C4622A',110))+'</div>';
    var sec = secLabel('Upcoming Actions') + (actions.length ? actions.map(function(a){
      var dc = a.status==='in_progress' ? 'dot-amber' : 'dot-green';
      var t = a.title.length>26?a.title.substring(0,26)+'\u2026':a.title;
      return secRow(dc, t, '', a.due);
    }).join('') : '<div class="sec-row" style="font-size:12px;color:var(--muted);">No actions yet</div>');

    var el = document.getElementById('panel-strategic-plan');
    if (!el) return;
    if (!isActive) el.classList.add('inactive');
    el.innerHTML = buildPanel('strategic-plan','\ud83d\uddfa\ufe0f','Strategic Plan & Operations','$69',isActive,'strategic-plan.html','','',kpis,'90-day plan progress',chartHtml,sec);
  }

  // ── REFRESH WIRING ──
  function wireRefresh(userId, activeTools) {
    document.querySelector('.panel-grid').addEventListener('click', function(e) {
      var btn = e.target.closest('.widget-refresh');
      if (!btn) return;
      var pid = btn.getAttribute('data-panel');
      var isActive = activeTools.indexOf(pid) !== -1;
      var renders = { 'social': renderSocial, 'email': renderEmail, 'chatbot': renderChatbot, 'news-digest': renderNews, 'bi': renderBI, 'strategic-plan': renderStrategic };
      if (renders[pid]) {
        var el = document.getElementById('panel-'+pid);
        if (el) el.innerHTML = '<div class="panel-loading">Refreshing\u2026</div>';
        renders[pid](userId, isActive);
      }
    });
  }

  // ── RENDER ALL ──
  async function renderAll(userId, activeTools) {
    var isActive = function(id) { return activeTools.indexOf(id) !== -1; };
    await Promise.all([
      renderSocial(userId, isActive('social')),
      renderEmail(userId, isActive('email')),
      renderChatbot(userId, isActive('chatbot')),
      renderNews(userId, isActive('news-digest')),
      renderBI(userId, isActive('bi')),
      renderStrategic(userId, isActive('strategic-plan')),
    ]);
    wireRefresh(userId, activeTools);
  }

  // Wire activate buttons via event delegation
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-activate-cta');
    if (!btn) return;
    var toolId = btn.getAttribute('data-toolid');
    if (!toolId) return;
    if (window.DASH_DATA && typeof window.DASH_DATA.activateTool === 'function') {
      window.DASH_DATA.activateTool(toolId);
    }
  });

  return { renderAll: renderAll };

})();
