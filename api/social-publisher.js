import https from "https";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRAPH_VERSION = "v19.0";

function graphPost(path, body, token) {
  const postBody = JSON.stringify({ ...body, access_token: token });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "graph.facebook.com",
      path: `/${GRAPH_VERSION}/${path}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postBody) }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on("error", reject);
    req.write(postBody);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = new Date().toISOString();

  const { data: duePosts, error: fetchError } = await supabase
    .from("scheduled_posts")
    .select("*, social_posts(*)")
    .eq("status", "pending")
    .lte("scheduled_for", now);

  if (fetchError) {
    console.error("[social-publisher] Fetch error:", fetchError.message);
    return res.status(500).json({ error: "Failed to fetch scheduled posts" });
  }

  if (!duePosts || duePosts.length === 0) {
    return res.status(200).json({ published: 0, message: "No posts due" });
  }

  let published = 0;
  let errors = [];

  for (const scheduledPost of duePosts) {
    const post = scheduledPost.social_posts;
    if (!post) {
      const { error: skipErr } = await supabase.from("scheduled_posts").update({ status: "failed" }).eq("id", scheduledPost.id);
      if (skipErr) console.error("[social-publisher] scheduled_posts update error:", skipErr.message);
      continue;
    }

    try {
      const { data: settings, error: settingsErr } = await supabase
        .from("social_settings")
        .select("meta_page_id, meta_page_token, instagram_account_id, facebook_connected, instagram_connected")
        .eq("user_id", post.user_id)
        .maybeSingle();

      if (settingsErr) {
        console.error("[social-publisher] social_settings query error:", settingsErr.message);
        errors.push({ id: scheduledPost.id, error: "Failed to load social settings" });
        continue;
      }

      if (!settings || !settings.meta_page_token) {
        const { error: failErr } = await supabase.from("scheduled_posts").update({ status: "failed" }).eq("id", scheduledPost.id);
        if (failErr) console.error("[social-publisher] scheduled_posts update error:", failErr.message);
        errors.push({ id: scheduledPost.id, error: "No Meta connection found" });
        continue;
      }

      const platforms = scheduledPost.platforms || ["facebook"];
      let fbResult = null;
      let igResult = null;

      if (platforms.includes("facebook") && settings.facebook_connected) {
        const caption = (post.caption || "") + "\n\n" + (post.hashtags || "");
        const fbBody = { message: caption };
        if (post.image_url) fbBody.url = post.image_url;
        const endpoint = post.image_url ? `${settings.meta_page_id}/photos` : `${settings.meta_page_id}/feed`;
        const result = await graphPost(endpoint, fbBody, settings.meta_page_token);
        if (result.error) {
          errors.push({ id: scheduledPost.id, error: "Facebook: " + result.error.message });
        } else {
          fbResult = result.id;
        }
      }

      if (platforms.includes("instagram") && settings.instagram_connected && settings.instagram_account_id && post.image_url) {
        const caption = (post.caption || "") + "\n\n" + (post.hashtags || "");
        const container = await graphPost(
          `${settings.instagram_account_id}/media`,
          { image_url: post.image_url, caption: caption },
          settings.meta_page_token
        );
        if (container.id) {
          const publish = await graphPost(
            `${settings.instagram_account_id}/media_publish`,
            { creation_id: container.id },
            settings.meta_page_token
          );
          if (publish.id) {
            igResult = publish.id;
          }
        }
      }

      const publishedOk = fbResult || igResult;
      const { error: schedUpdateErr } = await supabase.from("scheduled_posts").update({
        status: publishedOk ? "published" : "failed"
      }).eq("id", scheduledPost.id);
      if (schedUpdateErr) console.error("[social-publisher] scheduled_posts update error:", schedUpdateErr.message);

      const { error: postUpdateErr } = await supabase.from("social_posts").update({
        status: publishedOk ? "published" : "failed",
        published_at: publishedOk ? new Date().toISOString() : null,
        post_id: fbResult || igResult || null,
        metadata: { facebook_id: fbResult, instagram_id: igResult },
        updated_at: new Date().toISOString()
      }).eq("id", post.id);
      if (postUpdateErr) console.error("[social-publisher] social_posts update error:", postUpdateErr.message);

      if (publishedOk) published++;
    } catch (err) {
      console.error("[social-publisher] Error publishing post:", scheduledPost.id, err.message);
      const { error: catchUpdateErr } = await supabase.from("scheduled_posts").update({ status: "failed" }).eq("id", scheduledPost.id);
      if (catchUpdateErr) console.error("[social-publisher] scheduled_posts update error:", catchUpdateErr.message);
      errors.push({ id: scheduledPost.id, error: err.message });
    }
  }

  console.log(`[social-publisher] Published ${published}/${duePosts.length} posts`);
  return res.status(200).json({ published, total: duePosts.length, errors });
}
