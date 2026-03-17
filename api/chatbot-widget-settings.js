import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Public endpoint — returns only the fields the widget needs to render
// No auth required: userId is supplied as query param from the embed snippet
// Only safe, non-sensitive settings are returned (availability, time labels, booking enabled)
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  try {
    const { data, error } = await supabase
      .from("chatbot_settings")
      .select("appointment_booking_enabled, time_labels, availability, greeting_message, widget_title")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      // Return safe defaults if no settings found
      return res.status(200).json({
        appointment_booking_enabled: false,
        time_labels: ["Morning", "Afternoon", "Evening"],
        availability: {},
        greeting_message: null,
        widget_title: null
      });
    }

    return res.status(200).json({
      appointment_booking_enabled: data.appointment_booking_enabled || false,
      time_labels: data.time_labels || ["Morning", "Afternoon", "Evening"],
      availability: data.availability || {},
      greeting_message: data.greeting_message || null,
      widget_title: data.widget_title || null
    });
  } catch (e) {
    console.error("Widget settings error:", e);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}