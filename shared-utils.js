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
