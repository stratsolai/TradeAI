/**
 * cl-profile-location.js
 * Business Profile Location panel — location block, trading hours,
 * phones, sites, multiple locations, Google Places address autocomplete,
 * and the Location panel save. Extends window.CL_PROFILE via Object.assign
 * so methods cross-call freely with the shell, form primitives, and
 * validation helpers in cl-profile.js.
 */

// @BP_FIELDS:location — single source of truth for the fields this
// panel writes to profiles via /api/profile-save. Read by the
// endpoint at module load time (fs.readFileSync on this file +
// regex extract) to derive its allow-list. See cl-profile.js for
// the maintenance contract. Do not rename the
// `window.BP_FIELDS_LOCATION` identifier — the endpoint parser
// anchors on it.
window.BP_FIELDS_LOCATION = [
  'address_name',
  'address_unit',
  'address_street',
  'address_suburb',
  'address_state',
  'address_postcode',
  'additional_phones',
  'additional_locations',
  'website_urls',
  'service_area',
  'trading_hours'
];

window.CL_PROFILE = window.CL_PROFILE || {};
Object.assign(window.CL_PROFILE, {

  _locationBlock: function(loc, idx, isPrimary) {
    var idPfx = isPrimary ? 'loc-p' : 'loc-' + idx;
    var nameVal = loc.name || '';
    var phones = Array.isArray(loc.phones) ? loc.phones : (loc.phone ? [{ type: 'Mobile', number: loc.phone }] : [{ type: 'Mobile', number: '' }]);
    var typeOpts = ['Main', 'Mobile', 'Work', 'Fax'];
    var phonesHtml = phones.map(function(ph, pi) {
      var currentType = ph.type || 'Mobile';
      var typeSelect = '<span class="lookback-dropdown-wrap">' +
        '<button type="button" class="lookback-dropdown loc-phone-type" data-value="' + window.escHtml(currentType) + '">' + window.escHtml(currentType) + '</button>' +
        '<div class="lookback-dropdown-menu">' +
        typeOpts.map(function(t) {
          return '<button type="button" class="lookback-dropdown-item' + (t === currentType ? ' active' : '') + '" data-value="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
        }).join('') +
        '</div></span>';
      return '<div class="profile-repeating-row" id="' + idPfx + '-ph-' + pi + '">' +
        typeSelect +
        '<input type="text" class="profile-input loc-phone-number" value="' + window.escHtml(window.formatPhoneNumber(ph.number || '')) + '" placeholder="Phone number" />' +
        '<button class="btn-remove-url" data-action="remove-row" data-target="' + idPfx + '-ph-' + pi + '">Remove</button>' +
      '</div>';
    }).join('');
    var removeBtn = isPrimary ? '' :
      '<button class="btn-remove-url" data-action="remove-row" data-target="loc-block-' + idx + '">Remove Location</button>';
    return '<div class="profile-location-block" id="' + (isPrimary ? 'loc-primary-block' : 'loc-block-' + idx) + '">' +
      '<div class="profile-location-row-header">' +
        '<strong class="profile-location-title">' + (isPrimary ? 'Primary Location' : 'Location ' + (idx + 2)) + '</strong>' +
        removeBtn +
      '</div>' +
      '<div class="profile-fields profile-fields-compact">' +
        '<div class="profile-field-full"><label class="profile-label">Location Name <span class="profile-required">*</span></label>' +
          '<input type="text" class="profile-input loc-name" placeholder="e.g. Main Office, Warehouse, Bendigo Site" value="' + window.escHtml(nameVal) + '" /></div>' +
        '<div class="profile-field-full"><label class="profile-label">Suite / Level / Unit <span class="profile-optional">(optional)</span></label>' +
          '<input type="text" class="profile-input loc-unit" placeholder="e.g. Suite 4, Level 2, Shed 3" value="' + window.escHtml(loc.unit || '') + '" /></div>' +
        '<div class="profile-field-full"><label class="profile-label">Street Address <span class="profile-required">*</span></label>' +
          '<input type="text" class="profile-input loc-street" placeholder="Street address" value="' + window.escHtml(loc.street || '') + '" /></div>' +
        '<div class="profile-field-full"><div class="profile-address-row">' +
          '<div><label class="profile-label">Suburb <span class="profile-required">*</span></label><input type="text" class="profile-input loc-suburb" placeholder="Suburb" value="' + window.escHtml(loc.suburb || '') + '" /></div>' +
          '<div><label class="profile-label">State <span class="profile-required">*</span></label>' +
          (function() {
            var states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
            var current = states.indexOf(loc.state) !== -1 ? loc.state : '';
            // "Select state" appears only on the trigger as a
            // placeholder while nothing is picked — no matching menu
            // item, so users can't re-select the empty state. Once a
            // real state is set, the button label switches to it.
            var triggerLabel = current === '' ? 'Select state' : current;
            var items = states.map(function(s) {
              return '<button type="button" class="lookback-dropdown-item' + (s === current ? ' active' : '') + '" data-value="' + s + '">' + s + '</button>';
            }).join('');
            return '<span class="lookback-dropdown-wrap">'
              + '<button type="button" class="lookback-dropdown lookback-dropdown-field loc-state" data-value="' + window.escHtml(current) + '">' + window.escHtml(triggerLabel) + '</button>'
              + '<div class="lookback-dropdown-menu loc-state-menu">' + items + '</div>'
              + '</span>';
          })() + '</div>' +
          '<div><label class="profile-label">Postcode <span class="profile-required">*</span></label><input type="text" class="profile-input loc-postcode" placeholder="Postcode" value="' + window.escHtml(loc.postcode || '') + '" /></div>' +
        '</div></div>' +
      '</div>' +
      '<div class="profile-label profile-label-heading">Phone Numbers <span class="profile-required">*</span></div>' +
      '<div class="loc-phones-wrap" id="' + idPfx + '-phones">' + phonesHtml + '</div>' +
      '<button class="btn-add-connection" data-action="add-phone" data-target="' + idPfx + '">+ Add Phone</button>' +
    '</div>';
  },

  _renderLocation: function() {
    var p = this._profile;
    var primaryLoc = {
      name: this._v('address_name'),
      unit: this._v('address_unit'),
      street: this._v('address_street'),
      suburb: this._v('address_suburb'),
      state: this._v('address_state'),
      postcode: this._v('address_postcode'),
      phones: Array.isArray(p.additional_phones) ? p.additional_phones.map(function(ph) {
        if (typeof ph === 'string') { try { return JSON.parse(ph); } catch(e) { return { type: 'Mobile', number: ph }; } }
        return ph;
      }) : [{ type: 'Mobile', number: '' }]
    };
    var extraLocs = Array.isArray(p.additional_locations) ? p.additional_locations : [];
    var sites = Array.isArray(p.website_urls) ? p.website_urls : [];
    var extraLocsHtml = extraLocs.map(function(loc, i) {
      return window.CL_PROFILE._locationBlock(loc, i, false);
    }).join('');
    var extraSitesHtml = sites.slice(1).map(function(u, i) {
      return '<div class="profile-repeating-row" id="prof-site-' + (i + 1) + '">' +
        '<input type="url" class="profile-input prof-add-site" value="' + window.escHtml(u) + '" placeholder="https://yoursite.com.au" />' +
        '<button class="btn-remove-url" data-action="remove-row" data-target="prof-site-' + (i + 1) + '">Remove</button>' +
      '</div>';
    }).join('');

    var serviceAreaOpts = window.BP_SERVICE_AREA_OPTIONS || [];
    var selectedArea = this._va('service_area');
    var customAreas = selectedArea.filter(function(a) { return serviceAreaOpts.indexOf(a) === -1; });
    var serviceAreaHtml = this._chipGroupWithOther('prof-service-area', serviceAreaOpts, selectedArea, customAreas);

    var tradingHours = this._vj('trading_hours', []);
    var hoursHtml = this._renderTradingHours(tradingHours);

    var body =
      this._locationBlock(primaryLoc, 0, true) +
      '<div id="prof-extra-locs">' + extraLocsHtml + '</div>' +
      '<button class="btn-add-connection profile-btn-add-location" data-action="add-location">+ Add Location</button>' +
      '<div class="profile-location-block profile-location-block-websites">' +
        '<div class="profile-label profile-label-heading">Website URL(s)</div>' +
        '<input type="url" id="prof-site-primary" class="profile-input profile-input-mb" value="' + window.escHtml(sites[0] || '') + '" placeholder="https://yoursite.com.au" />' +
        '<div id="prof-sites-extra">' + extraSitesHtml + '</div>' +
        '<button class="btn-add-connection" data-action="add-site">+ Add Website</button>' +
      '</div>' +
      '<div class="profile-fields" style="margin-top:16px">' +
        this._field('Service Area <span class="profile-required">*</span>', serviceAreaHtml) +
        this._field('Trading Hours <span class="profile-required">*</span>', hoursHtml) +
      '</div>';

    document.getElementById('prof-panel-location').innerHTML = this._card(
      '📍', '2. Location &amp; Contact', 'Where you operate and how to reach you', body, 'location', 'prof-loc-save'
    );

    var self = this;
    document.getElementById('prof-loc-save').addEventListener('click', function() { self._saveLocation(); });
    var locPanel = document.getElementById('prof-panel-location');
    self._wirePhoneFormat(locPanel);
    self._bindPhoneTypeDropdowns(locPanel);
    self._bindChipToggles(locPanel);
    self._bindHoursPresets();
    self._bindAutoSave('location', locPanel);
    self._wireStateDropdowns(locPanel);
    self._wireHoursDropdowns(locPanel);
    self._initStreetAutocomplete();

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.lookback-dropdown-wrap')) {
        document.querySelectorAll('#cl-tab-profile .lookback-dropdown-menu.open').forEach(function(m) { m.classList.remove('open'); });
        document.querySelectorAll('#cl-tab-profile .lookback-dropdown.active').forEach(function(b) { b.classList.remove('active'); });
      }
    });
  },

  // Wire each .loc-state lookback-dropdown in the location panel
  // (one per primary + per additional location). Outside-click close
  // is handled by the existing global handler at the bottom of
  // _renderLocation, so each per-instance wiring only needs to handle
  // trigger toggle, item-click selection, and auto-save firing.
  _wireStateDropdowns: function(scope) {
    var self = this;
    scope.querySelectorAll('.loc-state').forEach(function(btn) {
      var menu = btn.parentNode.querySelector('.loc-state-menu');
      self._wireLookback(btn, menu, function() {
        self._scheduleAutoSave('location', 300);
      });
    });
  },

  _renderTradingHours: function(hours) {
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var hoursMap = {};
    if (Array.isArray(hours)) {
      hours.forEach(function(h) { hoursMap[h.day] = h; });
    }
    // Curated common opening / closing slots. Anything outside these
    // goes through the Custom item, which swaps the dropdown for a
    // free text input — the parser is forgiving on form, strict on
    // value (HH:MM 24-hour out).
    var openChoices = [
      { value: '06:00', label: '6:00 AM' },
      { value: '06:30', label: '6:30 AM' },
      { value: '07:00', label: '7:00 AM' },
      { value: '07:30', label: '7:30 AM' },
      { value: '08:00', label: '8:00 AM' },
      { value: '08:30', label: '8:30 AM' },
      { value: '09:00', label: '9:00 AM' }
    ];
    var closeChoices = [
      { value: '15:00', label: '3:00 PM' },
      { value: '15:30', label: '3:30 PM' },
      { value: '16:00', label: '4:00 PM' },
      { value: '16:30', label: '4:30 PM' },
      { value: '17:00', label: '5:00 PM' },
      { value: '17:30', label: '5:30 PM' },
      { value: '18:00', label: '6:00 PM' }
    ];
    var self = this;
    var renderTimeMenu = function(choices, activeValue) {
      var items = choices.map(function(t) {
        return '<button type="button" class="lookback-dropdown-item' + (t.value === activeValue ? ' active' : '') + '" data-value="' + t.value + '">' + t.label + '</button>';
      }).join('');
      // Custom item sits at the end. _wireHoursDropdowns catches the
      // __custom__ sentinel in onSelect and swaps the cell to input
      // mode rather than persisting it as a value.
      items += '<button type="button" class="lookback-dropdown-item prof-hours-custom-item" data-value="__custom__">Custom…</button>';
      return items;
    };

    var presetHtml = '<div class="profile-hours-preset">' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="business">Mon–Fri 8:00–5:00</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="24-7">24/7</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="appointment">By Appointment</button>' +
    '</div>';

    var renderPicker = function(kind, day, currentValue, isDisabled) {
      var choices = kind === 'open' ? openChoices : closeChoices;
      var disabledAttr = isDisabled ? ' disabled' : '';
      var label = self._formatTime(currentValue);
      // Custom row layout: HH:MM text input, AM/PM toggle button, ×
      // cancel. The AM/PM is a separate control (not typed) so users
      // can't fat-finger the period; the input is narrow and just
      // accepts "H", "H:MM", or "HH:MM" — leading zeros optional.
      return '<div class="prof-hours-cell">'
        + '<span class="lookback-dropdown-wrap prof-hours-dropdown">'
          + '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-hours-' + kind + '" data-day="' + day + '" data-value="' + currentValue + '"' + disabledAttr + '>' + label + '</button>'
          + '<div class="lookback-dropdown-menu prof-hours-' + kind + '-menu">' + renderTimeMenu(choices, currentValue) + '</div>'
        + '</span>'
        + '<div class="prof-hours-custom" style="display:none">'
          + '<input type="text" class="profile-input prof-hours-custom-time" placeholder="HH:MM" maxlength="5" inputmode="numeric"' + disabledAttr + ' />'
          + '<button type="button" class="prof-hours-ampm" data-value="AM"' + disabledAttr + '>AM</button>'
          + '<button type="button" class="prof-hours-custom-cancel" title="Cancel and return to dropdown">×</button>'
        + '</div>'
      + '</div>';
    };

    var rowsHtml = days.map(function(day) {
      var data = hoursMap[day] || { enabled: false, open: '08:00', close: '17:00' };
      var checked = data.enabled ? ' checked' : '';
      var openVal = data.open || '08:00';
      var closeVal = data.close || '17:00';
      return '<div class="profile-hours-row">' +
        '<label class="profile-hours-day"><input type="checkbox" class="prof-hours-toggle" data-day="' + day + '"' + checked + ' /> ' + day + '</label>' +
        renderPicker('open', day, openVal, !data.enabled) +
        renderPicker('close', day, closeVal, !data.enabled) +
      '</div>';
    }).join('');

    return presetHtml + '<div class="profile-hours-grid" id="prof-hours-grid">' + rowsHtml + '</div>';
  },

  // Format a "HH:MM" 24-hour string as a 12-hour label with AM/PM.
  // Returns the input unchanged if it doesn't parse — keeps the UI
  // resilient to legacy or malformed saved values.
  _formatTime: function(value) {
    var parts = (value || '').split(':');
    if (parts.length !== 2) return value || '';
    var h = parseInt(parts[0], 10);
    var mm = parts[1];
    if (isNaN(h) || mm.length !== 2) return value || '';
    var displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    var ampm = h < 12 ? 'AM' : 'PM';
    return displayH + ':' + mm + ' ' + ampm;
  },

  // Programmatic time set on a hours-picker trigger button. Updates
  // data-value, label, and active-class — works whether or not the
  // value lands on a curated item, so presets like 24/7 (00:00 /
  // 23:30) outside the curated list still display correctly.
  _setHoursValue: function(btn, value) {
    if (!btn) return;
    var menu = btn.parentNode.querySelector('.lookback-dropdown-menu');
    btn.setAttribute('data-value', value);
    btn.textContent = this._formatTime(value);
    if (!menu) return;
    var items = menu.querySelectorAll('.lookback-dropdown-item');
    items.forEach(function(i) { i.classList.remove('active'); });
    items.forEach(function(i) {
      if (i.getAttribute('data-value') === value) i.classList.add('active');
    });
  },

  _toggleHoursRow: function(checkbox) {
    var day = checkbox.dataset.day;
    var row = checkbox.closest('.profile-hours-row');
    // Now operating on lookback-dropdown trigger buttons rather than
    // native <select>s — same .disabled property, just on a different
    // element type. Buttons that are .disabled don't fire click, so
    // the menu can't open while the day is unchecked.
    row.querySelectorAll('.lookback-dropdown-field').forEach(function(b) { b.disabled = !checkbox.checked; });
    row.querySelectorAll('.prof-hours-custom-time, .prof-hours-ampm').forEach(function(i) { i.disabled = !checkbox.checked; });
    // If the user uncheck-s while a cell is mid-Custom-edit, drop
    // them back to the dropdown view so the disabled state is visible
    // and the input doesn't sit there enabled-looking.
    if (!checkbox.checked) {
      var self = this;
      row.querySelectorAll('.prof-hours-cell').forEach(function(cell) {
        var customWrap = cell.querySelector('.prof-hours-custom');
        if (customWrap && customWrap.style.display === 'flex') {
          self._exitHoursCustomMode(cell);
        }
      });
    }
  },

  // Wire every open/close lookback in the hours grid. Multiple
  // instances render (7 days × open + close = 14), so wiring is
  // class-based rather than ID-based: each trigger's sibling menu is
  // found via parentNode + class. The onSelect callback either swaps
  // the cell to Custom (free-text) input mode or fires the location-
  // panel auto-save the same way native change events used to be
  // picked up by _bindAutoSave's `select` selector.
  _wireHoursDropdowns: function(scope) {
    var self = this;
    scope.querySelectorAll('.prof-hours-open, .prof-hours-close').forEach(function(btn) {
      var menu = btn.parentNode.querySelector('.lookback-dropdown-menu');
      self._wireLookback(btn, menu, function(value) {
        if (value === '__custom__') {
          self._enterHoursCustomMode(btn);
          return;
        }
        self._scheduleAutoSave('location', 300);
      });
    });

    // Wire the custom-mode controls per cell. Each cell holds a
    // dropdown row plus a custom row (input + AM/PM toggle + cancel)
    // and we keep them in sync via element references. The dataset
    // guard makes this safe to call repeatedly on re-renders.
    scope.querySelectorAll('.prof-hours-cell').forEach(function(cell) {
      if (cell.dataset.customWired === '1') return;
      cell.dataset.customWired = '1';
      var input = cell.querySelector('.prof-hours-custom-time');
      var ampmBtn = cell.querySelector('.prof-hours-ampm');
      var cancelBtn = cell.querySelector('.prof-hours-custom-cancel');
      var trigger = cell.querySelector('.prof-hours-open, .prof-hours-close');
      if (!input || !ampmBtn || !cancelBtn || !trigger) return;

      var commit = function() {
        var raw = (input.value || '').trim();
        if (!raw) return;
        // Accept "H" / "HH" / "H:MM" / "HH:MM" — 12-hour. AM/PM is
        // separate so we don't let the user type letters into the
        // time input.
        var match = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
        if (!match) { input.classList.add('input-error'); return; }
        var h12 = parseInt(match[1], 10);
        var m = match[2] ? parseInt(match[2], 10) : 0;
        if (isNaN(h12) || h12 < 1 || h12 > 12 || m < 0 || m > 59) {
          input.classList.add('input-error'); return;
        }
        var ampm = ampmBtn.getAttribute('data-value');
        var h24 = h12 === 12 ? (ampm === 'AM' ? 0 : 12) : (ampm === 'PM' ? h12 + 12 : h12);
        var value = (h24 < 10 ? '0' : '') + h24 + ':' + (m < 10 ? '0' : '') + m;
        input.classList.remove('input-error');
        self._setHoursValue(trigger, value);
        self._exitHoursCustomMode(cell);
        self._scheduleAutoSave('location', 300);
      };

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
      });
      input.addEventListener('blur', function() {
        // Don't run commit if the user is still interacting with the
        // AM/PM toggle or X button (their mousedown preventDefault
        // keeps focus on the input, but a blur can still fire when
        // the cell is being torn down via cancel).
        if (cell.dataset.cancelling === '1') return;
        commit();
      });

      // mousedown.preventDefault on the auxiliary controls so clicking
      // them doesn't blur the input mid-edit; click handlers do the
      // real work and then refocus the input.
      ampmBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
      ampmBtn.addEventListener('click', function() {
        var current = ampmBtn.getAttribute('data-value');
        var next = current === 'AM' ? 'PM' : 'AM';
        ampmBtn.setAttribute('data-value', next);
        ampmBtn.textContent = next;
        input.focus();
      });

      cancelBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
      cancelBtn.addEventListener('click', function(e) {
        e.preventDefault();
        // Flag so the input's blur handler skips commit while we tear
        // down the custom row. Cleared on the next tick.
        cell.dataset.cancelling = '1';
        input.value = '';
        input.classList.remove('input-error');
        self._exitHoursCustomMode(cell);
        setTimeout(function() { delete cell.dataset.cancelling; }, 0);
      });
    });
  },

  // Hide the dropdown trigger, reveal the HH:MM input + AM/PM toggle,
  // and pre-fill both with either the current value (if it parses) or
  // a sensible per-kind default — 8:00 AM for opens, 5:00 PM for
  // closes. Focus + select the input so typing replaces the prefill
  // immediately.
  _enterHoursCustomMode: function(trigger) {
    var cell = trigger.closest('.prof-hours-cell');
    if (!cell) return;
    var dropdown = cell.querySelector('.prof-hours-dropdown');
    var customWrap = cell.querySelector('.prof-hours-custom');
    var input = cell.querySelector('.prof-hours-custom-time');
    var ampmBtn = cell.querySelector('.prof-hours-ampm');
    if (dropdown) dropdown.style.display = 'none';
    if (customWrap) customWrap.style.display = 'flex';

    var currentValue = trigger.getAttribute('data-value') || '';
    var defaultValue = trigger.classList.contains('prof-hours-open') ? '08:00' : '17:00';
    var sourceValue = (/^\d{2}:\d{2}$/.test(currentValue)) ? currentValue : defaultValue;
    var split = this._splitHourValue(sourceValue);
    if (input) {
      input.value = split.display;
      input.classList.remove('input-error');
      input.focus();
      input.select();
    }
    if (ampmBtn) {
      ampmBtn.setAttribute('data-value', split.ampm);
      ampmBtn.textContent = split.ampm;
    }
  },

  // Split an "HH:MM" 24-hour string into the parts the custom-mode
  // input + AM/PM toggle expect: a "h:mm" 12-hour display string and
  // the AM/PM string. Falls back to 8:00 AM if the input doesn't
  // parse, so the caller always has a sane default to render.
  _splitHourValue: function(value) {
    var parts = (value || '').split(':');
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h)) h = 8;
    if (isNaN(m)) m = 0;
    var displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    var ampm = h < 12 ? 'AM' : 'PM';
    var mm = (m < 10 ? '0' : '') + m;
    return { display: displayH + ':' + mm, ampm: ampm };
  },

  // Hide the input row and restore the dropdown trigger. Does not
  // touch the underlying value — the caller (Cancel button or
  // successful blur commit) decides what to persist.
  _exitHoursCustomMode: function(cell) {
    var dropdown = cell.querySelector('.prof-hours-dropdown');
    var customWrap = cell.querySelector('.prof-hours-custom');
    if (dropdown) dropdown.style.display = '';
    if (customWrap) customWrap.style.display = 'none';
  },

  _bindHoursPresets: function() {
    var self = this;
    document.querySelectorAll('.prof-hours-preset').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var preset = btn.dataset.preset;
        var grid = document.getElementById('prof-hours-grid');
        if (!grid) return;
        var toggles = grid.querySelectorAll('.prof-hours-toggle');
        var opens = grid.querySelectorAll('.prof-hours-open');
        var closes = grid.querySelectorAll('.prof-hours-close');
        var setTime = function(triggerBtn, value) {
          // _setHoursValue handles values outside the curated list
          // (00:00 / 23:30 from the 24/7 preset, etc.) by formatting
          // the trigger label via _formatTime even when no menu item
          // matches. _setLookbackValue would just early-return on a
          // miss, leaving the trigger label stale.
          self._setHoursValue(triggerBtn, value);
        };
        toggles.forEach(function(t, i) {
          if (preset === '24-7') {
            t.checked = true;
            opens[i].disabled = false;
            setTime(opens[i], '00:00');
            closes[i].disabled = false;
            setTime(closes[i], '23:30');
          } else if (preset === 'appointment') {
            t.checked = false;
            opens[i].disabled = true;
            closes[i].disabled = true;
          } else if (preset === 'business') {
            var isWeekday = i < 5;
            t.checked = isWeekday;
            opens[i].disabled = !isWeekday;
            closes[i].disabled = !isWeekday;
            if (isWeekday) { setTime(opens[i], '08:00'); setTime(closes[i], '17:00'); }
          }
        });
      });
    });
  },

  _collectTradingHours: function() {
    var grid = document.getElementById('prof-hours-grid');
    if (!grid) return [];
    var hours = [];
    grid.querySelectorAll('.profile-hours-row').forEach(function(row) {
      var toggle = row.querySelector('.prof-hours-toggle');
      if (!toggle) return;
      hours.push({
        day: toggle.dataset.day,
        enabled: toggle.checked,
        open: row.querySelector('.prof-hours-open').getAttribute('data-value') || '',
        close: row.querySelector('.prof-hours-close').getAttribute('data-value') || ''
      });
    });
    return hours;
  },

  _bindPhoneTypeDropdowns: function(container) {
    container.querySelectorAll('.lookback-dropdown-wrap').forEach(function(wrap) {
      // Restrict to phone-type wraps. The function name suggests this
      // already, but the original implementation grabbed every
      // .lookback-dropdown-wrap in the container — which now picks up
      // the new state and hours-of-operation lookbacks added in the
      // platform-wide native-select sweep, double-binding their click
      // toggles (one open + one close in the same event = no net
      // change, so the menus appear not to open).
      var trigger = wrap.querySelector('.loc-phone-type');
      if (!trigger) return;
      if (wrap.dataset.phoneTypeBound) return;
      wrap.dataset.phoneTypeBound = '1';
      var menu = wrap.querySelector('.lookback-dropdown-menu');
      if (!menu) return;
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.lookback-dropdown-menu.open').forEach(function(m) { if (m !== menu) m.classList.remove('open'); });
        document.querySelectorAll('.lookback-dropdown.active').forEach(function(b) { if (b !== trigger) b.classList.remove('active'); });
        menu.classList.toggle('open');
        trigger.classList.toggle('active');
      });
      menu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function() {
          trigger.setAttribute('data-value', item.getAttribute('data-value'));
          trigger.innerHTML = window.escHtml(item.getAttribute('data-value')) + ' &#9662;';
          menu.querySelectorAll('.lookback-dropdown-item').forEach(function(it) { it.classList.remove('active'); });
          item.classList.add('active');
          menu.classList.remove('open');
          trigger.classList.remove('active');
        });
      });
    });
  },

  _wirePhoneFormat: function(container) {
    container.querySelectorAll('.loc-phone-number').forEach(function(input) {
      if (input.dataset.phoneFormatted) return;
      input.dataset.phoneFormatted = '1';
      input.addEventListener('input', function() {
        var pos = input.selectionStart;
        var oldLen = input.value.length;
        input.value = window.formatPhoneNumber(input.value);
        var newLen = input.value.length;
        input.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
      });
    });
  },

  _addPhone: function(idPfx) {
    var wrap = document.getElementById(idPfx + '-phones');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length;
    var typeOpts = ['Main', 'Mobile', 'Work', 'Fax'];
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = idPfx + '-ph-' + i;
    d.innerHTML = '<span class="lookback-dropdown-wrap">' +
      '<button type="button" class="lookback-dropdown loc-phone-type" data-value="Mobile">Mobile</button>' +
      '<div class="lookback-dropdown-menu">' +
      typeOpts.map(function(t) {
        return '<button type="button" class="lookback-dropdown-item' + (t === 'Mobile' ? ' active' : '') + '" data-value="' + t + '">' + t + '</button>';
      }).join('') +
      '</div></span>' +
    '<input type="text" class="profile-input loc-phone-number" placeholder="Phone number" />' +
    '<button class="btn-remove-url" data-action="remove-row" data-target="' + idPfx + '-ph-' + i + '">Remove</button>';
    wrap.appendChild(d);
    this._wirePhoneFormat(d);
    this._bindPhoneTypeDropdowns(d);
  },

  _addSite: function() {
    var wrap = document.getElementById('prof-sites-extra');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-repeating-row').length + 1;
    var d = document.createElement('div');
    d.className = 'profile-repeating-row';
    d.id = 'prof-site-' + i;
    d.innerHTML = '<input type="url" class="profile-input prof-add-site" placeholder="https://yoursite.com.au" />' +
      '<button class="btn-remove-url" data-action="remove-row" data-target="prof-site-' + i + '">Remove</button>';
    wrap.appendChild(d);
  },

  _addLocation: function() {
    var wrap = document.getElementById('prof-extra-locs');
    if (!wrap) return;
    var i = wrap.querySelectorAll('.profile-location-block').length;
    var emptyLoc = { name: '', unit: '', street: '', suburb: '', state: '', postcode: '', phones: [{ type: 'Mobile', number: '' }] };
    var div = document.createElement('div');
    div.innerHTML = window.CL_PROFILE._locationBlock(emptyLoc, i, false);
    wrap.appendChild(div.firstChild);
    this._wirePhoneFormat(wrap);
    this._bindPhoneTypeDropdowns(wrap);
    this._initStreetAutocomplete();
  },

  // BP UX Improvements Spec v1.0 §3 — Google Places address suggestions
  // for every Street Address field.
  //
  // Implementation note (2025): we drive a custom dropdown using the
  // programmatic AutocompleteSuggestion / Place API instead of the
  // <gmp-place-autocomplete> web component. The component renders its
  // search icon and clear button inside a shadow root that exposes no
  // CSS parts for them, so there's no way to make it match the
  // platform .profile-input look. With AutocompleteSuggestion we keep
  // the platform <input class="profile-input loc-street"> as-is and
  // render our own suggestions <ul> below it — full styling control,
  // no shadow DOM, no Google chrome.
  _initStreetAutocomplete: function() {
    var self = this;
    if (!self._supabase) return;
    self._loadGoogleMapsPlaces().then(function() {
      if (!window.google || !window.google.maps || !window.google.maps.places) return;
      var AutocompleteSuggestion = window.google.maps.places.AutocompleteSuggestion;
      var AutocompleteSessionToken = window.google.maps.places.AutocompleteSessionToken;
      if (!AutocompleteSuggestion) {
        console.error('[BP autocomplete] AutocompleteSuggestion not available — Places API (New) not enabled?');
        return;
      }
      var inputs = document.querySelectorAll('#prof-panel-location .loc-street');
      inputs.forEach(function(input) {
        if (input.dataset.gmapAutocompleteBound) return;
        input.dataset.gmapAutocompleteBound = '1';
        self._attachStreetAutocomplete(input, AutocompleteSuggestion, AutocompleteSessionToken);
      });
    }).catch(function(err) {
      console.error('[BP autocomplete] Maps load failed:', err && err.message ? err.message : err);
    });
  },

  _attachStreetAutocomplete: function(input, AutocompleteSuggestion, AutocompleteSessionToken) {
    var self = this;

    // Insert a wrapper around the input so the dropdown can be
    // positioned absolutely relative to it. The label / .profile-field-full
    // structure is untouched — the wrapper sits inside the field.
    var parent = input.parentElement;
    if (!parent) return;
    var wrap = document.createElement('div');
    wrap.className = 'loc-street-wrap';
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);

    var dropdown = document.createElement('ul');
    dropdown.className = 'loc-street-suggestions';
    dropdown.style.display = 'none';
    wrap.appendChild(dropdown);

    var sessionToken = AutocompleteSessionToken ? new AutocompleteSessionToken() : undefined;
    var currentSuggestions = [];
    var debounceTimer = null;
    var lastQuery = '';

    function hideDropdown() {
      dropdown.style.display = 'none';
    }
    function showDropdown() {
      if (dropdown.children.length > 0) dropdown.style.display = 'block';
    }

    function renderSuggestions() {
      if (currentSuggestions.length === 0) {
        dropdown.innerHTML = '';
        hideDropdown();
        return;
      }
      var html = currentSuggestions.map(function(s, i) {
        var pred = s.placePrediction;
        if (!pred) return '';
        var text = '';
        try { text = pred.text ? pred.text.toString() : (pred.mainText ? pred.mainText.toString() : ''); }
        catch (e) { text = ''; }
        return '<li data-idx="' + i + '" class="loc-street-suggestion-item">' + window.escHtml(text) + '</li>';
      }).join('');
      dropdown.innerHTML = html;
      showDropdown();
    }

    async function fetchSuggestions(query) {
      var trimmed = (query || '').trim();
      if (trimmed.length < 3) {
        currentSuggestions = [];
        renderSuggestions();
        return;
      }
      if (trimmed === lastQuery) return;
      lastQuery = trimmed;
      try {
        var req = {
          input: trimmed,
          includedRegionCodes: ['au']
        };
        if (sessionToken) req.sessionToken = sessionToken;
        var result = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        var suggestions = (result && result.suggestions) || [];
        // Only addressed predictions — drop anything Google returns
        // without a place prediction (e.g. query suggestions).
        currentSuggestions = suggestions.filter(function(s) { return !!s.placePrediction; });
        renderSuggestions();
      } catch (e) {
        console.error('[BP autocomplete] fetch error:', e && e.message ? e.message : e);
      }
    }

    async function selectSuggestion(idx) {
      var suggestion = currentSuggestions[idx];
      if (!suggestion || !suggestion.placePrediction) return;
      try {
        var place = suggestion.placePrediction.toPlace();
        await place.fetchFields({ fields: ['addressComponents'] });
        var components = place.addressComponents;
        if (!components) return;
        var streetValue = self._applyAutocompleteResult(input, components);
        if (streetValue) input.value = streetValue;
      } catch (e) {
        console.error('[BP autocomplete] select error:', e && e.message ? e.message : e);
      } finally {
        currentSuggestions = [];
        dropdown.innerHTML = '';
        hideDropdown();
        // New session for the next address — billing groups suggestion
        // fetches with the final fetchFields call into one transaction.
        if (AutocompleteSessionToken) sessionToken = new AutocompleteSessionToken();
      }
    }

    input.addEventListener('input', function() {
      if (debounceTimer) clearTimeout(debounceTimer);
      var q = input.value;
      debounceTimer = setTimeout(function() { fetchSuggestions(q); }, 250);
    });
    input.addEventListener('focus', function() {
      if (currentSuggestions.length > 0) showDropdown();
    });
    // mousedown rather than click so the input's blur (which fires
    // hideDropdown on a 200ms delay) doesn't race with the click.
    dropdown.addEventListener('mousedown', function(e) {
      var li = e.target.closest('.loc-street-suggestion-item');
      if (!li) return;
      e.preventDefault();
      var idx = parseInt(li.dataset.idx, 10);
      if (!isNaN(idx)) selectSuggestion(idx);
    });
    input.addEventListener('blur', function() {
      // Delay so a click on a suggestion still registers before we hide.
      setTimeout(hideDropdown, 200);
    });
  },

  _loadGoogleMapsPlaces: function() {
    if (window.google && window.google.maps && window.google.maps.places && window.google.maps.places.AutocompleteSuggestion) {
      return Promise.resolve();
    }
    if (window.__staxGmapPromise) return window.__staxGmapPromise;
    var self = this;
    window.__staxGmapPromise = (async function() {
      var sessionRes = await self._supabase.auth.getSession();
      var token = sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.access_token;
      if (!token) throw new Error('No session');
      var keyRes = await fetch('/api/places-key', { headers: { Authorization: 'Bearer ' + token } });
      if (!keyRes.ok) throw new Error('Places key unavailable');
      var keyJson = await keyRes.json();
      if (!keyJson || !keyJson.key) throw new Error('Places key missing');
      return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        // v=weekly so we get the current PlaceAutocompleteElement build.
        // libraries=places loads the Places library; loading=async lets
        // Google paint the page first.
        script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(keyJson.key) + '&libraries=places&loading=async&v=weekly';
        script.async = true;
        script.defer = true;
        script.onload = function() { resolve(); };
        script.onerror = function() { reject(new Error('Maps script failed to load')); };
        document.head.appendChild(script);
      });
    })().catch(function(err) {
      // Reset the cached promise so a later panel render can retry.
      window.__staxGmapPromise = null;
      throw err;
    });
    return window.__staxGmapPromise;
  },

  // PlaceAutocompleteElement returns Place.AddressComponent objects with
  // longText / shortText / types — different shape from the legacy
  // long_name / short_name on AutocompleteResult.
  _applyAutocompleteResult: function(streetInput, components) {
    var parsed = { street_number: '', route: '', subpremise: '', locality: '', state: '', postcode: '' };
    components.forEach(function(c) {
      var types = c.types || [];
      var longText = c.longText || c.long_name || '';
      var shortText = c.shortText || c.short_name || '';
      if (types.indexOf('subpremise') > -1) parsed.subpremise = longText;
      else if (types.indexOf('street_number') > -1) parsed.street_number = longText;
      else if (types.indexOf('route') > -1) parsed.route = longText;
      else if (types.indexOf('locality') > -1) parsed.locality = longText;
      else if (types.indexOf('administrative_area_level_1') > -1) parsed.state = shortText;
      else if (types.indexOf('postal_code') > -1) parsed.postcode = longText;
    });
    var streetParts = [parsed.street_number, parsed.route].filter(Boolean);
    var streetValue = streetParts.join(' ').trim();
    streetInput.value = streetValue;
    var block = streetInput.closest('.profile-location-block');
    if (!block) return streetValue;
    var unitEl = block.querySelector('.loc-unit');
    if (unitEl && parsed.subpremise && !unitEl.value.trim()) {
      unitEl.value = parsed.subpremise;
    }
    var suburbEl = block.querySelector('.loc-suburb');
    if (suburbEl && parsed.locality) suburbEl.value = parsed.locality;
    var stateBtn = block.querySelector('.loc-state');
    if (stateBtn && parsed.state) {
      var stateMenu = stateBtn.parentNode.querySelector('.loc-state-menu');
      this._setLookbackValue(stateBtn, stateMenu, parsed.state);
    }
    var postEl = block.querySelector('.loc-postcode');
    if (postEl && parsed.postcode) postEl.value = parsed.postcode;
    // The location panel's auto-save listens for blur/change events;
    // we set values programmatically so trigger an explicit save.
    if (this._scheduleAutoSave) this._scheduleAutoSave('location', 300);
    return streetValue;
  },

  _saveLocation: function(opts) {
    var autoSave = !!(opts && opts.autoSave);
    var pb = document.getElementById('loc-primary-block');
    var primaryPhones = Array.from(pb.querySelectorAll('#loc-p-phones .profile-repeating-row')).map(function(row) {
      return { type: row.querySelector('.loc-phone-type').getAttribute('data-value') || 'Mobile', number: row.querySelector('.loc-phone-number').value.trim() };
    }).filter(function(ph) { return ph.number; });
    var extraBlocks = document.querySelectorAll('#prof-extra-locs .profile-location-block');
    var locs = Array.from(extraBlocks).map(function(b) {
      var phonesWrap = b.querySelector('.loc-phones-wrap');
      var phones = phonesWrap ? Array.from(phonesWrap.querySelectorAll('.profile-repeating-row')).map(function(row) {
        return { type: row.querySelector('.loc-phone-type').getAttribute('data-value') || 'Mobile', number: row.querySelector('.loc-phone-number').value.trim() };
      }).filter(function(ph) { return ph.number; }) : [];
      return {
        name: b.querySelector('.loc-name').value.trim(),
        unit: b.querySelector('.loc-unit').value.trim(),
        street: b.querySelector('.loc-street').value.trim(),
        suburb: b.querySelector('.loc-suburb').value.trim(),
        state: (b.querySelector('.loc-state').getAttribute('data-value') || '').trim(),
        postcode: b.querySelector('.loc-postcode').value.trim(),
        phones: phones
      };
    });
    var sites = [];
    var primary = document.getElementById('prof-site-primary');
    if (primary && primary.value.trim()) sites.push(primary.value.trim());
    Array.from(document.querySelectorAll('#prof-sites-extra .prof-add-site')).forEach(function(el) {
      if (el.value.trim()) sites.push(el.value.trim());
    });
    var serviceArea = this._getSelectedChips('prof-service-area').concat(this._getOtherItems('prof-service-area'));
    var tradingHours = this._collectTradingHours();

    var self = this;
    var btn = document.getElementById('prof-loc-save');
    window.handleSave(btn, async function() {
      var nameEl = pb.querySelector('.loc-name');
      var streetEl = pb.querySelector('.loc-street');
      var suburbEl = pb.querySelector('.loc-suburb');
      var stateEl = pb.querySelector('.loc-state');
      var postcodeEl = pb.querySelector('.loc-postcode');
      var serviceAreaEl = document.getElementById('prof-service-area');
      var phonesEl = document.getElementById('loc-p-phones');
      var hoursEl = document.getElementById('prof-hours-grid');
      // Skip validation on auto-save — see comment in _saveIdentity.
      if (!autoSave) {
        self._validateMandatory('prof-panel-location', [
          { test: function() { return nameEl.value.trim() !== ''; }, el: nameEl, label: 'Location Name' },
          { test: function() { return streetEl.value.trim() !== ''; }, el: streetEl, label: 'Street Address' },
          { test: function() { return suburbEl.value.trim() !== ''; }, el: suburbEl, label: 'Suburb' },
          { test: function() { return (stateEl.getAttribute('data-value') || '').trim() !== ''; }, el: stateEl, label: 'State' },
          { test: function() { return postcodeEl.value.trim() !== ''; }, el: postcodeEl, label: 'Postcode' },
          { test: function() { return primaryPhones.length > 0; }, el: phonesEl, label: 'Phone Number (at least one)' },
          { test: function() { return serviceArea.length > 0; }, el: serviceAreaEl, label: 'Service Area (at least one)' },
          { test: function() { return Array.isArray(tradingHours) && tradingHours.some(function(h) { return h.enabled; }); }, el: hoursEl, label: 'Trading Hours (at least one day)' }
        ]);
      }
      var updates = {
        address_name: nameEl.value.trim(),
        address_unit: pb.querySelector('.loc-unit').value.trim(),
        address_street: streetEl.value.trim(),
        address_suburb: suburbEl.value.trim(),
        address_state: (stateEl.getAttribute('data-value') || '').trim(),
        address_postcode: postcodeEl.value.trim(),
        additional_phones: primaryPhones,
        additional_locations: locs,
        website_urls: sites,
        service_area: serviceArea,
        trading_hours: tradingHours
      };
      // SRL Cohort Architecture Addendum v1.2 — Location panel writes
      // `address_state` and `address_postcode`, both cohort-determining
      // fields. Route through api/profile-save so cohort_id is
      // recomputed and any new-cohort SRL refresh is enqueued
      // server-side. Browser no longer writes profiles directly for
      // this panel.
      var sessionRes = await self._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) throw new Error('No active session');
      var apiRes = await fetch('/api/profile-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify(updates)
      });
      var apiData = await apiRes.json().catch(function() { return {}; });
      if (!apiRes.ok || !apiData.success) throw new Error(apiData.error || ('Profile save failed: ' + apiRes.status));
      Object.assign(self._profile, updates);
      if (autoSave) self._showSaved('location');
    }, document.getElementById('prof-save-msg'));
  }

});
