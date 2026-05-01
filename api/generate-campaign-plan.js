import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logAnthropicUsage } from "../lib/usage-logger.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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

  const { action, inputs, marketing_plan, campaign_id } = req.body;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[generate-campaign-plan] query error:', profileError.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  const bp = profile || {};
  const businessName = bp.business_name || "the business";
  const industry = bp.industry || "business";
  const location = bp.location || "Australia";
  const tone = bp.tone_of_voice || inputs?.tone || "friendly";

  try {
    if (action === "generate-posts") {
      return await generatePosts(req, res, user, bp, marketing_plan, inputs, campaign_id);
    }
    return await generatePlan(req, res, user, bp, inputs);
  } catch (err) {
    console.error("[generate-campaign-plan] Error:", err);
    return res.status(500).json({ error: "Failed to generate. Please try again." });
  }
}

async function generatePlan(req, res, user, bp, inputs) {
  const businessName = bp.business_name || "the business";
  const industry = bp.industry || "business";
  const tone = bp.tone_of_voice || "friendly";

  let context = `Business: ${businessName}\nIndustry: ${industry}`;
  if (bp.marketing_theme_differentiators) context += `\nDifferentiators: ${bp.marketing_theme_differentiators}`;
  if (bp.marketing_theme_awareness) context += `\nKey messages: ${bp.marketing_theme_awareness}`;
  if (bp.bp_services) {
    const services = Array.isArray(bp.bp_services) ? bp.bp_services.map(s => s.name || s).join(", ") : "";
    if (services) context += `\nServices: ${services}`;
  }

  const prompt = `You are a marketing strategist creating a social media marketing plan for an Australian SME business.

${context}

Campaign inputs from the business owner:
- Goal: ${inputs.goal || "general promotion"}
${inputs.goal_detail ? "- Goal detail: " + inputs.goal_detail : ""}
- Focus: ${inputs.focus || "general business"}
${inputs.target_customer ? "- Target customer: " + inputs.target_customer : ""}
- Timeframe: ${inputs.timeframe || "8 weeks"}
- Upcoming events/offers: ${(inputs.upcoming || []).join(", ") || "none"}
${inputs.upcoming_detail ? "- Upcoming details: " + inputs.upcoming_detail : ""}
- Content available: ${inputs.content_source || "mix of all"}
- Posting frequency: ${inputs.frequency || "3x per week"}
${inputs.preferred_days ? "- Preferred days: " + inputs.preferred_days.join(", ") : ""}
- Platforms: ${(inputs.connections || []).join(", ") || "facebook, instagram"}

Create a complete marketing plan including:
1. Goal and focus summary (2-3 sentences)
2. Timeframe and posting cadence
3. Content mix - recommend which post types to use and how many:
   - Finished Job Posts (showcase completed work)
   - Customer Stories/Testimonials
   - Behind the Scenes
   - Product/Service Launches
   - Event Promotions
   - Offers/Promotions
   - Industry Insights
   - Tips & Advice
   - Blog Content
   - Business Updates
4. Week-by-week schedule showing what type of post goes on which day
5. Any special inclusions (offers, events, milestones) slotted into the right weeks

Format the plan as clear, readable text with sections. Use Australian English. No exclamation marks.
The plan should feel achievable and practical for a busy business owner.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }]
  });
  logAnthropicUsage({ tool_id: 'social', user_id: user.id, model: 'claude-sonnet-4-6', usage: message.usage });

  const plan = message.content[0].text;
  return res.status(200).json({ plan });
}

async function generatePosts(req, res, user, bp, planText, inputs, campaignId) {
  const businessName = bp.business_name || "the business";
  const industry = bp.industry || "business";
  const tone = bp.tone_of_voice || inputs?.tone || "friendly";

  const toneMap = {
    professional: "professional and authoritative",
    friendly: "warm and approachable",
    casual: "casual and conversational",
    bold: "bold and confident",
    helpful: "supportive and educational"
  };

  const prompt = `You are generating social media posts for ${businessName}, a ${industry} business in Australia.
Tone: ${toneMap[tone] || toneMap.friendly}

Here is the approved marketing plan:
${planText}

Generate all the social media posts specified in the plan. For each post, provide:
1. journey_type (one of: finished_job, customer_story, behind_scenes, product_launch, event_promo, offer_promo, industry_insight, tips_advice, blog_content, business_update)
2. caption (the post text, under 280 characters for social posts)
3. hashtags (relevant hashtags)
4. suggested_date (YYYY-MM-DD format, starting from tomorrow and following the weekly schedule)

Respond ONLY with a JSON array of objects:
[{"journey_type": "...", "caption": "...", "hashtags": "...", "suggested_date": "YYYY-MM-DD"}, ...]

No exclamation marks in captions. Australian English throughout.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }]
  });
  logAnthropicUsage({ tool_id: 'social', user_id: user.id, model: 'claude-sonnet-4-6', usage: message.usage });

  const raw = message.content[0].text;
  let posts = [];
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    posts = JSON.parse(clean);
  } catch (e) {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      posts = JSON.parse(match[0]);
    }
  }

  if (!Array.isArray(posts)) posts = [];

  return res.status(200).json({ posts });
}
