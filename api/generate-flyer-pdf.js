import { createClient } from "@supabase/supabase-js";

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

  const { flyer, business_name, primary_colour } = req.body;
  if (!flyer) {
    return res.status(400).json({ error: "flyer data required" });
  }

  try {
    const brandColour = primary_colour || "#4A6D8C";
    const headline = flyer.headline || "Your Business";
    const subheadline = flyer.subheadline || "";
    const body = (flyer.body || "").replace(/\n/g, "<br>");
    const cta = flyer.call_to_action || "";
    const finePrint = flyer.fine_print || "";
    const bName = business_name || "Your Business";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; width: 595px; min-height: 842px; background: #fff; }
  .flyer { padding: 48px 40px; min-height: 842px; display: flex; flex-direction: column; }
  .header { background: ${brandColour}; color: #fff; padding: 32px 40px; margin: -48px -40px 32px -40px; }
  .headline { font-size: 32px; font-weight: 700; line-height: 1.2; margin-bottom: 8px; }
  .subheadline { font-size: 16px; font-weight: 400; opacity: 0.9; }
  .body { font-size: 14px; line-height: 1.7; color: #333; flex: 1; margin-bottom: 24px; }
  .cta { background: ${brandColour}; color: #fff; padding: 16px 24px; border-radius: 6px; font-size: 16px; font-weight: 600; text-align: center; margin-bottom: 16px; }
  .fine-print { font-size: 10px; color: #999; text-align: center; }
  .footer { margin-top: auto; text-align: center; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #999; }
</style></head><body>
<div class="flyer">
  <div class="header">
    <div class="headline">${escapeHtml(headline)}</div>
    ${subheadline ? '<div class="subheadline">' + escapeHtml(subheadline) + '</div>' : ''}
  </div>
  <div class="body">${body}</div>
  ${cta ? '<div class="cta">' + escapeHtml(cta) + '</div>' : ''}
  ${finePrint ? '<div class="fine-print">' + escapeHtml(finePrint) + '</div>' : ''}
  <div class="footer">${escapeHtml(bName)}</div>
</div></body></html>`;

    const path = user.id + "/social/flyer-" + Date.now() + ".html";
    const { error: uploadError } = await supabase.storage
      .from("cl-assets")
      .upload(path, html, {
        contentType: "text/html",
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      console.error("[generate-flyer-pdf] upload error:", uploadError.message);
      return res.status(500).json({ error: "Failed to generate flyer." });
    }

    const { data: urlData } = supabase.storage.from("cl-assets").getPublicUrl(path);

    return res.status(200).json({
      flyer_url: urlData.publicUrl,
      flyer_html: html
    });
  } catch (err) {
    console.error("[generate-flyer-pdf] error:", err);
    return res.status(500).json({ error: "Failed to generate flyer." });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
