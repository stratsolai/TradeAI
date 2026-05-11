const fs = require('fs');
const path = 'cl-profile.js';
let t = fs.readFileSync(path, 'utf-8');

const oldFn = `  _renderTradingHours: function(hours) {
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var hoursMap = {};
    if (Array.isArray(hours)) {
      hours.forEach(function(h) { hoursMap[h.day] = h; });
    }
    // Build the time-option list once and reuse for every open/close
    // dropdown. The trigger button label uses the human-readable
    // form ("8:00 AM"); the menu items carry the same label as their
    // text, with the 24-hour value stashed in data-value.
    //
    // Order: 6:00 AM through 5:30 AM the following morning. Most SMEs
    // open between 7-10 AM and close between 4-9 PM, so a typical
    // selection lands inside the first ~22 items without any
    // scrolling. Late-night hospitality and cleaning businesses still
    // have access to the whole half-hourly grid — the post-midnight
    // hours just sit at the bottom of the list rather than at the top.
    var timeChoices = [];
    var addSlot = function(h, m) {
      var hh = (h < 10 ? '0' : '') + h;
      var mm = m === 0 ? '00' : '30';
      var label = (h === 0 ? '12' : h > 12 ? (h - 12) : h) + ':' + mm + (h < 12 ? ' AM' : ' PM');
      timeChoices.push({ value: hh + ':' + mm, label: label });
    };
    for (var h = 6; h < 24; h++) { addSlot(h, 0); addSlot(h, 30); }
    for (var h = 0; h < 6; h++) { addSlot(h, 0); addSlot(h, 30); }
    var renderTimeMenu = function(activeValue) {
      return timeChoices.map(function(t) {
        return '<button type="button" class="lookback-dropdown-item' + (t.value === activeValue ? ' active' : '') + '" data-value="' + t.value + '">' + t.label + '</button>';
      }).join('');
    };
    var labelFor = function(value) {
      for (var i = 0; i < timeChoices.length; i++) {
        if (timeChoices[i].value === value) return timeChoices[i].label;
      }
      return value;
    };

    var presetHtml = '<div class="profile-hours-preset">' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="business">Mon\\u2013Fri 8:00\\u20135:00</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="24-7">24/7</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="appointment">By Appointment</button>' +
    '</div>';

    var rowsHtml = days.map(function(day) {
      var data = hoursMap[day] || { enabled: false, open: '08:00', close: '17:00' };
      var checked = data.enabled ? ' checked' : '';
      var openVal = data.open || '08:00';
      var closeVal = data.close || '17:00';
      var disabledAttr = data.enabled ? '' : ' disabled';
      return '<div class="profile-hours-row">' +
        '<label class="profile-hours-day"><input type="checkbox" class="prof-hours-toggle" data-day="' + day + '"' + checked + ' /> ' + day + '</label>' +
        '<span class="lookback-dropdown-wrap">'
          + '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-hours-open" data-day="' + day + '" data-value="' + openVal + '"' + disabledAttr + '>' + labelFor(openVal) + '</button>'
          + '<div class="lookback-dropdown-menu prof-hours-open-menu">' + renderTimeMenu(openVal) + '</div>'
        + '</span>' +
        '<span class="lookback-dropdown-wrap">'
          + '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-hours-close" data-day="' + day + '" data-value="' + closeVal + '"' + disabledAttr + '>' + labelFor(closeVal) + '</button>'
          + '<div class="lookback-dropdown-menu prof-hours-close-menu">' + renderTimeMenu(closeVal) + '</div>'
        + '</span>' +
      '</div>';
    }).join('');

    return presetHtml + '<div class="profile-hours-grid" id="prof-hours-grid">' + rowsHtml + '</div>';
  },`;

const newFn = `  _renderTradingHours: function(hours) {
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var hoursMap = {};
    if (Array.isArray(hours)) {
      hours.forEach(function(h) { hoursMap[h.day] = h; });
    }
    // Curated common opening / closing slots. Anything outside these
    // goes through the Custom item, which swaps the dropdown for a
    // free text input that accepts "9:15 AM", "9:15am", "9:15", or
    // "9 AM" \\u2014 the parser is forgiving on form, strict on value.
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
      items += '<button type="button" class="lookback-dropdown-item prof-hours-custom-item" data-value="__custom__">Custom\\u2026</button>';
      return items;
    };

    var presetHtml = '<div class="profile-hours-preset">' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="business">Mon\\u2013Fri 8:00\\u20135:00</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="24-7">24/7</button>' +
      '<button type="button" class="btn-outline btn-sm prof-hours-preset" data-preset="appointment">By Appointment</button>' +
    '</div>';

    var renderPicker = function(kind, day, currentValue, isDisabled) {
      var choices = kind === 'open' ? openChoices : closeChoices;
      var disabledAttr = isDisabled ? ' disabled' : '';
      var label = self._formatTime(currentValue);
      return '<div class="prof-hours-cell">'
        + '<span class="lookback-dropdown-wrap prof-hours-dropdown">'
          + '<button type="button" class="lookback-dropdown lookback-dropdown-field prof-hours-' + kind + '" data-day="' + day + '" data-value="' + currentValue + '"' + disabledAttr + '>' + label + '</button>'
          + '<div class="lookback-dropdown-menu prof-hours-' + kind + '-menu">' + renderTimeMenu(choices, currentValue) + '</div>'
        + '</span>'
        + '<div class="prof-hours-custom" style="display:none">'
          + '<input type="text" class="profile-input prof-hours-custom-input" placeholder="e.g. 9:15 AM"' + disabledAttr + ' />'
          + '<button type="button" class="prof-hours-custom-cancel" title="Cancel and return to dropdown">\\u00D7</button>'
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
  // Returns the input unchanged if it doesn't parse \\u2014 keeps the UI
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

  // Parse user-typed time strings into "HH:MM" 24-hour form. Accepts:
  //   "9:15 AM" / "9:15am" / "9:15" / "9 AM" / "9am" / "9" / "21:30"
  // Returns null when the input can't be coerced into a sensible time.
  _parseTimeInput: function(raw) {
    raw = (raw || '').trim().toUpperCase().replace(/\\./g, '');
    if (!raw) return null;
    var match = raw.match(/^(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM)?$/);
    if (!match) return null;
    var h = parseInt(match[1], 10);
    var m = match[2] ? parseInt(match[2], 10) : 0;
    var ap = match[3];
    if (isNaN(h) || h < 0 || h > 23) return null;
    if (m < 0 || m > 59) return null;
    if (ap === 'AM') {
      if (h === 12) h = 0;
      else if (h > 12) return null;
    } else if (ap === 'PM') {
      if (h < 12) h += 12;
    }
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  },

  // Programmatic time set on a hours-picker trigger button. Updates
  // data-value, label, and active-class \\u2014 works whether or not the
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
  },`;

if (!t.includes(oldFn)) {
  console.error('Old function block not found.');
  process.exit(1);
}
t = t.replace(oldFn, newFn);
fs.writeFileSync(path, t);
console.log('replaced');
