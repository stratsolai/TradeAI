import { createClient } from "@supabase/supabase-js";

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

  const predisApiKey = process.env.PREDIS_API_KEY;
  if (!predisApiKey) {
    return res.status(503).json({ error: "AI graphics service is not yet configured. Please check back soon." });
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_name, website, logo_url, primary_brand_colour, secondary_brand_colour, tone_of_voice")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[predis-brand] query error:', profileError.message);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }

    if (!profile) {
      return res.status(400).json({ error: "Business profile not found. Please set up your Business Profile first." });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("social_settings")
      .select("predis_brand_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('[predis-brand] query error:', settingsError.message);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }

    const brandPayload = {
      name: profile.business_name || "My Business",
      logo_url: profile.logo_url || null,
      colors: [profile.primary_brand_colour, profile.secondary_brand_colour].filter(Boolean),
      website: profile.website || null,
      tone: profile.tone_of_voice || "friendly"
    };

    let predisRes;
    if (settings?.predis_brand_id) {
      predisRes = await fetch("https://brain.predis.ai/predis/update_brand", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + predisApiKey
        },
        body: JSON.stringify({
          brand_id: settings.predis_brand_id,
          ...brandPayload
        })
      });
    } else {
      predisRes = await fetch("https://brain.predis.ai/predis/create_brand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + predisApiKey
        },
        body: JSON.stringify(brandPayload)
      });
    }

    if (!predisRes.ok) {
      const errData = await predisRes.json().catch(function() { return {}; });
      console.error("[predis-brand] Predis API error:", errData);
      return res.status(502).json({ error: "Could not sync brand settings. Please try again." });
    }

    const data = await predisRes.json();
    const brandId = data.brand_id || data.id || settings?.predis_brand_id;

    if (brandId) {
      const { error: upsertError } = await supabase
        .from("social_settings")
        .upsert({
          user_id: user.id,
          predis_brand_id: brandId,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      if (upsertError) {
        console.error('[predis-brand] upsert error:', upsertError.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
    }

    return res.status(200).json({
      success: true,
      brand_id: brandId
    });
  } catch (err) {
    console.error("[predis-brand] Error:", err);
    return res.status(500).json({ error: "Failed to sync brand. Please try again." });
  }
}
