/**
 * shared-utils.js
 * Shared utility functions loaded by all authenticated pages.
 * Do not duplicate these functions in individual logic files.
 */

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

/* ── Global Session Expiry Handler (Task 30) ──
   Listens for Supabase SIGNED_OUT events and redirects to login.
   Covers session expiry, token refresh failure, and manual sign-out.
   Safe alongside the existing sign-out redirect in topbar.js —
   both target /login so the first redirect wins. */
(function() {
  var sb = window.supabaseClient;
  if (!sb) return;
  sb.auth.onAuthStateChange(function(event) {
    if (event === 'SIGNED_OUT') {
      window.location.href = '/login';
    }
  });
})();
