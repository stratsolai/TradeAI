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
    var raw = p.marketing_theme_extra;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch(e) { raw = null; } }
    var saved = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
    var hasSaved = saved && Array.isArray(saved.standout);
    this._answers = {
      standout: hasSaved ? (saved.standout || []) : [],
      standout_other: hasSaved ? (saved.standout_other || '') : '',
      quality_detail: hasSaved ? (saved.quality_detail || []) : [],
      quality_other: hasSaved ? (saved.quality_other || '') : '',
      service_detail: hasSaved ? (saved.service_detail || []) : [],
      service_other: hasSaved ? (saved.service_other || '') : '',
      affordable_detail: hasSaved ? (saved.affordable_detail || []) : [],
      affordable_other: hasSaved ? (saved.affordable_other || '') : '',
      experience_years: hasSaved ? (saved.experience_years || '') : '',
      certifications: hasSaved ? (saved.certifications || []) : [],
      certifications_other: hasSaved ? (saved.certifications_other || '') : '',
      awareness: hasSaved ? (saved.awareness || []) : [],
      awareness_other: hasSaved ? (saved.awareness_other || '') : '',
      customer_count: hasSaved ? (saved.customer_count || '') : '',
      awards_text: hasSaved ? (saved.awards_text || '') : '',
      feeling: hasSaved ? (saved.feeling || []) : [],
      feeling_other: hasSaved ? (saved.feeling_other || '') : '',
      tone: p.tone_of_voice || (hasSaved ? (saved.tone || 'friendly') : 'friendly'),
      primary_colour: p.primary_brand_colour || '', secondary_colour: p.secondary_brand_colour || '',
      tagline: p.tagline || '', has_tagline: p.tagline ? 'yes' : 'no',
      specialise_services: hasSaved ? (saved.specialise_services || []) : [],
      specialise_duration: hasSaved ? (saved.specialise_duration || '') : ''
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
    nav += '<button class="perm-modal-cancel" id="prof-mkt-cancel">Cancel</button>';
    if (t > 0) nav += '<button class="btn-back" id="prof-mkt-prev">Back</button>';
    nav += '<button class="btn-primary" id="prof-mkt-next" style="margin-left:auto">' + (t < 5 ? 'Next' : 'Generate Summary') + '</button>';
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
          if (attr === 'feelingMax') {
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
    var picker1 = document.getElementById('prof-mkt-colour1');
    var hex1 = document.getElementById('prof-mkt-colour1-hex');
    if (picker1 && hex1) {
      picker1.addEventListener('input', function() { hex1.value = picker1.value; });
      hex1.addEventListener('input', function() {
        if (/^#[0-9a-fA-F]{6}$/.test(hex1.value)) picker1.value = hex1.value;
      });
    }
    var picker2 = document.getElementById('prof-mkt-colour2');
    var hex2 = document.getElementById('prof-mkt-colour2-hex');
    if (picker2 && hex2) {
      picker2.addEventListener('input', function() { hex2.value = picker2.value; });
      hex2.addEventListener('input', function() {
        if (/^#[0-9a-fA-F]{6}$/.test(hex2.value)) picker2.value = hex2.value;
      });
    }
    var noColourBtn = document.getElementById('prof-mkt-no-colour');
    if (noColourBtn && hex1) {
      noColourBtn.addEventListener('click', function() { hex1.value = ''; });
    }
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
    if (a.standout.indexOf('More experienced or qualified') !== -1) {
      html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">Years in business</label>' +
        '<input type="text" class="profile-input" id="prof-mkt-exp-years" value="' + window.escHtml(a.experience_years || '') + '" style="width:120px"></div>';
      var bp = this._profile || {};
      var bpLicences = Array.isArray(bp.licences) ? bp.licences : [];
      if (bpLicences.length > 0) {
        var selectedCerts = a.certifications || [];
        html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">Qualifications and certifications</label>';
        html += '<div class="review-pill-row" style="margin-bottom:8px">';
        bpLicences.forEach(function(lic) {
          var active = selectedCerts.indexOf(lic) !== -1 ? ' active' : '';
          html += '<button class="filter-pill' + active + '" data-certpill="' + window.escHtml(lic) + '">' + window.escHtml(lic) + '</button>';
        });
        html += '</div></div>';
      }
      html += '<div class="profile-field-full" style="margin-top:8px"><label class="profile-label">Other certifications (optional)</label>' +
        '<input type="text" class="profile-input" id="prof-mkt-cert-other" value="' + window.escHtml(a.certifications_other || '') + '" placeholder="Any other qualifications or certifications"></div>';
    }
    if (a.standout.indexOf('We specialise in certain areas') !== -1) {
      var bp = this._profile || {};
      var bpServices = Array.isArray(bp.bp_services) ? bp.bp_services : [];
      var serviceNames = bpServices.map(function(s) { return s.name || s; }).filter(function(n) { return !!n; });
      var selectedSpecialise = a.specialise_services || [];
      html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">Which services do you specialise in?</label>';
      if (serviceNames.length > 0) {
        html += '<div class="review-pill-row" style="margin-bottom:8px">';
        serviceNames.forEach(function(svc) {
          var active = selectedSpecialise.indexOf(svc) !== -1 ? ' active' : '';
          html += '<button class="filter-pill' + active + '" data-specsvc="' + window.escHtml(svc) + '">' + window.escHtml(svc) + '</button>';
        });
        html += '</div>';
      } else {
        html += '<div style="color:var(--text-muted);font-size:var(--badge-font-size);margin-bottom:8px">No services found in your Business Profile. Add services to your profile to select them here.</div>';
      }
      html += '</div>';
      var durationOptions = ['Less than 2 years', '2\u20135 years', '5\u201310 years', '10+ years'];
      var currentDuration = a.specialise_duration ? [a.specialise_duration] : [];
      html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">How long have you been specialising in this?</label>' +
        this._pills(durationOptions, currentDuration, 'specdur') + '</div>';
    }
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
    html += this._pills(items, a.feeling, 'feelingMax');
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

  _topicColours: function() {
    var a = this._answers;
    var html = '<div class="profile-label" style="font-size:var(--section-title-font-size);font-weight:var(--heading-lg-weight);margin-bottom:12px">Brand Colours</div>';
    html += '<div class="profile-field-full"><label class="profile-label">Main brand colour</label>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<input type="color" id="prof-mkt-colour1" value="' + (a.primary_colour || '#4A6D8C') + '" style="width:50px;height:36px;border:var(--input-border-width) solid var(--border);border-radius:var(--input-radius);cursor:pointer">' +
      '<input type="text" class="profile-input" id="prof-mkt-colour1-hex" value="' + window.escHtml(a.primary_colour || '') + '" placeholder="#000000" style="width:120px">' +
      '<button class="filter-pill" id="prof-mkt-no-colour">I don\'t have one</button>' +
      '</div></div>';
    html += '<div class="profile-field-full" style="margin-top:12px"><label class="profile-label">Secondary brand colour (optional)</label>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<input type="color" id="prof-mkt-colour2" value="' + (a.secondary_colour || '#FFFFFF') + '" style="width:50px;height:36px;border:var(--input-border-width) solid var(--border);border-radius:var(--input-radius);cursor:pointer">' +
      '<input type="text" class="profile-input" id="prof-mkt-colour2-hex" value="' + window.escHtml(a.secondary_colour || '') + '" placeholder="#000000" style="width:120px">' +
      '</div></div>';
    return html;
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
      var expYears = document.getElementById('prof-mkt-exp-years');
      if (expYears) a.experience_years = expYears.value;
      a.certifications = [];
      document.querySelectorAll('[data-certpill].active').forEach(function(p) { a.certifications.push(p.dataset.certpill); });
      var certOther = document.getElementById('prof-mkt-cert-other');
      if (certOther) a.certifications_other = certOther.value;
      a.specialise_services = [];
      document.querySelectorAll('[data-specsvc].active').forEach(function(p) { a.specialise_services.push(p.dataset.specsvc); });
      a.specialise_duration = '';
      document.querySelectorAll('[data-specdur].active').forEach(function(p) { a.specialise_duration = p.dataset.specdur; });
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
      document.querySelectorAll('[data-feeling-max].active, [data-feelingMax].active').forEach(function(p) {
        a.feeling.push(p.dataset.feelingMax || p.dataset['feeling-max']);
      });
      var fother = document.getElementById('prof-mkt-feeling-other');
      if (fother) a.feeling_other = fother.value;
    } else if (t === 3) {
      document.querySelectorAll('[data-tone].active').forEach(function(p) { a.tone = p.dataset.tone; });
    } else if (t === 4) {
      var c1 = document.getElementById('prof-mkt-colour1-hex');
      if (c1) a.primary_colour = c1.value;
      var c2 = document.getElementById('prof-mkt-colour2-hex');
      if (c2) a.secondary_colour = c2.value;
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
          '<button class="btn-back" id="prof-mkt-err-back">Back</button>' +
          '<button class="btn-primary" id="prof-mkt-err-retry">Try Again</button>' +
        '</div>' +
      '</div>';
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
    html += '<button class="btn-outline" id="prof-mkt-redo">Start Over</button>';
    html += '<button class="btn-save" id="prof-mkt-save-final" style="margin-left:auto">Confirm &amp; Save</button>';
    html += '</div>';

    el.innerHTML = html;

    document.getElementById('prof-mkt-redo').addEventListener('click', function() {
      self._topic = 0;
      self._renderTopic();
    });
    document.getElementById('prof-mkt-save-final').addEventListener('click', function() {
      self._saveFinal();
    });
  },

  _saveFinal: function() {
    var self = this;
    var btn = document.getElementById('prof-mkt-save-final');

    window.handleSave(btn, async function() {
      var updates = {
        marketing_theme_differentiators: document.getElementById('prof-sum-diff').value.trim(),
        marketing_theme_awareness: document.getElementById('prof-sum-aware').value.trim(),
        marketing_theme_feeling: document.getElementById('prof-sum-feel').value.trim(),
        marketing_theme_extra: JSON.parse(JSON.stringify(self._answers)),
        tone_of_voice: document.getElementById('prof-sum-tone').value.trim(),
        primary_brand_colour: document.getElementById('prof-sum-colour1').value.trim() || null,
        secondary_brand_colour: document.getElementById('prof-sum-colour2').value.trim() || null,
        tagline: document.getElementById('prof-sum-tagline').value.trim() || null
      };
      var res = await self._supabase.from('profiles').update(updates).eq('id', self._userId);
      if (res.error) throw new Error(res.error.message);
      Object.assign(self._profile, updates);

      self._closeModal();
      self._renderPanel();

      try {
        var sessionRes = await self._supabase.auth.getSession();
        var sess = sessionRes.data && sessionRes.data.session;
        if (sess) {
          fetch('/api/predis-brand', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + sess.access_token
            }
          }).catch(function() {});
        }
      } catch (e) {}
    }, document.getElementById('prof-save-msg'));
  }
};
