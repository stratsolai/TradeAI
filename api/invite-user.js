import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    var { email, security_level } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (security_level !== 2 && security_level !== 3) {
      return res.status(400).json({ error: 'Access level must be Manager (2) or Staff (3).' });
    }

    // Verify caller is account owner (not a team member themselves)
    var { data: memberCheck } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (memberCheck) {
      return res.status(403).json({ error: 'Only the account owner can invite team members.' });
    }

    // Check fewer than 4 active/pending team members
    var { count, error: countErr } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('account_owner_id', user.id)
      .in('status', ['active', 'pending']);

    if (countErr) {
      console.error('[invite-user] Count error:', countErr.message);
      return res.status(500).json({ error: 'Could not check team size.' });
    }
    if (count >= 4) {
      return res.status(422).json({ error: 'Your account has reached the maximum of 5 users (you + 4 team members).' });
    }

    // Check email not already invited
    var { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('account_owner_id', user.id)
      .eq('email', email)
      .in('status', ['active', 'pending'])
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'This email has already been invited to your account.' });
    }

    // Send invite via Supabase Admin API
    var { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { account_owner_id: user.id, security_level: security_level }
    });

    if (inviteErr) {
      console.error('[invite-user] Invite error:', inviteErr.message);
      if (inviteErr.message && inviteErr.message.includes('already been registered')) {
        return res.status(409).json({ error: 'This email is already registered. They can be added directly.' });
      }
      return res.status(500).json({ error: 'Could not send invite email. Please try again.' });
    }

    // Insert team_members row
    var { error: insertErr } = await supabase
      .from('team_members')
      .insert({
        account_owner_id: user.id,
        email: email,
        security_level: security_level,
        status: 'pending'
      });

    if (insertErr) {
      console.error('[invite-user] Insert error:', insertErr.message);
      return res.status(500).json({ error: 'Invite email sent but could not save record. Please contact support.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[invite-user] Error:', err.message || err);
    return res.status(500).json({ error: 'Could not send invite. Please try again.' });
  }
}
