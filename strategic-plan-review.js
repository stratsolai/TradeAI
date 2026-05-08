/**
 * strategic-plan-review.js
 * SP Review & Approval screen — spec §6. Renders the draft plan
 * after generation: editable plan name, DRAFT banner, Executive
 * Summary, SWOT, category accordions of Goals + Tasks, plus the
 * Discard / Approve flow. Loaded alongside strategic-plan-logic.js
 * and strategic-plan-modules.js; all three contribute methods to
 * the same window.SP_LOGIC object so methods cross-call freely.
 */
window.SP_LOGIC = window.SP_LOGIC || {};
Object.assign(window.SP_LOGIC, {

  // Category metadata shared with the Review screen renders. Order
  // matches spec §4. Display labels and icons end up in section
  // headers on the Review screen and in chip rows where applicable.
  _SP_REVIEW_CATEGORIES: [
    { key: 'financial',  label: 'Financial',              icon: '\u{1F4B0}' },
    { key: 'products',   label: 'Products & Services',     icon: '\u{1F527}' },
    { key: 'customers',  label: 'Customers & Suppliers',   icon: '\u{1F465}' },
    { key: 'operations', label: 'Operations & Capacity',   icon: '⚙'    },
    { key: 'market',     label: 'Market & Competition',    icon: '\u{1F4CA}' },
    { key: 'growth',     label: 'Growth & Transformation', icon: '\u{1F680}' },
    { key: 'risk',       label: 'Risk & Resilience',       icon: '\u{1F6E1}️' }
  ],

  // Loads a pending_approval plan from strategic_plans and renders
  // the Review screen. Called from init when checkPlanExists finds
  // a pending plan, and from onPlanGenerated immediately after a
  // fresh generate succeeds.
  loadReviewScreen: function(planId) {
    var self = this;
    if (!self._supabase || !self._userId || !planId) return;
    self._pendingPlanId = planId;
    var reviewEl = document.getElementById('sp-doc-review');
    if (reviewEl) reviewEl.style.display = 'block';
    self._supabase
      .from('strategic_plans')
      .select('id, plan_name, version, status, created_at, plan_data, swot_data')
      .eq('id', planId)
      .eq('user_id', self._userId)
      .single()
      .then(function(res) {
        if (res.error || !res.data) {
          console.error('[SP Review] load error:', res.error && res.error.message);
          return;
        }
        self._pendingPlanData = res.data.plan_data || {};
        self._pendingPlanRow = res.data;
        self.renderReviewScreen(res.data);
      });
  },

  renderReviewScreen: function(plan) {
    var self = this;
    var content = plan.plan_data || {};
    var headerEl = document.getElementById('sp-review-header');
    var summaryEl = document.getElementById('sp-review-summary');
    var swotEl = document.getElementById('sp-review-swot');
    if (headerEl) headerEl.innerHTML = self.renderReviewHeader(plan);
    if (summaryEl) summaryEl.innerHTML = self.renderReviewSummary(content);
    if (swotEl) swotEl.innerHTML = self.renderReviewSwot(content, plan);
    self.bindReviewHeaderEvents();
  },

  // Header — editable plan name, DRAFT banner, Discard / Approve.
  renderReviewHeader: function(plan) {
    var name = plan.plan_name || 'Strategic Plan';
    var generated = plan.created_at ? plan.created_at.substring(0, 10) : '';
    return '<div class="sp-review-header-row">' +
        '<div class="sp-review-header-left">' +
          '<input type="text" id="sp-review-plan-name" class="sp-review-plan-name" value="' + escHtml(name) + '" maxlength="120" />' +
          '<div class="sp-review-meta">' +
            '<span class="badge badge-orange">DRAFT — Not yet approved</span>' +
            (generated ? '<span class="sp-review-meta-date">Generated ' + escHtml(generated) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="sp-review-header-actions">' +
          '<button type="button" class="btn-back" id="sp-review-discard-btn">Discard Draft</button>' +
          '<button type="button" class="btn-primary" id="sp-review-approve-btn">Approve Plan</button>' +
        '</div>' +
      '</div>';
  },

  // Executive Summary — read-only narrative. Spec §6.3 — to change
  // the wording the owner regenerates the plan.
  renderReviewSummary: function(content) {
    var summary = (content && content.executiveSummary) || '';
    if (!summary) {
      return '<div class="sp-review-empty">Executive summary unavailable for this draft.</div>';
    }
    var paragraphs = String(summary).split(/\n\n+/).map(function(p) {
      return '<p>' + escHtml(p.trim()) + '</p>';
    }).join('');
    return '<h2 class="sp-review-section-title">Executive Summary</h2>' +
      '<div class="sp-review-readonly-note">Read-only — to change this, update your wizard answers and regenerate.</div>' +
      '<div class="sp-review-summary-body">' + paragraphs + '</div>';
  },

  // SWOT — 4-quadrant grid of dot points. Spec §6.4 — max 10 words
  // per point. Pulls from plan_data.swotPoints (the new structured
  // form) first, then falls back to swot_data (legacy shape) and
  // finally plain-text swotAnalysis if nothing structured is
  // available. The 10-word cap is enforced cosmetically by the
  // prompt; the renderer trusts what it gets.
  renderReviewSwot: function(content, plan) {
    var quadrants = [
      { key: 'strengths',     label: 'Strengths',     css: 'strengths' },
      { key: 'weaknesses',    label: 'Weaknesses',    css: 'weaknesses' },
      { key: 'opportunities', label: 'Opportunities', css: 'opportunities' },
      { key: 'threats',       label: 'Threats',       css: 'threats' }
    ];
    var points = (content && content.swotPoints) || (plan && plan.swot_data) || null;
    if (!points || typeof points !== 'object') {
      return '<h2 class="sp-review-section-title">SWOT Analysis</h2>' +
        '<div class="sp-review-empty">SWOT points unavailable for this draft.</div>';
    }
    var html = '<h2 class="sp-review-section-title">SWOT Analysis</h2>' +
      '<div class="sp-review-swot-grid">';
    quadrants.forEach(function(q) {
      var items = Array.isArray(points[q.key]) ? points[q.key] : [];
      html += '<div class="sp-review-swot-card sp-review-swot-' + q.css + '">' +
        '<div class="sp-review-swot-card-title">' + q.label + '</div>';
      if (items.length === 0) {
        html += '<div class="sp-review-swot-empty">No points generated.</div>';
      } else {
        html += '<ul class="sp-review-swot-list">';
        items.forEach(function(p) {
          html += '<li>' + escHtml(String(p).trim()) + '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  },

  bindReviewHeaderEvents: function() {
    var self = this;
    var nameInput = document.getElementById('sp-review-plan-name');
    if (nameInput && !nameInput.dataset.bound) {
      nameInput.dataset.bound = '1';
      nameInput.addEventListener('blur', function() {
        var name = nameInput.value.trim();
        if (!name || !self._pendingPlanId || !self._supabase || !self._userId) return;
        if (self._pendingPlanRow && self._pendingPlanRow.plan_name === name) return;
        self._supabase
          .from('strategic_plans')
          .update({ plan_name: name, updated_at: new Date().toISOString() })
          .eq('id', self._pendingPlanId)
          .eq('user_id', self._userId)
          .then(function(res) {
            if (res.error) console.error('[SP Review] rename error:', res.error.message);
            else if (self._pendingPlanRow) self._pendingPlanRow.plan_name = name;
          });
      });
    }
    // Discard / Approve handlers land in the next commit alongside
    // the confirmation modals.
  }

});
