window.DASH_DATA = (function() {

  var TOOLS = [
    { id: 'social',        icon: '📱', name: 'Marketing & Social Media Manager', desc: 'AI builds your posts, graphics and marketing content — auto-posts to Facebook and Instagram', price: '$79',  status: 'built',   url: '/social',        priceId: 'price_1T4dCEHnoVvjo5gxQysf0vQI' },
    { id: 'email',         icon: '📧', name: 'AI Email Assistant',               desc: 'AI reads your Gmail and Outlook — summarised on one smart dashboard',                          price: '$59',  status: 'built',   url: '/email', priceId: 'price_1T4dBcHnoVvjo5gx8EuxX5hL' },
    { id: 'chatbot',       icon: '💬', name: 'AI Website Chatbot',               desc: 'AI chatbot for your website — answers customers, qualifies leads, books jobs — 24/7',           price: '$79',  status: 'built',   url: '/chatbot',        priceId: 'price_1T4dAyHnoVvjo5gxMgLczawf' },
    { id: 'news-digest',   icon: '📰', name: 'Industry News Digest',             desc: 'Industry news, regulation changes, supplier updates — AI-summarised on one dashboard',          price: '$59',  status: 'built',   url: '/news',    priceId: 'price_1TB7IdHnoVvjo5gxTA1rOKRI' },
    { id: 'bi',            icon: '🧠', name: 'Business Intelligence Dashboard',  desc: 'AI-powered insights driven by your business data, your industry, your region',                  price: '$89',  status: 'pending', url: 'bi.html',             priceId: null },
    { id: 'strategic-plan',icon: '🗺️', name: 'Strategic Plan & Operations',      desc: 'Create your roadmap in minutes from a simple AI-guided interview',                              price: '$69',  status: 'built',   url: '/strategy', priceId: 'price_1TB7DDHnoVvjo5gxgLzZbego' },
    { id: 'tender',        icon: '📋', name: 'Tender Response Generator',        desc: 'AI reads the tender brief and generates a full professional response — ready to submit',         price: '$99',  status: 'pending', url: '/panel?tool=tender',          priceId: 'price_1T4dDMHnoVvjo5gxWhPHyqQc' },
    { id: 'quote-enhancer',icon: '💰', name: 'Quote Enhancer',                   desc: 'Turn your prices into a professional branded quote with AI-written scope of works',             price: 'TBC',  status: 'pending', url: '/panel?tool=quote-enhancer', priceId: 'price_1TB8QZHnoVvjo5gxwL0GKduI' },
    { id: 'swms',          icon: '🦺', name: 'SWMS & Safety Docs',               desc: 'AI generates compliant Safe Work Method Statements tailored to your trade and job',             price: 'TBC',  status: 'pending', url: '/panel?tool=swms',            priceId: 'price_1TB8RNHnoVvjo5gxPb5wxUuF' },
    { id: 'customer-updates',icon: '📲',name: 'Customer Progress Updates',        desc: 'Keep customers informed automatically with AI-generated job progress updates',                  price: 'TBC',  status: 'pending', url: '/panel?tool=customer-updates', priceId: 'price_1TB8S6HnoVvjo5gxVYoEezlN' },
    { id: 'handover-docs', icon: '📁', name: 'Handover Documentation',           desc: 'Professional handover packs generated from your job data — warranties, compliance, sign-off',  price: 'TBC',  status: 'pending', url: '/panel?tool=handover-docs',  priceId: 'price_1TB8ShHnoVvjo5gxrGBAMHZL' },
    { id: 'review-booster',icon: '⭐',       name: 'Review & Referral Booster',        desc: 'AI identifies the right moment to ask for reviews and referrals — and writes the message',      price: 'TBC',  status: 'pending', url: '/panel?tool=review-booster', priceId: 'price_1TB8TFHnoVvjo5gxkF2QMzJa' },
    { id: 'design-viz',    icon: '🎨', name: 'Design Visualiser',                desc: 'AI-generated concept renders from a brief — show customers what the finished job looks like',   price: 'TBC',  status: 'pending', url: '/panel?tool=design-viz',     priceId: null }
  ];

  function renderStax(activeTools) {
    var grid = document.getElementById('stax-grid');
    if (!grid) return;
    var html = '';
    TOOLS.forEach(function(tool) {
      var isActive  = activeTools.indexOf(tool.id) !== -1;
      var isPending = tool.status === 'pending';
      var cls = 'stax-card' + (isActive ? ' stax-active' : '') + (isPending ? ' stax-coming' : '');
      html += '<div class="' + cls + '">';
      html += '<div class="stax-card-top">';
      html += '<span class="stax-card-icon">' + tool.icon + '</span>';
      html += '<span class="stax-card-name">' + tool.name + '</span>';
      if (isActive) html += '<span class="stax-card-badge badge badge-live">Live</span>';
      else if (isPending) html += '<span class="stax-card-badge badge badge-inactive">Soon</span>';
      html += '</div>';
      html += '<p class="stax-card-desc">' + tool.desc + '</p>';
      html += '<div class="stax-card-actions">';
      if (isActive) {
        html += '<a href="' + tool.url + '" class="btn-stax-open">Open Tool</a>';
      } else if (!isPending) {
        html += '<span class="stax-card-price">' + tool.price + '/month</span><br>';
        html += '<a href="/activate?tool=" + tool.id + "" class="btn-stax-learn" style="margin-top:6px;display:inline-block;margin-right:6px;">Learn More</a><button class="btn-stax-activate" data-toolid="" + tool.id + "" style="margin-top:6px;display:inline-block;">Activate</button>';
      }
      html += '</div></div>';
    });
    grid.innerHTML = html;
  }

  async function loadNotifications(userId) {
    var bar = document.getElementById('notification-bar');
    if (!bar) return;
    var items = [];
    try {
      var pr = await window.supabaseClient.from('profiles').select('profile_complete').eq('id', userId).single();
      if (pr.data && !pr.data.profile_complete) {
        items.push({ msg: 'Complete your Business Profile so your tools can personalise outputs', link: '/library#business-profile', linkText: 'Complete now' });
      }
    } catch(e) {}
    try {
      var cr = await window.supabaseClient.from('content_library').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending');
      if (cr.count && cr.count > 0) {
        items.push({ msg: cr.count + ' item' + (cr.count > 1 ? 's' : '') + ' awaiting approval in Content Library', link: '/library', linkText: 'Review' });
      }
    } catch(e) {}
    try {
      var sp = await window.supabaseClient.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending_review');
      if (sp.count && sp.count > 0) {
        items.push({ msg: sp.count + ' post' + (sp.count > 1 ? 's' : '') + ' ready for review in Marketing Hub', link: '/social', linkText: 'Review' });
      }
    } catch(e) {}
    if (items.length === 0) { bar.style.display = 'none'; return; }
    items = items.slice(0, 3);
    bar.innerHTML = items.map(function(item) {
      return '<div class="notif-item"><span>' + item.msg + '</span><a href="' + item.link + '">' + item.linkText + '</a><button class="notif-dismiss" title="Dismiss">&times;</button></div>';
    }).join('');
  }

  async function init(user) {
    var userId = user.id;
    var activeTools = [];
    try {
      var pr = await window.supabaseClient.from('profiles').select('activated_tools, trial_expires_at, is_trial, bundle_tier').eq('id', userId).single();
      if (pr.data && Array.isArray(pr.data.activated_tools)) activeTools = pr.data.activated_tools;
    } catch(e) {}
    await loadNotifications(userId);
    if (window.DASH_WIDGETS && typeof window.DASH_WIDGETS.renderAll === 'function') {
      await window.DASH_WIDGETS.renderAll(userId, activeTools);
    }
    renderTrialBanner(pr.data);
    renderStax(activeTools);
  }

  function activateTool(toolId) {
    var tool = TOOLS.find(function(t) { return t.id === toolId; });
    if (!tool || !tool.priceId) {
      var msg = document.createElement('div');
      msg.textContent = 'Coming Soon — this tool is not yet available for purchase.';
      msg.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#4A6D8C;color:#fff;padding:14px 28px;border-radius:8px;font-family:DM Sans,sans-serif;font-size:15px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.18);';
      document.body.appendChild(msg);
      setTimeout(function(){ if (msg.parentNode) msg.parentNode.removeChild(msg); }, 3500);
      return;
    }
    window.supabaseClient.auth.getUser().then(function(res) {
      var user = res.data && res.data.user;
      if (!user) { window.location.href = '//login'; return; }
      fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: tool.priceId, userId: user.id, toolId: toolId })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.url) { window.location.href = data.url; }
        else { console.error('activateTool: no checkout URL returned', data); }
      })
      .catch(function(e) { console.error('activateTool: fetch error', e); });
    });
  }

  // Wire stax-section activate buttons via event delegation
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-stax-activate');
    if (!btn) return;
    var toolId = btn.getAttribute('data-toolid');
    if (!toolId) return;
    DASH_DATA.activateTool(toolId);
  });

  function renderTrialBanner(profile) {
    var DISMISS_KEY = 'trial_banner_dismissed';
    var banner = document.getElementById('trial-banner');
    var msg = document.getElementById('trial-banner-msg');
    var cta = document.getElementById('trial-banner-cta');
    var dismiss = document.getElementById('trial-banner-dismiss');
    if (!banner || !profile) return;
    if (!profile.is_trial || !profile.trial_expires_at) return;
    if (sessionStorage.getItem(DISMISS_KEY) === 'true') return;
    var now = new Date();
    var expires = new Date(profile.trial_expires_at);
    var msLeft = expires - now;
    var daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    var bannerClass, bannerMsg;
    if (daysLeft <= 0) {
      bannerClass = 'trial-banner--expired';
      bannerMsg = 'Your trial has ended. Subscribe to reactivate your tools.';
    } else if (daysLeft <= 1) {
      bannerClass = 'trial-banner--urgent';
      bannerMsg = 'Your free trial ends tomorrow.';
    } else if (daysLeft <= 3) {
      bannerClass = 'trial-banner--warning';
      bannerMsg = '3 days left on your free trial.';
    } else if (daysLeft <= 7) {
      bannerClass = 'trial-banner--info';
      bannerMsg = 'Your free trial ends in 7 days. Subscribe to keep your Stax.';
    } else {
      return;
    }
    banner.className = 'trial-banner ' + bannerClass + ' visible';
    msg.textContent = bannerMsg;
    var tier = profile.bundle_tier;
    cta.onclick = function() {
      if (tier === 'stax3' || tier === 'stax6') {
        window.location.href = 'subscribe-confirm.html?tier=' + tier;
      } else {
        window.location.href = '/api/create-checkout?tier=' + (tier || 'individual');
      }
    };
    dismiss.onclick = function() {
      sessionStorage.setItem(DISMISS_KEY, 'true');
      banner.classList.remove('visible');
    };
  }

  return { init: init, activateTool: activateTool };

})();
