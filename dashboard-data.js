window.DASH_DATA = (function() {

  var _supabase, _user, _profile, _activeTools;
  var _resolvedPrices = null;

  // Tool catalog mirrors tools-data.js for the Your Stax section.
  // Note: dashboard-data.js maintains its own copy per CLAUDE.md (codebase quirk).
  var TOOLS = [
    { id: 'social',         icon: '📱', name: 'Marketing & Social Media Manager', desc: 'AI builds your posts, graphics and marketing content — auto-posts to Facebook and Instagram', price: '$69',  status: 'built',   url: '/social',         settingsUrl: '/social-settings.html',            priceId: 'price_1TEQg8HnoVvjo5gxkxUaFrok', benefit: 'Works great with Content Library' },
    { id: 'email',          icon: '📧', name: 'AI Email Assistant',               desc: 'AI reads your Gmail and Outlook — summarised on one smart dashboard',                          price: '$39',  status: 'built',   url: '/email',          settingsUrl: '/email-assistant-settings.html',   priceId: 'price_1TQLhHHnoVvjo5gxnwUQQYwM', benefit: 'Feeds into BI insights' },
    { id: 'chatbot',        icon: '💬', name: 'AI Website Chatbot',               desc: 'AI chatbot for your website — answers customers, qualifies leads, books jobs — 24/7',     price: '$69',  status: 'built',   url: '/chatbot',        settingsUrl: '/chatbot-settings.html',           priceId: 'price_1TRlgkHnoVvjo5gxXR6NMrkR', benefit: 'Uses your Content Library' },
    { id: 'news-digest',    icon: '📰', name: 'Industry News Digest',             desc: 'Industry news, regulation changes, supplier updates — AI-summarised on one dashboard',          price: '$39',  status: 'built',   url: '/news',           settingsUrl: '/news-digest-settings.html',       priceId: 'price_1TQLehHnoVvjo5gxjv8cH40m', benefit: 'Feeds into BI insights' },
    { id: 'bi',             icon: '🧠', name: 'Business Intelligence Dashboard',  desc: 'AI-powered insights driven by your business data, your industry, your region',                      price: '$69',  status: 'built',   url: '/bi.html',        settingsUrl: null,                               priceId: 'price_1T4dClHnoVvjo5gxjSvoi4ky', benefit: 'Uses your Content Library' },
    { id: 'strategic-plan', icon: '🗺️', name: 'Strategic Plan & Operations', desc: 'Create your roadmap in minutes from a simple AI-guided interview',                                  price: '$69',  status: 'built',   url: '/strategy',       settingsUrl: null,                               priceId: 'price_1TB7DDHnoVvjo5gxgLzZbego', benefit: 'Works great with BI Dashboard' },
    { id: 'design-viz',     icon: '🎨', name: 'Design Visualiser',                desc: 'AI-generated concept renders from a brief — show customers what the finished job looks like',   price: '$69',  status: 'built',   url: '/design',         settingsUrl: '/design-viz-settings.html',        priceId: 'price_1TQLbEHnoVvjo5gxIuSSm7tH', benefit: 'Uses your Content Library' },
    { id: 'tender',         icon: '📋', name: 'Tender Response Generator',        desc: 'AI reads the tender brief and generates a full professional response — ready to submit',       price: '$69',  status: 'pending', url: '/panel?tool=tender',          settingsUrl: null, priceId: 'price_1TEQjVHnoVvjo5gxfyLbHE3M', benefit: '' },
    { id: 'quote-enhancer', icon: '💰', name: 'Quote Enhancer',                   desc: 'Turn your prices into a professional branded quote with AI-written scope of works',                 price: '$59',  status: 'pending', url: '/panel?tool=quote-enhancer', settingsUrl: null, priceId: 'price_1TB8QZHnoVvjo5gxwL0GKduI', benefit: '' },
    { id: 'swms',           icon: '🦺', name: 'SWMS & Safety Docs',               desc: 'AI generates compliant Safe Work Method Statements tailored to your trade and job',                 price: '$59',  status: 'pending', url: '/panel?tool=swms',            settingsUrl: null, priceId: 'price_1TB8RNHnoVvjo5gxPb5wxUuF', benefit: '' },
    { id: 'customer-updates',icon:'📲', name: 'Customer Progress Updates',        desc: 'Keep customers informed automatically with AI-generated job progress updates',                      price: '$59',  status: 'pending', url: '/panel?tool=customer-updates', settingsUrl: null, priceId: 'price_1TB8S6HnoVvjo5gxVYoEezlN', benefit: '' },
    { id: 'handover-docs',  icon: '📁', name: 'Handover Documentation',           desc: 'Professional handover packs generated from your job data — warranties, compliance, sign-off',  price: '$59',  status: 'pending', url: '/panel?tool=handover-docs',  settingsUrl: null, priceId: 'price_1TB8ShHnoVvjo5gxrGBAMHZL', benefit: '' },
    { id: 'review-booster', icon: '⭐',       name: 'Review & Referral Booster',        desc: 'AI identifies the right moment to ask for reviews and referrals — and writes the message',     price: '$39',  status: 'pending', url: '/panel?tool=review-booster', settingsUrl: null, priceId: 'price_1TB8TFHnoVvjo5gxkF2QMzJa', benefit: '' }
  ];

  // Photo Capture preset → tool mapping (per Dashboard Redesign Spec 4.3)
  var PHOTO_PRESETS = [
    { id: 'social',           label: 'Job Completion — Social Media',     toolUrl: '/social',           tag: 'social' },
    { id: 'customer-updates', label: 'Job Completion — Customer Progress', toolUrl: '/panel?tool=customer-updates', tag: 'customer-updates' },
    { id: 'swms',             label: 'Site Issue — SWMS',                  toolUrl: '/panel?tool=swms',  tag: 'swms' },
    { id: 'tender',           label: 'Job Completion — Tender Response',  toolUrl: '/panel?tool=tender', tag: 'tender' }
  ];

  async function loadLivePrices() {
    try {
      var r = await fetch('/api/get-prices');
      if (!r.ok) return null;
      var d = await r.json();
      return d && d.prices ? d.prices : null;
    } catch (e) { return null; }
  }

  function resolveLivePrices(livePriceMap) {
    if (!livePriceMap) return null;
    var resolved = {};
    for (var i = 0; i < TOOLS.length; i++) {
      var t = TOOLS[i];
      if (t.status !== 'built') continue;
      if (!t.priceId) return null;
      if (!livePriceMap[t.priceId]) return null;
      resolved[t.id] = livePriceMap[t.priceId];
    }
    return resolved;
  }

  function getDisplayPrice(tool) {
    if (_resolvedPrices && _resolvedPrices[tool.id]) return _resolvedPrices[tool.id];
    return tool.price + '/mth';
  }

  // ── INIT ──
  async function init(supabase, user) {
    _supabase = supabase;
    _user = user;

    _resolvedPrices = resolveLivePrices(await loadLivePrices());

    var pr = await _supabase.from('profiles')
      .select('activated_tools, trial_expires_at, is_trial, bundle_tier, business_name')
      .eq('id', user.id).single();

    if (pr.error) {
      console.error('[Dashboard] Profile query error:', pr.error.message || pr.error);
    }
    _profile = (pr.data) ? pr.data : {};
    _activeTools = Array.isArray(_profile.activated_tools) ? _profile.activated_tools : [];

    var bp = await _supabase.from('profiles')
      .select('abn, business_structure, industry, years_in_business, logo_url, address_name, address_street, address_suburb, address_state, address_postcode, additional_phones, service_area, trading_hours, bp_services, bp_products, payment_methods, response_time, warranty_info, complaints_handling, after_hours_support, marketing_theme_awareness, marketing_theme_differentiators, marketing_theme_feeling, tone_of_voice, primary_brand_colour')
      .eq('id', user.id).single();
    if (bp.data) {
      Object.keys(bp.data).forEach(function(k) { _profile[k] = bp.data[k]; });
    }

    setHeading();
    renderTrialBanner(_profile);
    showBPModal();
    await renderZone1(user.id, _activeTools);
    wirePhotoCapture();
    wireTileToggles();

    if (window.DASH_WIDGETS && typeof window.DASH_WIDGETS.renderAll === 'function') {
      await window.DASH_WIDGETS.renderAll(_supabase, user.id, _activeTools);
    }

    renderYourStax(_activeTools);
    wireTabSwitching();
    wireActivateButtons();
    wireToolBlocker();
  }

  function setHeading() {
    var el = document.getElementById('dash-heading');
    if (!el) return;
    var companyName = _profile.business_name || '';
    el.textContent = companyName ? 'Dashboard — ' + companyName : 'Dashboard';
  }

  // ── BP COMPLETION CHECK ──
  var _bpComplete = false;
  var _bpMissing = [];

  function checkBPComplete(p) {
    if (!p) return false;
    var hasText = function(k) {
      var v = p[k];
      if (v === null || v === undefined || v === '') return false;
      if (typeof v === 'number') return true;
      if (typeof v === 'string') return v.trim() !== '';
      return false;
    };
    var hasArr = function(k) { return Array.isArray(p[k]) && p[k].length > 0; };
    var hasJson = function(k) {
      var v = p[k];
      if (Array.isArray(v) && v.length > 0) return true;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return v.type && typeof v.type === 'string' && v.type.trim() !== '';
      }
      return false;
    };
    var hasPhone = function() { return Array.isArray(p.additional_phones) && p.additional_phones.length > 0; };

    var checks = [
      { panel: 'Identity',                test: hasText('business_name'),       label: 'Business Name' },
      { panel: 'Identity',                test: hasText('abn'),                 label: 'ABN' },
      { panel: 'Identity',                test: hasText('business_structure'),  label: 'Business Structure' },
      { panel: 'Identity',                test: hasArr('industry'),             label: 'Industry (at least one)' },
      { panel: 'Identity',                test: hasText('logo_url'),            label: 'Business Logo' },
      { panel: 'Identity',                test: hasText('years_in_business'),   label: 'Years in Business' },
      { panel: 'Location & Contact',      test: hasText('address_name'),        label: 'Location Name' },
      { panel: 'Location & Contact',      test: hasText('address_street'),      label: 'Street Address' },
      { panel: 'Location & Contact',      test: hasText('address_suburb'),      label: 'Suburb' },
      { panel: 'Location & Contact',      test: hasText('address_state'),       label: 'State' },
      { panel: 'Location & Contact',      test: hasText('address_postcode'),    label: 'Postcode' },
      { panel: 'Location & Contact',      test: hasPhone(),                     label: 'Phone Number (at least one)' },
      { panel: 'Location & Contact',      test: hasArr('service_area'),         label: 'Service Area' },
      { panel: 'Location & Contact',      test: hasJson('trading_hours'),       label: 'Trading Hours' },
      { panel: 'Services',                test: hasArr('bp_services'),           label: 'Services (at least one)' },
      { panel: 'Products',                test: hasArr('bp_products'),            label: 'Products (at least one)' },
      { panel: 'Credentials & Support',   test: hasArr('payment_methods'),       label: 'Payment Methods' },
      { panel: 'Credentials & Support',   test: hasText('response_time'),        label: 'Response Time' },
      { panel: 'Credentials & Support',   test: hasText('warranty_info'),        label: 'Warranty / Guarantee' },
      { panel: 'Credentials & Support',   test: hasText('complaints_handling'),  label: 'Complaints Handling' },
      { panel: 'Credentials & Support',   test: hasJson('after_hours_support'),  label: 'After-Hours Support' },
      { panel: 'Marketing Theme',         test: hasText('marketing_theme_differentiators'), label: 'What Makes You Stand Out' },
      { panel: 'Marketing Theme',         test: hasText('marketing_theme_awareness'),       label: 'What Customers Should Know' },
      { panel: 'Marketing Theme',         test: hasText('marketing_theme_feeling'),         label: 'How Customers Should Feel' },
      { panel: 'Marketing Theme',         test: hasText('tone_of_voice'),                   label: 'Tone of Voice' },
      { panel: 'Marketing Theme',         test: hasText('primary_brand_colour'),             label: 'Primary Brand Colour' }
    ];

    _bpMissing = [];
    for (var i = 0; i < checks.length; i++) {
      if (!checks[i].test) _bpMissing.push(checks[i]);
    }
    return _bpMissing.length === 0;
  }

  function showBPModal() {
    _bpComplete = checkBPComplete(_profile);
    if (_bpComplete) return;

    var modal = document.getElementById('bp-modal');
    if (!modal) return;

    var bodyEl = modal.querySelector('.perm-modal-body');
    if (bodyEl && _bpMissing.length > 0) {
      var grouped = {};
      for (var i = 0; i < _bpMissing.length; i++) {
        var panel = _bpMissing[i].panel;
        if (!grouped[panel]) grouped[panel] = [];
        grouped[panel].push(_bpMissing[i].label);
      }
      var html = '<p style="margin-bottom:16px">To access your tools, please complete these required fields:</p>';
      var panels = Object.keys(grouped);
      for (var j = 0; j < panels.length; j++) {
        html += '<div style="margin-bottom:12px"><div style="font-weight:var(--font-weight-semibold);font-size:var(--label-font-size);color:var(--text);margin-bottom:4px">' + window.escHtml(panels[j]) + '</div>';
        html += '<ul style="margin:0;padding-left:20px;color:var(--text-secondary);font-size:var(--note-font-size);line-height:1.8">';
        for (var k = 0; k < grouped[panels[j]].length; k++) {
          html += '<li>' + window.escHtml(grouped[panels[j]][k]) + '</li>';
        }
        html += '</ul></div>';
      }
      bodyEl.innerHTML = html;
    }

    modal.classList.add('open');

    var dismiss = document.getElementById('bp-modal-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', function() { modal.classList.remove('open'); });
    }
    var ctaBtn = document.getElementById('bp-modal-cta');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function() {
        try { sessionStorage.setItem('tab_state:/content-library.html', 'profile'); } catch (e) {}
        window.location.href = '/content-library.html#profile';
      });
    }
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  function wireToolBlocker() {
    if (_bpComplete) return;

    var toolUrls = ['/social', '/email', '/chatbot', '/news', '/bi.html', '/strategy', '/design',
      '/social-settings', '/email-assistant-settings', '/chatbot-settings', '/news-digest-settings',
      '/design-viz-settings', '/panel'];

    function isToolLink(href) {
      if (!href) return false;
      for (var i = 0; i < toolUrls.length; i++) {
        if (href.indexOf(toolUrls[i]) !== -1) return true;
      }
      return false;
    }

    document.addEventListener('click', function(e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!isToolLink(href)) return;

      e.preventDefault();
      var modal = document.getElementById('bp-modal');
      if (modal) modal.classList.add('open');
    });
  }

  // ── TRIAL BANNER ──
  function renderTrialBanner(profile) {
    var banner = document.getElementById('trial-banner');
    var msg = document.getElementById('trial-banner-msg');
    var cta = document.getElementById('trial-banner-cta');
    var dismiss = document.getElementById('trial-banner-dismiss');
    if (!banner || !profile) return;
    if (!profile.is_trial || !profile.trial_expires_at) return;
    if (sessionStorage.getItem('trial_banner_dismissed') === 'true') return;

    var now = new Date();
    var expires = new Date(profile.trial_expires_at);
    var daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    var bannerMsg;

    if (daysLeft <= 0) bannerMsg = 'Your trial has ended. Subscribe to reactivate your tools.';
    else if (daysLeft <= 1) bannerMsg = 'Your free trial ends tomorrow.';
    else if (daysLeft <= 3) bannerMsg = daysLeft + ' days left on your free trial.';
    else if (daysLeft <= 7) bannerMsg = 'Your free trial ends in ' + daysLeft + ' days. Subscribe to keep your Stax.';
    else return;

    msg.textContent = bannerMsg;
    banner.classList.add('visible');

    var tier = profile.bundle_tier;
    cta.addEventListener('click', function() {
      if (tier === 'stax3' || tier === 'stax6') {
        window.location.href = '/subscribe-confirm.html?tier=' + tier;
      } else {
        window.location.href = '/api/create-checkout?tier=' + (tier || 'individual');
      }
    });
    dismiss.addEventListener('click', function() {
      sessionStorage.setItem('trial_banner_dismissed', 'true');
      banner.classList.remove('visible');
    });
  }

  // ── ZONE 1: Content Library + Email Assistant + BI Dashboard placeholder ──
  async function renderZone1(userId, activeTools) {
    var container = document.getElementById('zone-1');
    if (!container) return;

    var clHtml = await renderCLTile(userId);
    var eaHtml = await renderEATile(userId, activeTools);
    var biHtml = renderBIPlaceholder();

    container.innerHTML = clHtml + eaHtml + biHtml;

    wireEATabs(container);
  }

  // BI Dashboard placeholder — shown in Zone 1 until test data is populated
  function renderBIPlaceholder() {
    var html = '<div class="tile-card" data-tile="bi">';
    html += '<a href="/bi.html" class="dash-tile-header">';
    html += '<span class="profile-section-icon">🧠</span>';
    html += '<span class="profile-section-title" style="flex:1">Business Intelligence</span>';
    html += '</a>';
    html += '<div class="dash-tile-summary">';
    html += '<div class="list-empty" style="padding:8px 0">Coming soon — populate test data to enable.</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // CL tile — pending review count, new outputs this week, colour indicator
  async function renderCLTile(userId) {
    var pendingCount = 0, outputCount = 0;
    try {
      var pending = await _supabase.from('content_library')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'pending').neq('source', 'tool');
      var outputs = await _supabase.from('content_library')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('source', 'tool')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

      if (pending.error) console.error('[Dashboard] CL pending query error:', pending.error.message || pending.error);
      if (outputs.error) console.error('[Dashboard] CL outputs query error:', outputs.error.message || outputs.error);

      pendingCount = pending.count || 0;
      outputCount = outputs.count || 0;
    } catch (e) {
      console.error('[Dashboard] CL tile error:', e.message || e);
    }

    var indicatorClass = 'green';
    var statusText = 'All Clear';
    if (pendingCount >= 20) {
      indicatorClass = 'red';
      statusText = 'Backing Up';
    } else if (pendingCount > 0) {
      indicatorClass = 'amber';
      statusText = 'Items Waiting';
    }

    var badgeColour = indicatorClass === 'green' ? 'green' : (indicatorClass === 'amber' ? 'orange' : 'red');

    var html = '<div class="tile-card">';
    html += '<a href="/content-library.html#review" class="dash-tile-header">';
    html += '<span class="profile-section-icon">📚</span>';
    html += '<span class="profile-section-title" style="flex:1"><span class="dash-cl-dot ' + indicatorClass + '"></span>Content Library</span>';
    html += '<span class="badge badge-' + badgeColour + '">' + window.escHtml(statusText) + '</span>';
    html += '</a>';
    html += '<div class="dash-tile-summary">';
    html += '<a href="/content-library.html#review" class="dash-tile-row">';
    html += '<span class="dash-tile-row-value">' + pendingCount + '</span>';
    html += '<span class="dash-tile-row-label">Pending Review</span>';
    html += '</a>';
    html += '<a href="/content-library.html#outputs" class="dash-tile-row">';
    html += '<span class="dash-tile-row-value">' + outputCount + '</span>';
    html += '<span class="dash-tile-row-label">New Output' + (outputCount === 1 ? '' : 's') + ' This Week</span>';
    html += '</a>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // EA tile — tabs per provider (Gmail/Outlook), urgent/leads/unhandled counts, expand for list.
  // Accounts come from profiles.ea_connected_emails (JSON array). Filtering uses
  // email_summaries.provider; "urgent" = category='urgent', "leads" = category='enquiries'.
  async function renderEATile(userId, activeTools) {
    var html = '<div class="tile-card" data-tile="ea">';
    html += '<a href="/email" class="dash-tile-header">';
    html += '<span class="profile-section-icon">📧</span>';
    html += '<span class="profile-section-title" style="flex:1">Email Assistant</span>';
    html += '</a>';

    if (activeTools.indexOf('email') === -1) {
      html += '<div class="dash-tile-summary"><div class="list-empty">Email Assistant is not yet active. <a href="/panel-auth.html?tool=email">Activate</a> to see your inbox summary here.</div></div>';
      html += '</div>';
      return html;
    }

    // Read connected accounts from profiles.ea_connected_emails (matches email-assistant-logic.js)
    var connectedEmails = [];
    try {
      var pr = await _supabase.from('profiles')
        .select('ea_connected_emails')
        .eq('id', userId).single();
      if (pr.error) console.error('[Dashboard] EA connected_emails query error:', pr.error.message || pr.error);
      connectedEmails = (pr.data && Array.isArray(pr.data.ea_connected_emails)) ? pr.data.ea_connected_emails : [];
    } catch (e) {
      console.error('[Dashboard] EA tile error:', e.message || e);
    }

    if (connectedEmails.length === 0) {
      html += '<div class="dash-tile-summary"><div class="list-empty">No email accounts connected yet. <a href="/email-assistant-settings.html">Connect an account</a>.</div></div>';
      html += '</div>';
      return html;
    }

    // Group by provider — one tab per provider regardless of how many addresses on it
    var providersSet = {};
    connectedEmails.forEach(function(acc) {
      var p = (acc.provider === 'gmail' || acc.provider === 'google') ? 'gmail' : 'outlook';
      if (!providersSet[p]) providersSet[p] = [];
      providersSet[p].push(acc.email);
    });
    var providers = Object.keys(providersSet);

    // Tabs row — uses platform .tab-nav / .ptab pattern
    html += '<div class="tab-nav" data-ea-tabs>';
    providers.forEach(function(provider, idx) {
      var label = provider === 'gmail' ? 'Gmail' : 'Outlook';
      var emails = providersSet[provider];
      if (emails.length > 1) label += ' (' + emails.length + ')';
      html += '<button type="button" class="ptab' + (idx === 0 ? ' active' : '') + '" data-tab="' + window.escHtml(provider) + '">' + window.escHtml(label) + '</button>';
    });
    html += '</div>';

    // Provider panes — uses platform .ptab-content
    for (var i = 0; i < providers.length; i++) {
      var paneHtml = await renderEAProviderPane(userId, providers[i], i === 0);
      html += paneHtml;
    }

    html += '<button type="button" class="dash-tile-toggle" aria-label="Expand details" title="Expand">▾</button>';
    html += '</div>';
    return html;
  }

  async function renderEAProviderPane(userId, provider, isActive) {
    var urgentCount = 0, leadCount = 0, unhandledCount = 0, items = [];
    try {
      var sumRes = await _supabase.from('email_summaries')
        .select('id, sender, sender_email, subject, summary, category, handled, received_at')
        .eq('user_id', userId)
        .eq('provider', provider)
        .order('received_at', { ascending: false }).limit(100);

      if (sumRes.error) console.error('[Dashboard] EA summaries query error:', sumRes.error.message || sumRes.error);
      items = sumRes.data || [];

      items.forEach(function(it) {
        if (it.category === 'urgent' && !it.handled) urgentCount++;
        if (it.category === 'enquiries' && !it.handled) leadCount++;
        if (!it.handled) unhandledCount++;
      });
    } catch (e) {
      console.error('[Dashboard] EA provider pane error:', e.message || e);
    }

    // Detail list — urgent + lead (enquiries) emails, sender + 5-word summary
    var listItems = items.filter(function(it) {
      return !it.handled && (it.category === 'urgent' || it.category === 'enquiries');
    }).slice(0, 6);

    var paneClass = 'ptab-content' + (isActive ? ' active' : '');
    var html = '<div class="' + paneClass + '" data-tab-pane="' + window.escHtml(provider) + '">';

    // Collapsed summary — three metrics laid out horizontally (Urgent / Leads / Unhandled)
    html += '<div class="dash-tile-summary dash-ea-metrics">';
    html += '<a href="/email" class="dash-ea-metric">';
    html += '<span class="dash-ea-metric-value">' + urgentCount + '</span>';
    html += '<span class="dash-ea-metric-label">Urgent</span>';
    html += '</a>';
    html += '<a href="/email" class="dash-ea-metric">';
    html += '<span class="dash-ea-metric-value">' + leadCount + '</span>';
    html += '<span class="dash-ea-metric-label">Lead' + (leadCount === 1 ? '' : 's') + '</span>';
    html += '</a>';
    html += '<a href="/email" class="dash-ea-metric">';
    html += '<span class="dash-ea-metric-value">' + unhandledCount + '</span>';
    html += '<span class="dash-ea-metric-label">Unhandled</span>';
    html += '</a>';
    html += '</div>';

    // Expanded list — sender + subject (no body-summary truncation)
    html += '<div class="dash-tile-detail">';
    if (listItems.length === 0) {
      html += '<div class="list-empty">No urgent emails or leads to show.</div>';
    } else {
      listItems.forEach(function(it) {
        var badgeColour = it.category === 'urgent' ? 'red' : 'green';
        var tagLabel = it.category === 'urgent' ? 'Urgent' : 'Lead';
        var subject = it.subject || '(No subject)';
        html += '<a href="/email?id=' + window.escHtml(it.id) + '" class="dash-ea-email-row">';
        html += '<span class="badge badge-' + badgeColour + '">' + tagLabel + '</span>';
        html += '<span class="dash-ea-email-sender">' + window.escHtml(it.sender || it.sender_email || 'Unknown') + '</span>';
        html += '<span class="text-preview">' + window.escHtml(subject) + '</span>';
        html += '</a>';
      });
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  function wireEATabs(container) {
    var tabSets = container.querySelectorAll('[data-ea-tabs]');
    tabSets.forEach(function(set) {
      var tile = set.closest('.tile-card');
      if (!tile) return;
      set.querySelectorAll('.ptab[data-tab]').forEach(function(tab) {
        tab.addEventListener('click', function(e) {
          e.preventDefault();
          set.querySelectorAll('.ptab').forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          var pane = tab.getAttribute('data-tab');
          tile.querySelectorAll('.ptab-content[data-tab-pane]').forEach(function(p) {
            if (p.getAttribute('data-tab-pane') === pane) p.classList.add('active');
            else p.classList.remove('active');
          });
        });
      });
    });
  }

  // Generic tile expand/collapse toggle
  // Tile expand/collapse — document-level delegation so it works for tiles in
  // either Zone 1 (EA) or Zone 2 (News, Social, Chatbot), regardless of when
  // they're added to the DOM. Wired once during init.
  function wireTileToggles() {
    if (window._stax_tileTogglesWired) return;
    window._stax_tileTogglesWired = true;
    document.addEventListener('click', function(e) {
      var btn = e.target.closest && e.target.closest('.dash-tile-toggle');
      if (!btn) return;
      e.preventDefault();
      var tile = btn.closest('.tile-card');
      if (!tile) return;
      var isOpen = btn.classList.toggle('open');
      btn.setAttribute('aria-label', isOpen ? 'Collapse details' : 'Expand details');
      btn.setAttribute('title', isOpen ? 'Collapse' : 'Expand');
      tile.querySelectorAll('.dash-tile-detail').forEach(function(d) {
        if (isOpen) d.classList.add('open'); else d.classList.remove('open');
      });
    });
  }

  // Photo Capture flow — preset selection → camera → hand off to destination tool.
  // Photo is stashed in sessionStorage as a data URL with the chosen tags;
  // the destination tool reads it and handles its own save with its own tool_source.
  // Dashboard never writes to Content Library on its own.
  function wirePhotoCapture() {
    var btn = document.getElementById('photo-tile-btn');
    var modal = document.getElementById('photo-preset-modal');
    var list = document.getElementById('photo-preset-list');
    var cancel = document.getElementById('photo-preset-cancel');
    var input = document.getElementById('photo-capture-input');
    if (!btn || !modal || !list || !cancel || !input) return;

    list.innerHTML = '';
    PHOTO_PRESETS.forEach(function(preset) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dash-photo-preset-btn';
      b.textContent = preset.label;
      b.setAttribute('data-preset-id', preset.id);
      b.addEventListener('click', function() { startCapture(preset); });
      list.appendChild(b);
    });

    btn.addEventListener('click', function() { modal.classList.add('open'); });
    cancel.addEventListener('click', function() { modal.classList.remove('open'); });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.classList.remove('open');
    });

    input.addEventListener('change', function() {
      var file = input.files && input.files[0];
      if (!file) return;
      var preset = window._stax_pendingPreset;
      if (!preset) return;
      handoffPhotoToTool(file, preset);
      input.value = '';
      window._stax_pendingPreset = null;
    });
  }

  function startCapture(preset) {
    var modal = document.getElementById('photo-preset-modal');
    var input = document.getElementById('photo-capture-input');
    if (!input) return;
    window._stax_pendingPreset = preset;
    if (modal) modal.classList.remove('open');
    input.click();
  }

  // Stashes the captured photo in sessionStorage and navigates to the destination tool.
  // The destination tool is responsible for reading the payload, surfacing any
  // tagging UI, and writing to Content Library with its own tool_source.
  function handoffPhotoToTool(file, preset) {
    if (!_user) { window.showModalError('Could not capture photo — session expired.'); return; }
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var payload = {
          dataUrl: reader.result,
          fileName: file.name || 'photo.jpg',
          contentType: file.type || 'image/jpeg',
          preset: preset.id,
          presetLabel: preset.label,
          tags: [preset.tag],
          capturedAt: new Date().toISOString()
        };
        sessionStorage.setItem('stax_photo_handoff', JSON.stringify(payload));
        window.location.href = preset.toolUrl;
      } catch (e) {
        console.error('[Dashboard] Photo handoff error:', e.message || e);
        window.showModalError('Could not prepare photo. Please try again.');
      }
    };
    reader.onerror = function() {
      console.error('[Dashboard] Photo read error:', reader.error && reader.error.message);
      window.showModalError('Could not read photo. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  // ── ZONE 3: YOUR STAX ──
  function renderYourStax(activeTools) {
    var activeContainer = document.getElementById('dash-tab-active');
    var availableContainer = document.getElementById('dash-tab-available');
    if (!activeContainer || !availableContainer) return;

    var activeHtml = '', availableHtml = '';
    var hasActive = false, hasAvailable = false;

    TOOLS.forEach(function(tool) {
      var isActive = activeTools.indexOf(tool.id) !== -1;
      var isPending = tool.status === 'pending';

      if (isActive) {
        hasActive = true;
        activeHtml += activeCardHtml(tool);
      } else if (isPending) {
        hasAvailable = true;
        availableHtml += comingSoonCardHtml(tool);
      } else {
        hasAvailable = true;
        availableHtml += availableCardHtml(tool);
      }
    });

    if (!hasActive) {
      activeHtml = '<div class="empty-state"><div class="empty-state-icon">📦</div><h3>No active tools yet</h3><p>Check out the Available Tools tab to get started.</p></div>';
    }
    if (!hasAvailable) {
      availableHtml = '<div class="empty-state"><div class="empty-state-icon">✅</div><h3>All tools activated</h3><p>You have access to every available tool.</p></div>';
    }

    activeContainer.innerHTML = '<div class="dash-stax-grid">' + activeHtml + '</div>';
    availableContainer.innerHTML = '<div class="dash-stax-grid">' + availableHtml + '</div>';
  }

  function activeCardHtml(tool) {
    var settingsLink = tool.settingsUrl
      ? '<a href="' + tool.settingsUrl + '" class="dash-stax-settings-link">Settings</a>'
      : '';
    return '<div class="dash-stax-card dash-stax-live">'
      + '<div class="dash-stax-card-top">'
      + '<span class="dash-stax-icon">' + tool.icon + '</span>'
      + '<div class="dash-stax-card-info">'
      + '<span class="dash-stax-name">' + window.escHtml(tool.name) + '</span>'
      + '<span class="profile-section-subtitle">' + window.escHtml(tool.desc) + '</span>'
      + '</div>'
      + '<span class="badge badge-green">Live</span>'
      + '</div>'
      + '<div class="action-row">'
      + '<a href="' + tool.url + '" class="btn-primary btn-sm">Open Tool</a>'
      + settingsLink
      + '</div>'
      + '</div>';
  }

  function availableCardHtml(tool) {
    return '<div class="dash-stax-card dash-stax-available">'
      + '<div class="dash-stax-card-top">'
      + '<span class="dash-stax-icon">' + tool.icon + '</span>'
      + '<div class="dash-stax-card-info">'
      + '<span class="dash-stax-name">' + window.escHtml(tool.name) + '</span>'
      + '<span class="profile-section-subtitle">' + window.escHtml(tool.desc) + '</span>'
      + '</div>'
      + '</div>'
      + '<div class="dash-stax-meta">'
      + '<span class="dash-stax-price">' + getDisplayPrice(tool) + '</span>'
      + (tool.benefit ? '<span class="dash-stax-benefit">' + window.escHtml(tool.benefit) + '</span>' : '')
      + '</div>'
      + '<div class="action-row">'
      + '<a href="/panel-auth.html?tool=' + tool.id + '" class="btn-outline btn-sm">Learn More</a>'
      + '<button class="btn-orange btn-sm dash-activate-btn" data-toolid="' + tool.id + '">Activate</button>'
      + '</div>'
      + '</div>';
  }

  function comingSoonCardHtml(tool) {
    return '<div class="dash-stax-card dash-stax-coming">'
      + '<div class="dash-stax-card-top">'
      + '<span class="dash-stax-icon">' + tool.icon + '</span>'
      + '<div class="dash-stax-card-info">'
      + '<span class="dash-stax-name">' + window.escHtml(tool.name) + '</span>'
      + '<span class="profile-section-subtitle">' + window.escHtml(tool.desc) + '</span>'
      + '</div>'
      + '<span class="badge badge-grey">Coming Soon</span>'
      + '</div>'
      + '</div>';
  }

  function wireTabSwitching() {
    document.querySelectorAll('#zone-3-wrap .ptab[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#zone-3-wrap .ptab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('#zone-3-wrap .ptab-content').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById('dash-tab-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  function activateTool(toolId) {
    var tool = TOOLS.find(function(t) { return t.id === toolId; });
    if (!tool || !tool.priceId || tool.status === 'pending') {
      window.showModalError('Coming Soon — this tool is not yet available for purchase.');
      return;
    }
    if (!_user) { window.location.href = '/login'; return; }
    fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: tool.priceId, userId: _user.id, toolId: toolId })
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Checkout failed');
      return r.json();
    })
    .then(function(data) {
      if (data.url) window.location.href = data.url;
      else window.showModalError('Could not start checkout. Please try again.');
    })
    .catch(function(e) {
      console.error('activateTool error:', e);
      window.showModalError('Could not start checkout. Please try again.');
    });
  }

  function wireActivateButtons() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.dash-activate-btn');
      if (!btn) return;
      var toolId = btn.getAttribute('data-toolid');
      if (toolId) activateTool(toolId);
    });
  }

  return { init: init, activateTool: activateTool };

})();
