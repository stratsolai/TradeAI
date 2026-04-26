// industry-modal.js — Reusable pre-login industry selection modal
// Mirrors .perm-modal-overlay / .perm-modal pattern from staxai-auth.css
// and .filter-pill / .active pattern for industry chips
// Self-contained styles so it works on pre-login dark-themed pages

(function() {
  var INDUSTRIES = [
    { id: 'building-construction', name: 'Building & Construction' },
    { id: 'electrical-solar', name: 'Electrical & Solar' },
    { id: 'plumbing-gas', name: 'Plumbing & Gas' },
    { id: 'hvac-refrigeration', name: 'HVAC & Refrigeration' },
    { id: 'landscaping-outdoor', name: 'Landscaping & Outdoor' },
    { id: 'painting-finishing', name: 'Painting & Finishing' },
    { id: 'fabrication-manufacturing', name: 'Fabrication & Manufacturing' },
    { id: 'cleaning-maintenance', name: 'Cleaning & Maintenance' },
    { id: 'service-professional', name: 'Service & Professional' }
  ];

  var MAX_INDUSTRIES = 2;
  var overlayEl = null;
  var onContinueCallback = null;
  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '#industry-modal-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:500;align-items:center;justify-content:center;}' +
      '#industry-modal-overlay.open{display:flex;}' +
      '.ind-modal{background:#172035;border:1px solid rgba(255,255,255,0.16);border-radius:20px;max-width:520px;width:90%;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,0.4);}' +
      '.ind-modal-title{font-family:"Barlow Condensed",sans-serif;font-size:24px;font-weight:800;color:#fff;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;}' +
      '.ind-modal-sub{font-size:15px;color:rgba(255,255,255,0.65);margin-bottom:20px;font-family:"DM Sans",sans-serif;}' +
      '.ind-modal-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}' +
      '.ind-modal-chip{padding:8px 16px;border-radius:20px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.75);font-family:"DM Sans",sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.2s;}' +
      '.ind-modal-chip:hover{border-color:rgba(255,255,255,0.35);color:#fff;background:rgba(255,255,255,0.1);}' +
      '.ind-modal-chip.active{border-color:#c4622a;background:rgba(196,98,42,0.25);color:#fff;}' +
      '.ind-modal-counter{font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:4px;font-family:"DM Sans",sans-serif;}' +
      '.ind-modal-max-msg{font-size:13px;color:#ff8a8a;margin-bottom:8px;font-family:"DM Sans",sans-serif;}' +
      '.ind-modal-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:20px;}' +
      '.ind-modal-cancel{background:transparent;color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px 22px;font-size:14px;font-weight:600;cursor:pointer;font-family:"DM Sans",sans-serif;transition:all 0.2s;}' +
      '.ind-modal-cancel:hover{background:rgba(255,255,255,0.08);color:#fff;}' +
      '.ind-modal-continue{background:#c4622a;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:600;cursor:pointer;font-family:"DM Sans",sans-serif;transition:all 0.2s;}' +
      '.ind-modal-continue:hover:not(:disabled){background:#d4844a;}';
    document.head.appendChild(style);
  }

  function getSelected() {
    if (!overlayEl) return [];
    var chips = overlayEl.querySelectorAll('.ind-modal-chip.active');
    return Array.from(chips).map(function(c) { return c.getAttribute('data-industry'); });
  }

  function updateState() {
    var selected = getSelected();
    var counter = overlayEl.querySelector('.ind-modal-counter');
    if (counter) counter.textContent = selected.length + ' of ' + MAX_INDUSTRIES + ' selected';

    var continueBtn = overlayEl.querySelector('.ind-modal-continue');
    if (continueBtn) {
      if (selected.length >= 1) {
        continueBtn.disabled = false;
        continueBtn.style.opacity = '1';
        continueBtn.style.cursor = 'pointer';
      } else {
        continueBtn.disabled = true;
        continueBtn.style.opacity = '0.4';
        continueBtn.style.cursor = 'not-allowed';
      }
    }

    var msg = overlayEl.querySelector('.ind-modal-max-msg');
    if (msg) msg.style.display = 'none';
  }

  function buildModal() {
    if (overlayEl) return;
    injectStyles();

    overlayEl = document.createElement('div');
    overlayEl.id = 'industry-modal-overlay';

    var chipsHtml = INDUSTRIES.map(function(ind) {
      return '<button type="button" class="ind-modal-chip" data-industry="' + ind.name + '">' + ind.name + '</button>';
    }).join('');

    overlayEl.innerHTML =
      '<div class="ind-modal">' +
        '<div class="ind-modal-title">Select your industries</div>' +
        '<div class="ind-modal-sub">Choose up to 2 that best describe your business</div>' +
        '<div class="ind-modal-chips">' + chipsHtml + '</div>' +
        '<div class="ind-modal-counter">0 of 2 selected</div>' +
        '<div class="ind-modal-max-msg" style="display:none">Maximum 2 industries — remove one to select another</div>' +
        '<div class="ind-modal-actions">' +
          '<button type="button" class="ind-modal-cancel">Cancel</button>' +
          '<button type="button" class="ind-modal-continue" disabled style="opacity:0.4;cursor:not-allowed">Continue</button>' +
        '</div>' +
      '</div>';

    overlayEl.addEventListener('click', function(e) {
      var chip = e.target.closest('.ind-modal-chip');
      if (chip) {
        if (chip.classList.contains('active')) {
          chip.classList.remove('active');
        } else {
          if (getSelected().length >= MAX_INDUSTRIES) {
            var msg = overlayEl.querySelector('.ind-modal-max-msg');
            if (msg) msg.style.display = 'block';
            return;
          }
          chip.classList.add('active');
        }
        updateState();
        return;
      }

      if (e.target.closest('.ind-modal-cancel')) {
        closeModal();
        return;
      }

      if (e.target.closest('.ind-modal-continue')) {
        var selected = getSelected();
        if (selected.length < 1) return;
        sessionStorage.setItem('signup_industries', JSON.stringify(selected));
        closeModal();
        if (typeof onContinueCallback === 'function') onContinueCallback(selected);
        return;
      }

      if (e.target === overlayEl) {
        closeModal();
      }
    });

    document.body.appendChild(overlayEl);
  }

  function closeModal() {
    if (overlayEl) overlayEl.classList.remove('open');
    onContinueCallback = null;
  }

  function openIndustryModal(options) {
    options = options || {};
    buildModal();

    overlayEl.querySelectorAll('.ind-modal-chip').forEach(function(c) {
      c.classList.remove('active');
    });

    if (options.preSelect) {
      var pre = Array.isArray(options.preSelect) ? options.preSelect : [options.preSelect];
      pre.forEach(function(name) {
        var chip = overlayEl.querySelector('.ind-modal-chip[data-industry="' + name + '"]');
        if (chip) chip.classList.add('active');
      });
    }

    updateState();
    onContinueCallback = options.onContinue || null;
    overlayEl.classList.add('open');
  }

  window.openIndustryModal = openIndustryModal;
})();
