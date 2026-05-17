/**
 * cl-profile-products.js
 * Business Profile Services, Products, and Credentials panels —
 * multi-select pills, pricing rows + types, price formatting, plus the
 * Credentials panel render + save (kept here so cl-profile.js stays
 * under the 60K platform ceiling). Extends window.CL_PROFILE via
 * Object.assign so methods cross-call freely with the shell, form
 * primitives, and validation helpers in cl-profile.js.
 */
window.CL_PROFILE = window.CL_PROFILE || {};
Object.assign(window.CL_PROFILE, {

  _renderServices: function() {
    this._renderMultiSelect('svc', 'bp_services', 'Services', '🛠️', '3. Services',
      'What services your business provides with pricing', 'prof-panel-services', 'prof-svc-save');
  },

  _renderProducts: function() {
    this._renderMultiSelect('prod', 'bp_products', 'Products', '📦', '4. Products',
      'What products your business sells with pricing', 'prof-panel-products', 'prof-prod-save');
  },

  _renderMultiSelect: function(prefix, profileKey, label, icon, title, subtitle, panelId, saveBtnId) {
    var self = this;
    var items = this._vj(profileKey, []);
    var industries = this._va('industry');
    var mergeFn = prefix === 'svc' ? window.getMergedServices : window.getMergedProducts;
    var availableGroups = typeof mergeFn === 'function' ? mergeFn(industries) : [];
    var selectedNames = items.map(function(i) { return i.name || ''; }).filter(function(n) { return !!n; });
    var customItems = items.filter(function(i) { return i.is_custom; });
    var pricingTypes = window.BP_PRICING_TYPES || [];

    var pillsHtml = '<div class="profile-label" style="margin-bottom:8px">Select from your industry list</div>';
    pillsHtml += '<div id="prof-' + prefix + '-pills" style="margin-bottom:16px">';
    pillsHtml += this._renderAccordionGroups(availableGroups, 'svc-pill', selectedNames, 'prof-' + prefix);
    pillsHtml += '</div>';

    var customHtml = '<div style="margin-bottom:16px">';
    customHtml += '<div class="profile-label" style="margin-bottom:8px">Custom ' + label.toLowerCase() + '</div>';
    customHtml += '<div id="prof-' + prefix + '-custom-pills" class="review-pill-row" style="margin-bottom:8px">';
    customItems.forEach(function(item) {
      customHtml += '<button type="button" class="filter-pill active prof-custom-pill" data-svc-custom="' + window.escHtml(item.name) + '">' +
        window.escHtml(item.name) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="prof-' + prefix + '-custom-pills">×</span></button>';
    });
    customHtml += '</div>';
    customHtml += '<div style="display:flex;gap:8px;align-items:center">';
    customHtml += '<input type="text" class="profile-input" id="prof-' + prefix + '-other-input" placeholder="Add custom ' + label.toLowerCase().slice(0, -1) + '" style="flex:1" />';
    customHtml += '<button type="button" class="btn-outline btn-sm" id="prof-' + prefix + '-add-other">Add</button>';
    customHtml += '</div></div>';

    var pricingHtml = '<div id="prof-' + prefix + '-pricing" style="margin-top:8px"></div>';

    var body = '<div class="profile-fields" style="display:block">' +
      '<div class="profile-field-full">' +
        '<label class="profile-label">' + label + ' <span class="profile-required">*</span> <span class="profile-optional">(select all that apply, then set pricing)</span></label>' +
        pillsHtml + customHtml +
        '<div class="profile-label" style="margin-bottom:8px;margin-top:16px;font-weight:var(--heading-lg-weight)">Pricing for selected ' + label.toLowerCase() + '</div>' +
        pricingHtml +
      '</div>' +
    '</div>';

    var panelKey = prefix === 'svc' ? 'services' : 'products';
    document.getElementById(panelId).innerHTML = this._card(icon, title, subtitle, body, panelKey, saveBtnId);

    this._renderPricingRows(prefix, items, pricingTypes);
    this._bindMultiSelectPills(prefix, profileKey, pricingTypes);
    this._bindChipAccordion(document.getElementById('prof-' + prefix + '-pills'));

    var panelContainer = document.getElementById(panelId);
    this._bindAutoSave(prefix === 'svc' ? 'services' : 'products', panelContainer);

    document.getElementById(saveBtnId).addEventListener('click', function() {
      self._saveMultiSelect(prefix, profileKey, saveBtnId);
    });
  },

  _renderPricingRows: function(prefix, items, pricingTypes) {
    var self = this;
    var container = document.getElementById('prof-' + prefix + '-pricing');
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:var(--note-font-size);padding:8px 0">No ' + (prefix === 'svc' ? 'services' : 'products') + ' selected yet. Click items above to add them.</div>';
      this._bindPriceInputBehaviour(container);
      return;
    }
    var html = '';
    items.forEach(function(item, idx) {
      var pType = item.pricing_type || '';
      var pTypeLabel = pType ? (pricingTypes.find(function(pt) { return pt.value === pType; }) || {}).label || 'Pricing type...' : 'Pricing type...';
      var pTypeOpts = pricingTypes.map(function(pt) {
        return '<button type="button" class="lookback-dropdown-item' + (pt.value === pType ? ' active' : '') + '" data-value="' + pt.value + '">' + window.escHtml(pt.label) + '</button>';
      }).join('');
      var amountHtml = '';
      // BP UX Improvements Spec v1.0 §4 — text input + thousand separators,
      // wider fields so 7-digit prices fit without truncation.
      if (pType === 'hourly' || pType === 'fixed') {
        amountHtml = '<input type="text" inputmode="decimal" class="profile-input prof-svc-amount-val" value="' + window.escHtml(self._formatPrice(item.amount)) + '" placeholder="$ Amount" style="max-width:160px" />';
      } else if (pType === 'range') {
        amountHtml = '<input type="text" inputmode="decimal" class="profile-input prof-svc-amount-min" value="' + window.escHtml(self._formatPrice(item.amount_min)) + '" placeholder="$ Min" style="max-width:110px" />' +
          '<input type="text" inputmode="decimal" class="profile-input prof-svc-amount-max" value="' + window.escHtml(self._formatPrice(item.amount_max)) + '" placeholder="$ Max" style="max-width:110px" />';
      }
      var rowClass = 'profile-svc-row' + (pType === 'range' ? ' profile-svc-row-range' : '');
      html += '<div class="' + rowClass + '" data-svc-pricing="' + window.escHtml(item.name) + '" data-custom="' + (item.is_custom ? '1' : '0') + '">' +
        '<div style="font-size:var(--btn-font-size);font-weight:500;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + window.escHtml(item.name) + '</div>' +
        '<span class="lookback-dropdown-wrap">' +
          '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-svc-ptype" data-value="' + window.escHtml(pType) + '">' + window.escHtml(pTypeLabel) + '</button>' +
          '<div class="lookback-dropdown-menu">' + pTypeOpts + '</div>' +
        '</span>' +
        amountHtml +
      '</div>';
    });
    container.innerHTML = html;
    this._bindPriceInputBehaviour(container);

    container.querySelectorAll('.lookback-dropdown-wrap').forEach(function(wrap) {
      var trigger = wrap.querySelector('.lookback-dropdown');
      var menu = wrap.querySelector('.lookback-dropdown-menu');
      if (!trigger || !menu) return;
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.lookback-dropdown-menu.open').forEach(function(m) { if (m !== menu) m.classList.remove('open'); });
        menu.classList.toggle('open');
        trigger.classList.toggle('active');
      });
      menu.querySelectorAll('.lookback-dropdown-item').forEach(function(menuItem) {
        menuItem.addEventListener('click', function() {
          var val = menuItem.getAttribute('data-value');
          trigger.setAttribute('data-value', val);
          trigger.textContent = menuItem.textContent;
          menu.querySelectorAll('.lookback-dropdown-item').forEach(function(it) { it.classList.remove('active'); });
          menuItem.classList.add('active');
          menu.classList.remove('open');
          trigger.classList.remove('active');
          self._updatePricingFields(trigger.closest('.profile-svc-row'), val);
        });
      });
    });
  },

  _bindMultiSelectPills: function(prefix, profileKey, pricingTypes) {
    var self = this;
    var pillsContainer = document.getElementById('prof-' + prefix + '-pills');
    if (pillsContainer) {
      pillsContainer.addEventListener('click', function(e) {
        var pill = e.target.closest('.filter-pill');
        if (!pill) return;
        pill.classList.toggle('active');
        self._syncPricingFromPills(prefix, pricingTypes);
      });
    }

    var customPillsContainer = document.getElementById('prof-' + prefix + '-custom-pills');
    if (customPillsContainer) {
      customPillsContainer.addEventListener('click', function(e) {
        var removeSpan = e.target.closest('.prof-pill-remove');
        if (removeSpan) {
          var pill = removeSpan.closest('.filter-pill');
          if (pill) pill.parentNode.removeChild(pill);
          self._syncPricingFromPills(prefix, pricingTypes);
        }
      });
    }

    var addBtn = document.getElementById('prof-' + prefix + '-add-other');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var input = document.getElementById('prof-' + prefix + '-other-input');
        var val = input ? input.value.trim() : '';
        if (!val) return;
        var customContainer = document.getElementById('prof-' + prefix + '-custom-pills');
        var existing = Array.from(customContainer.querySelectorAll('.filter-pill')).map(function(p) { return p.getAttribute('data-svc-custom'); });
        if (existing.indexOf(val) > -1) { input.value = ''; return; }
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'filter-pill active prof-custom-pill';
        chip.setAttribute('data-svc-custom', val);
        chip.innerHTML = window.escHtml(val) + ' <span class="prof-pill-remove" data-action="remove-other" data-group="prof-' + prefix + '-custom-pills">×</span>';
        customContainer.appendChild(chip);
        input.value = '';
        self._syncPricingFromPills(prefix, pricingTypes);
      });
    }
  },

  _syncPricingFromPills: function(prefix, pricingTypes) {
    var pillsContainer = document.getElementById('prof-' + prefix + '-pills');
    var customContainer = document.getElementById('prof-' + prefix + '-custom-pills');
    var pricingContainer = document.getElementById('prof-' + prefix + '-pricing');
    if (!pricingContainer) return;

    var self = this;
    var existingPricing = {};
    pricingContainer.querySelectorAll('[data-svc-pricing]').forEach(function(row) {
      var name = row.getAttribute('data-svc-pricing');
      var pTypeBtn = row.querySelector('.prof-svc-ptype');
      var amountVal = row.querySelector('.prof-svc-amount-val');
      var amountMin = row.querySelector('.prof-svc-amount-min');
      var amountMax = row.querySelector('.prof-svc-amount-max');
      existingPricing[name] = {
        pricing_type: pTypeBtn ? pTypeBtn.getAttribute('data-value') : '',
        amount: amountVal ? self._unformatPrice(amountVal.value) : null,
        amount_min: amountMin ? self._unformatPrice(amountMin.value) : null,
        amount_max: amountMax ? self._unformatPrice(amountMax.value) : null,
        is_custom: row.getAttribute('data-custom') === '1'
      };
    });

    var items = [];
    if (pillsContainer) {
      pillsContainer.querySelectorAll('.filter-pill.active').forEach(function(pill) {
        var name = pill.getAttribute('data-svc-pill');
        var existing = existingPricing[name] || {};
        items.push({ name: name, pricing_type: existing.pricing_type || '', amount: existing.amount || null, amount_min: existing.amount_min || null, amount_max: existing.amount_max || null, is_custom: false });
      });
    }
    if (customContainer) {
      customContainer.querySelectorAll('.filter-pill').forEach(function(pill) {
        var name = pill.getAttribute('data-svc-custom');
        var existing = existingPricing[name] || {};
        items.push({ name: name, pricing_type: existing.pricing_type || '', amount: existing.amount || null, amount_min: existing.amount_min || null, amount_max: existing.amount_max || null, is_custom: true });
      });
    }
    this._renderPricingRows(prefix, items, pricingTypes);
  },

  _updatePricingFields: function(row, pType) {
    var existingAmounts = row.querySelectorAll('.prof-svc-amount-val, .prof-svc-amount-min, .prof-svc-amount-max');
    existingAmounts.forEach(function(el) { el.parentNode.removeChild(el); });

    function makePriceInput(cls, placeholder, width) {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.className = 'profile-input ' + cls;
      inp.placeholder = placeholder;
      inp.style.maxWidth = width;
      return inp;
    }

    if (pType === 'hourly' || pType === 'fixed') {
      row.appendChild(makePriceInput('prof-svc-amount-val', '$ Amount', '160px'));
      row.classList.remove('profile-svc-row-range');
    } else if (pType === 'range') {
      row.appendChild(makePriceInput('prof-svc-amount-min', '$ Min', '110px'));
      row.appendChild(makePriceInput('prof-svc-amount-max', '$ Max', '110px'));
      row.classList.add('profile-svc-row-range');
    } else {
      row.classList.remove('profile-svc-row-range');
    }
  },

  // Format a numeric value as a thousand-separated string for display in
  // a price input. Returns '' for null/undefined/0/NaN so empty inputs
  // stay visually empty rather than showing "0". (BP UX Spec v1.0 §4.)
  _formatPrice: function(num) {
    if (num == null || num === '' || isNaN(num)) return '';
    var n = Number(num);
    if (n === 0) return '';
    return n.toLocaleString('en-AU', { maximumFractionDigits: 2 });
  },

  // Inverse of _formatPrice — strip any non-numeric characters (commas,
  // currency symbols, spaces) and parse to a Number. Returns null for
  // empty/invalid input so "no value" round-trips cleanly.
  _unformatPrice: function(str) {
    if (str == null || str === '') return null;
    var clean = String(str).replace(/[^\d.]/g, '');
    if (!clean) return null;
    var n = parseFloat(clean);
    return isNaN(n) ? null : n;
  },

  _bindPriceInputBehaviour: function(container) {
    if (!container || container.dataset.priceBehaviourBound) return;
    container.dataset.priceBehaviourBound = '1';
    var self = this;
    var sel = '.prof-svc-amount-val, .prof-svc-amount-min, .prof-svc-amount-max';
    container.addEventListener('focusin', function(e) {
      var input = e.target;
      if (!input.matches || !input.matches(sel)) return;
      // Strip formatting and clear if zero so user can type immediately.
      var raw = self._unformatPrice(input.value);
      input.value = (raw == null || raw === 0) ? '' : String(raw);
    });
    container.addEventListener('focusout', function(e) {
      var input = e.target;
      if (!input.matches || !input.matches(sel)) return;
      input.value = self._formatPrice(self._unformatPrice(input.value));
    });
  },

  _collectMultiSelectData: function(prefix) {
    var self = this;
    var pricingContainer = document.getElementById('prof-' + prefix + '-pricing');
    if (!pricingContainer) return [];
    return Array.from(pricingContainer.querySelectorAll('[data-svc-pricing]')).map(function(row) {
      var name = row.getAttribute('data-svc-pricing');
      var isCustom = row.getAttribute('data-custom') === '1';
      var pTypeBtn = row.querySelector('.prof-svc-ptype');
      var pType = pTypeBtn ? pTypeBtn.getAttribute('data-value') : '';
      var amountVal = row.querySelector('.prof-svc-amount-val');
      var amountMin = row.querySelector('.prof-svc-amount-min');
      var amountMax = row.querySelector('.prof-svc-amount-max');
      return {
        name: name,
        pricing_type: pType,
        amount: amountVal ? self._unformatPrice(amountVal.value) : null,
        amount_min: amountMin ? self._unformatPrice(amountMin.value) : null,
        amount_max: amountMax ? self._unformatPrice(amountMax.value) : null,
        is_custom: isCustom
      };
    });
  },

  _saveMultiSelect: function(prefix, profileKey, saveBtnId, opts) {
    var self = this;
    var autoSave = !!(opts && opts.autoSave);
    var btn = document.getElementById(saveBtnId);
    window.handleSave(btn, async function() {
      var data = self._collectMultiSelectData(prefix);
      // Skip validation on auto-save — see comment in _saveIdentity.
      if (!autoSave) {
        var panelId = prefix === 'svc' ? 'prof-panel-services' : 'prof-panel-products';
        var groupEl = document.getElementById('prof-' + prefix + '-pills');
        var label = prefix === 'svc' ? 'Services (at least one)' : 'Products (at least one)';
        self._validateMandatory(panelId, [
          { test: function() { return Array.isArray(data) && data.length > 0; }, el: groupEl, label: label }
        ]);
      }
      var updates = {};
      updates[profileKey] = data;
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
      if (autoSave) self._showSaved(prefix === 'svc' ? 'services' : 'products');
    }, document.getElementById('prof-save-msg'));
  },

  // ── Credentials panel (kept here so cl-profile.js stays under the
  //    60K platform ceiling) ─────────────────────────────────────────
  _renderCredentials: function() {
    var industries = this._va('industry');
    if (typeof this._v('industry') === 'string' && this._v('industry')) {
      industries = [this._v('industry')];
    }
    var licenceOpts = typeof window.getMergedLicences === 'function' ? window.getMergedLicences(industries) : [];
    var selectedLicences = this._va('licences');
    // licenceOpts is now an array of { name, items } groups; flatten to a
    // membership set so we can detect saved values that don't match any
    // standard chip and render them as custom pills instead.
    var standardLicenceSet = {};
    licenceOpts.forEach(function(g) { (g.items || []).forEach(function(i) { standardLicenceSet[i] = true; }); });
    var customLicences = selectedLicences.filter(function(l) { return !standardLicenceSet[l]; });
    var licenceHtml = this._chipGroupWithOther('prof-licences', licenceOpts, selectedLicences, customLicences);

    var paymentOpts = window.BP_PAYMENT_METHOD_OPTIONS || [];
    var selectedPayments = this._va('payment_methods');
    var paymentHtml = this._chipGroup('prof-payments', paymentOpts, selectedPayments);

    var responseOpts = window.BP_RESPONSE_TIME_OPTIONS || [];
    var responseHtml = this._dropdown('prof-response-time', responseOpts, this._v('response_time'));

    var afterHoursOpts = window.BP_AFTER_HOURS_OPTIONS || [];
    var ahData = this._vj('after_hours_support', { type: '', hours_text: '' });
    var ahType = ahData.type || '';
    var ahText = ahData.hours_text || '';
    var afterHoursHtml = this._dropdown('prof-after-hours', afterHoursOpts, ahType) +
      '<input type="text" id="prof-after-hours-text" class="profile-input" value="' + window.escHtml(ahText) + '" placeholder="e.g. Available 6pm–10pm weekdays" style="margin-top:8px;' + (ahType === 'Available' ? '' : 'display:none;') + '" />';

    var body = '<div class="profile-fields">' +
      this._field('Licences &amp; Accreditations <span class="profile-optional">(optional)</span>', licenceHtml) +
      this._field('Payment Methods Accepted <span class="profile-required">*</span>', paymentHtml) +
      this._field2('Typical Response Time <span class="profile-required">*</span>', responseHtml) +
      this._field2('After-Hours Support <span class="profile-required">*</span>', afterHoursHtml) +
      this._field('Warranty / Guarantee <span class="profile-required">*</span>', this._textarea('prof-warranty', this._v('warranty_info'), 'e.g. 12-month warranty on all workmanship', 3)) +
      this._field('Complaints Handling <span class="profile-required">*</span>', this._textarea('prof-complaints', this._v('complaints_handling'), 'e.g. All complaints acknowledged within 24 hours, resolved within 5 business days', 3)) +
    '</div>';

    document.getElementById('prof-panel-credentials').innerHTML = this._card(
      '📜', '5. Credentials &amp; Support', 'Licences, payment, response times, and support policies', body, 'credentials', 'prof-cred-save'
    );

    var self = this;
    var credPanel = document.getElementById('prof-panel-credentials');
    self._bindChipToggles(credPanel);
    self._bindPhoneTypeDropdowns(credPanel);
    self._bindChipAccordion(document.getElementById('prof-licences'));
    self._bindAutoSave('credentials', credPanel);

    document.getElementById('prof-cred-save').addEventListener('click', function() { self._saveCredentials(); });

    var afterHoursBtn = document.getElementById('prof-after-hours');
    if (afterHoursBtn) {
      var observer = new MutationObserver(function() {
        var val = afterHoursBtn.getAttribute('data-value');
        var textField = document.getElementById('prof-after-hours-text');
        if (textField) textField.style.display = val === 'Available' ? '' : 'none';
        self._scheduleAutoSave('credentials', 500);
      });
      observer.observe(afterHoursBtn, { attributes: true, attributeFilter: ['data-value'] });
    }

    var responseBtn = document.getElementById('prof-response-time');
    if (responseBtn) {
      var respObserver = new MutationObserver(function() {
        self._scheduleAutoSave('credentials', 500);
      });
      respObserver.observe(responseBtn, { attributes: true, attributeFilter: ['data-value'] });
    }
  },

  _saveCredentials: function(opts) {
    var self = this;
    var autoSave = !!(opts && opts.autoSave);
    var btn = document.getElementById('prof-cred-save');
    window.handleSave(btn, async function() {
      var licences = self._getSelectedChips('prof-licences').concat(self._getOtherItems('prof-licences'));
      var payments = self._getSelectedChips('prof-payments');
      var paymentsEl = document.getElementById('prof-payments');
      var responseEl = document.getElementById('prof-response-time');
      var warrantyEl = document.getElementById('prof-warranty');
      var complaintsEl = document.getElementById('prof-complaints');
      var afterHoursEl = document.getElementById('prof-after-hours');
      var afterHoursType = afterHoursEl.getAttribute('data-value') || '';
      var afterHoursText = document.getElementById('prof-after-hours-text').value.trim();
      // Skip validation on auto-save — see comment in _saveIdentity.
      if (!autoSave) {
        self._validateMandatory('prof-panel-credentials', [
          { test: function() { return payments.length > 0; }, el: paymentsEl, label: 'Payment Methods (at least one)' },
          { test: function() { return (responseEl.getAttribute('data-value') || '').trim() !== ''; }, el: responseEl, label: 'Response Time' },
          { test: function() { return warrantyEl.value.trim() !== ''; }, el: warrantyEl, label: 'Warranty / Guarantee' },
          { test: function() { return complaintsEl.value.trim() !== ''; }, el: complaintsEl, label: 'Complaints Handling' },
          { test: function() { return afterHoursType.trim() !== ''; }, el: afterHoursEl, label: 'After-Hours Support' }
        ]);
      }
      var updates = {
        licences: licences,
        payment_methods: payments,
        response_time: responseEl.getAttribute('data-value') || '',
        warranty_info: warrantyEl.value.trim(),
        complaints_handling: complaintsEl.value.trim(),
        after_hours_support: { type: afterHoursType, hours_text: afterHoursText }
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);
      if (autoSave) self._showSaved('credentials');
    }, document.getElementById('prof-save-msg'));
  }

});
