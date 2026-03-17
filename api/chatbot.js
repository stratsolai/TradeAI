import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // JWT authentication — Section 8a
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorised" });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const { messages, session_id, action } = req.body;

  // Handle conversation end / storage — Section 8f
  if (action === "end_conversation") {
    try {
      await storeConversation(user.id, session_id, messages);
    } catch (e) {
      console.error("Store conversation error:", e);
    }
    return res.status(200).json({ stored: true });
  }

  // Load user profile for industry context — Section 8e
  let industry = "business";
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("industry, business_name")
      .eq("user_id", user.id)
      .single();
    if (profile?.industry) industry = profile.industry;
  } catch (e) {
    // non-fatal
  }

  // Load chatbot settings for appointment booking flag
  let settings = { appointment_booking_enabled: false };
  try {
    const { data: s } = await supabase
      .from("chatbot_settings")
      .select("appointment_booking_enabled, time_labels, availability, greeting_message")
      .eq("user_id", user.id)
      .single();
    if (s) settings = s;
  } catch (e) {
    // non-fatal
  }

  // Load approved knowledge base — Section 8d
  let knowledgeContext = "";
  try {
    const { data: knowledgeItems } = await supabase
      .from("chatbot_knowledge")
      .select("category, title, structured_data")
      .eq("user_id", user.id)
      .eq("status", "approved");

    if (knowledgeItems && knowledgeItems.length > 0) {
      knowledgeContext += "\n\n--- APPROVED KNOWLEDGE BASE ---\n";
      for (const item of knowledgeItems) {
        knowledgeContext += `\nCategory: ${item.category}\nTitle: ${item.title}\nData: ${JSON.stringify(item.structured_data)}\n`;
      }
    }
  } catch (e) {
    // non-fatal
  }

  // Load approved FAQs — Section 8d
  try {
    const { data: faqs } = await supabase
      .from("chatbot_faqs")
      .select("question, answer")
      .eq("user_id", user.id)
      .eq("status", "approved");

    if (faqs && faqs.length > 0) {
      knowledgeContext += "\n\n--- APPROVED FAQS ---\n";
      for (const faq of faqs) {
        knowledgeContext += `\nQ: ${faq.question}\nA: ${faq.answer}\n`;
      }
    }
  } catch (e) {
    // non-fatal
  }

  if (!knowledgeContext) {
    knowledgeContext = "\n\nNo approved knowledge has been configured yet. Tell the customer that information is not yet available and ask them to contact the business directly.";
  }

  // Build system prompt — Section 8c guardrails
  const bookingInstruction = settings.appointment_booking_enabled
    ? `\n\nAPPOINTMENT BOOKING: When a customer asks to book an appointment, arrange a call, get a quote visit, or similar, respond with a booking prompt and include the exact string TRIGGER_APPOINTMENT_PICKER on its own line so the widget can render the calendar. Do not attempt to confirm a specific time — the business owner reviews preferred slots and contacts the customer directly.`
    : "";

  const systemPrompt = `You are a helpful customer service assistant for a ${industry} business. You answer customer questions on behalf of the business via their website chat widget.

MANDATORY GUARDRAILS — follow these at all times without exception:
- Answer only from the approved knowledge base and FAQ content provided below. Do not invent facts, prices, or capabilities.
- If a question is not covered by the available knowledge, say so plainly and ask the customer to contact the business directly.
- Never promise specific prices, timelines, or outcomes unless stated explicitly in the approved knowledge.
- If a customer question requires qualification before an accurate answer can be given, ask the qualifying question first.
- Never make commitments on behalf of the business without explicit instruction in the knowledge base.
- Be friendly, concise, and professional. Write in plain language.
- Do not reveal that you are an AI assistant unless directly asked.${bookingInstruction}

${knowledgeContext}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages || []
    });

    const replyContent = response.content[0]?.text || "";
    const triggerBooking = replyContent.includes("TRIGGER_APPOINTMENT_PICKER");
    const cleanReply = replyContent.replace("TRIGGER_APPOINTMENT_PICKER", "").trim();

    return res.status(200).json({
      reply: cleanReply,
      trigger_appointment_picker: triggerBooking
    });
  } catch (e) {
    console.error("Anthropic API error:", e);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

// Store completed conversation — Section 8f
async function storeConversation(userId, sessionId, messages) {
  if (!messages || messages.length === 0) return;

  const transcript = messages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: new Date().toISOString()
  }));

  // Detect unanswered questions — look for deflection phrases
  const deflectionPhrases = [
    "not covered",
    "contact the business",
    "contact us directly",
    "don't have information",
    "do not have information",
    "unable to answer",
    "not available in",
    "please reach out"
  ];
  const unansweredQuestions = [];
  const assistantMessages = messages.filter(m => m.role === "assistant");
  const userMessages = messages.filter(m => m.role === "user");

  for (let i = 0; i < assistantMessages.length; i++) {
    const assistantText = (assistantMessages[i]?.content || "").toLowerCase();
    const wasDeflected = deflectionPhrases.some(p => assistantText.includes(p));
    if (wasDeflected && userMessages[i]) {
      unansweredQuestions.push(userMessages[i].content);
    }
  }

  // Detect lead — customer provided contact details
  const fullText = messages
    .filter(m => m.role === "user")
    .map(m => m.content)
    .join(" ");
  const emailMatch = fullText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = fullText.match(/(\+?61|0)[2-9]\d{8}|(\+?61|0)4\d{8}/);
  const nameMatch = fullText.match(/my name is ([A-Z][a-z]+ [A-Z][a-z]+)/i);

  const isLead = !!(emailMatch || phoneMatch);

  // Detect appointment picker usage
  const appointmentRequested = messages.some(
    m => m.role === "assistant" && m.content && m.content.includes("TRIGGER_APPOINTMENT_PICKER")
  );
  const preferredSlots = messages
    .filter(m => m.role === "system_slots")
    .map(m => {
      try { return JSON.parse(m.content); } catch (e) { return null; }
    })
    .filter(Boolean)
    .flat()
    .slice(0, 4);

  const hasEnded = messages.some(m => m.role === "assistant");
  const status = hasEnded ? "completed" : "abandoned";

  await supabase.from("chatbot_conversations").insert({
    user_id: userId,
    session_id: sessionId || ("session_" + Date.now()),
    transcript,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    status,
    is_lead: isLead,
    lead_name: nameMatch ? nameMatch[1] : null,
    lead_email: emailMatch ? emailMatch[0] : null,
    lead_phone: phoneMatch ? phoneMatch[0] : null,
    appointment_requested: appointmentRequested,
    preferred_slots: preferredSlots.length > 0 ? preferredSlots : null,
    unanswered_questions: unansweredQuestions.length > 0 ? unansweredQuestions : null,
    created_at: new Date().toISOString()
  });
}