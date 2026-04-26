// industry-modal.js — Reusable pre-login industry selection modal
// Uses .perm-modal-overlay / .perm-modal pattern from staxai-auth.css
// and .filter-pill / .active pattern for industry chips

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

    overlayEl = document.createElement('div');
    overlayEl.className = 'perm-modal-overlay';
    overlayEl.id = 'industry-modal-overlay';

    var chipsHtml = INDUSTRIES.map(function(ind) {
      return '<button type="button" class="filter-pill ind-modal-chip" data-industry="' + ind.name + '">' + ind.name + '</button>';
    }).join('');

    overlayEl.innerHTML =
      '<div class="perm-modal" style="max-width:520px">' +
        '<div class="perm-modal-title">Select your industries</div>' +
        '<div class="perm-modal-body">' +
          '<p style="margin-bottom:16px">Choose up to 2 that best describe your business</p>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">' + chipsHtml + '</div>' +
          '<div class="ind-modal-counter" style="font-size:13px;color:var(--text-muted,#888);margin-bottom:4px">0 of 2 selected</div>' +
          '<div class="ind-modal-max-msg" style="display:none;font-size:13px;color:var(--red,#dc3545);margin-bottom:8px">Maximum 2 industries — remove one to select another</div>' +
        '</div>' +
        '<div class="perm-modal-actions">' +
          '<button type="button" class="perm-modal-cancel ind-modal-cancel">Cancel</button>' +
          '<button type="button" class="perm-modal-continue ind-modal-continue" disabled style="opacity:0.4;cursor:not-allowed">Continue</button>' +
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
