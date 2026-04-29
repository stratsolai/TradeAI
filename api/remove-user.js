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

    var { team_member_id } = req.body || {};
    if (!team_member_id) {
      return res.status(400).json({ error: 'team_member_id is required.' });
    }

    // Verify caller is account owner (not a team member themselves)
    var { data: memberCheck } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (memberCheck) {
      return res.status(403).json({ error: 'Only the account owner can remove team members.' });
    }

    // Get the team member row and verify it belongs to this account
    var { data: member, error: fetchErr } = await supabase
      .from('team_members')
      .select('id, user_id, status')
      .eq('id', team_member_id)
      .eq('account_owner_id', user.id)
      .maybeSingle();

    if (fetchErr || !member) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    // Delete the user from Supabase Auth if they have a user_id (accepted invite)
    if (member.user_id) {
      var { error: deleteErr } = await supabase.auth.admin.deleteUser(member.user_id);
      if (deleteErr) {
        console.error('[remove-user] deleteUser error:', deleteErr.message);
      }
    }

    // Update team_members row to revoked
    var { error: updateErr } = await supabase
      .from('team_members')
      .update({ status: 'revoked' })
      .eq('id', team_member_id)
      .eq('account_owner_id', user.id);

    if (updateErr) {
      console.error('[remove-user] Update error:', updateErr.message);
      return res.status(500).json({ error: 'Could not remove user. Please try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[remove-user] Error:', err.message || err);
    return res.status(500).json({ error: 'Could not remove user. Please try again.' });
  }
}
