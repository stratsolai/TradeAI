// Wait for Supabase to load, then initialize
(function() {
  // Your Supabase credentials
  const SUPABASE_URL = 'https://ogdeckglmqyleahwfuqs.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZGVja2dsbXF5bGVhaHdmdXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjE0NzksImV4cCI6MjA4NzUzNzQ3OX0.-Qvuw_5ZcEFkG2c6YrVwd_fbhm1OjO-wABceCq74M68';

  // Wait for Supabase library to load
  function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
      // Initialize Supabase client
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('Supabase initialized!');
    } else {
      // If not loaded yet, wait and try again
      setTimeout(initSupabase, 100);
    }
  }

  // Start initialization
  initSupabase();
})();
