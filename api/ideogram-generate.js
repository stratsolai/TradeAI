// api/ideogram-generate.js — generates an image via the Ideogram API.
//
// Auth: JWT Bearer token required + BP completion gate. The previous
// implementation had no auth at all (CORS-open, userId-from-body) which
// let any caller pass any userId. Tightened to the platform pattern in
// the Industry Taxonomy v2.0 follow-up.

import { createClient } from '@supabase/supabase-js';
import { logIdeogramUsage } from '../lib/usage-logger.js';
import { requireBpComplete } from '../lib/bp-gate.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://staxai.com.au');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  const token = authHeader.split(' ')[1];

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  if (!(await requireBpComplete(supabase, user.id, res))) return;
  const userId = user.id;

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const response = await fetch('https://api.ideogram.ai/generate', {
      method: 'POST',
      headers: {
        'Api-Key': process.env.IDEOGRAM_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_request: {
          prompt: prompt,
          aspect_ratio: 'ASPECT_1_1',
          model: 'V_2',
          magic_prompt_option: 'OFF'
        }
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });
    await logIdeogramUsage({ tool_id: 'social', user_id: userId });
    const url = data?.data?.[0]?.url;
    return res.status(200).json({ url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
