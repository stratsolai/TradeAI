import { createClient } from "@supabase/supabase-js";
import { logAnthropicUsage } from "../lib/usage-logger.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("[generate-marketing-theme] ANTHROPIC_API_KEY not configured");
    return res.status(500).json({ error: "API key not configured. Please contact support." });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorised" });
  }
  const token = authHeader.split(" ")[1];

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const { answers } = req.body;
  if (!answers) {
    return res.status(400).json({ error: "answers required" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("business_name, industry, years_in_business, licences, bp_services")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[generate-marketing-theme] query error:", profileError.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }

  const businessName = profile?.business_name || "the business";
  const industry = Array.isArray(profile?.industry) ? profile.industry.join(", ") : (profile?.industry || "business");

  const standout = (answers.standout || []).join(", ");
  const standoutOther = answers.standout_other || "";
  const qualityDetail = (answers.quality_detail || []).join(", ");
  const serviceDetail = (answers.service_detail || []).join(", ");
  const affordableDetail = (answers.affordable_detail || []).join(", ");

  // BP UX Improvements Spec v1.0 §5.2.1 — these used to come from the
  // wizard but now read directly from the BP panels. We only inject them
  // into the prompt when the relevant standout pill is selected so the
  // AI gets the same hint it had before.
  const standoutPicked = answers.standout || [];
  const profileLicences = Array.isArray(profile?.licences) ? profile.licences : [];
  const profileServices = Array.isArray(profile?.bp_services)
    ? profile.bp_services.map((s) => (s && s.name ? s.name : "")).filter(Boolean)
    : [];
  const experienceYears = standoutPicked.indexOf("More experienced or qualified") !== -1 && profile?.years_in_business
    ? String(profile.years_in_business)
    : "";
  const certifications = standoutPicked.indexOf("More experienced or qualified") !== -1
    ? profileLicences.join(", ")
    : "";
  const specialiseServices = standoutPicked.indexOf("We specialise in certain areas") !== -1
    ? profileServices.join(", ")
    : "";

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
${qualityDetail ? "Quality details: " + qualityDetail : ""}
${serviceDetail ? "Service details: " + serviceDetail : ""}
${affordableDetail ? "Affordability details: " + affordableDetail : ""}
${experienceYears ? "Years in business: " + experienceYears : ""}
${certifications ? "Certifications: " + certifications : ""}
${specialiseServices ? "Specialises in: " + specialiseServices : ""}

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[generate-marketing-theme] Anthropic API error:", response.status, errBody);
      return res.status(500).json({ error: "AI generation failed (status " + response.status + "). Please try again." });
    }

    const message = await response.json();
    logAnthropicUsage({ tool_id: 'social', user_id: user.id, model: 'claude-sonnet-4-6', usage: message.usage });
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
    console.error("[generate-marketing-theme] Error:", err.message || err);
    return res.status(500).json({ error: "Failed to generate marketing theme: " + (err.message || "unknown error") });
  }
}
