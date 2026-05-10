/**
 * strategic-plan-wizard.js
 * Wizard-support methods split out of strategic-plan-modules.js so
 * neither file exceeds the platform's 60K ceiling. Holds:
 *   - prefillFromBIContext + bucketers (spec §8.9)
 *   - Incomplete-fields modal (spec §8.8)
 *   - BI Generated Items / Tab 9 (spec §8.7)
 *
 * Loaded alongside strategic-plan-logic.js / -modules.js / -review.js
 * / -archive.js; methods Object.assign onto the same window.SP_LOGIC
 * object so cross-file calls (loadInitiatives, _showError,
 * _performGeneration, goToSection, readFieldValue,
 * updateHiddenFromChips, writeFieldValue, loadBIActiveTile, etc.)
 * resolve naturally.
 */
window.SP_LOGIC = window.SP_LOGIC || {};
Object.assign(window.SP_LOGIC, {

  // ── BI prefill orchestrator + bucketers ──────────────────────────
  // prefillFromBIContext walks SP_SECTIONS and writes a bucketed
  // value for every fromBI:true field that has a matching apiKey in
  // the prefillValues map. Spec §8.9 wires five previously-dead
  // flags here: avgJobValue, leadConversion, jobsPerMonth,
  // industryOutlook, marketTrends.
  prefillFromBIContext: function(bi) {
    var self = this;
    if (!bi) return;
    var fin = bi.financial || {};
    var ops = bi.operations || {};
    var cust = bi.customers || {};
    var market = bi.market_signal || null;

    var prefillValues = {
      annualRevenue:    self.bucketRevenue(fin.revenue),
      revenueTrend:     self.bucketRevenueTrend(fin.revenue_trend_pct),
      grossMargin:      fin.gross_margin != null
                          ? self.bucketGrossMargin(fin.gross_margin)
                          : self.bucketGrossMargin(fin.profit_margin),
      netProfitMargin:  self.bucketNetMargin(fin.profit_margin),
      avgPaymentTime:   self.bucketDebtorDays(fin.avg_debtor_days),
      avgJobValue:      self.bucketAvgJobValue(ops.avg_job_value),
      leadConversion:   self.bucketLeadConversion(cust.conversion_rate),
      jobsPerMonth:     self.bucketJobsPerMonth(ops.jobs_per_month),
      industryOutlook:  self.bucketIndustryOutlook(market),
      marketTrends:     self.bucketMarketTrends(market)
    };

    var applied = 0;
    window.SP_SECTIONS.forEach(function(s) { (s.fields || []).forEach(function(f) {
      if (!f.fromBI) return;
      var el = document.getElementById(f.id);
      if (!el) return;
      var v = prefillValues[f.apiKey];
      if (v == null) return;
      // If the user has set a different scalar value, leave it.
      var current = self.readFieldValue(el);
      if (current && current !== v && !Array.isArray(v)) return;
      if (f.type === 'chip-single') {
        el.value = v;
        var g = document.getElementById(f.id + '-chips');
        if (g) {
          g.querySelectorAll('.filter-pill').forEach(function(c) { if (c.dataset.value === v) c.classList.add('active'); });
          g.classList.add('sp-from-bi');
        }
      } else if (f.type === 'chip-multi') {
        var vals = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(function(x){return x.trim()}).filter(Boolean) : []);
        if (vals.length === 0) return;
        var group = document.getElementById(f.id + '-chips');
        if (!group) return;
        // Don't overwrite if the user has already picked any chip.
        if (group.querySelector('.filter-pill.active')) return;
        vals.forEach(function(val) {
          var chip = group.querySelector('.filter-pill[data-value="' + val + '"]');
          if (chip) chip.classList.add('active');
        });
        group.classList.add('sp-from-bi');
        self.updateHiddenFromChips(f.id);
      } else {
        self.writeFieldValue(el, v);
        el.classList.add('sp-from-bi');
      }
      applied++;
    }); });
    console.log('[SP] BI prefill — applied sp-from-bi to ' + applied + ' field(s)');
  },

  // ── BI prefill bucketers — spec §8.9 ─────────────────────────────
  // Convert raw BI numbers / signals to the wizard's bucketed option
  // values. Pure functions, called from prefillFromBIContext above.
  // Bucket boundaries match the actual option lists in
  // strategic-plan-data.js — keep them in sync if the option sets
  // change.

  bucketAvgJobValue: function(amount) {
    if (amount == null || isNaN(amount)) return null;
    if (amount < 500) return 'under-500';
    if (amount < 1000) return '500-1k';
    if (amount < 2500) return '1k-2.5k';
    if (amount < 5000) return '2.5k-5k';
    if (amount < 10000) return '5k-10k';
    if (amount < 25000) return '10k-25k';
    if (amount < 50000) return '25k-50k';
    return '50k+';
  },

  bucketLeadConversion: function(pct) {
    if (pct == null || isNaN(pct)) return null;
    if (pct >= 60) return 'excellent';
    if (pct >= 40) return 'good';
    if (pct >= 25) return 'average';
    if (pct >= 0)  return 'below-average';
    return null;
  },

  bucketJobsPerMonth: function(count) {
    if (count == null || isNaN(count) || count <= 0) return null;
    if (count <= 5) return '1-5';
    if (count <= 10) return '6-10';
    if (count <= 20) return '11-20';
    if (count <= 50) return '21-50';
    if (count <= 100) return '51-100';
    return '100+';
  },

  // Industry outlook — derived from the severity distribution of
  // cached BI market insights. Heavily-green ⇒ growth; heavily-red ⇒
  // declining; mixed amber ⇒ uncertain; otherwise stable. Returns
  // null when the user has no market insights yet so the field
  // stays unset rather than guessing.
  bucketIndustryOutlook: function(signal) {
    if (!signal || !signal.severity_counts) return null;
    var c = signal.severity_counts;
    var total = (c.red || 0) + (c.amber || 0) + (c.green || 0);
    if (total === 0) return null;
    var greenPct = (c.green || 0) / total;
    var redPct = (c.red || 0) / total;
    if (greenPct >= 0.7) return 'strong-growth';
    if (greenPct >= 0.5) return 'moderate-growth';
    if (redPct >= 0.6) return 'declining';
    if ((c.amber || 0) >= 2) return 'uncertain';
    return 'stable';
  },

  // Market trends — match each trend chip's keywords against the
  // joined market insight headlines. Returns an array of trend chip
  // values (or null when no signal). The match list is intentionally
  // conservative so we don't tag a trend off a single tangential
  // word; tweak as the chip option set evolves.
  bucketMarketTrends: function(signal) {
    if (!signal || !Array.isArray(signal.headlines) || signal.headlines.length === 0) return null;
    var lower = signal.headlines.join(' ').toLowerCase();
    var keywords = {
      'digital-transform': ['digital', 'automation', 'ai ', 'ai-', 'a.i.'],
      'sustainability':    ['sustainab', 'environment', 'esg', 'net zero'],
      'consolidation':     ['consolidat', 'merger', 'acquisition', 'roll-up'],
      'skills-shortage':   ['shortage', 'skills gap', 'labour shortage', 'recruitment'],
      'regulation':        ['regulat', 'complianc', 'legislation', 'licens'],
      'material-costs':    ['material cost', 'commodity', 'inflation', 'supply chain'],
      'customer-expect':   ['expectation', 'customer demand'],
      'new-tech':          ['technology', 'innovation', 'platform']
    };
    var matched = [];
    Object.keys(keywords).forEach(function(key) {
      var kws = keywords[key];
      for (var i = 0; i < kws.length; i++) {
        if (lower.indexOf(kws[i]) !== -1) { matched.push(key); break; }
      }
    });
    return matched.length > 0 ? matched : null;
  },

  // ── Incomplete-fields modal — spec §8.8 ──────────────────────────
  // Counts every wizard field that is user-fillable but currently
  // empty (skips readonly-pills and the BI Generated Items tab). The
  // generate() flow calls this after the required-field gate passes;
  // if the count is non-zero the user picks Review Fields (jumps to
  // the first incomplete and amber-highlights all incompletes) or
  // Generate Anyway (proceeds with the partial dataset).
  _countIncompleteFields: function() {
    var self = this;
    var sections = window.SP_SECTIONS || [];
    var incomplete = [];
    sections.forEach(function(section) {
      // BI Generated Items isn't a form. Skip it entirely.
      if (section.type === 'bi-items') return;
      (section.fields || []).forEach(function(field) {
        // readonly-pills mirror Business Profile data — the user
        // can't fill them from the wizard, so an empty value here
        // means BP itself is empty and the SP wizard isn't the right
        // place to flag it.
        if (field.type === 'readonly-pills') return;
        var el = document.getElementById(field.id);
        if (!el) return;
        var value = self.readFieldValue(el);
        if (!value || !String(value).trim()) {
          incomplete.push({ section: section, field: field });
        }
      });
    });
    return incomplete;
  },

  _showIncompleteFieldsModal: function(incomplete, data) {
    var self = this;
    var modal = document.getElementById('sp-incomplete-modal');
    if (!modal) {
      // Modal markup missing — fail open and proceed with generation
      // so the user is never left stuck.
      self._performGeneration(data);
      return;
    }
    var countEl = document.getElementById('sp-incomplete-count');
    var pluralEl = document.getElementById('sp-incomplete-plural');
    if (countEl) countEl.textContent = incomplete.length;
    if (pluralEl) pluralEl.textContent = incomplete.length === 1 ? '' : 's';
    modal.classList.add('open');

    var reviewBtn = document.getElementById('sp-incomplete-review');
    var proceedBtn = document.getElementById('sp-incomplete-proceed');
    var onReview, onProceed, onBackdrop;
    var cleanup = function() {
      modal.classList.remove('open');
      if (reviewBtn) reviewBtn.removeEventListener('click', onReview);
      if (proceedBtn) proceedBtn.removeEventListener('click', onProceed);
      modal.removeEventListener('click', onBackdrop);
    };
    onReview = function() { cleanup(); self._highlightIncomplete(incomplete); };
    onProceed = function() { cleanup(); self._performGeneration(data); };
    onBackdrop = function(e) { if (e.target === modal) cleanup(); };
    if (reviewBtn) reviewBtn.addEventListener('click', onReview);
    if (proceedBtn) proceedBtn.addEventListener('click', onProceed);
    modal.addEventListener('click', onBackdrop);
  },

  _highlightIncomplete: function(incomplete) {
    var self = this;
    // Drop any leftover highlights from a prior cycle.
    document.querySelectorAll('.sp-field.sp-field-incomplete').forEach(function(el) {
      el.classList.remove('sp-field-incomplete');
    });
    incomplete.forEach(function(entry) {
      var el = document.getElementById(entry.field.id);
      if (!el) return;
      var fieldEl = el.closest('.sp-field');
      if (fieldEl) fieldEl.classList.add('sp-field-incomplete');
    });
    if (incomplete.length === 0) return;
    // Jump to the first section that has an incomplete field. The
    // setTimeout gives goToSection's smooth-scroll a beat to land
    // before we scroll the specific field into view.
    var firstSectionId = incomplete[0].section.id;
    self.goToSection(firstSectionId);
    setTimeout(function() {
      var firstFieldEl = document.getElementById(incomplete[0].field.id);
      if (!firstFieldEl) return;
      var wrapper = firstFieldEl.closest('.sp-field');
      if (wrapper && wrapper.scrollIntoView) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 250);
  },

  // ── BI Generated Items (Tab 9) — spec §8.7 ───────────────────────
  // Loads strategic insights queued from BI (Add to Plan in the
  // dashboard set added_to_sp = true on bi_insights, with
  // is_tactical = false meaning the item needs strategic decision
  // rather than an immediate task). Renders one card per item with
  // Approve / Hold / Reject buttons. The action persists on
  // bi_insights.sp_queue_action for the SP generator to read in a
  // later phase.
  loadBIQueueItems: function() {
    var self = this;
    var listEl = document.getElementById('sp-bi-queue-list');
    if (!listEl) return;
    if (!self._supabase || !self._userId) {
      listEl.innerHTML = self._renderBIQueueEmpty();
      return;
    }
    self._supabase
      .from('bi_insights')
      .select('id, insight_data, sp_queue_action, added_to_sp_at')
      .eq('user_id', self._userId)
      .eq('added_to_sp', true)
      .eq('is_tactical', false)
      .eq('is_dismissed', false)
      .order('added_to_sp_at', { ascending: false })
      .then(function(res) {
        if (res.error) {
          console.error('[SP] BI queue load error:', res.error.message || res.error);
          listEl.innerHTML = self._renderBIQueueEmpty();
          return;
        }
        var items = res.data || [];
        if (items.length === 0) {
          listEl.innerHTML = self._renderBIQueueEmpty();
          return;
        }
        listEl.innerHTML = items.map(function(item) { return self._renderBIQueueItem(item); }).join('');
      });
  },

  _renderBIQueueEmpty: function() {
    return '<div class="sp-bi-queue-empty">' +
      '<p>No items queued from Business Intelligence.</p>' +
      '<p class="sp-label-hint">Strategic insights you add from the BI dashboard will appear here for review.</p>' +
      '</div>';
  },

  _renderBIQueueItem: function(item) {
    var d = item.insight_data || {};
    var category = (d.category || '').toLowerCase();
    var categoryLabels = {
      financial: 'Financial', products: 'Products & Services',
      customers: 'Customers & Suppliers', operations: 'Operations & Capacity',
      market: 'Market & Competition', growth: 'Growth & Transformation',
      risk: 'Continuity & Resilience'
    };
    var catLabel = categoryLabels[category] || 'Other';
    var action = item.sp_queue_action || '';
    var actionBadge = '';
    if (action === 'approved') actionBadge = '<span class="badge badge-green">Approved</span>';
    else if (action === 'held') actionBadge = '<span class="badge badge-orange">Held</span>';
    else if (action === 'rejected') actionBadge = '<span class="badge badge-red">Rejected</span>';

    var headline = d.headline || 'Strategic suggestion';
    var detail = d.detail || '';
    return '<div class="sp-bi-queue-item' + (action ? ' sp-bi-queue-item-' + action : '') + '" data-id="' + escHtml(item.id) + '">' +
      '<div class="sp-bi-queue-item-head">' +
        '<span class="sp-bi-queue-item-title">' + escHtml(headline) + '</span>' +
        '<span class="badge badge-blue">' + escHtml(catLabel) + '</span>' +
        actionBadge +
      '</div>' +
      (detail ? '<div class="sp-bi-queue-item-detail">' + escHtml(detail) + '</div>' : '') +
      '<div class="sp-bi-queue-item-source">From: BI Risks &amp; Opportunities</div>' +
      '<div class="sp-bi-queue-item-actions">' +
        '<button type="button" class="review-approve-btn btn-sm" data-action="approve">Approve</button>' +
        '<button type="button" class="btn-outline btn-sm" data-action="hold">Hold</button>' +
        '<button type="button" class="btn-dismiss btn-sm" data-action="reject">Reject</button>' +
      '</div>' +
    '</div>';
  },

  bindBIQueueEvents: function() {
    var self = this;
    var listEl = document.getElementById('sp-bi-queue-list');
    if (!listEl || listEl.dataset.queueBound === '1') return;
    listEl.dataset.queueBound = '1';
    listEl.addEventListener('click', function(e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var item = btn.closest('.sp-bi-queue-item');
      if (!item) return;
      var insightId = item.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      self._setBIQueueAction(insightId, action);
    });
  },

  _setBIQueueAction: function(insightId, action) {
    var self = this;
    if (!self._supabase || !self._userId || !insightId) return;
    var actionMap = { approve: 'approved', hold: 'held', reject: 'rejected' };
    var queueAction = actionMap[action];
    if (!queueAction) return;
    var nowIso = new Date().toISOString();
    var updates = { sp_queue_action: queueAction, updated_at: nowIso };
    // Reject also dismisses the insight from the BI dashboard so the
    // owner doesn't see it on the next BI page load.
    if (queueAction === 'rejected') updates.is_dismissed = true;
    self._supabase
      .from('bi_insights')
      .update(updates)
      .eq('id', insightId)
      .eq('user_id', self._userId)
      .then(function(res) {
        if (res.error) {
          console.error('[SP] BI queue update error:', res.error.message || res.error);
          self._showError('Could not save your decision. Please try again.');
          return;
        }
        self.loadBIQueueItems();
        // The active-plan BI tile reads from the same query — refresh
        // its cache so the count updates after a Tab 9 decision.
        if (typeof self.loadBIActiveTile === 'function') self.loadBIActiveTile();
      });
  }

});
