import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // JWT auth
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { social_post_id, scheduled_for, platforms } = req.body;

  if (!social_post_id || !scheduled_for || !platforms || !platforms.length) {
    return res.status(400).json({ error: 'social_post_id, scheduled_for, and platforms are required' });
  }

  // Verify the social_post belongs to this user
  const { data: socialPost, error: postError } = await supabase
    .from('social_posts')
    .select('id, status')
    .eq('id', social_post_id)
    .eq('user_id', user.id)
    .single();

  if (postError || !socialPost) {
    return res.status(404).json({ error: 'Social post not found' });
  }

  // Insert scheduled post record
  const { data: scheduled, error: scheduleError } = await supabase
    .from('scheduled_posts')
    .insert({
      user_id: user.id,
      social_post_id,
      scheduled_for,
      platforms,
      status: 'pending'
    })
    .select()
    .single();

  if (scheduleError) {
    console.error('schedule-social-posts insert error:', scheduleError);
    return res.status(500).json({ error: 'Failed to schedule post. Please try again.' });
  }

  // Update social_posts status to scheduled
  const { error: updateError } = await supabase
    .from('social_posts')
    .update({ status: 'scheduled' })
    .eq('id', social_post_id)
    .eq('user_id', user.id);

  if (updateError) {
    console.error('schedule-social-posts update error:', updateError);
    // Non-fatal — scheduled record was created, log and continue
  }

  return res.status(200).json({ scheduled });
}
