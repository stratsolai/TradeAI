/**
 * api/chatbot-widget-settings.js
 *
 * Public endpoint — returns widget configuration for the customer-facing
 * chatbot. Authenticated via widget_id with domain validation.
 * Only safe, non-sensitive settings are returned.
 *
 * ENV VARS: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  var widgetId = req.query.widget_id;
  if (!widgetId) return res.status(400).json({ error: 'widget_id required' });

  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Server configuration error' });

  var supabase = createClient(supabaseUrl, supabaseKey);

  try {
    var settingsRes = await supabase
      .from('chatbot_settings')
      .select('user_id, allowed_domains, appointment_booking_enabled, time_labels, availability, greeting_message, widget_title, widget_colour, pricing_disclosure, dv_mode')
      .eq('widget_id', widgetId)
      .maybeSingle();

    if (settingsRes.error) {
      console.error('[CB Widget Settings] Query error:', settingsRes.error.message);
      return res.status(500).json({ error: 'Something went wrong.' });
    }

    if (!settingsRes.data) {
      return res.status(404).json({ error: 'Widget not found' });
    }

    var data = settingsRes.data;

    // Domain validation
    var origin = req.headers.origin || req.headers.referer || '';
    var allowed = data.allowed_domains || [];
    if (allowed.length > 0 && origin) {
      var originHost = '';
      try { originHost = new URL(origin).hostname; } catch(e) { originHost = origin; }
      var domainMatch = allowed.some(function(d) {
        var clean = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
        return originHost.toLowerCase() === clean || originHost.toLowerCase().endsWith('.' + clean);
      });
      if (!domainMatch) {
        return res.status(403).json({ error: 'Domain not authorised' });
      }
    }

    // Load business name for the widget greeting
    var businessName = null;
    var profileRes = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', data.user_id)
      .maybeSingle();
    if (profileRes.data) businessName = profileRes.data.business_name;

    return res.status(200).json({
      appointment_booking_enabled: data.appointment_booking_enabled || false,
      time_labels: data.time_labels || ['Morning', 'Afternoon', 'Evening'],
      availability: data.availability || {},
      greeting_message: data.greeting_message || null,
      widget_title: data.widget_title || null,
      widget_colour: data.widget_colour || '#4A6D8C',
      dv_mode: data.dv_mode || 'off',
      business_name: businessName
    });

  } catch(e) {
    console.error('[CB Widget Settings] Error:', e.message);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}
