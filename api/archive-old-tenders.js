// Scheduled function — archives Tender & Proposal Documents older than 12 months
// Runs daily via Vercel cron (see vercel.json)

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const { data: oldTenders, error: fetchError } = await supabase
      .from('content_library')
      .select('id')
      .eq('status', 'approved')
      .eq('category', 'Tender & Proposal Documents')
      .lt('created_at', cutoff);

    if (fetchError) {
      console.error('archive-old-tenders fetch error:', fetchError.message);
      return res.status(500).json({ error: fetchError.message });
    }

    const ids = (oldTenders || []).map(function(r) { return r.id; });
    if (ids.length === 0) {
      return res.status(200).json({ success: true, archived: 0, message: 'No old tenders to archive' });
    }

    const { error: updateError } = await supabase
      .from('content_library')
      .update({ status: 'archived' })
      .in('id', ids);

    if (updateError) {
      console.error('archive-old-tenders update error:', updateError.message);
      return res.status(500).json({ error: updateError.message });
    }

    console.log('archive-old-tenders — archived', ids.length, 'items');
    return res.status(200).json({ success: true, archived: ids.length });
  } catch (err) {
    console.error('archive-old-tenders error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
