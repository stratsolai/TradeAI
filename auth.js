// Authentication Functions

// Check if user is logged in
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

// Sign up new user
async function signUp(email, password, businessName, phone, industry) {
  try {
    // Read industries from sessionStorage as fallback
    var industryArr = Array.isArray(industry) ? industry : (industry ? [industry] : []);
    if (industryArr.length === 0) {
      var stored = sessionStorage.getItem('signup_industries');
      if (stored) {
        try { industryArr = JSON.parse(stored); } catch(e) {}
      }
    }

    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: window.location.origin + '/login'
      }
    });

    if (authError) throw authError;

    if (authData.user) {
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .update({
          business_name: businessName,
          phone: phone,
          industry: industryArr
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;
    }

    // Clear signup sessionStorage after successful signup
    sessionStorage.removeItem('signup_industries');

    return { success: true, data: authData };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sign in existing user
async function signIn(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sign out
async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    window.location.href = '/';
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get current user profile
async function getUserProfile() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) return null;

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    return { ...user, ...profile };
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
}

// Protect pages - redirect to login if not authenticated
async function requireAuth() {
  const session = await checkAuth();
  if (!session) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

// Resolve account owner and security level for multi-user access.
// Sets window.accountOwnerId and window.userSecurityLevel.
// Must run after supabaseClient is available and user is authenticated.
async function resolveAccountOwner(userId) {
  window.accountOwnerId = userId;
  window.userSecurityLevel = 1;
  try {
    var result = await window.supabaseClient
      .from('team_members')
      .select('account_owner_id, security_level')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (result.data) {
      window.accountOwnerId = result.data.account_owner_id;
      window.userSecurityLevel = result.data.security_level;
    }
  } catch (e) {
    console.error('[auth] resolveAccountOwner error:', e);
  }
}
window.resolveAccountOwner = resolveAccountOwner;
