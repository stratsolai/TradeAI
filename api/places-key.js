import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Returns the Google Maps JS API key so the client can dynamically load
// the Places library for the BP address autocomplete (BP UX Improvements
// Spec v1.0 §3). Auth-gated to authenticated users only — the actual
// key is also expected to be locked down by HTTP referrer restrictions
// in Google Cloud Console.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!PLACES_KEY) {
    return res.status(503).json({ error: "Places API not configured" });
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

  return res.status(200).json({ key: PLACES_KEY });
}
