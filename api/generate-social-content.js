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

  // JWT auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorised" });
  }
  const token = authHeader.split(" ")[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  // Load user profile for industry
  const { data: profile } = await supabase
    .from("profiles")
    .select("industry, business_name, location")
    .eq("id", user.id)
    .single();

  const industry = profile?.industry || "trade";
  const businessName = profile?.business_name || "your business";
  const location = profile?.location || "Australia";

  const { input_type, category, tone, job_description, location: jobLocation, photo_url, offer_text, price_value, valid_until, extra_detail, topic, extra_context } = req.body;

  if (!input_type) {
    return res.status(400).json({ error: "input_type is required" });
  }

  const toneMap = {
    professional: "professional and authoritative",
    friendly: "warm and friendly",
    casual: "casual and conversational",
    bold: "bold and attention-grabbing"
  };
  const toneDesc = toneMap[tone] || toneMap.friendly;

  let promptContent = "";

  if (input_type === "job") {
    promptContent = `You are writing a social media post for ${businessName}, a ${industry} business based in ${location}.
Tone: ${toneDesc}
Category: ${category || "completed job"}
Job description: ${job_description || ""}
${jobLocation ? "Location: " + jobLocation : ""}
${photo_url ? "A photo has been included with this post." : ""}

Write a compelling social media post showcasing this completed work. Include relevant hashtags at the end. Keep it under 300 words. No exclamation marks. Australian English.`;
  } else if (input_type === "offer") {
    promptContent = `You are writing a social media post for ${businessName}, a ${industry} business based in ${location}.
Tone: ${toneDesc}
Category: ${category || "promotion"}
Offer: ${offer_text || ""}
${price_value ? "Price or value: " + price_value : ""}
${valid_until ? "Valid until: " + valid_until : ""}
${extra_detail ? "Extra detail: " + extra_detail : ""}

Write a compelling social media post promoting this offer. Include relevant hashtags at the end. Keep it under 300 words. No exclamation marks. Australian English.`;
  } else if (input_type === "news") {
    promptContent = `You are writing a social media post for ${businessName}, a ${industry} business based in ${location}.
Tone: ${toneDesc}
Category: ${category || "tips"}
Topic: ${topic || ""}
${extra_context ? "Extra context: " + extra_context : ""}

Write an engaging social media post about this topic relevant to the ${industry} industry. Include relevant hashtags at the end. Keep it under 300 words. No exclamation marks. Australian English.`;
  } else {
    return res.status(400).json({ error: "Invalid input_type. Must be job, offer, or news." });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: promptContent }]
    });

    const generatedContent = message.content[0].text;

    return res.status(200).json({ content: generatedContent });
  } catch (err) {
    console.error("generate-social-content error:", err);
    return res.status(500).json({ error: "Failed to generate content. Please try again." });
  }
}
