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
