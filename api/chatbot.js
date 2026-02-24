// Serverless function to call Claude API
// This runs on Vercel's server, keeping your API key hidden

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the message from the request
  const { message, conversationHistory } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          ...(conversationHistory || []),
          {
            role: 'user',
            content: message
          }
        ],
        system: `You are a helpful AI assistant for a trades business. Your job is to:
1. Greet website visitors warmly
2. Ask qualifying questions: budget, timeline, location, project type
3. Capture their contact details (name, email, phone)
4. Offer to book a consultation
5. Be friendly, professional, and helpful

Keep responses concise (2-3 sentences max). Ask one quest
