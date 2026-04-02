// Wait for Supabase to load, then initialize
(function() {
  // Your Supabase credentials
  const SUPABASE_URL = 'https://yzojtzghzbpqsfujxrxl.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6b2p0emdoemJwcXNmdWp4cnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODQ0ODksImV4cCI6MjA5MDE2MDQ4OX0.rmgiZFvV1jKScXQFAz3vVDMQyO0e0svK3kzxc_PNmrI';

  // Wait for Supabase library to load
  function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
      // Initialize Supabase client
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      console.log('Supabase initialized!');
    } else {
      // If not loaded yet, wait and try again
      setTimeout(initSupabase, 100);
    }
  }

  // Start initialization
  initSupabase();
})();
