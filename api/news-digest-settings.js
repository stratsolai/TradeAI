import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const token = (req.headers["authorization"] || "").replace("Bearer ", "").trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: "Bearer " + token } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const DEFAULT_CATEGORIES = [
    { id: "regulatory", label: "Regulatory", enabled: true, is_custom: false },
    { id: "industry-body", label: "Industry Body", enabled: true, is_custom: false },
    { id: "suppliers", label: "Suppliers", enabled: true, is_custom: false },
    { id: "workplace-safety", label: "Workplace & Safety", enabled: true, is_custom: false },
    { id: "economic-market", label: "Economic & Market", enabled: true, is_custom: false },
    { id: "technology", label: "Technology", enabled: true, is_custom: false }
  ];

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("news_digest_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code === "PGRST116") {
      const { data: inserted, error: insertError } = await supabase
        .from("news_digest_settings")
        .insert({ user_id: user.id, categories: DEFAULT_CATEGORIES })
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ error: "Failed to initialise settings" });
      }
      return res.status(200).json(inserted);
    }

    if (error) {
      return res.status(500).json({ error: "Failed to load settings" });
    }

    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const upsertData = { user_id: user.id, updated_at: new Date().toISOString() };
    if (Array.isArray(payload.categories)) upsertData.categories = payload.categories;
    if (payload.cadence === "daily" || payload.cadence === "weekly") upsertData.cadence = payload.cadence;
    if (Array.isArray(payload.source_preferences)) upsertData.source_preferences = payload.source_preferences;
    if (typeof payload.industry_override === "string" || payload.industry_override === null) upsertData.industry_override = payload.industry_override;
    if (typeof payload.location_override === "string" || payload.location_override === null) upsertData.location_override = payload.location_override;

    const { data, error } = await supabase
      .from("news_digest_settings")
      .upsert(upsertData, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: "Failed to save settings" });
    }

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}