import { createClient } from "@supabase/supabase-js";
import { logPredisUsage } from "../lib/usage-logger.js";
import { requireBpComplete } from "../lib/bp-gate.js";

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
  if (!(await requireBpComplete(supabase, user.id, res))) return;

  const { prompt, media_type, template_id } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const predisApiKey = process.env.PREDIS_API_KEY;
  if (!predisApiKey) {
    return res.status(503).json({ error: "AI graphics service is not yet configured. Please check back soon." });
  }

  try {
    const { data: settings, error: settingsError } = await supabase
      .from("social_settings")
      .select("predis_brand_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('[predis-generate] query error:', settingsError.message);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }

    const brandId = settings?.predis_brand_id || null;

    const predisRes = await fetch("https://brain.predis.ai/predis/generate_content", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + predisApiKey
      },
      body: JSON.stringify({
        brand_id: brandId,
        text: prompt,
        media_type: media_type || "single_image",
        template_id: template_id || null
      })
    });

    if (!predisRes.ok) {
      const errData = await predisRes.json().catch(function() { return {}; });
      console.error("[predis-generate] Predis API error:", errData);
      return res.status(502).json({ error: "Graphics generation failed. Please try again." });
    }

    const data = await predisRes.json();
    await logPredisUsage({ tool_id: 'social', user_id: user.id, subtype: 'generate' });
    return res.status(200).json({
      generation_id: data.generation_id || data.id,
      status: data.status || "processing",
      preview_url: data.preview_url || null
    });
  } catch (err) {
    console.error("[predis-generate] Error:", err);
    return res.status(500).json({ error: "Failed to generate graphic. Please try again." });
  }
}
