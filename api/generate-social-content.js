import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

  const { input_type, category, tone, job_description, location, offer_what, offer_price, offer_valid_until, offer_detail, topic, extra_context } = req.body;

  if (!input_type) {
    return res.status(400).json({ error: 'input_type is required' });
  }

  // Load user profile for industry
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('industry, business_name, location')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return res.status(400).json({ error: 'User profile not found' });
  }

  const industry = profile.industry || 'business';
  const businessName = profile.business_name || 'your business';
  const businessLocation = profile.location || location || '';
  const toneLabel = tone || 'Friendly';

  // Build prompt dynamically based on input_type
  let promptContent = '';

  if (input_type === 'job') {
    promptContent = `You are creating a social media post for a ${industry} business called ${businessName}${businessLocation ? ' based in ' + businessLocation : ''}.

Post type: Completed job or project showcase
Category: ${category || 'completed-job'}
Tone: ${toneLabel}
Job description: ${job_description || ''}
${location ? 'Location: ' + location : ''}

Write a single engaging social media post (2-4 sentences, max 280 characters for the main text). 
- Highlight the work completed and the outcome for the customer
- Tone must be ${toneLabel.toLowerCase()}
- Use Australian English spelling
- Do not use exclamation marks
- Do not mention specific dollar amounts unless provided
- End with 3-5 relevant hashtags on a new line
- Do not include the business name unless it flows naturally`;

  } else if (input_type === 'offer') {
    promptContent = `You are creating a social media post for a ${industry} business called ${businessName}${businessLocation ? ' based in ' + businessLocation : ''}.

Post type: Offer or promotion
Category: ${category || 'seasonal-offer'}
Tone: ${toneLabel}
What is the offer: ${offer_what || ''}
${offer_price ? 'Price or value: ' + offer_price : ''}
${offer_valid_until ? 'Valid until: ' + offer_valid_until : ''}
${offer_detail ? 'Extra detail: ' + offer_detail : ''}

Write a single engaging social media post (2-4 sentences, max 280 characters for the main text).
- Clearly communicate the offer and its value
- Tone must be ${toneLabel.toLowerCase()}
- Use Australian English spelling
- Do not use exclamation marks
- Create a sense of opportunity without being pushy
- End with 3-5 relevant hashtags on a new line`;

  } else if (input_type === 'tips') {
    promptContent = `You are creating a social media post for a ${industry} business called ${businessName}${businessLocation ? ' based in ' + businessLocation : ''}.

Post type: News or tips
Category: ${category || 'tips-advice'}
Tone: ${toneLabel}
Topic: ${topic || ''}
${extra_context ? 'Extra context: ' + extra_context : ''}

Write a single engaging social media post (2-4 sentences, max 280 characters for the main text).
- Share a genuinely useful tip or insight relevant to the topic and the ${industry} industry
- Tone must be ${toneLabel.toLowerCase()}
- Use Australian English spelling
- Do not use exclamation marks
- Position the business as knowledgeable and helpful
- End with 3-5 relevant hashtags on a new line`;

  } else {
    return res.status(400).json({ error: 'Invalid input_type. Must be job, offer, or tips.' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: promptContent }]
    });

    const generatedText = message.content[0].text.trim();

    return res.status(200).json({ content: generatedText });

  } catch (err) {
    console.error('generate-social-content error:', err);
    return res.status(500).json({ error: 'Content generation failed. Please try again.' });
  }
}
