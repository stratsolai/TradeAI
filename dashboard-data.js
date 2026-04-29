window.DASH_DATA = (function() {

  var _supabase, _user, _profile, _activeTools;

  var TOOLS = [
    { id: 'social',         icon: '\ud83d\udcf1', name: 'Marketing & Social Media Manager', desc: 'AI builds your posts, graphics and marketing content \u2014 auto-posts to Facebook and Instagram', price: '$79',  status: 'built',   url: '/social',         settingsUrl: '/social-settings.html',            priceId: 'price_1T4dCEHnoVvjo5gxQysf0vQI', benefit: 'Works great with Content Library' },
    { id: 'email',          icon: '\ud83d\udce7', name: 'AI Email Assistant',               desc: 'AI reads your Gmail and Outlook \u2014 summarised on one smart dashboard',                          price: '$59',  status: 'built',   url: '/email',          settingsUrl: '/email-assistant-settings.html',   priceId: 'price_1T4dBcHnoVvjo5gx8EuxX5hL', benefit: 'Feeds into BI insights' },
    { id: 'chatbot',        icon: '\ud83d\udcac', name: 'AI Website Chatbot',               desc: 'AI chatbot for your website \u2014 answers customers, qualifies leads, books jobs \u2014 24/7',     price: '$79',  status: 'built',   url: '/chatbot',        settingsUrl: '/chatbot-settings.html',           priceId: 'price_1T4dAyHnoVvjo5gxMgLczawf', benefit: 'Uses your Content Library' },
    { id: 'news-digest',    icon: '\ud83d\udcf0', name: 'Industry News Digest',             desc: 'Industry news, regulation changes, supplier updates \u2014 AI-summarised on one dashboard',          price: '$59',  status: 'built',   url: '/news',           settingsUrl: '/news-digest-settings.html',       priceId: 'price_1TB7IdHnoVvjo5gxTA1rOKRI', benefit: 'Feeds into BI insights' },
    { id: 'bi',             icon: '\ud83e\udde0', name: 'Business Intelligence Dashboard',  desc: 'AI-powered insights driven by your business data, your industry, your region',                      price: '$89',  status: 'built',   url: '/bi.html',        settingsUrl: null,                               priceId: 'price_1T4dClHnoVvjo5gxjSvoi4ky', benefit: 'Uses your Content Library' },
    { id: 'strategic-plan', icon: '\ud83d\uddfa\ufe0f', name: 'Strategic Plan & Operations', desc: 'Create your roadmap in minutes from a simple AI-guided interview',                                  price: '$69',  status: 'built',   url: '/strategy',       settingsUrl: null,                               priceId: 'price_1TB7DDHnoVvjo5gxgLzZbego', benefit: 'Works great with BI Dashboard' },
    { id: 'design-viz',     icon: '\ud83c\udfa8', name: 'Design Visualiser',                desc: 'AI-generated concept renders from a brief \u2014 show customers what the finished job looks like',   price: '$89',  status: 'built',   url: '/design',         settingsUrl: '/design-viz-settings.html',        priceId: 'price_1TQLbEHnoVvjo5gxIuSSm7tH', benefit: 'Uses your Content Library' },
    { id: 'tender',         icon: '\ud83d\udccb', name: 'Tender Response Generator',        desc: 'AI reads the tender brief and generates a full professional response \u2014 ready to submit',       price: '$99',  status: 'pending', url: '/panel?tool=tender',          settingsUrl: null, priceId: 'price_1T4dDMHnoVvjo5gxWhPHyqQc', benefit: '' },
    { id: 'quote-enhancer', icon: '\ud83d\udcb0', name: 'Quote Enhancer',                   desc: 'Turn your prices into a professional branded quote with AI-written scope of works',                 price: 'TBC',  status: 'pending', url: '/panel?tool=quote-enhancer', settingsUrl: null, priceId: 'price_1TB8QZHnoVvjo5gxwL0GKduI', benefit: '' },
    { id: 'swms',           icon: '\ud83e\uddba', name: 'SWMS & Safety Docs',               desc: 'AI generates compliant Safe Work Method Statements tailored to your trade and job',                 price: 'TBC',  status: 'pending', url: '/panel?tool=swms',            settingsUrl: null, priceId: 'price_1TB8RNHnoVvjo5gxPb5wxUuF', benefit: '' },
    { id: 'customer-updates',icon:'\ud83d\udcf2', name: 'Customer Progress Updates',        desc: 'Keep customers informed automatically with AI-generated job progress updates',                      price: 'TBC',  status: 'pending', url: '/panel?tool=customer-updates', settingsUrl: null, priceId: 'price_1TB8S6HnoVvjo5gxVYoEezlN', benefit: '' },
    { id: 'handover-docs',  icon: '\ud83d\udcc1', name: 'Handover Documentation',           desc: 'Professional handover packs generated from your job data \u2014 warranties, compliance, sign-off',  price: 'TBC',  status: 'pending', url: '/panel?tool=handover-docs',  settingsUrl: null, priceId: 'price_1TB8ShHnoVvjo5gxrGBAMHZL', benefit: '' },
    { id: 'review-booster', icon: '\u2b50',       name: 'Review & Referral Booster',        desc: 'AI identifies the right moment to ask for reviews and referrals \u2014 and writes the message',     price: 'TBC',  status: 'pending', url: '/panel?tool=review-booster', settingsUrl: null, priceId: 'price_1TB8TFHnoVvjo5gxkF2QMzJa', benefit: '' }
  ];

  // ── INIT ──
  async function init(supabase, user) {
    _supabase = supabase;
    _user = user;

    var pr = await _supabase.from('profiles')
      .select('activated_tools, trial_expires_at, is_trial, bundle_tier, business_name')
      .eq('id', user.id).single();

    if (pr.error) {
      console.error('[Dashboard] Profile query error:', pr.error.message || pr.error);
    }
    _profile = (pr.data) ? pr.data : {};
    _activeTools = Array.isArray(_profile.activated_tools) ? _profile.activated_tools : [];

    var bp = await _supabase.from('profiles')
      .select('abn, business_structure, industry, years_in_business, address_name, address_street, address_suburb, address_state, address_postcode, service_area, bp_services, bp_products, payment_methods, response_time, warranty_info, complaints_handling, marketing_theme_awareness, marketing_theme_differentiators, marketing_theme_feeling')
      .eq('id', user.id).single();
    if (bp.data) {
      Object.keys(bp.data).forEach(function(k) { _profile[k] = bp.data[k]; });
    }

    setHeading();
    renderTrialModal(_profile);
    loadNotifications(user.id);
    await renderActionTiles(user.id, _activeTools);

    if (window.DASH_WIDGETS && typeof window.DASH_WIDGETS.renderAll === 'function') {
      await window.DASH_WIDGETS.renderAll(_supabase, user.id, _activeTools);
    }

    renderYourStax(_activeTools);
    wireTabSwitching();
    wireActivateButtons();

    hideEmptyZones();
  }

  // ── PAGE HEADING ──
  function setHeading() {
    var el = document.getElementById('dash-heading');
    if (!el) return;
    var companyName = _profile.business_name || '';
    el.textContent = companyName ? 'Dashboard \u2014 ' + companyName : 'Dashboard';
  }

  // ── NOTIFICATIONS (BP completion) ──
  function checkBPComplete(p) {
    if (!p) return false;
    var hasText = function(k) { return p[k] && typeof p[k] === 'string' && p[k].trim() !== ''; };
    var hasArr = function(k) { return Array.isArray(p[k]) && p[k].length > 0; };
    return hasText('business_name') && hasText('abn') && hasText('business_structure') &&
      hasArr('industry') && hasText('years_in_business') &&
      hasText('address_name') && hasText('address_street') && hasText('address_suburb') &&
      hasText('address_state') && hasText('address_postcode') &&
      hasArr('service_area') && hasArr('bp_services') && hasArr('bp_products') &&
      hasArr('payment_methods') && hasText('response_time') &&
      hasText('warranty_info') && hasText('complaints_handling') &&
      hasText('marketing_theme_awareness') && hasText('marketing_theme_differentiators') &&
      hasText('marketing_theme_feeling');
  }

  function loadNotifications(userId) {
    var bar = document.getElementById('notification-bar');
    if (!bar) return;
    if (!checkBPComplete(_profile)) {
      bar.innerHTML = '<div class="notif-item"><span>Complete your Business Profile so your tools can personalise outputs</span><a href="/content-library.html#business-profile">Complete now</a><button class="notif-dismiss" title="Dismiss">&times;</button></div>';
    }
  }

  // ── TRIAL MODAL ──
  function renderTrialModal(profile) {
    var modal = document.getElementById('trial-modal');
    var msg = document.getElementById('trial-modal-msg');
    var cta = document.getElementById('trial-modal-cta');
    var dismiss = document.getElementById('trial-modal-dismiss');
    if (!modal || !profile) return;
    if (!profile.is_trial || !profile.trial_expires_at) return;
    if (sessionStorage.getItem('trial_modal_dismissed') === 'true') return;

    var now = new Date();
    var expires = new Date(profile.trial_expires_at);
    var daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    var trialMsg;

    if (daysLeft <= 0) {
      trialMsg = 'Your trial has ended. Subscribe to reactivate your tools.';
    } else if (daysLeft <= 1) {
      trialMsg = 'Your free trial ends tomorrow.';
    } else if (daysLeft <= 3) {
      trialMsg = '3 days left on your free trial.';
    } else if (daysLeft <= 7) {
      trialMsg = 'Your free trial ends in ' + daysLeft + ' days. Subscribe to keep your Stax.';
    } else {
      return;
    }

    msg.textContent = trialMsg;
    modal.classList.add('open');

    var tier = profile.bundle_tier;
    cta.addEventListener('click', function() {
      if (tier === 'stax3' || tier === 'stax6') {
        window.location.href = '/subscribe-confirm.html?tier=' + tier;
      } else {
        window.location.href = '/api/create-checkout?tier=' + (tier || 'individual');
      }
    });
    dismiss.addEventListener('click', function() {
      sessionStorage.setItem('trial_modal_dismissed', 'true');
      modal.classList.remove('open');
    });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        sessionStorage.setItem('trial_modal_dismissed', 'true');
        modal.classList.remove('open');
      }
    });
  }

  // ── ZONE 1: ACTION TILES ──
  async function renderActionTiles(userId, activeTools) {
    var container = document.getElementById('zone-1');
    if (!container) return;

    var tiles = [];

    // CL tile — always first
    try {
      var pending = await _supabase.from('content_library')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'pending').neq('source', 'tool');
      var outputs = await _supabase.from('content_library')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('source', 'tool')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

      var pendingCount = (pending.count) || 0;
      var outputCount = (outputs.count) || 0;
      var summary = [];
      if (pendingCount > 0) summary.push(pendingCount + ' pending review');
      if (outputCount > 0) summary.push(outputCount + ' new output' + (outputCount !== 1 ? 's' : '') + ' this week');
      if (summary.length === 0) summary.push('All clear');

      tiles.push(tileHtml('\ud83d\udcda', 'Content Library', summary.join(' \u00b7 '), '/content-library.html#review', 'orange'));
    } catch (e) {
      tiles.push(tileHtml('\ud83d\udcda', 'Content Library', 'All clear', '/content-library.html', 'orange'));
    }

    // Social — pending posts
    if (activeTools.indexOf('social') !== -1) {
      try {
        var sp = await _supabase.from('social_posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('status', 'pending_review');
        if (sp.count && sp.count > 0) {
          tiles.push(tileHtml('\ud83d\udcf1', 'Marketing & Social', sp.count + ' post' + (sp.count !== 1 ? 's' : '') + ' to approve', '/social', 'orange'));
        }
      } catch (e) {}
    }

    // Chatbot — pending FAQs
    if (activeTools.indexOf('chatbot') !== -1) {
      try {
        var fq = await _supabase.from('learned_faqs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('status', 'pending');
        if (fq.count && fq.count > 0) {
          tiles.push(tileHtml('\ud83d\udcac', 'Website Chatbot', fq.count + ' FAQ' + (fq.count !== 1 ? 's' : '') + ' to approve', '/chatbot', ''));
        }
      } catch (e) {}
    }

    // Email — urgent emails
    if (activeTools.indexOf('email') !== -1) {
      try {
        var ur = await _supabase.from('email_summaries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('urgency', 'high');
        if (ur.count && ur.count > 0) {
          tiles.push(tileHtml('\ud83d\udce7', 'Email Assistant', ur.count + ' urgent email' + (ur.count !== 1 ? 's' : ''), '/email', 'orange'));
        }
      } catch (e) {}
    }

    container.innerHTML = tiles.join('');
  }

  function tileHtml(icon, name, summary, href, colourClass) {
    return '<a href="' + href + '" class="stat-card ' + colourClass + ' dash-action-tile">'
      + '<div class="dash-action-row">'
      + '<span class="dash-action-icon">' + icon + '</span>'
      + '<span class="dash-action-name">' + escHtml(name) + '</span>'
      + '</div>'
      + '<div class="stat-label">' + escHtml(summary) + '</div>'
      + '</a>';
  }

  // ── ZONE 3: YOUR STAX ──
  function renderYourStax(activeTools) {
    var activeContainer = document.getElementById('dash-tab-active');
    var availableContainer = document.getElementById('dash-tab-available');
    if (!activeContainer || !availableContainer) return;

    var activeHtml = '';
    var availableHtml = '';
    var hasActive = false;
    var hasAvailable = false;

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
      activeHtml = '<div class="empty-state"><div class="empty-state-icon">\ud83d\udce6</div><h3>No active tools yet</h3><p>Check out the Available Tools tab to get started.</p></div>';
    }
    if (!hasAvailable) {
      availableHtml = '<div class="empty-state"><div class="empty-state-icon">\u2705</div><h3>All tools activated</h3><p>You have access to every available tool.</p></div>';
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
      + '<span class="dash-stax-name">' + escHtml(tool.name) + '</span>'
      + '<span class="dash-stax-tagline">' + escHtml(tool.desc) + '</span>'
      + '</div>'
      + '<span class="badge badge-green">Live</span>'
      + '</div>'
      + '<div class="dash-stax-card-actions">'
      + '<a href="' + tool.url + '" class="btn-primary btn-sm">Open Tool</a>'
      + settingsLink
      + '</div>'
      + '</div>';
  }

  function availableCardHtml(tool) {
    return '<div class="dash-stax-card">'
      + '<div class="dash-stax-card-top">'
      + '<span class="dash-stax-icon">' + tool.icon + '</span>'
      + '<div class="dash-stax-card-info">'
      + '<span class="dash-stax-name">' + escHtml(tool.name) + '</span>'
      + '<span class="dash-stax-tagline">' + escHtml(tool.desc) + '</span>'
      + '</div>'
      + '</div>'
      + '<div class="dash-stax-meta">'
      + '<span class="dash-stax-price">' + tool.price + '/month</span>'
      + (tool.benefit ? '<span class="dash-stax-benefit">' + escHtml(tool.benefit) + '</span>' : '')
      + '</div>'
      + '<div class="dash-stax-card-actions">'
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
      + '<span class="dash-stax-name">' + escHtml(tool.name) + '</span>'
      + '<span class="dash-stax-tagline">' + escHtml(tool.desc) + '</span>'
      + '</div>'
      + '<span class="badge badge-grey">Coming Soon</span>'
      + '</div>'
      + '</div>';
  }

  // ── TAB SWITCHING ──
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

  // ── ACTIVATE TOOL ──
  function activateTool(toolId) {
    var tool = TOOLS.find(function(t) { return t.id === toolId; });
    if (!tool || !tool.priceId || tool.status === 'pending') {
      window.showModalError('Coming Soon \u2014 this tool is not yet available for purchase.');
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
      if (data.url) { window.location.href = data.url; }
      else { window.showModalError('Could not start checkout. Please try again.'); }
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

  // ── NOTIFICATION DISMISS ──
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('notif-dismiss')) {
      var item = e.target.closest('.notif-item');
      if (item) item.remove();
    }
  });

  // ── HIDE EMPTY ZONES ──
  function hideEmptyZones() {
    var zone2 = document.getElementById('zone-2');
    var zone2Wrap = document.getElementById('zone-2-wrap');
    if (zone2 && zone2Wrap && !zone2.innerHTML.trim()) {
      zone2Wrap.style.display = 'none';
    }
  }

  return { init: init, activateTool: activateTool };

})();
