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

  const { journey_type, inputs, media_url, output_type } = req.body;
  if (!journey_type) {
    return res.status(400).json({ error: "journey_type is required" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[generate-social-content] query error:', profileError.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  const businessName = profile?.business_name || "your business";
  const industry = profile?.industry || "business";
  const location = profile?.location || "Australia";
  const tone = inputs?.tone || profile?.tone_of_voice || "friendly";
  const toneMap = {
    professional: "professional and authoritative",
    friendly: "warm and approachable",
    casual: "casual and conversational",
    bold: "bold and confident",
    helpful: "supportive and educational"
  };
  const toneDesc = toneMap[tone] || toneMap.friendly;

  const differentiators = profile?.marketing_theme_differentiators || "";
  const awareness = profile?.marketing_theme_awareness || "";
  const feeling = profile?.marketing_theme_feeling || "";
  const tagline = profile?.tagline || "";

  let contextBlock = `Business: ${businessName}
Industry: ${industry}
Location: ${location}
Tone: ${toneDesc}`;

  if (differentiators) contextBlock += `\nWhat makes them stand out: ${differentiators}`;
  if (awareness) contextBlock += `\nWhat customers should know: ${awareness}`;
  if (feeling) contextBlock += `\nHow customers should feel: ${feeling}`;
  if (tagline) contextBlock += `\nTagline: ${tagline}`;

  let prompt = "";

  try {
    if (journey_type === "finished_job") {
      prompt = buildFinishedJobPrompt(contextBlock, inputs, media_url);
    } else if (journey_type === "customer_story") {
      prompt = buildCustomerStoryPrompt(contextBlock, inputs);
    } else if (journey_type === "behind_scenes") {
      prompt = buildBehindScenesPrompt(contextBlock, inputs);
    } else if (journey_type === "product_launch") {
      prompt = buildProductLaunchPrompt(contextBlock, inputs, output_type);
    } else if (journey_type === "event_promo") {
      prompt = buildEventPromoPrompt(contextBlock, inputs, output_type);
    } else if (journey_type === "offer_promo") {
      prompt = buildOfferPromoPrompt(contextBlock, inputs, output_type);
    } else if (journey_type === "industry_insight") {
      prompt = buildIndustryInsightPrompt(contextBlock, inputs, output_type);
    } else if (journey_type === "tips_advice") {
      prompt = buildTipsAdvicePrompt(contextBlock, inputs, output_type);
    } else if (journey_type === "blog_content") {
      prompt = buildBlogContentPrompt(contextBlock, inputs);
    } else if (journey_type === "business_update") {
      prompt = buildBusinessUpdatePrompt(contextBlock, inputs, output_type);
    } else {
      return res.status(400).json({ error: "Invalid journey_type." });
    }

    const maxTokens = journey_type === "blog_content" ? 4096 : 1024;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }]
    });

    const raw = message.content[0].text;
    const { caption, hashtags } = parseResponse(raw);

    return res.status(200).json({
      caption: caption,
      hashtags: hashtags,
      image_url: media_url || null
    });
  } catch (err) {
    console.error("generate-social-content error:", err);
    return res.status(500).json({ error: "Failed to generate content. Please try again." });
  }
}

function parseResponse(text) {
  const hashtagMatch = text.match(/((?:#\w+\s*)+)$/);
  let caption = text;
  let hashtags = "";
  if (hashtagMatch) {
    hashtags = hashtagMatch[1].trim();
    caption = text.substring(0, text.length - hashtagMatch[0].length).trim();
  }
  return { caption, hashtags };
}

function buildFinishedJobPrompt(ctx, inputs, mediaUrl) {
  return `You are writing a social media post for a business.

${ctx}

Job description: ${inputs.description || ""}
${inputs.location ? "Location: " + inputs.location : ""}
${inputs.special ? "Special detail: " + inputs.special : ""}
${mediaUrl ? "A photo has been included with this post." : ""}

Write a compelling social media post showcasing this completed work. Include relevant hashtags at the end. Keep it under 280 characters for the caption (excluding hashtags). No exclamation marks. Australian English.`;
}

function buildCustomerStoryPrompt(ctx, inputs) {
  return `You are writing a social media post featuring a customer testimonial.

${ctx}

Customer first name: ${inputs.customer_name || "Anonymous"}
Service provided: ${inputs.service || ""}
Testimonial: ${inputs.testimonial || ""}

Write an engaging social media post featuring this customer story. Keep the customer's words central. Only use their first name. Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}

function buildBehindScenesPrompt(ctx, inputs) {
  return `You are writing a behind-the-scenes social media post.

${ctx}

Story type: ${inputs.story_type || "general"}
Who is shown: ${inputs.who || "the team"}
Description: ${inputs.description || ""}

Write an authentic, engaging behind-the-scenes social media post. Make it feel real and human. Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}

function buildProductLaunchPrompt(ctx, inputs, outputType) {
  const format = outputType === "blog_post" ? "a blog post (500-1000 words)" : "a social media post (under 280 characters excluding hashtags)";
  return `You are writing ${format} announcing a new product or service launch.

${ctx}

What is being launched: ${inputs.what || ""}
Target customer: ${inputs.who || ""}
Why now: ${inputs.why_now || ""}
${inputs.headline ? "Headline: " + inputs.headline : ""}

Write compelling content for this launch. Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}

function buildEventPromoPrompt(ctx, inputs, outputType) {
  const format = outputType === "flyer" ? "flyer copy" : "a social media post";
  return `You are writing ${format} promoting an event.

${ctx}

Event type: ${inputs.what || ""}
Date: ${inputs.event_date || ""} ${inputs.event_time || ""}
Location: ${inputs.event_location || ""}
Details: ${inputs.description || ""}
${inputs.headline ? "Headline: " + inputs.headline : ""}

Write engaging promotional content for this event. Format the date in a readable way (e.g. Saturday 15 June, 10am-2pm). Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}

function buildOfferPromoPrompt(ctx, inputs, outputType) {
  const format = outputType === "flyer" ? "flyer copy" : "a social media post";
  return `You are writing ${format} promoting a special offer.

${ctx}

Offer description: ${inputs.what || ""}
What is included: ${inputs.included || ""}
Start date: ${inputs.start_date || ""}
End date: ${inputs.end_date || ""}
${inputs.ongoing ? "This is an ongoing offer." : ""}
${inputs.headline ? "Headline: " + inputs.headline : ""}

Write compelling promotional content with urgency. Use the end date to create natural urgency (e.g. "Ends Sunday", "48 hours only"). Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}

function buildIndustryInsightPrompt(ctx, inputs, outputType) {
  const format = outputType === "blog_post" ? "a thought-leadership blog post (500-1000 words)" : "a social media post";
  return `You are writing ${format} sharing an industry insight.

${ctx}

Source: ${inputs.source_type || "manual"}
Key insight: ${inputs.insight || inputs.what || ""}
${inputs.headline ? "Headline: " + inputs.headline : ""}

Write engaging content that positions the business as an industry expert. Include the business owner's perspective. Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}

function buildTipsAdvicePrompt(ctx, inputs, outputType) {
  const format = outputType === "blog_post" ? "a helpful blog post (500-1000 words)" : "a social media post";
  return `You are writing ${format} sharing professional tips and advice.

${ctx}

Topic type: ${inputs.topic_type || ""}
Details: ${inputs.description || inputs.details || ""}
${inputs.headline ? "Headline: " + inputs.headline : ""}

Write helpful, practical content that demonstrates expertise. Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}

function buildBlogContentPrompt(ctx, inputs) {
  return `You are writing a blog post for a business website.

${ctx}

Topic: ${inputs.blog_topic || ""}
Working title: ${inputs.blog_title || ""}
Key points to cover: ${inputs.key_points || ""}
Target audience: ${inputs.audience || "customers"}
Source: ${inputs.source_type || "from scratch"}

Write a well-structured blog post of 500-1000 words. Include:
- An engaging introduction
- Clear sections with subheadings
- Practical, actionable content
- A conclusion with a call to action
- A suggested meta description (1-2 sentences) at the end, labelled "Meta description:"

No exclamation marks. Australian English.`;
}

function buildBusinessUpdatePrompt(ctx, inputs, outputType) {
  const format = outputType === "blog_post" ? "a blog post (500-1000 words)" : "a social media post";
  return `You are writing ${format} sharing a business update.

${ctx}

Update type: ${inputs.news_type || ""}
Details: ${inputs.description || inputs.details || ""}
${inputs.headline ? "Headline: " + inputs.headline : ""}

Write content that shares this news in a warm, celebratory way. Even for a professional tone, business announcements can be warmer. Include relevant hashtags at the end. No exclamation marks. Australian English.`;
}
