// Wait for Supabase to load, then initialize
(function() {
  // Your Supabase credentials
  const SUPABASE_URL = 'https://yzojtzghzbpqsfujxrxl.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6b2p0emdoemJwcXNmdWp4cnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODQ0ODksImV4cCI6MjA5MDE2MDQ4OX0.rmgiZFvV1jKScXQFAz3vVDMQyO0e0svK3kzxc_PNmrI';

  // Wait for Supabase library to load
  var _retries = 0;
  function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
      try {
        // detectSessionInUrl: false — our signup-confirmation flow
        // calls supabase.auth.verifyOtp() explicitly in login.html
        // (the page that receives ?token_hash=...&type=signup links).
        // Leaving the default `true` causes the supabase-js client to
        // ALSO auto-process the URL on every page init, doubling the
        // verify calls. The first one consumes the single-use token,
        // the second returns otp_expired. Disabling auto-detection
        // makes the explicit verifyOtp call the single source of
        // truth. OAuth and password flows are unaffected — those use
        // exchangeCodeForSession / signInWithPassword, not URL detect.
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { detectSessionInUrl: false }
        });
      } catch (e) {
        console.error('Supabase createClient failed:', e);
      }
    } else if (_retries < 50) {
      _retries++;
      setTimeout(initSupabase, 100);
    } else {
      console.error('Supabase SDK failed to load after 5 seconds');
    }
  }

  // Start initialization
  initSupabase();
})();
