/**
 * api/chatbot.js
 *
 * Chatbot message handler. Accepts messages from the customer-facing widget
 * (authenticated via widget_id + domain check) or from the owner test panel
 * (authenticated via Bearer JWT).
 *
 * Builds a dynamic system prompt from Business Profile + Content Library
 * items tagged CB. Supports appointment booking triggers, lead capture,
 * unanswered question detection, and DV integration flags.
 *
 * ENV VARS: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import https from 'https';
import { createClient } from '@supabase/supabase-js';
import { logAnthropicUsage, logSmtp2goUsage } from '../lib/usage-logger.js';

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── HTTP HELPER ──────────────────────────────────────────────────────────────

function httpsPost(hostname, path, headers, body) {
  return new Promise(function(resolve, reject) {
    var bodyStr = JSON.stringify(body);
    var req = https.request(
      { hostname: hostname, path: path, method: 'POST', headers: Object.assign({}, headers, { 'Content-Length': Buffer.byteLength(bodyStr) }) },
      function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch(e) { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

async function authenticateWidget(supabase, widgetId, origin) {
  if (!widgetId) return null;

  var res = await supabase
    .from('chatbot_settings')
    .select('user_id, allowed_domains')
    .eq('widget_id', widgetId)
    .maybeSingle();

  if (res.error || !res.data) return null;

  var allowed = res.data.allowed_domains || [];
  if (allowed.length > 0 && origin) {
    var originHost = '';
    try { originHost = new URL(origin).hostname; } catch(e) { originHost = origin; }
    var domainMatch = allowed.some(function(d) {
      var clean = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
      return originHost.toLowerCase() === clean || originHost.toLowerCase().endsWith('.' + clean);
    });
    if (!domainMatch) return null;
  }

  return res.data.user_id;
}

async function authenticateOwner(supabase, token) {
  if (!token) return null;
  var res = await supabase.auth.getUser(token);
  if (res.error || !res.data || !res.data.user) return null;
  return res.data.user.id;
}

// ── SYSTEM PROMPT BUILDER ────────────────────────────────────────────────────

async function buildSystemPrompt(supabase, userId, settings) {
  var parts = [];

  // Load Business Profile
  var profileRes = await supabase.from('profiles').select('*').eq('id', userId).single();
  var p = (profileRes.data) || {};

  // Identity
  var identity = 'You are the customer service assistant for ' + (p.business_name || 'this business') + '.';
  if (p.industry && p.industry.length > 0) identity += ' Industries: ' + p.industry.join(', ') + '.';
  if (p.years_in_business) identity += ' Established ' + p.years_in_business + '.';
  if (p.abn) identity += ' ABN: ' + p.abn + '.';
  parts.push(identity);

  // Location & Contact
  var location = '';
  if (p.address_street) location += p.address_street + ', ';
  if (p.address_suburb) location += p.address_suburb + ' ';
  if (p.address_state) location += p.address_state + ' ';
  if (p.address_postcode) location += p.address_postcode;
  if (location) parts.push('Location: ' + location.trim() + '.');
  if (p.phone) parts.push('Phone: ' + p.phone + '.');
  if (p.additional_phones && p.additional_phones.length > 0) {
    parts.push('Additional phones: ' + p.additional_phones.map(function(ph) { return (ph.label || '') + ' ' + (ph.number || ''); }).join(', ') + '.');
  }
  if (Array.isArray(p.service_area) && p.service_area.length > 0) {
    parts.push('Service area: ' + p.service_area.join(', ') + '.');
  }
  if (p.trading_hours && typeof p.trading_hours === 'object') {
    var hoursLines = [];
    var days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(function(day) {
      var h = p.trading_hours[day];
      if (h && h.open) hoursLines.push(day.charAt(0).toUpperCase() + day.slice(1) + ': ' + (h.from || '9:00') + ' – ' + (h.to || '17:00'));
    });
    if (hoursLines.length > 0) parts.push('Trading hours:\n' + hoursLines.join('\n'));
  }

  // Services
  if (Array.isArray(p.bp_services) && p.bp_services.length > 0) {
    var svcLines = p.bp_services.map(function(s) {
      var line = '- ' + (s.name || 'Unnamed service');
      if (s.description) line += ': ' + s.description;
      if (settings.pricing_disclosure === 'actual' && s.price) line += ' (Price: ' + s.price + ')';
      else if (settings.pricing_disclosure === 'ranges' && s.price_range) line += ' (Price range: ' + s.price_range + ')';
      return line;
    });
    parts.push('Services offered:\n' + svcLines.join('\n'));
  }

  // Products
  if (Array.isArray(p.bp_products) && p.bp_products.length > 0) {
    var prodLines = p.bp_products.map(function(pr) {
      var line = '- ' + (pr.name || 'Unnamed product');
      if (pr.description) line += ': ' + pr.description;
      if (settings.pricing_disclosure === 'actual' && pr.price) line += ' (Price: ' + pr.price + ')';
      else if (settings.pricing_disclosure === 'ranges' && pr.price_range) line += ' (Price range: ' + pr.price_range + ')';
      return line;
    });
    parts.push('Products available:\n' + prodLines.join('\n'));
  }

  // Credentials & Support
  if (Array.isArray(p.payment_methods) && p.payment_methods.length > 0) {
    parts.push('Payment methods: ' + p.payment_methods.join(', ') + '.');
  }
  if (p.response_time) parts.push('Typical response time: ' + p.response_time + '.');
  if (p.warranty_info) parts.push('Warranty: ' + p.warranty_info);
  if (p.complaints_handling) parts.push('Complaints process: ' + p.complaints_handling);

  // Marketing Theme
  if (p.marketing_theme_awareness) parts.push('What customers should know: ' + p.marketing_theme_awareness);
  if (p.marketing_theme_differentiators) parts.push('What sets this business apart: ' + p.marketing_theme_differentiators);
  if (p.marketing_theme_feeling) parts.push('How customers should feel: ' + p.marketing_theme_feeling);

  // Content Library items tagged CB
  var clRes = await supabase
    .from('content_library')
    .select('content_text, category')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .contains('tool_tags', ['CB']);

  if (!clRes.error && clRes.data && clRes.data.length > 0) {
    var clLines = clRes.data.map(function(item) {
      return '- ' + (item.content_text || '');
    }).filter(function(l) { return l.length > 3; });
    if (clLines.length > 0) {
      parts.push('Additional knowledge from the business:\n' + clLines.join('\n'));
    }
  }

  // Pricing behaviour
  var pricingInstruction = '';
  if (settings.pricing_disclosure === 'actual') {
    pricingInstruction = 'Share actual prices when asked, using the data provided above.';
  } else if (settings.pricing_disclosure === 'ranges') {
    pricingInstruction = 'When asked about pricing, provide general ranges only. Do not quote exact prices even if you have them.';
  } else {
    pricingInstruction = 'Do not discuss pricing. If asked about costs, direct the customer to request a quote or contact the business.';
  }
  parts.push(pricingInstruction);

  // Appointment booking
  if (settings.appointment_booking_enabled) {
    parts.push('APPOINTMENT BOOKING: When a customer asks to book, schedule, or arrange an appointment — or when the conversation naturally leads to next steps after a pricing discussion — respond helpfully and include the exact string TRIGGER_APPOINTMENT_PICKER on its own line. The widget will render a booking interface. Do not attempt to confirm a specific time.');
  }

  // DV integration
  if (settings.dv_mode && settings.dv_mode !== 'off') {
    parts.push('DESIGN VISUALISER: This business offers AI design visualisation. If a customer is discussing a specific project and would benefit from seeing a visual render, you may offer: "Would you like to upload a photo and see a concept render of what that could look like?" Include the exact string TRIGGER_DV_UPLOAD on its own line when the customer accepts. Do not push this feature — offer it naturally when relevant.');
  }

  // Role, tone and guardrails
  parts.push(
    'ROLE AND TONE:\n'
    + '- Be professional, friendly and helpful\n'
    + '- Write in plain Australian English\n'
    + '- Be concise — customers want quick answers\n'
    + '- Do not reveal that you are an AI unless directly asked\n\n'
    + 'GUARDRAILS:\n'
    + '- Answer only from the knowledge provided above. Do not invent facts, prices or capabilities.\n'
    + '- If a question is not covered, say so plainly. Offer to pass the question to the business.\n'
    + '- If a customer provides their name, email or phone number, acknowledge it.\n'
    + '- Never recommend competitors.\n'
    + '- Never give legal, medical or financial advice.\n'
    + '- Never make promises or commitments not supported by the knowledge above.\n'
    + '- If the customer seems frustrated or asks to speak to a person, offer to have the business contact them directly.'
  );

  return parts.join('\n\n');
}

// ── CONVERSATION STORAGE ─────────────────────────────────────────────────────

async function storeConversation(supabase, userId, sessionId, messages) {
  if (!messages || messages.length === 0) return;

  var transcript = messages.map(function(m) {
    return { role: m.role, content: m.content, timestamp: m.timestamp || new Date().toISOString() };
  });

  // Detect unanswered questions
  var deflectionPhrases = [
    'don\'t have that information',
    'do not have that information',
    'not covered',
    'contact the business',
    'contact us directly',
    'unable to answer',
    'not available',
    'please reach out',
    'pass your question'
  ];
  var unansweredQuestions = [];
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].role === 'assistant') {
      var text = (messages[i].content || '').toLowerCase();
      var wasDeflected = deflectionPhrases.some(function(p) { return text.indexOf(p) !== -1; });
      if (wasDeflected && i > 0 && messages[i - 1].role === 'user') {
        unansweredQuestions.push(messages[i - 1].content);
      }
    }
  }

  // Detect lead info
  var userText = messages
    .filter(function(m) { return m.role === 'user'; })
    .map(function(m) { return m.content; })
    .join(' ');

  var emailMatch = userText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  var phoneMatch = userText.match(/(\+?61|0)[2-9]\d{8}|(\+?61|0)4\d{8}/);
  var nameMatch = userText.match(/my name is ([A-Z][a-z]+ [A-Z][a-z]+)/i);
  var isLead = !!(emailMatch || phoneMatch);

  // Detect appointment request
  var appointmentRequested = messages.some(function(m) {
    return m.role === 'assistant' && m.content && m.content.indexOf('TRIGGER_APPOINTMENT_PICKER') !== -1;
  });

  // Extract preferred slots if submitted
  var preferredSlots = messages
    .filter(function(m) { return m.role === 'system_slots'; })
    .map(function(m) { try { return JSON.parse(m.content); } catch(e) { return null; } })
    .filter(Boolean)
    .flat()
    .slice(0, 4);

  var row = {
    user_id: userId,
    session_id: sessionId || ('session_' + Date.now()),
    transcript: transcript,
    started_at: messages[0].timestamp || new Date().toISOString(),
    ended_at: new Date().toISOString(),
    status: 'completed',
    is_lead: isLead,
    lead_name: nameMatch ? nameMatch[1] : null,
    lead_email: emailMatch ? emailMatch[0] : null,
    lead_phone: phoneMatch ? phoneMatch[0] : null,
    appointment_requested: appointmentRequested,
    preferred_slots: preferredSlots.length > 0 ? preferredSlots : null,
    unanswered_questions: unansweredQuestions.length > 0 ? unansweredQuestions : null
  };

  var insertRes = await supabase.from('chatbot_conversations').insert(row);
  if (insertRes.error) {
    console.error('[CB] Conversation insert error:', insertRes.error.message);
  }

  // Send notification if there are unanswered questions and a lead was captured
  if (unansweredQuestions.length > 0 && isLead) {
    await sendNotification(supabase, userId, {
      customerName: nameMatch ? nameMatch[1] : null,
      customerEmail: emailMatch ? emailMatch[0] : null,
      customerPhone: phoneMatch ? phoneMatch[0] : null,
      questions: unansweredQuestions
    });
  }
}

// ── NOTIFICATION ─────────────────────────────────────────────────────────────

async function sendNotification(supabase, userId, details) {
  try {
    var settingsRes = await supabase
      .from('chatbot_settings')
      .select('notification_email')
      .eq('user_id', userId)
      .maybeSingle();

    var notifEmail = settingsRes.data && settingsRes.data.notification_email;
    if (!notifEmail) return;

    var profileRes = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', userId)
      .maybeSingle();

    var businessName = (profileRes.data && profileRes.data.business_name) || 'StaxAI';

    var subject = 'New lead requires attention — ' + businessName;

    // Plain text fallback
    var textBody = 'NEW LEAD REQUIRES ATTENTION\n'
      + businessName + '\n'
      + '================================\n\n'
      + 'A customer asked a question your chatbot could not answer and left their contact details.\n\n'
      + 'CUSTOMER DETAILS\n';
    if (details.customerName) textBody += 'Name: ' + details.customerName + '\n';
    if (details.customerEmail) textBody += 'Email: ' + details.customerEmail + '\n';
    if (details.customerPhone) textBody += 'Phone: ' + details.customerPhone + '\n';
    textBody += '\nUNANSWERED QUESTIONS\n';
    details.questions.forEach(function(q) { textBody += '- ' + q + '\n'; });
    textBody += '\nView the full conversation: https://staxai.com.au/chatbot\n\n'
      + '---\n'
      + 'StaxAI — Your AI Business Assistant\n'
      + 'https://staxai.com.au';

    // Branded HTML email
    var contactRows = '';
    if (details.customerName) contactRows += '<tr><td style="padding:6px 12px;color:#888;font-size:13px;width:70px">Name</td><td style="padding:6px 12px;color:#333;font-size:14px;font-weight:600">' + details.customerName + '</td></tr>';
    if (details.customerEmail) contactRows += '<tr><td style="padding:6px 12px;color:#888;font-size:13px;width:70px">Email</td><td style="padding:6px 12px;color:#333;font-size:14px"><a href="mailto:' + details.customerEmail + '" style="color:#4A6D8C;text-decoration:none">' + details.customerEmail + '</a></td></tr>';
    if (details.customerPhone) contactRows += '<tr><td style="padding:6px 12px;color:#888;font-size:13px;width:70px">Phone</td><td style="padding:6px 12px;color:#333;font-size:14px"><a href="tel:' + details.customerPhone + '" style="color:#4A6D8C;text-decoration:none">' + details.customerPhone + '</a></td></tr>';

    var questionItems = '';
    details.questions.forEach(function(q) { questionItems += '<li style="padding:6px 0;color:#333;font-size:14px;line-height:1.5">' + q + '</li>'; });

    var htmlBody = '<!DOCTYPE html>'
      + '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      + '<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px">'
      + '<tr><td align="center">'
      + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'

      // Header
      + '<tr><td style="background:linear-gradient(135deg,#4A6D8C 0%,#3d5f7a 100%);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">'
      + '<img src="https://staxai.com.au/icons/icon-192.png" alt="StaxAI" width="48" height="48" style="display:block;margin:0 auto 12px">'
      + '<div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px">New Lead Requires Attention</div>'
      + '<div style="color:rgba(255,255,255,0.75);font-size:14px;margin-top:4px">' + businessName + '</div>'
      + '</td></tr>'

      // Body
      + '<tr><td style="background:#ffffff;padding:32px">'

      // Intro
      + '<p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">A customer asked a question your chatbot could not answer and left their contact details for follow-up.</p>'

      // Customer details card
      + '<div style="background:#f8fafc;border:1px solid #e5e5e5;border-left:4px solid #4A6D8C;border-radius:8px;margin-bottom:24px;overflow:hidden">'
      + '<div style="padding:12px 16px;border-bottom:1px solid #e5e5e5;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em">Customer Details</div>'
      + '<table width="100%" cellpadding="0" cellspacing="0">' + contactRows + '</table>'
      + '</div>'

      // Unanswered questions card
      + '<div style="background:#f8fafc;border:1px solid #e5e5e5;border-left:4px solid #c4622a;border-radius:8px;margin-bottom:28px;overflow:hidden">'
      + '<div style="padding:12px 16px;border-bottom:1px solid #e5e5e5;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em">Unanswered Questions</div>'
      + '<div style="padding:8px 16px"><ul style="margin:0;padding:0 0 0 18px">' + questionItems + '</ul></div>'
      + '</div>'

      // CTA button
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
      + '<a href="https://staxai.com.au/chatbot" style="display:inline-block;padding:14px 32px;background:#4A6D8C;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px">View Conversation</a>'
      + '</td></tr></table>'

      + '</td></tr>'

      // Footer
      + '<tr><td style="background:#f5f7fa;padding:20px 32px;border-top:1px solid #e5e5e5;border-radius:0 0 12px 12px;text-align:center">'
      + '<div style="color:#888;font-size:12px">StaxAI — Your AI Business Assistant</div>'
      + '<div style="margin-top:4px"><a href="https://staxai.com.au" style="color:#4A6D8C;font-size:12px;text-decoration:none">staxai.com.au</a></div>'
      + '</td></tr>'

      + '</table>'
      + '</td></tr></table>'
      + '</body></html>';

    var smtp2goKey = process.env.SMTP2GO_API_KEY;
    if (!smtp2goKey) {
      console.log('[CB] SMTP2GO_API_KEY not configured — notification email skipped for', notifEmail);
      return;
    }

    var emailPayload = {
      api_key: smtp2goKey,
      sender: 'StaxAI <notifications@staxai.com.au>',
      to: [notifEmail],
      subject: subject,
      text_body: textBody,
      html_body: htmlBody
    };

    var emailRes = await httpsPost('api.smtp2go.com', '/v3/email/send', {
      'Content-Type': 'application/json'
    }, emailPayload);

    if (emailRes.status >= 200 && emailRes.status < 300 && emailRes.body && emailRes.body.data && emailRes.body.data.succeeded > 0) {
      console.log('[CB] Notification email sent to', notifEmail);
      await logSmtp2goUsage({ tool_id: 'chatbot', user_id: userId || null });
    } else {
      console.error('[CB] SMTP2Go API error:', emailRes.status, emailRes.body);
    }

  } catch(e) {
    console.error('[CB] Notification error:', e.message);
  }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  var supabase = getSupabase();
  var body = req.body || {};
  var origin = req.headers.origin || req.headers.referer || '';

  // Authenticate — widget_id for customers, Bearer token for owner test
  var userId = null;
  var isOwnerTest = false;

  if (body.widget_id) {
    userId = await authenticateWidget(supabase, body.widget_id, origin);
    if (!userId) return res.status(403).json({ error: 'Invalid widget ID or domain not authorised' });
  } else {
    var authHeader = req.headers.authorization || '';
    var token = authHeader.replace('Bearer ', '').trim();
    userId = await authenticateOwner(supabase, token);
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    isOwnerTest = true;
  }

  var action = body.action || 'chat';
  var messages = body.messages || [];
  var sessionId = body.session_id || null;

  // ── END CONVERSATION ────────────────────────────────────────────────
  if (action === 'end_conversation') {
    if (!isOwnerTest) {
      try {
        await storeConversation(supabase, userId, sessionId, messages);
      } catch(e) {
        console.error('[CB] Store conversation error:', e.message);
      }
    }
    return res.status(200).json({ stored: true });
  }

  // ── CHAT ────────────────────────────────────────────────────────────
  try {
    // Load settings
    var settingsRes = await supabase
      .from('chatbot_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    var settings = (settingsRes.data) || {};

    // Build system prompt
    var systemPrompt = await buildSystemPrompt(supabase, userId, settings);

    // Call Claude
    var response = await httpsPost(
      'api.anthropic.com',
      '/v1/messages',
      {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      }
    );

    if (response.status !== 200) {
      console.error('[CB] Claude API error:', response.body);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
    logAnthropicUsage({ tool_id: 'chatbot', user_id: userId, model: 'claude-sonnet-4-6', usage: response.body && response.body.usage });

    var replyText = '';
    if (response.body.content && response.body.content[0]) {
      replyText = response.body.content[0].text || '';
    }

    // Detect triggers
    var triggerBooking = replyText.indexOf('TRIGGER_APPOINTMENT_PICKER') !== -1;
    var triggerDV = replyText.indexOf('TRIGGER_DV_UPLOAD') !== -1;

    // Clean trigger strings from reply
    var cleanReply = replyText
      .replace(/TRIGGER_APPOINTMENT_PICKER/g, '')
      .replace(/TRIGGER_DV_UPLOAD/g, '')
      .trim();

    return res.status(200).json({
      reply: cleanReply,
      trigger_appointment_picker: triggerBooking,
      trigger_dv_upload: triggerDV
    });

  } catch(e) {
    console.error('[CB] Chat error:', e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
