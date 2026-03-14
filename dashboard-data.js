window.DASH_DATA = (function() {

  var TOOLS = [
    { id: 'social',        icon: '📱', name: 'Marketing & Social Media Manager', desc: 'AI builds your posts, graphics and marketing content — auto-posts to Facebook and Instagram', price: '$79', status: 'built',   url: 'social.html' },
    { id: 'email',         icon: '📧', name: 'AI Email Assistant',               desc: 'AI reads your Gmail and Outlook — summarised on one smart dashboard',                          price: '$59', status: 'built',   url: 'email-assistant.html' },
    { id: 'chatbot',       icon: '💬', name: 'AI Website Chatbot',               desc: 'AI chatbot for your website — answers customers, qualifies leads, books jobs — 24/7',           price: '$79', status: 'built',   url: 'chatbot.html' },
    { id: 'news-digest',   icon: '📰', name: 'Industry News Digest',             desc: 'Industry news, regulation changes, supplier updates — AI-summarised on one dashboard',          price: '$59', status: 'built',   url: 'news-digest.html' },
    { id: 'bi',            icon: '🧠', name: 'Business Intelligence Dashboard',  desc: 'AI-powered insights driven by your business data, your industry, your region',                  price: '$89', status: 'built',   url: 'dashboard.html' },
    { id: 'strategic-plan',icon: '🗺️', name: 'Strategic Plan & Operations',      desc: 'Create your roadmap in minutes from a simple AI-guided interview',                              price: '$69', status: 'built',   url: 'strategic-plan.html' },
    { id: 'tender',        icon: '📋', name: 'Tender Response Generator',        desc: 'AI reads the tender brief and generates a full professional response — ready to submit',         price: '$99', status: 'pending', url: 'panel.html?tool=tender' },
    { id: 'quote-enhancer',icon: '💰', name: 'Quote Enhancer',                   desc: 'Turn your prices into a professional branded quote with AI-written scope of works',             price: 'Coming Soon', status: 'pending', url: 'panel.html?tool=quote-enhancer' },
    { id: 'swms',          icon: '🦺', name: 'SWMS & Safety Docs',               desc: 'AI generates compliant Safe Work Method Statements tailored to your trade and job',             price: 'Coming Soon', status: 'pending', url: 'panel.html?tool=swms' },
    { id: 'customer-updates', icon: '📲', name: 'Customer Progress Updates',     desc: 'Keep customers informed automatically with AI-generated job progress updates',                  price: 'Coming Soon', status: 'pending', url: 'panel.html?tool=customer-updates' },
    { id: 'handover-docs', icon: '📁', name: 'Handover Documentation',           desc: 'Professional handover packs generated from your job data — warranties, compliance, sign-off',  price: 'Coming Soon', status: 'pending', url: 'panel.html?tool=handover-docs' },
    { id: 'review-booster',icon: '⭐', name: 'Review & Referral Booster',        desc: 'AI identifies the right moment to ask for reviews and referrals — and writes the message',      price: 'Coming Soon', status: 'pending', url: 'panel.html?tool=review-booster' },
    { id: 'design-viz',    icon: '🎨', name: 'Design Visualiser',                desc: 'AI-generated concept renders from a brief — show customers what the finished job looks like',   price: 'Coming Soon', status: 'pending', url: 'panel.html?tool=design-viz' }
  ];

  function renderStax(activeTools) {
    var grid = document.getElementById('stax-grid');
    if (!grid) return;
    var html = '';
    TOOLS.forEach(function(tool) {
      var isActive  = activeTools.indexOf(tool.id) !== -1;
      var isPending = tool.status === 'pending';
      var cardClass = isActive ? 'stax-card active' : (isPending ? 'stax-card coming-soon' : 'stax-card');
      html += '<div class="' + cardClass + '">';
      html += '<div class="stax-card-top">';
      html += '<span class="stax-card-icon">' + tool.icon + '</span>';
      html += '<span class="stax-card-name">' + tool.name + '</span>';
      if (isActive) {
        html += '<span class="stax-card-badge badge badge-live">Live</span>';
      } else if (isPending) {
        html += '<span class="stax-card-badge badge badge-coming">Coming Soon</span>';
      }
      html += '</div>';
      html += '<p class="stax-card-desc">' + tool.desc + '</p>';
      html += '<div class="stax-card-actions">';
      if (isActive) {
        html += '<a href="' + tool.url + '" class="btn-open-tool">Open Tool</a>';
      } else if (!isPending) {
        html += '<span class="stax-card-price">' + tool.price + '/month</span><br>';
        html += '<a href="login.html?tab=signup&tool=' + tool.id + '" class="btn-activate-tool" style="margin-top:8px;display:inline-block;">Activate</a>';
      }
      html += '</div>';
      html += '</div>';
    });
    grid.innerHTML = html;
  }

  async function loadNotifications(userId) {
    var bar = document.getElementById('notification-bar');
    if (!bar) return;
    var items = [];

    try {
      var profRes = await supabaseClient.from('profiles').select('profile_complete').eq('id', userId).single();
      if (profRes.data && !profRes.data.profile_complete) {
        items.push({ msg: 'Complete your Business Profile so your tools can personalise outputs', link: 'content-library.html#business-profile', linkText: 'Complete now' });
      }
    } catch(e) {}

    try {
      var clRes = await supabaseClient.from('content_library').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending');
      if (clRes.count && clRes.count > 0) {
        items.push({ msg: clRes.count + ' item' + (clRes.count > 1 ? 's' : '') + ' awaiting approval in Content Library', link: 'content-library.html', linkText: 'Review' });
      }
    } catch(e) {}

    try {
      var spRes = await supabaseClient.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending_review');
      if (spRes.count && spRes.count > 0) {
        items.push({ msg: spRes.count + ' post' + (spRes.count > 1 ? 's' : '') + ' ready for review in Marketing Hub', link: 'social.html', linkText: 'Review' });
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
      var profRes = await supabaseClient.from('profiles').select('active_tools').eq('id', userId).single();
      if (profRes.data && Array.isArray(profRes.data.active_tools)) {
        activeTools = profRes.data.active_tools;
      }
    } catch(e) {}

    renderStax(activeTools);
    await loadNotifications(userId);

    var widgetZone = document.getElementById('widget-zone');
    if (activeTools.length > 0 && widgetZone) {
      widgetZone.classList.add('visible');
      if (window.DASH_WIDGETS && typeof window.DASH_WIDGETS.render === 'function') {
        await window.DASH_WIDGETS.render(userId, activeTools);
      }
    }
  }

  return { init: init, TOOLS: TOOLS };

})();
