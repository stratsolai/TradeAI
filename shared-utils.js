/**
 * shared-utils.js
 * Shared utility functions loaded by all authenticated pages.
 * Do not duplicate these functions in individual logic files.
 */

function escHtml(s) {
  if (s === null || s === undefined) return '';
  var str = (typeof s === 'string') ? s : String(s);
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
window.escHtml = escHtml;

/**
 * formatPhoneNumber(value)
 * Formats an Australian phone number as the user types.
 * Strips non-digits (except leading +), then applies the appropriate mask.
 */
function formatPhoneNumber(value) {
  if (!value) return '';
  if (value.charAt(0) === '+') return value;
  var d = value.replace(/\D/g, '');
  if (!d) return '';
  if (/^0[45]/.test(d)) {
    if (d.length <= 4) return d;
    if (d.length <= 7) return d.substring(0, 4) + ' ' + d.substring(4);
    return d.substring(0, 4) + ' ' + d.substring(4, 7) + ' ' + d.substring(7, 10);
  }
  if (/^0[2378]/.test(d)) {
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.substring(0, 2) + ') ' + d.substring(2);
    return '(' + d.substring(0, 2) + ') ' + d.substring(2, 6) + ' ' + d.substring(6, 10);
  }
  if (/^1[38]00/.test(d)) {
    if (d.length <= 4) return d;
    if (d.length <= 7) return d.substring(0, 4) + ' ' + d.substring(4);
    return d.substring(0, 4) + ' ' + d.substring(4, 7) + ' ' + d.substring(7, 10);
  }
  return value;
}
window.formatPhoneNumber = formatPhoneNumber;

/**
 * handleSave(btn, saveFn, msgEl)
 * Standard Save button behaviour used across all settings and profile pages.
 * btn: the Save button element
 * saveFn: async function that performs the save — throws an Error on failure
 * msgEl: the .save-msg modal element for error display (null to skip modal)
 */
window.handleSave = async function(btn, saveFn, msgEl) {
  if (!btn) return;
  var label = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;
  try {
    await saveFn();
    btn.textContent = 'Saved \u2713';
    setTimeout(function() { btn.textContent = label; btn.disabled = false; }, 2000);
  } catch (err) {
    console.error('[handleSave] Error:', err.message || err);
    btn.textContent = label;
    btn.disabled = false;
    if (msgEl) {
      var textEl = msgEl.querySelector('.save-msg-text');
      if (textEl) textEl.textContent = err.message || 'Could not save. Please try again.';
      msgEl.classList.add('open');
      var okBtn = msgEl.querySelector('.save-msg-ok');
      if (okBtn) okBtn.addEventListener('click', function() { msgEl.classList.remove('open'); }, { once: true });
      msgEl.addEventListener('click', function(e) { if (e.target === msgEl) msgEl.classList.remove('open'); }, { once: true });
    }
  }
};

/**
 * loadStats()
 * Refreshes the stat tiles on pages that have them (e.g. content-library).
 * Safe to call on any page — silently exits if stat elements are absent.
 */
window.loadStats = async function() {
  try {
    var sb = window.supabaseClient;
    if (!sb) return;
    var authResp = await sb.auth.getUser();
    var user = authResp.data && authResp.data.user;
    if (!user) return;

    var libResult = await sb
      .from('content_library')
      .select('status', { count: 'exact' })
      .eq('user_id', user.id)
      .neq('source', 'tool');

    if (libResult.error) { console.error('[CL] loadStats query error:', libResult.error); return; }

    var items = libResult.data || [];
    var total = items.length;
    var pending = items.filter(function(i) { return i.status === 'pending'; }).length;
    var approved = items.filter(function(i) { return i.status === 'approved'; }).length;
    var rejected = items.filter(function(i) { return i.status === 'rejected'; }).length;
    var archived = items.filter(function(i) { return i.status === 'archived'; }).length;

    var el;
    el = document.getElementById('stat-total'); if (el) el.textContent = total;
    el = document.getElementById('stat-pending'); if (el) el.textContent = pending;
    el = document.getElementById('stat-approved'); if (el) el.textContent = approved;
    el = document.getElementById('stat-rejected'); if (el) el.textContent = rejected;
    el = document.getElementById('stat-archived'); if (el) el.textContent = archived;
  } catch (e) {
    console.error('[CL] loadStats error:', e.message);
  }
};

/**
 * showModalError(msg, modalId)
 * Displays an error message in the platform-standard .save-msg modal.
 * modalId: optional — defaults to first .save-msg on the page.
 */
window.showModalError = function(msg, modalId) {
  var modal = modalId ? document.getElementById(modalId) : document.querySelector('.save-msg');
  if (!modal) return;
  var textEl = modal.querySelector('.save-msg-text');
  if (textEl) textEl.textContent = msg;
  modal.classList.add('open');
  var okBtn = modal.querySelector('.save-msg-ok');
  if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
};

/**
 * showModalSuccess(msg, modalId)
 * Displays a success message in the platform-standard .save-msg modal.
 * modalId: optional — defaults to first .save-msg on the page.
 */
window.showModalSuccess = function(msg, modalId) {
  window.showModalError(msg, modalId);
};

/**
 * checkToolAccess(toolId, supabase, user)
 * Gates a tool page based on profile state. Resolves the owner's profile
 * (handles team members), then applies the access rules from spec 7.2:
 *   - Trial active and not expired       → allow
 *   - Subscribed and toolId in activated → allow
 *   - Otherwise                          → redirect to /dashboard.html?expired=1&tool=X
 *
 * Returns true if access is allowed. On denial, redirects and returns false.
 * Tool init() should `if (!await window.checkToolAccess(...)) return;` at the top.
 */
window.checkToolAccess = async function(toolId, supabase, user) {
  // Reveals the page-wrap shell only on the success path so the user
  // never sees a flash of the tool page before being redirected. The
  // tool HTML keeps page-wrap hidden via inline style="display:none".
  function reveal() {
    var pw = document.getElementById('page-wrap');
    if (pw) pw.style.display = 'block';
  }

  if (!toolId || !supabase || !user || !user.id) return false;
  try {
    // Team-member resolution: profiles row with trial state and
    // activated_tools lives on the account owner, not the team member.
    var ownerId = user.id;
    var team = await supabase
      .from('team_members')
      .select('account_owner_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (team.data && team.data.account_owner_id) ownerId = team.data.account_owner_id;

    var pr = await supabase
      .from('profiles')
      .select('is_trial, trial_expires_at, activated_tools')
      .eq('id', ownerId)
      .single();
    if (pr.error || !pr.data) {
      window.location.href = '/dashboard.html?expired=1&tool=' + encodeURIComponent(toolId);
      return false;
    }

    var p = pr.data;
    var now = Date.now();
    if (p.is_trial && p.trial_expires_at && new Date(p.trial_expires_at).getTime() > now) {
      reveal();
      return true;
    }
    if (!p.is_trial) {
      var owned = Array.isArray(p.activated_tools) ? p.activated_tools : [];
      if (owned.indexOf(toolId) !== -1) { reveal(); return true; }
    }
    window.location.href = '/dashboard.html?expired=1&tool=' + encodeURIComponent(toolId);
    return false;
  } catch (e) {
    console.error('[checkToolAccess]', e && e.message);
    window.location.href = '/dashboard.html?expired=1&tool=' + encodeURIComponent(toolId);
    return false;
  }
};

/**
 * loadScriptAsync(url)
 * Promise-based script loader. Resolves once the <script> tag has loaded;
 * rejects on network/parse failure. Lets callers run multiple loads in
 * parallel via Promise.all() instead of nested callbacks.
 * Idempotent — repeat calls for the same URL reuse the same in-flight or
 * resolved Promise so a script never loads twice.
 */
(function() {
  var _cache = {};
  window.loadScriptAsync = function(url) {
    if (_cache[url]) return _cache[url];
    _cache[url] = new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') { resolve(); return; }
        existing.addEventListener('load', function() { resolve(); }, { once: true });
        existing.addEventListener('error', function() { reject(new Error('Failed to load ' + url)); }, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.addEventListener('load', function() { s.dataset.loaded = '1'; resolve(); });
      s.addEventListener('error', function() { reject(new Error('Failed to load ' + url)); });
      document.head.appendChild(s);
    });
    return _cache[url];
  };
})();

/* ── BP Incomplete 403 Handler (Industry Taxonomy v2.0 §11.6) ──
   Wraps window.fetch so every tool API response is inspected. When the
   server-side BP gate returns 403 { error: 'bp_incomplete', message: ... }
   the BP-incomplete modal opens with the spec §11.6.1 copy and a CTA that
   takes the user to the BP page. The original Response is always returned
   unchanged so callers' existing .then/.catch chains still work.

   Implementation: response.clone() is used for the bp_incomplete probe so
   the caller's downstream .json()/.text() consumption is not affected by
   the body being read here. The wrap is idempotent — a marker flag stops
   double-wrapping if shared-utils.js loads twice.

   Modal markup is injected lazily on first 403 so tool pages don't carry
   the markup statically. Reuses .perm-modal-overlay / .perm-modal classes
   from staxai-auth.css (no new CSS classes per CLAUDE.md). */
(function() {
  if (typeof window === 'undefined' || !window.fetch) return;
  if (window.fetch._staxBpWrapped) return;

  function injectBpIncompleteModal(message) {
    var existing = document.getElementById('stax-bp-incomplete-modal');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'stax-bp-incomplete-modal';
      existing.className = 'perm-modal-overlay';
      existing.innerHTML =
        '<div class="perm-modal">' +
          '<div class="perm-modal-title">Complete your Business Profile</div>' +
          '<div class="perm-modal-body" id="stax-bp-incomplete-body">' +
            'Your tools need your Business Profile information to give you accurate, tailored outputs. Take a moment to complete it now — it only takes a few minutes.' +
          '</div>' +
          '<div class="perm-modal-actions">' +
            '<button type="button" class="perm-modal-continue" id="stax-bp-incomplete-cta">Complete Business Profile</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(existing);
      var cta = document.getElementById('stax-bp-incomplete-cta');
      if (cta) {
        cta.addEventListener('click', function() {
          try { sessionStorage.setItem('tab_state:/content-library.html', 'profile'); } catch (e) {}
          window.location.href = '/content-library.html#profile';
        });
      }
    }
    // Endpoint-supplied message override is informational only; the heading
    // and CTA stay fixed per spec §11.6.1. The default body copy is the
    // platform-standard one — only swap in the override when an endpoint
    // has supplied something more contextual.
    if (message && typeof message === 'string') {
      var body = document.getElementById('stax-bp-incomplete-body');
      if (body && message.trim() && message !== 'Complete your Business Profile to use this tool.') {
        body.textContent = message;
      }
    }
    existing.classList.add('open');
  }

  var originalFetch = window.fetch.bind(window);
  var wrappedFetch = function(input, init) {
    return originalFetch(input, init).then(function(response) {
      if (response && response.status === 403) {
        // Probe a clone so the caller can still .json() the original body.
        // Non-JSON 403s (e.g. network proxies) silently fall through.
        response.clone().json().then(function(data) {
          if (data && data.error === 'bp_incomplete') {
            injectBpIncompleteModal(data.message);
          }
        }).catch(function() { /* not a JSON body — ignore */ });
      }
      return response;
    });
  };
  wrappedFetch._staxBpWrapped = true;
  window.fetch = wrappedFetch;
})();

/* ── Global Session Expiry Handler (Task 30) ──
   Listens for Supabase SIGNED_OUT events and redirects to login.
   Covers session expiry, token refresh failure, and manual sign-out.
   Safe alongside the existing sign-out redirect in topbar.js —
   both target /login so the first redirect wins.
   Retries if supabaseClient is not yet initialised (CDN polling). */
(function() {
  function attach() {
    var sb = window.supabaseClient;
    if (!sb) { setTimeout(attach, 150); return; }
    sb.auth.onAuthStateChange(function(event) {
      if (event === 'SIGNED_OUT') {
        window.location.href = '/login';
      }
    });
  }
  attach();
})();
