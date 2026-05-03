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
