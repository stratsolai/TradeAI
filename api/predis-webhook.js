import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { generation_id, status, output_url, caption, error: genError } = req.body;
  if (!generation_id) {
    return res.status(400).json({ error: "generation_id required" });
  }

  try {
    if (status === "completed" && output_url) {
      const { error: updateError } = await supabase
        .from("social_posts")
        .update({
          image_url: output_url,
          updated_at: new Date().toISOString()
        })
        .eq("predis_generation_id", generation_id);

      if (updateError) {
        console.error('[predis-webhook] query error:', updateError.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }

      console.log("[predis-webhook] Generation complete:", generation_id);
    } else if (status === "failed") {
      console.error("[predis-webhook] Generation failed:", generation_id, genError);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[predis-webhook] Error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
