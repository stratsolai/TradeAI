import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('tool_prices')
      .select('price_id, display_price');

    if (error) {
      console.error('[get-prices] supabase error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const prices = {};
    (data || []).forEach(function(row) {
      if (row && row.price_id) {
        prices[row.price_id] = row.display_price;
      }
    });

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ prices: prices });
  } catch (err) {
    console.error('[get-prices] error:', err && err.message);
    return res.status(500).json({ error: 'Could not fetch prices' });
  }
}
