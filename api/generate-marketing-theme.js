import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorised" });
  }
  const token = authHeader.split(" ")[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const { answers } = req.body;
  if (!answers) {
    return res.status(400).json({ error: "answers required" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("business_profiles")
    .select("business_name, industry")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[generate-marketing-theme] query error:', profileError.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  const businessName = profile?.business_name || "the business";
  const industry = profile?.industry || "business";

  const standout = (answers.standout || []).join(", ");
  const standoutOther = answers.standout_other || "";
  const awareness = (answers.awareness || []).join(", ");
  const awarenessOther = answers.awareness_other || "";
  const customerCount = answers.customer_count || "";
  const awards = answers.awards_text || "";
  const feeling = (answers.feeling || []).join(", ");
  const feelingOther = answers.feeling_other || "";

  const prompt = `You are writing a marketing theme summary for ${businessName}, a ${industry} business in Australia.

Based on the business owner's answers below, write three concise paragraphs:

1. DIFFERENTIATORS — What makes this business stand out (2-3 sentences)
Selected: ${standout}
${standoutOther ? "Other: " + standoutOther : ""}

2. AWARENESS — What customers should know (2-3 sentences)
Selected: ${awareness}
${awarenessOther ? "Other: " + awarenessOther : ""}
${customerCount ? "Customer count: " + customerCount : ""}
${awards ? "Awards: " + awards : ""}

3. FEELING — How customers should feel (1-2 sentences)
Selected: ${feeling}
${feelingOther ? "Other: " + feelingOther : ""}

Write naturally as if describing the business to a prospective customer. Do not use bullet points. Do not use exclamation marks. Australian English. Use "you" and "your" — never "we" or "our".

Respond with exactly three lines, labelled:
DIFFERENTIATORS: [text]
AWARENESS: [text]
FEELING: [text]`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    });

    const raw = message.content[0].text;
    const lines = raw.split("\n").filter(l => l.trim());
    let differentiators = "";
    let awareText = "";
    let feelText = "";

    lines.forEach(line => {
      if (line.startsWith("DIFFERENTIATORS:")) differentiators = line.replace("DIFFERENTIATORS:", "").trim();
      else if (line.startsWith("AWARENESS:")) awareText = line.replace("AWARENESS:", "").trim();
      else if (line.startsWith("FEELING:")) feelText = line.replace("FEELING:", "").trim();
    });

    if (!differentiators && lines.length >= 1) differentiators = lines[0];
    if (!awareText && lines.length >= 2) awareText = lines[1];
    if (!feelText && lines.length >= 3) feelText = lines[2];

    return res.status(200).json({
      differentiators,
      awareness: awareText,
      feeling: feelText
    });
  } catch (err) {
    console.error("[generate-marketing-theme] Error:", err);
    return res.status(500).json({ error: "Failed to generate marketing theme. Please try again." });
  }
}
