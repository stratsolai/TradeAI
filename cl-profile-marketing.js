window.BP_MARKETING = {

  _supabase: null,
  _userId: null,
  _profile: null,
  _parent: null,
  _topic: 0,
  _answers: {},
  _summaryData: null,

  init: function(supabase, userId, profile, parent) {
    this._supabase = supabase;
    this._userId = userId;
    this._profile = profile || {};
    this._parent = parent;
    var p = this._profile;
    this._topic = 0;
    var saved = null;
    var mte = p.marketing_theme_extra;
    if (Array.isArray(mte) && mte.length === 1 && typeof mte[0] === 'string') {
      try { saved = JSON.parse(mte[0]); } catch(e) { saved = null; }
    } else if (mte && typeof mte === 'object' && !Array.isArray(mte)) {
      saved = mte;
    }
    var hasSaved = saved && Array.isArray(saved.standout);
    var savedStatements = saved && Array.isArray(saved.additional_statements) ? saved.additional_statements : [];
    this._answers = {
      standout: hasSaved ? (saved.standout || []) : [],
      standout_other: hasSaved ? (saved.standout_other || '') : '',
      quality_detail: hasSaved ? (saved.quality_detail || []) : [],
      quality_other: hasSaved ? (saved.quality_other || '') : '',
      service_detail: hasSaved ? (saved.service_detail || []) : [],
      service_other: hasSaved ? (saved.service_other || '') : '',
      affordable_detail: hasSaved ? (saved.affordable_detail || []) : [],
      affordable_other: hasSaved ? (saved.affordable_other || '') : '',
      awareness: hasSaved ? (saved.awareness || []) : [],
      awareness_other: hasSaved ? (saved.awareness_other || '') : '',
      customer_count: hasSaved ? (saved.customer_count || '') : '',
      awards_text: hasSaved ? (saved.awards_text || '') : '',
      feeling: hasSaved ? (saved.feeling || []) : [],
      feeling_other: hasSaved ? (saved.feeling_other || '') : '',
      tone: p.tone_of_voice || (hasSaved ? (saved.tone || 'friendly') : 'friendly'),
      primary_colour: p.primary_brand_colour || '', secondary_colour: p.secondary_brand_colour || '',
      tagline: p.tagline || '', has_tagline: p.tagline ? 'yes' : 'no',
      // Preserved through the wizard so the panel-level "Additional
      // Theme Statements" UI doesn't get clobbered when the wizard saves.
      additional_statements: savedStatements
    };
    this._renderPanel();
  },

  _renderPanel: function() {
    var self = this;
    var el = document.getElementById('prof-mkt-guided');
    if (!el) return;
    var p = this._profile;
    var hasExisting = p.marketing_theme_differentiators || p.marketing_theme_awareness || p.marketing_theme_feeling;

    var html = '';
    if (hasExisting) {
      html += '<div style="margin-bottom:20px">' +
        '<button class="btn-primary" id="prof-mkt-open-modal">Update Marketing Theme</button>' +
      '</div>';
      html += this._summaryHtml(true);
    } else {
      html += '<div class="empty-state" style="padding:32px 20px">' +
        '<div class="empty-state-icon">\uD83C\uDFA8</div>' +
        '<h3>No Marketing Theme Yet</h3>' +
        '<p>Answer a few questions and the AI will build your marketing theme.</p>' +
        '<button class="btn-primary" id="prof-mkt-open-modal" style="margin-top:16px">Create Marketing Theme</button>' +
      '</div>';
    }

    el.innerHTML = html;

    document.getElementById('prof-mkt-open-modal').addEventListener('click', function() {
      self._topic = 0;
      self._openModal();
    });
  },

  _summaryHtml: function(fromProfile) {
    var p = this._profile;
    var d = this._summaryData || {};
    var diff = fromProfile ? (p.marketing_theme_differentiators || '') : (d.differentiators || '');
    var aware = fromProfile ? (p.marketing_theme_awareness || '') : (d.awareness || '');
    var feel = fromProfile ? (p.marketing_theme_feeling || '') : (d.feeling || '');
    var tone = fromProfile ? (p.tone_of_voice || '') : (this._answers.tone || '');
    var pc = fromProfile ? (p.primary_brand_colour || '') : (this._answers.primary_colour || '');
    var sc = fromProfile ? (p.secondary_brand_colour || '') : (this._answers.secondary_colour || '');
    var tag = fromProfile ? (p.tagline || '') : (this._answers.tagline || '');

    var toneLabel = tone ? tone.charAt(0).toUpperCase() + tone.slice(1) : '\u2014';
    var colourSwatches = '';
    if (pc) colourSwatches += '<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:' + window.escHtml(pc) + ';border:1px solid var(--border);vertical-align:middle"></span> ' + window.escHtml(pc);
    if (sc) colourSwatches += '&nbsp;&nbsp;<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:' + window.escHtml(sc) + ';border:1px solid var(--border);vertical-align:middle"></span> ' + window.escHtml(sc);

    return '<div style="display:grid;gap:16px">' +
      '<div><div class="profile-label">What makes you stand out</div><div style="color:var(--text-secondary);font-size:var(--btn-font-size);line-height:1.6">' + window.escHtml(diff) + '</div></div>' +
      '<div><div class="profile-label">What customers should know</div><div style="color:var(--text-secondary);font-size:var(--btn-font-size);line-height:1.6">' + window.escHtml(aware) + '</div></div>' +
      '<div><div class="profile-label">How you want customers to feel</div><div style="color:var(--text-secondary);font-size:var(--btn-font-size);line-height:1.6">' + window.escHtml(feel) + '</div></div>' +
      '<div style="display:flex;gap:24px;flex-wrap:wrap">' +
        '<div><div class="profile-label">Tone of voice</div><div style="color:var(--text-secondary)">' + window.escHtml(toneLabel) + '</div></div>' +
        '<div><div class="profile-label">Brand colours</div><div style="color:var(--text-secondary)">' + (colourSwatches || '\u2014') + '</div></div>' +
        '<div><div class="profile-label">Tagline</div><div style="color:var(--text-secondary)">' + (tag ? window.escHtml(tag) : '\u2014') + '</div></div>' +
      '</div>' +
    '</div>';
  },

  _openModal: function() {
    var existing = document.getElementById('prof-mkt-modal');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'prof-mkt-modal';
    overlay.className = 'perm-modal-overlay open';
    overlay.innerHTML = '<div class="perm-modal" style="max-width:640px;max-height:85vh;overflow-y:auto;position:relative">' +
      '<button type="button" id="prof-mkt-close" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);line-height:1;padding:4px">\u00D7</button>' +
      '<div id="prof-mkt-modal-content"></div>' +
    '</div>';
    document.body.appendChild(overlay);

    var self = this;
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) self._closeModal();
    });
    document.getElementById('prof-mkt-close').addEventListener('click', function() {
      self._closeModal();
    });
    self._escHandler = function(e) { if (e.key === 'Escape') self._closeModal(); };
    document.addEventListener('keydown', self._escHandler);

    this._renderTopic();
  },

  _closeModal: function() {
    var modal = document.getElementById('prof-mkt-modal');
    if (modal) modal.parentNode.removeChild(modal);
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  },

  _renderTopic: function() {
    var self = this;
    var el = document.getElementById('prof-mkt-modal-content');
    if (!el) return;
    var t = this._topic;
    var html = '';

    if (t === 0) html = this._topicStandout();
    else if (t === 1) html = this._topicAwareness();
    else if (t === 2) html = this._topicFeeling();
    else if (t === 3) html = this._topicTone();
    else if (t === 4) html = this._topicColours();
    else if (t === 5) html = this._topicTagline();
    else { this._generate(); return; }

    var nav = '<div style="display:flex;gap:12px;margin-top:20px">';
    if (t > 0) nav += '<button class="btn-back" id="prof-mkt-prev">Back</button>';
    nav += '<button class="perm-modal-cancel" id="prof-mkt-cancel">Cancel</button>';
    nav += '<button class="btn-back" id="prof-mkt-next" style="margin-left:auto">' + (t < 5 ? 'Next' : 'Generate Summary') + '</button>';
    nav += '</div>';

    el.innerHTML = '<div style="margin-bottom:8px;font-size:var(--badge-font-size);color:var(--text-muted)">Topic ' + (t + 1) + ' of 6</div>' + html + nav;

    document.getElementById('prof-mkt-cancel').addEventListener('click', function() {
      self._closeModal();
    });
    if (document.getElementById('prof-mkt-prev')) {
      document.getElementById('prof-mkt-prev').addEventListener('click', function() {
        self._saveTopicData(); self._topic--; self._renderTopic();
      });
    }
    document.getElementById('prof-mkt-next').addEventListener('click', function() {
      self._saveTopicData(); self._topic++; self._renderTopic();
    });
    this._bindPills();
    this._bindColourSync();
  },

  _pills: function(items, selected, dataAttr) {
    var html = '<div class="review-pill-row" style="margin-bottom:12px">';
    items.forEach(function(item) {
      var active = selected.indexOf(item) !== -1 ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-' + dataAttr + '="' + window.escHtml(item) + '">' + window.escHtml(item) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _bindPills: function() {
    var self = this;
    var container = document.getElementById('prof-mkt-modal-content');
    if (!container) return;
    container.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        var attr = Object.keys(pill.dataset)[0];
        if (pill.classList.contains('active')) {
          pill.classList.remove('active');
        } else {
          if (attr === 'tone' || attr === 'specdur' || attr === 'tagline' || attr === 'custcount') {
            pill.parentElement.querySelectorAll('.filter-pill').forEach(function(s) { s.classList.remove('active'); });
          }
          if (attr === 'feeling') {
            var activeCount = pill.parentElement.querySelectorAll('.filter-pill.active').length;
            if (activeCount >= 2) return;
          }
          pill.classList.add('active');
        }
        var reRenderAttrs = ['standout', 'qualdetail', 'svcdetail', 'affdetail', 'tagline'];
        if (reRenderAttrs.indexOf(attr) !== -1) {
          self._saveTopicData();
          self._renderTopic();
        }
      });
    });
  },

  _bindColourSync: function() {
    var self = this;
    var container = document.getElementById('prof-mkt-modal-content');
    if (!container) return;

    container.querySelectorAll('[data-colour-swatch]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.getAttribute('data-colour-swatch');
        var hex = btn.getAttribute('data-hex');
        self._answers[key + '_colour'] = hex;
        var customHex = document.getElementById('prof-mkt-' + key + '-hex');
        var customPicker = document.getElementById('prof-mkt-' + key + '-picker');
        if (customHex) customHex.value = hex;
        if (customPicker) customPicker.value = hex;
        var note = document.getElementById('prof-mkt-' + key + '-none-note');
        if (note) note.style.display = 'none';
        self._refreshColourSwatches(key);
      });
    });

    container.querySelectorAll('[data-colour-action="custom"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.getAttribute('data-colour-key');
        var custom = document.getElementById('prof-mkt-' + key + '-custom');
        if (!custom) return;
        var willShow = custom.style.display === 'none';
        custom.style.display = willShow ? 'flex' : 'none';
        btn.textContent = willShow ? 'Hide custom' : 'Custom colour';
        if (willShow) {
          var hexInput = document.getElementById('prof-mkt-' + key + '-hex');
          if (hexInput) hexInput.focus();
        }
      });
    });

    container.querySelectorAll('[data-colour-action="none"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.getAttribute('data-colour-key');
        self._answers[key + '_colour'] = self.PLATFORM_DEFAULT_COLOUR;
        var hexInput = document.getElementById('prof-mkt-' + key + '-hex');
        var picker = document.getElementById('prof-mkt-' + key + '-picker');
        if (hexInput) hexInput.value = self.PLATFORM_DEFAULT_COLOUR;
        if (picker) picker.value = self.PLATFORM_DEFAULT_COLOUR;
        var note = document.getElementById('prof-mkt-' + key + '-none-note');
        if (note) note.style.display = 'block';
        self._refreshColourSwatches(key);
      });
    });

    ['primary', 'secondary'].forEach(function(key) {
      var picker = document.getElementById('prof-mkt-' + key + '-picker');
      var hexInput = document.getElementById('prof-mkt-' + key + '-hex');
      if (picker && hexInput) {
        picker.addEventListener('input', function() {
          hexInput.value = picker.value;
          self._answers[key + '_colour'] = picker.value;
          self._refreshColourSwatches(key);
        });
        hexInput.addEventListener('input', function() {
          var v = hexInput.value.trim();
          if (/^#[0-9a-fA-F]{6}$/.test(v)) {
            picker.value = v;
            self._answers[key + '_colour'] = v;
            self._refreshColourSwatches(key);
          }
        });
      }
    });
  },

  _refreshColourSwatches: function(key) {
    var hex = (this._answers[key + '_colour'] || '').toLowerCase();
    document.querySelectorAll('[data-colour-swatch="' + key + '"]').forEach(function(btn) {
      var swatchHex = (btn.getAttribute('data-hex') || '').toLowerCase();
      var ring = btn.querySelector('span');
      if (!ring) return;
      ring.style.boxShadow = swatchHex === hex
        ? 'inset 0 0 0 3px var(--blue), 0 0 0 1px var(--border)'
        : 'inset 0 0 0 1px var(--border)';
    });
  },

  _topicStandout: function() {
    var a = this._answers;
    var items = [
      'Our products or services are better quality', 'We\'re faster than competitors', 'We\'re more affordable',
      'Better customer service', 'More experienced or qualified', 'We specialise in certain areas',
      'Locally owned and operated', 'Family business', 'We\'ve been around a long time', 'We use better materials or suppliers'
    ];
    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:12px">What makes your business stand out?</div>';
    html += '<div class="profile-label" style="color:var(--text-muted);margin-bottom:12px">Select all that apply</div>';
    html += this._pills(items, a.standout, 'standout');
    html += '<div class="profile-field-full" style="margin-top:8px"><label class="profile-label">Other (optional)</label>' +
      '<input type="text" class="profile-input" id="prof-mkt-standout-other" value="' + window.escHtml(a.standout_other) + '" placeholder="Something else that sets you apart"></div>';

    if (a.standout.indexOf('Our products or services are better quality') !== -1) {
      var qualityItems = ['Premium materials or ingredients', 'More thorough process', 'Better attention to detail', 'Longer lasting results', 'We don\'t cut corners', 'Industry-leading brands or suppliers', 'Other'];
      html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">What makes your quality better?</label>' +
        this._pills(qualityItems, a.quality_detail || [], 'qualdetail');
      if ((a.quality_detail || []).indexOf('Other') !== -1) {
        html += '<input type="text" class="profile-input" id="prof-mkt-quality-other" value="' + window.escHtml(a.quality_other || '') + '" placeholder="Describe what else" style="margin-top:8px">';
      }
      html += '</div>';
    }
    if (a.standout.indexOf('Better customer service') !== -1) {
      var serviceItems = ['We always answer the phone', 'We show up on time', 'We explain everything clearly', 'We\'re easy to deal with', 'We go above and beyond', 'We follow up after the job', 'We clean up after ourselves', 'Other'];
      html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">What is different about your customer service?</label>' +
        this._pills(serviceItems, a.service_detail || [], 'svcdetail');
      if ((a.service_detail || []).indexOf('Other') !== -1) {
        html += '<input type="text" class="profile-input" id="prof-mkt-service-other" value="' + window.escHtml(a.service_other || '') + '" placeholder="Describe what else" style="margin-top:8px">';
      }
      html += '</div>';
    }
    if (a.standout.indexOf('We\'re more affordable') !== -1) {
      var affordItems = ['Lower prices than competitors', 'No call-out fees', 'Free quotes', 'Upfront pricing \u2014 no surprises', 'We match or beat quotes', 'Other'];
      html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">How are you more affordable?</label>' +
        this._pills(affordItems, a.affordable_detail || [], 'affdetail');
      if ((a.affordable_detail || []).indexOf('Other') !== -1) {
        html += '<input type="text" class="profile-input" id="prof-mkt-affordable-other" value="' + window.escHtml(a.affordable_other || '') + '" placeholder="Describe what else" style="margin-top:8px">';
      }
      html += '</div>';
    }
    // Years in business / certifications / specialisation are no longer
    // asked here \u2014 BP UX Improvements Spec v1.0 \u00a75.2.1 removes them as
    // duplicates of Panel 1, Panel 5, and Panel 3. The marketing-theme
    // API now reads years_in_business, licences, and bp_services
    // directly from the profile.
    return html;
  },

  _topicAwareness: function() {
    var a = this._answers;
    var items = [
      'Fully licensed and insured', 'Australian owned and operated', 'Family-owned business',
      'Trusted by many customers', 'Award-winning', 'Satisfaction guarantee',
      'Warranty on work', 'Free quotes available', 'Emergency or after-hours service available'
    ];
    var serviceArea = this._profile.service_area || '';
    if (serviceArea) items.push('Serving ' + serviceArea);
    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:12px">What should customers know about your business?</div>';
    html += '<div class="profile-label" style="color:var(--text-muted);margin-bottom:12px">Select all that apply</div>';
    html += this._pills(items, a.awareness, 'awareness');
    html += '<div class="profile-field-full" style="margin-top:8px"><label class="profile-label">Other (optional)</label>' +
      '<input type="text" class="profile-input" id="prof-mkt-awareness-other" value="' + window.escHtml(a.awareness_other) + '"></div>';
    if (a.awareness.indexOf('Trusted by many customers') !== -1) {
      html += '<div class="profile-field-full" style="margin-top:8px"><label class="profile-label">Roughly how many customers have you served?</label>' +
        this._pills(['Under 100', '100\u2013500', '500\u20131,000', '1,000\u20135,000', '5,000+', 'Not sure'], a.customer_count ? [a.customer_count] : [], 'custcount') + '</div>';
    }
    if (a.awareness.indexOf('Award-winning') !== -1) {
      html += '<div class="profile-field-full" style="margin-top:8px"><label class="profile-label">What awards or recognition have you received?</label>' +
        '<input type="text" class="profile-input" id="prof-mkt-awards" value="' + window.escHtml(a.awards_text) + '"></div>';
    }
    return html;
  },

  _topicFeeling: function() {
    var a = this._answers;
    var items = [
      'Confident they made the right choice', 'Relieved it\'s all taken care of', 'Impressed by the quality',
      'Like they got great value', 'Genuinely looked after', 'Like they\'re dealing with experts'
    ];
    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:12px">How do you want customers to feel?</div>';
    html += '<div class="profile-label" style="color:var(--text-muted);margin-bottom:12px">Select up to 2</div>';
    html += this._pills(items, a.feeling, 'feeling');
    html += '<div class="profile-field-full" style="margin-top:8px"><label class="profile-label">Other (optional)</label>' +
      '<input type="text" class="profile-input" id="prof-mkt-feeling-other" value="' + window.escHtml(a.feeling_other) + '"></div>';
    return html;
  },

  _topicTone: function() {
    var a = this._answers;
    var tones = [
      { id: 'professional', label: 'Professional', desc: 'Formal, trustworthy, corporate' },
      { id: 'friendly', label: 'Friendly', desc: 'Warm, approachable, conversational' },
      { id: 'casual', label: 'Casual', desc: 'Relaxed, informal, matey' },
      { id: 'bold', label: 'Bold', desc: 'Confident, direct, punchy' },
      { id: 'helpful', label: 'Helpful', desc: 'Supportive, educational, advisory' }
    ];
    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:12px">How does your business communicate?</div>';
    html += '<div class="profile-label" style="color:var(--text-muted);margin-bottom:12px">Select one</div>';
    html += '<div class="review-pill-row" style="margin-bottom:12px;gap:12px">';
    tones.forEach(function(t) {
      var active = a.tone === t.id ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-tone="' + t.id + '" style="flex-direction:column;align-items:flex-start;padding:12px 16px;min-width:120px">' +
        '<span style="font-weight:var(--font-weight-semibold)">' + window.escHtml(t.label) + '</span>' +
        '<span style="font-size:var(--badge-font-size);font-weight:400;color:var(--text-muted);margin-top:4px">' + window.escHtml(t.desc) + '</span>' +
      '</button>';
    });
    html += '</div>';
    return html;
  },

  // BP UX Improvements Spec v1.0 §5.2.3 — preset palette for the
  // colour picker so SME owners don't need to know hex codes.
  PRESET_COLOURS: [
    { name: 'Navy Blue',     hex: '#1F3864', use: 'Professional, corporate' },
    { name: 'Ocean Blue',    hex: '#4A6D8C', use: 'Trustworthy, calm (platform primary)' },
    { name: 'Sky Blue',      hex: '#5DADE2', use: 'Fresh, modern' },
    { name: 'Forest Green',  hex: '#27AE60', use: 'Natural, eco-friendly' },
    { name: 'Teal',          hex: '#17A589', use: 'Professional, healthcare' },
    { name: 'Burnt Orange',  hex: '#C4622A', use: 'Bold, energetic (platform accent)' },
    { name: 'Bright Orange', hex: '#E67E22', use: 'Friendly, approachable' },
    { name: 'Deep Red',      hex: '#C0392B', use: 'Bold, urgent' },
    { name: 'Royal Purple',  hex: '#8E44AD', use: 'Premium, creative' },
    { name: 'Charcoal',      hex: '#2C3E50', use: 'Sophisticated, minimal' },
    { name: 'Warm Grey',     hex: '#7F8C8D', use: 'Neutral, balanced' },
    { name: 'Black',         hex: '#000000', use: 'Classic, formal' }
  ],

  PLATFORM_DEFAULT_COLOUR: '#4A6D8C',

  _topicColours: function() {
    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:12px">Brand Colours</div>' +
      '<div class="profile-label" style="color:var(--text-muted);margin-bottom:12px">Pick a swatch — or click <strong>Custom colour</strong> to enter your own hex.</div>';
    html += this._colourSelectorHtml('primary', 'Main brand colour', this._answers.primary_colour || '', true);
    html += '<div style="height:24px"></div>';
    html += this._colourSelectorHtml('secondary', 'Secondary brand colour (optional)', this._answers.secondary_colour || '', false);
    return html;
  },

  _colourSelectorHtml: function(key, label, currentHex, allowNone) {
    var presets = this.PRESET_COLOURS;
    var matched = null;
    var lc = (currentHex || '').toLowerCase();
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].hex.toLowerCase() === lc) { matched = presets[i]; break; }
    }
    var isCustom = !!(currentHex && !matched);

    var swatchesHtml = '<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:8px">';
    presets.forEach(function(p) {
      var sel = matched && matched.hex === p.hex;
      var ring = sel
        ? 'inset 0 0 0 3px var(--blue), 0 0 0 1px var(--border)'
        : 'inset 0 0 0 1px var(--border)';
      swatchesHtml += '<button type="button" data-colour-swatch="' + key + '" data-hex="' + p.hex + '" title="' + window.escHtml(p.name + ' — ' + p.use) + '" ' +
        'style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:0;border:none;background:transparent;cursor:pointer">' +
        '<span style="display:block;width:100%;height:36px;background:' + p.hex + ';border-radius:8px;box-shadow:' + ring + '"></span>' +
        '<span style="font-size:11px;color:var(--text-muted);text-align:center;line-height:1.2">' + window.escHtml(p.name) + '</span>' +
      '</button>';
    });
    swatchesHtml += '</div>';

    var actions = '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button type="button" class="btn-outline btn-sm" data-colour-action="custom" data-colour-key="' + key + '">' + (isCustom ? 'Hide custom' : 'Custom colour') + '</button>' +
      (allowNone ? '<button type="button" class="btn-outline btn-sm" data-colour-action="none" data-colour-key="' + key + '">I don\'t have one</button>' : '') +
    '</div>';

    var customBlock =
      '<div id="prof-mkt-' + key + '-custom" style="display:' + (isCustom ? 'flex' : 'none') + ';align-items:center;gap:12px;margin-top:12px">' +
        '<input type="color" id="prof-mkt-' + key + '-picker" value="' + (currentHex || this.PLATFORM_DEFAULT_COLOUR) + '" style="width:50px;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer">' +
        '<input type="text" class="profile-input" id="prof-mkt-' + key + '-hex" value="' + window.escHtml(currentHex || '') + '" placeholder="#000000" style="width:140px">' +
      '</div>';

    var noneNote = allowNone
      ? '<div id="prof-mkt-' + key + '-none-note" style="display:none;margin-top:8px;font-size:13px;color:var(--text-muted)">Using platform default — Ocean Blue. You can change this later.</div>'
      : '';

    return '<div class="profile-field-full">' +
      '<label class="profile-label">' + label + '</label>' +
      swatchesHtml +
      actions +
      customBlock +
      noneNote +
    '</div>';
  },

  _topicTagline: function() {
    var a = this._answers;
    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:12px">Business Tagline</div>';
    html += '<div class="profile-label" style="color:var(--text-muted);margin-bottom:12px">Do you have a business tagline or slogan?</div>';
    html += '<div class="review-pill-row" style="margin-bottom:12px">';
    html += '<button class="filter-pill' + (a.has_tagline === 'yes' ? ' active' : '') + '" data-tagline="yes">Yes</button>';
    html += '<button class="filter-pill' + (a.has_tagline === 'no' ? ' active' : '') + '" data-tagline="no">No</button>';
    html += '</div>';
    if (a.has_tagline === 'yes') {
      html += '<div class="profile-field-full"><label class="profile-label">Your tagline</label>' +
        '<input type="text" class="profile-input" id="prof-mkt-tagline" value="' + window.escHtml(a.tagline) + '" placeholder="Your tagline or slogan"></div>';
    }
    return html;
  },

  _saveTopicData: function() {
    var a = this._answers;
    var t = this._topic;
    if (t === 0) {
      a.standout = [];
      document.querySelectorAll('[data-standout].active').forEach(function(p) { a.standout.push(p.dataset.standout); });
      var other = document.getElementById('prof-mkt-standout-other');
      if (other) a.standout_other = other.value;
      a.quality_detail = [];
      document.querySelectorAll('[data-qualdetail].active').forEach(function(p) { a.quality_detail.push(p.dataset.qualdetail); });
      var qualOther = document.getElementById('prof-mkt-quality-other');
      if (qualOther) a.quality_other = qualOther.value;
      a.service_detail = [];
      document.querySelectorAll('[data-svcdetail].active').forEach(function(p) { a.service_detail.push(p.dataset.svcdetail); });
      var svcOther = document.getElementById('prof-mkt-service-other');
      if (svcOther) a.service_other = svcOther.value;
      a.affordable_detail = [];
      document.querySelectorAll('[data-affdetail].active').forEach(function(p) { a.affordable_detail.push(p.dataset.affdetail); });
      var affOther = document.getElementById('prof-mkt-affordable-other');
      if (affOther) a.affordable_other = affOther.value;
    } else if (t === 1) {
      a.awareness = [];
      document.querySelectorAll('[data-awareness].active').forEach(function(p) { a.awareness.push(p.dataset.awareness); });
      var aother = document.getElementById('prof-mkt-awareness-other');
      if (aother) a.awareness_other = aother.value;
      document.querySelectorAll('[data-custcount].active').forEach(function(p) { a.customer_count = p.dataset.custcount; });
      var awards = document.getElementById('prof-mkt-awards');
      if (awards) a.awards_text = awards.value;
    } else if (t === 2) {
      a.feeling = [];
      document.querySelectorAll('[data-feeling].active').forEach(function(p) {
        a.feeling.push(p.dataset.feeling);
      });
      var fother = document.getElementById('prof-mkt-feeling-other');
      if (fother) a.feeling_other = fother.value;
    } else if (t === 3) {
      document.querySelectorAll('[data-tone].active').forEach(function(p) { a.tone = p.dataset.tone; });
    } else if (t === 4) {
      var pHex = document.getElementById('prof-mkt-primary-hex');
      if (pHex && /^#[0-9a-fA-F]{6}$/.test(pHex.value.trim())) a.primary_colour = pHex.value.trim();
      var sHex = document.getElementById('prof-mkt-secondary-hex');
      if (sHex && /^#[0-9a-fA-F]{6}$/.test(sHex.value.trim())) a.secondary_colour = sHex.value.trim();
    } else if (t === 5) {
      document.querySelectorAll('[data-tagline].active').forEach(function(p) { a.has_tagline = p.dataset.tagline; });
      var tl = document.getElementById('prof-mkt-tagline');
      if (tl) a.tagline = tl.value;
      if (a.has_tagline === 'no') a.tagline = '';
    }
  },

  _generate: async function() {
    var self = this;
    var el = document.getElementById('prof-mkt-modal-content');
    if (!el) return;

    var savedAnswers = JSON.parse(JSON.stringify(this._answers));

    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">' +
      '<div class="loading-spinner"></div>' +
      '<div>Generating your marketing theme...</div>' +
    '</div>';

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) throw new Error('Session expired. Please sign in again.');

      var res = await fetch('/api/generate-marketing-theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ answers: this._answers })
      });
      if (!res.ok) {
        var errData = null;
        try { errData = await res.json(); } catch(e) {}
        throw new Error((errData && errData.error) || 'Failed to generate theme. Please try again.');
      }
      var data = await res.json();
      this._summaryData = data;
      this._showReview();
    } catch (err) {
      this._answers = savedAnswers;
      el.innerHTML = '<div style="text-align:center;padding:20px">' +
        '<div style="color:var(--red);margin-bottom:16px">' + window.escHtml(err.message) + '</div>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
          '<button class="perm-modal-cancel" id="prof-mkt-err-cancel">Cancel</button>' +
          '<button class="btn-back" id="prof-mkt-err-back">Back</button>' +
          '<button class="btn-primary" id="prof-mkt-err-retry">Try Again</button>' +
        '</div>' +
      '</div>';
      document.getElementById('prof-mkt-err-cancel').addEventListener('click', function() {
        self._closeModal();
      });
      document.getElementById('prof-mkt-err-back').addEventListener('click', function() {
        self._topic = 5;
        self._renderTopic();
      });
      document.getElementById('prof-mkt-err-retry').addEventListener('click', function() {
        self._generate();
      });
    }
  },

  _showReview: function() {
    var self = this;
    var el = document.getElementById('prof-mkt-modal-content');
    if (!el) return;
    var pr = this._parent;
    var d = this._summaryData || {};
    var diff = d.differentiators || '';
    var aware = d.awareness || '';
    var feel = d.feeling || '';
    var tone = this._answers.tone || 'friendly';
    var pc = this._answers.primary_colour || '';
    var sc = this._answers.secondary_colour || '';
    var tag = this._answers.tagline || '';

    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:16px">Your Marketing Theme</div>';
    html += '<div class="profile-label" style="color:var(--text-muted);margin-bottom:16px">Review and edit, then confirm to save.</div>';
    html += pr._field('What makes you stand out', pr._textarea('prof-sum-diff', diff, '', 3));
    html += pr._field('What customers should know', pr._textarea('prof-sum-aware', aware, '', 3));
    html += pr._field('How you want customers to feel', pr._textarea('prof-sum-feel', feel, '', 2));
    html += pr._field('Tone of voice', '<input type="text" class="profile-input" id="prof-sum-tone" value="' + window.escHtml(tone) + '">');
    html += '<div style="display:flex;gap:16px;margin-bottom:12px">';
    html += '<div class="profile-field-full" style="flex:1"><label class="profile-label">Primary colour</label><input type="text" class="profile-input" id="prof-sum-colour1" value="' + window.escHtml(pc) + '" placeholder="#000000"></div>';
    html += '<div class="profile-field-full" style="flex:1"><label class="profile-label">Secondary colour</label><input type="text" class="profile-input" id="prof-sum-colour2" value="' + window.escHtml(sc) + '" placeholder="(optional)"></div>';
    html += '</div>';
    html += pr._field('Tagline', '<input type="text" class="profile-input" id="prof-sum-tagline" value="' + window.escHtml(tag) + '" placeholder="(optional)">');
    html += '<div style="display:flex;gap:12px;margin-top:20px">';
    html += '<button class="perm-modal-cancel" id="prof-mkt-review-cancel">Cancel</button>';
    html += '<button class="btn-outline" id="prof-mkt-redo">Start Over</button>';
    html += '<button class="btn-save" id="prof-mkt-save-final" style="margin-left:auto">Confirm &amp; Save</button>';
    html += '</div>';

    el.innerHTML = html;

    document.getElementById('prof-mkt-review-cancel').addEventListener('click', function() {
      self._closeModal();
    });
    document.getElementById('prof-mkt-redo').addEventListener('click', function() {
      self._topic = 0;
      self._renderTopic();
    });
    document.getElementById('prof-mkt-save-final').addEventListener('click', function() {
      self._saveFinal();
    });
  },

  _saveFinal: async function() {
    var self = this;
    var btn = document.getElementById('prof-mkt-save-final');
    if (!btn || btn.disabled) return;
    var label = btn.textContent;

    var diffEl = document.getElementById('prof-sum-diff');
    var awareEl = document.getElementById('prof-sum-aware');
    var feelEl = document.getElementById('prof-sum-feel');
    var toneEl = document.getElementById('prof-sum-tone');
    var colour1El = document.getElementById('prof-sum-colour1');

    // Validate the five marketing-theme mandatory fields. Mirrors the
    // _validateMandatory helper on CL_PROFILE — uses the same
    // .input-error class so the visual treatment matches the other
    // panels. Throws so we can short-circuit before the supabase write.
    var firstMissing = null;
    var missingLabels = [];
    [
      { el: diffEl,    label: 'What Makes You Stand Out',  test: function() { return diffEl && diffEl.value.trim() !== ''; } },
      { el: awareEl,   label: 'What Customers Should Know', test: function() { return awareEl && awareEl.value.trim() !== ''; } },
      { el: feelEl,    label: 'How Customers Should Feel',  test: function() { return feelEl && feelEl.value.trim() !== ''; } },
      { el: toneEl,    label: 'Tone of Voice',              test: function() { return toneEl && toneEl.value.trim() !== ''; } },
      { el: colour1El, label: 'Primary Brand Colour',       test: function() { return colour1El && colour1El.value.trim() !== ''; } }
    ].forEach(function(f) {
      if (f.el) f.el.classList.remove('input-error');
      if (!f.test()) {
        if (f.el) f.el.classList.add('input-error');
        if (!firstMissing && f.el) firstMissing = f.el;
        missingLabels.push(f.label);
      }
    });
    if (missingLabels.length > 0) {
      if (firstMissing && typeof firstMissing.scrollIntoView === 'function') {
        firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      window.showModalError('Please complete: ' + missingLabels.join(', '));
      return;
    }

    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      var updates = {
        marketing_theme_differentiators: diffEl.value.trim(),
        marketing_theme_awareness: awareEl.value.trim(),
        marketing_theme_feeling: feelEl.value.trim(),
        marketing_theme_extra: [JSON.stringify(self._answers)],
        tone_of_voice: toneEl.value.trim(),
        primary_brand_colour: colour1El.value.trim() || null,
        secondary_brand_colour: document.getElementById('prof-sum-colour2').value.trim() || null,
        tagline: document.getElementById('prof-sum-tagline').value.trim() || null
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);

      btn.textContent = 'Saved \u2713';
      setTimeout(function() {
        self._closeModal();
        self._renderPanel();
      }, 800);

      try {
        var sessionRes = await self._supabase.auth.getSession();
        var sess = sessionRes.data && sessionRes.data.session;
        if (sess) {
          fetch('/api/predis-brand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sess.access_token }
          }).catch(function() {});
        }
      } catch (e) {}
    } catch (err) {
      btn.textContent = label;
      btn.disabled = false;
      window.showModalError(err.message || 'Could not save. Please try again.');
    }
  }
};
