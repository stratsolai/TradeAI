// activation-modal.js — Post-trial / early-conversion activation modal.
// Triggered from: trial banner "Subscribe Now", trial-expired modal "Activate Now",
// dashboard tool-tile "Activate Now" buttons, and the account page Subscribe Now CTA.
// Self-contained: injects its own DOM and page-local styles on first open.
// Uses .perm-modal-overlay from staxai-auth.css for the backdrop; the inner card
// is a custom shape (blue header bar + body + footer) per the v2.1 design spec.
(function() {
  var BUNDLES = [
    { tier: 'stax3',    priceId: 'price_1TEQc9HnoVvjo5gxHQ1CQYAT', name: 'STAX3',   desc: 'Pick any 3 tools',           defaultPrice: '$129/mth', comingSoon: true,  featured: false },
    { tier: 'stax6',    priceId: 'price_1TEQdAHnoVvjo5gxg6uwVWV1', name: 'STAX6',   desc: 'Pick any 6 tools',           defaultPrice: '$249/mth', comingSoon: true,  featured: false },
    { tier: 'stax-all', priceId: 'price_1TEQdoHnoVvjo5gxlNMGajr8', name: 'STAXALL', desc: 'All 13 tools — best value',  defaultPrice: '$449/mth', comingSoon: false, featured: true  }
  ];

  var overlayEl = null;
  var stylesInjected = false;
  var livePrices = null;
  var currentTool = null;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '#activation-modal-overlay { align-items: flex-start; padding: 60px 16px 40px; overflow-y: auto; }' +
      '.activation-card { background: #ffffff; border-radius: 12px; max-width: 520px; width: 100%; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.18); margin: auto; }' +
      '.activation-header { background: #4A6D8C; color: #ffffff; padding: 16px 24px; font-family: var(--heading-font); font-weight: 800; font-size: 20px; letter-spacing: 1px; text-transform: uppercase; }' +
      '.activation-body { padding: 22px 24px 6px; }' +
      '.activation-single { background: #f8f9fa; border: 2px solid #4A6D8C; border-radius: 10px; padding: 18px 18px 16px; margin-bottom: 18px; }' +
      '.activation-single-name { font-family: var(--heading-font); font-weight: 700; font-size: 18px; color: var(--text); margin-bottom: 2px; }' +
      '.activation-single-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 10px; }' +
      '.activation-single-price { font-family: var(--heading-font); font-weight: 800; font-size: 22px; color: #4A6D8C; margin-bottom: 14px; }' +
      '.activation-single-btn { display: block; width: 100%; background: #4A6D8C; color: #ffffff; border: none; border-radius: 8px; padding: 12px 16px; font-family: var(--body-font); font-size: 15px; font-weight: 700; cursor: pointer; transition: background 0.2s; }' +
      '.activation-single-btn:hover:not(:disabled) { background: #3a5a75; }' +
      '.activation-single-btn:disabled { opacity: 0.7; cursor: not-allowed; }' +
      '.activation-divider { display: flex; align-items: center; text-align: center; margin: 10px 0 14px; color: var(--text-muted); font-size: 13px; font-weight: 600; }' +
      '.activation-divider::before, .activation-divider::after { content: \'\'; flex: 1; border-bottom: 1px solid #ddd; }' +
      '.activation-divider span { padding: 0 12px; }' +
      '.activation-bundles { display: flex; flex-direction: column; gap: 10px; padding-bottom: 10px; }' +
      '.activation-bundle { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #ffffff; border: 1px solid #ddd; border-radius: 10px; padding: 16px 18px; cursor: pointer; font-family: var(--body-font); text-align: left; transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s; position: relative; }' +
      '.activation-bundle:hover:not(:disabled) { border-color: #4A6D8C; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(74,109,140,0.12); }' +
      '.activation-bundle:disabled { opacity: 0.65; cursor: not-allowed; }' +
      '.activation-bundle.featured { background: linear-gradient(135deg, #4A6D8C 0%, #3a5a75 100%); border: none; color: #ffffff; }' +
      '.activation-bundle.featured:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(74,109,140,0.32); transform: translateY(-1px); border: none; }' +
      '.activation-bundle-info { flex: 1; min-width: 0; }' +
      '.activation-bundle-name { font-family: var(--heading-font); font-weight: 800; font-size: 20px; letter-spacing: 0.6px; color: var(--text); margin-bottom: 4px; }' +
      '.activation-bundle.featured .activation-bundle-name { color: #ffffff; }' +
      '.activation-bundle-desc { font-size: 13px; color: var(--text-muted); }' +
      '.activation-bundle.featured .activation-bundle-desc { color: rgba(255,255,255,0.88); }' +
      '.activation-bundle-price { font-family: var(--heading-font); font-weight: 800; font-size: 22px; color: #E8A54B; flex-shrink: 0; }' +
      '.activation-bundle-soon { display: inline-block; margin-left: 8px; background: #6c757d; color: #ffffff; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 2px 8px; border-radius: 12px; vertical-align: middle; }' +
      '.activation-footer { padding: 6px 24px 18px; text-align: center; }' +
      '.activation-cancel { background: transparent; border: none; color: #666666; font-family: var(--body-font); font-size: 14px; font-weight: 500; cursor: pointer; padding: 8px 16px; }' +
      '.activation-cancel:hover { color: var(--text); text-decoration: underline; }';
    document.head.appendChild(style);
  }

  function buildModal() {
    if (overlayEl) return;
    injectStyles();

    var bundlesHtml = BUNDLES.map(function(b) {
      var classes = 'activation-bundle' + (b.featured ? ' featured' : '');
      return '<button type="button" class="' + classes + '" data-tier="' + b.tier + '"' + (b.comingSoon ? ' disabled' : '') + '>' +
        '<div class="activation-bundle-info">' +
          '<div class="activation-bundle-name">' + b.name + (b.comingSoon ? ' <span class="activation-bundle-soon">Coming soon</span>' : '') + '</div>' +
          '<div class="activation-bundle-desc">' + b.desc + '</div>' +
        '</div>' +
        '<div class="activation-bundle-price" data-priceid="' + b.priceId + '">' + b.defaultPrice + '</div>' +
      '</button>';
    }).join('');

    overlayEl = document.createElement('div');
    overlayEl.className = 'perm-modal-overlay';
    overlayEl.id = 'activation-modal-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-labelledby', 'activation-modal-title');
    overlayEl.innerHTML =
      '<div class="activation-card">' +
        '<div class="activation-header" id="activation-modal-title">Activate Your Tools</div>' +
        '<div class="activation-body">' +
          '<div class="activation-single" id="activation-single-tool" hidden>' +
            '<div class="activation-single-name" id="activation-single-tool-name"></div>' +
            '<div class="activation-single-sub">Activate this tool only</div>' +
            '<div class="activation-single-price" id="activation-single-tool-price"></div>' +
            '<button type="button" class="activation-single-btn" id="activation-single-tool-btn">Activate</button>' +
          '</div>' +
          '<div class="activation-divider"><span>or choose a bundle and save</span></div>' +
          '<div class="activation-bundles">' + bundlesHtml + '</div>' +
        '</div>' +
        '<div class="activation-footer">' +
          '<button type="button" class="activation-cancel" id="activation-modal-cancel">Maybe Later</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlayEl);

    overlayEl.addEventListener('click', function(e) {
      if (e.target === overlayEl) closeModal();
    });
    document.getElementById('activation-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('activation-single-tool-btn').addEventListener('click', handleSingleTool);
    overlayEl.querySelectorAll('.activation-bundle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tier = btn.getAttribute('data-tier');
        if (tier === 'stax-all') handleStaxAll();
        // STAX3 / STAX6 are `disabled` so they can't fire — picker not built yet.
      });
    });

    loadLivePrices();
  }

  function loadLivePrices() {
    fetch('/api/get-prices')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        if (!d || !d.prices) return;
        for (var i = 0; i < BUNDLES.length; i++) {
          if (!d.prices[BUNDLES[i].priceId]) return;
        }
        livePrices = d.prices;
        overlayEl.querySelectorAll('.activation-bundle-price[data-priceid]').forEach(function(el) {
          var pid = el.getAttribute('data-priceid');
          if (livePrices[pid]) el.textContent = livePrices[pid];
        });
        if (currentTool && currentTool.priceId && livePrices[currentTool.priceId]) {
          var pe = document.getElementById('activation-single-tool-price');
          if (pe) pe.textContent = livePrices[currentTool.priceId];
        }
      })
      .catch(function() { /* keep hardcoded copy */ });
  }

  function configureSingleTool(toolId) {
    var section = document.getElementById('activation-single-tool');
    if (!toolId) { section.hidden = true; currentTool = null; return; }
    var tools = window.CORE_TOOLS || [];
    var tool = tools.find(function(t) { return t.id === toolId; });
    if (!tool || !tool.priceId) { section.hidden = true; currentTool = null; return; }
    currentTool = tool;
    var name = Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.name || toolId);
    document.getElementById('activation-single-tool-name').textContent = name;
    var price = (livePrices && livePrices[tool.priceId]) || (tool.price ? tool.price + '/mth' : '');
    document.getElementById('activation-single-tool-price').textContent = price;
    document.getElementById('activation-single-tool-btn').textContent = 'Activate ' + name;
    section.hidden = false;
  }

  async function getUserId() {
    if (!window.supabaseClient) return null;
    var u = await window.supabaseClient.auth.getUser();
    return u && u.data && u.data.user ? u.data.user.id : null;
  }

  async function postCheckout(payload, btn) {
    if (btn) btn.disabled = true;
    try {
      var r = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        var d = await r.json();
        if (d && d.url) { window.location.href = d.url; return; }
      }
      console.error('[activation-modal] checkout returned no URL');
    } catch (e) {
      console.error('[activation-modal] checkout error:', e && e.message);
    }
    if (btn) btn.disabled = false;
  }

  async function handleSingleTool() {
    if (!currentTool || !currentTool.priceId) return;
    var uid = await getUserId();
    if (!uid) return;
    var btn = document.getElementById('activation-single-tool-btn');
    await postCheckout({ userId: uid, toolId: currentTool.id, priceId: currentTool.priceId }, btn);
  }

  async function handleStaxAll() {
    var uid = await getUserId();
    if (!uid) return;
    var btn = overlayEl.querySelector('.activation-bundle[data-tier="stax-all"]');
    await postCheckout({ userId: uid, tier: 'stax-all' }, btn);
  }

  function openModal(toolId) {
    buildModal();
    configureSingleTool(toolId);
    overlayEl.classList.add('open');
  }

  function closeModal() {
    if (overlayEl) overlayEl.classList.remove('open');
  }

  window.openActivationModal = openModal;
})();
