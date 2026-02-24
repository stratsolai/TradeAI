// Supabase Client Configuration
// Replace these with YOUR actual Supabase credentials
const SUPABASE_URL = 'https://ogdeckglmqyleahwfuqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZGVja2dsbXF5bGVhaHdmdXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjE0NzksImV4cCI6MjA4NzUzNzQ3OX0.-Qvuw_5ZcEFkG2c6YrVwd_fbhm1OjO-wABceCq74M68';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other files
window.supabaseClient = supabase;
