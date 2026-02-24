// Authentication Functions

// Check if user is logged in
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

// Sign up new user
async function signUp(email, password, businessName, phone, industry) {
  try {
    // Create auth user
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email: email,
      password: password
    });

    if (authError) throw authError;

    // Update profile with business info
    if (authData.user) {
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .update({
          business_name: businessName,
          phone: phone,
          industry: industry
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;
    }

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
    window.location.href = '/login.html';
    return false;
  }
  return true;
}
