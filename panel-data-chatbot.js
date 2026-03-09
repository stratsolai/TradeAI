// panel-data-chatbot.js
// AI Website Chatbot — StaxAI panel data
// Built per Panel Redesign Build Spec v2.0

window.PANEL_TOOL = {

  id: "chatbot",
  icon: "💬",

  title: {
    line1: "AI WEBSITE",
    line2: "CHATBOT"
  },

  tagline: "Your 24/7 sales team that never sleeps ✨",

  description: "An AI chatbot answers customer enquiries, qualifies leads, and books jobs — 24/7. It learns your business from your emails, your website, your content library, or FAQs you add yourself. Every answer goes through your approval before it goes live. It keeps learning as it goes.",

  benefits: [
    "Answers customer enquiries 24/7 — even when you are on-site",
    "Qualifies leads and books jobs automatically",
    "Learns from your emails, website and content library",
    "Every FAQ approved by you before it goes live",
    "Gets smarter with every customer interaction"
  ],

  price: "y79",

  status: "built",

  roi: {
    inputs: [
      { label: "Website visitors per month", min: 100, max: 5000, default: 500, step: 50 },
      { label: "After-hours enquiries you miss", min: 1, max: 100, default: 12, step: 1 },
      { label: "Average job value", min: 500, max: 50000, default: 4500, step: 500, prefix: "$" }
    ],
    calculate: function(inputs) {
      var visitors = inputs[0];
      var missed = inputs[1];
      var jobValue = inputs[2];
      var leadsCapt = Math.round(visitors * 0.04);
      var afterHours = missed;
      var jobsBooked = Math.round(leadsCapt * 0.4);
      var revenue = jobsBooked * jobValue;
      return [leadsCapt, afterHours, jobsBooked, revenue];
    },
    outputs: [
      { label: "Leads Captured" },
      { label: "After-Hours Saves" },
      { label: "Jobs Booked" },
      { label: "Potential Revenue" }
    ]
  },

  steps: [
    {
      icon: "⚡",
      title: "ACTIVATE",
      desc: "Start your free trial and connect your Gmail or website — AI reads your business and creates FAQs in minutes"
    },
    {
      icon: "⚙️",
      title: "SETTINGS",
      desc: "Set your greeting, tone, and booking preferences. Review AI-suggested answers — nothing goes live without your OK"
    },
    {
      icon: "🚀",
      title: "LIVE",
      desc: "Your chatbot is live on your website — qualifying leads, booking jobs, and notifying you of hot prospects 24/7"
    }
  ],

  preview: {
    type: "interactive",
    videoUrl: "",
    screenshots: [],
    comingSoonLabel: "Demo coming soon",

    css: "\n  /* ===== EXAMPLE OUTPUT \u2014 CHATBOT PREVIEW ===== */\n  .example-section { padding: 80px 48px; position: relative; }\n  .preview-wrap { max-width: 1100px; margin: 0 auto; position: relative; }\n  .preview-chrome {\n    background: var(--cream);\n    border-radius: 16px 16px 0 0;\n    padding: 12px 16px 0;\n    border: 1px solid rgba(196,98,42,0.15);\n    border-bottom: none;\n  }\n  .chrome-bar {\n    display: flex; align-items: center; gap: 12px; margin-bottom: 10px;\n  }\n  .chrome-dots { display: flex; gap: 6px; }\n  .chrome-dot {\n    width: 12px; height: 12px; border-radius: 50%;\n  }\n  .chrome-dot.r { background: #e05050; }\n  .chrome-dot.y { background: var(--gold); }\n  .chrome-dot.g { background: #4a9e6a; }\n  .chrome-url {\n    flex: 1; background: #fff; border: 1px solid rgba(196,98,42,0.15);\n    border-radius: 6px; padding: 5px 12px;\n    font-family: \"DM Sans\", sans-serif; font-size: 12px;\n    color: #6b5540;\n  }\n  .preview-website {\n    background: linear-gradient(160deg, var(--navy) 0%, var(--deep-blue) 50%, var(--steel-blue) 100%);\n    min-height: 420px; position: relative; overflow: hidden;\n    border-radius: 0 0 16px 16px;\n    border: 1px solid rgba(196,98,42,0.15);\n    border-top: none;\n  }\n  .site-deco-1 {\n    position: absolute; top: -60px; right: -60px;\n    width: 300px; height: 300px; border-radius: 50%;\n    background: radial-gradient(ellipse, rgba(212,132,74,0.12), transparent 70%);\n    pointer-events: none;\n  }\n  .site-deco-2 {\n    position: absolute; bottom: -40px; left: -40px;\n    width: 250px; height: 250px; border-radius: 50%;\n    background: radial-gradient(ellipse, rgba(196,98,42,0.08), transparent 70%);\n    pointer-events: none;\n  }\n  .site-nav {\n    display: flex; align-items: center; justify-content: space-between;\n    padding: 18px 32px;\n  }\n  .site-logo {\n    display: flex; align-items: center; gap: 10px;\n  }\n  .site-logo-icon {\n    width: 36px; height: 36px; border-radius: 8px;\n    background: linear-gradient(135deg, var(--burnt-orange), var(--copper));\n    display: flex; align-items: center; justify-content: center;\n    font-size: 18px;\n  }\n  .site-logo-text {\n    font-family: \"Barlow Condensed\", sans-serif;\n    font-size: 20px; font-weight: 700; color: var(--cream);\n  }\n  .site-nav-links {\n    display: flex; gap: 24px;\n    font-family: \"DM Sans\", sans-serif; font-size: 13px;\n    color: rgba(232,213,184,0.7);\n  }\n  .site-hero {\n    padding: 40px 32px 32px;\n  }\n  .site-hero h2 {\n    font-family: \"Barlow Condensed\", sans-serif;\n    font-size: 42px; font-weight: 900; color: #fff;\n    line-height: 1.05; margin: 0 0 12px;\n    max-width: 380px;\n  }\n  .site-hero p {\n    font-family: \"DM Sans\", sans-serif;\n    font-size: 14px; color: rgba(232,213,184,0.75);\n    max-width: 320px; line-height: 1.6; margin: 0 0 20px;\n  }\n  .site-cta {\n    display: inline-block;\n    background: linear-gradient(135deg, var(--burnt-orange), var(--copper));\n    color: #fff; font-family: \"DM Sans\", sans-serif;\n    font-size: 14px; font-weight: 700;\n    padding: 10px 24px; border-radius: 8px;\n    text-decoration: none;\n  }\n  .chatbot-widget {\n    position: absolute; bottom: 24px; right: 30px;\n    width: 370px; background: #fff; border-radius: 20px;\n    box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);\n    overflow: hidden;\n    opacity: 0; animation: widgetAppear 0.6s ease forwards; animation-delay: 0.5s;\n  }\n  .cw-header {\n    background: linear-gradient(135deg, var(--navy), var(--deep-blue), var(--steel-blue));\n    padding: 14px 18px;\n    display: flex; align-items: center; gap: 10px;\n  }\n  .cw-avatar {\n    width: 36px; height: 36px; border-radius: 50%;\n    background: linear-gradient(135deg, var(--burnt-orange), var(--copper));\n    display: flex; align-items: center; justify-content: center;\n    font-size: 16px; flex-shrink: 0;\n  }\n  .cw-header-text { flex: 1; }\n  .cw-name {\n    font-family: \"DM Sans\", sans-serif;\n    font-size: 13px; font-weight: 700; color: #fff;\n  }\n  .cw-status {\n    font-family: \"DM Sans\", sans-serif;\n    font-size: 11px; color: rgba(232,213,184,0.8);\n  }\n  .cw-powered {\n    font-family: \"DM Sans\", sans-serif;\n    font-size: 10px; color: rgba(232,213,184,0.5);\n  }\n  .cw-messages {\n    background: var(--warm-white);\n    padding: 16px; min-height: 180px;\n    display: flex; flex-direction: column; gap: 10px;\n  }\n  .cw-msg {\n    max-width: 85%; opacity: 0;\n    font-family: \"DM Sans\", sans-serif; font-size: 13px; line-height: 1.5;\n  }\n  .cw-msg.bot {\n    background: #fff; border: 1px solid rgba(196,98,42,0.1);\n    border-radius: 14px 14px 14px 4px;\n    padding: 10px 14px; color: #3d2e1e;\n    align-self: flex-start;\n    animation: wMsgIn 0.4s ease forwards;\n  }\n  .cw-msg.user {\n    background: linear-gradient(135deg, var(--deep-blue), var(--steel-blue));\n    border-radius: 14px 14px 4px 14px;\n    padding: 10px 14px; color: #fff;\n    align-self: flex-end;\n    animation: wMsgIn 0.4s ease forwards;\n  }\n  .cw-msg.m1 { animation-delay: 1.0s; }\n  .cw-msg.m2 { animation-delay: 1.8s; }\n  .cw-msg.m3 { animation-delay: 2.8s; }\n  .cw-msg.m4 { animation-delay: 3.6s; }\n  .cw-msg.m5 { animation-delay: 4.4s; }\n  .cw-input-area {\n    background: var(--warm-white);\n    padding: 10px 14px;\n    display: flex; align-items: center; gap: 8px;\n    border-top: 1px solid rgba(196,98,42,0.08);\n  }\n  .cw-input {\n    flex: 1; background: #fff;\n    border: 1px solid rgba(196,98,42,0.15); border-radius: 20px;\n    padding: 8px 14px;\n    font-family: \"DM Sans\", sans-serif; font-size: 12px; color: #9a8a7a;\n  }\n  .cw-send {\n    width: 32px; height: 32px; border-radius: 50%;\n    background: linear-gradient(135deg, var(--burnt-orange), var(--copper));\n    display: flex; align-items: center; justify-content: center;\n    color: #fff; font-size: 14px; cursor: pointer;\n    border: none;\n  }\n  .cw-badge {\n    display: inline-block;\n    background: var(--burnt-orange); color: #fff;\n    font-family: \"DM Sans\", sans-serif; font-size: 9px; font-weight: 700;\n    padding: 2px 6px; border-radius: 10px;\n    margin-left: 6px;\n    opacity: 0; animation: badgeFade 0.3s ease forwards; animation-delay: 5s;\n  }\n  .phone-notif {\n    position: absolute; bottom: 180px; left: 24px;\n    background: #fff; border-radius: 14px;\n    padding: 12px 16px; width: 240px;\n    box-shadow: 0 8px 30px rgba(0,0,0,0.15);\n    display: flex; align-items: flex-start; gap: 10px;\n    opacity: 0; animation: notifPop 0.5s ease forwards; animation-delay: 5.2s;\n  }\n  .notif-icon {\n    width: 32px; height: 32px; border-radius: 8px;\n    background: linear-gradient(135deg, #4a9e6a, #3d8a5a);\n    display: flex; align-items: center; justify-content: center;\n    font-size: 16px; flex-shrink: 0;\n  }\n  .notif-text { flex: 1; }\n  .notif-title {\n    font-family: \"DM Sans\", sans-serif;\n    font-size: 12px; font-weight: 700; color: #3d2e1e;\n    margin-bottom: 2px;\n  }\n  .notif-body {\n    font-family: \"DM Sans\", sans-serif;\n    font-size: 11px; color: #6b5540; line-height: 1.4;\n  }\n  .notif-time {\n    font-family: \"DM Sans\", sans-serif;\n    font-size: 10px; color: #9a8a7a; margin-top: 4px;\n  }\n  .preview-tabs {\n    display: flex; gap: 0;\n    background: var(--cream);\n    border: 1px solid rgba(196,98,42,0.15);\n    border-top: none;\n    border-radius: 0 0 16px 16px;\n    overflow: hidden;\n  }\n  .preview-tab {\n    flex: 1; padding: 12px 16px;\n    font-family: \"DM Sans\", sans-serif; font-size: 13px; font-weight: 500;\n    color: #6b5540; text-align: center; cursor: pointer;\n    border-right: 1px solid rgba(196,98,42,0.1);\n    transition: background 0.2s;\n  }\n  .preview-tab:last-child { border-right: none; }\n  .preview-tab.active {\n    background: #fff; font-weight: 700; color: var(--burnt-orange);\n  }\n  .preview-tab:hover:not(.active) { background: rgba(196,98,42,0.05); }\n",

    animationCSS: "\n  @keyframes widgetAppear {\n    from { opacity: 0; transform: translateY(20px) scale(0.95); }\n    to   { opacity: 1; transform: translateY(0) scale(1); }\n  }\n  @keyframes wMsgIn {\n    from { opacity: 0; transform: translateY(8px); }\n    to   { opacity: 1; transform: translateY(0); }\n  }\n  @keyframes badgeFade {\n    from { opacity: 0; }\n    to   { opacity: 1; }\n  }\n  @keyframes notifPop {\n    from { opacity: 0; transform: translateX(-20px); }\n    to   { opacity: 1; transform: translateX(0); }\n  }\n  @keyframes svgPulse {\n    0%, 100% { opacity: 0.6; transform: scale(1); }\n    50%       { opacity: 1;   transform: scale(1.05); }\n  }\n  @keyframes svgPlugMove {\n    0%, 100% { transform: translateY(0); }\n    50%       { transform: translateY(-3px); }\n  }\n  @keyframes svgSpark {\n    0%, 100% { opacity: 0; transform: scale(0); }\n    50%       { opacity: 1; transform: scale(1); }\n  }\n  @keyframes svgStar {\n    0%, 100% { opacity: 0.3; transform: rotate(0deg) scale(1); }\n    50%       { opacity: 1;   transform: rotate(180deg) scale(1.2); }\n  }\n  @keyframes svgKnob1 {\n    0%, 100% { transform: rotate(0deg); }\n    50%       { transform: rotate(45deg); }\n  }\n  @keyframes svgBar1 {\n    0%, 100% { transform: scaleX(1); }\n    50%       { transform: scaleX(1.15); }\n  }\n  @keyframes svgKnob2 {\n    0%, 100% { transform: rotate(0deg); }\n    50%       { transform: rotate(-30deg); }\n  }\n  @keyframes svgBar2 {\n    0%, 100% { transform: scaleX(1); }\n    50%       { transform: scaleX(0.85); }\n  }\n  @keyframes svgCheckPop {\n    0%   { stroke-dashoffset: 30; opacity: 0; }\n    60%  { opacity: 1; }\n    100% { stroke-dashoffset: 0; opacity: 1; }\n  }\n  @keyframes svgRocketFloat {\n    0%, 100% { transform: translateY(0); }\n    50%       { transform: translateY(-4px); }\n  }\n  @keyframes svgFlame {\n    0%, 100% { transform: scaleY(1);   opacity: 0.8; }\n    50%       { transform: scaleY(1.3); opacity: 1; }\n  }\n  @keyframes svgArcPulse {\n    0%, 100% { opacity: 0.4; }\n    50%       { opacity: 1; }\n  }\n",

    html: "\n      <div class=\"preview-wrap\">\n        <div class=\"preview-chrome\">\n          <div class=\"chrome-bar\">\n            <div class=\"chrome-dots\">\n              <div class=\"chrome-dot r\"></div>\n              <div class=\"chrome-dot y\"></div>\n              <div class=\"chrome-dot g\"></div>\n            </div>\n            <div class=\"chrome-url\">yourbusiness.com.au</div>\n          </div>\n        </div>\n        <div class=\"preview-website\">\n          <div class=\"site-deco-1\"></div>\n          <div class=\"site-deco-2\"></div>\n          <div class=\"site-nav\">\n            <div class=\"site-logo\">\n              <div class=\"site-logo-icon\">🏄</div>\n              <div class=\"site-logo-text\">Aqua Blue Pools</div>\n            </div>\n            <div class=\"site-nav-links\">\n              <span>About</span>\n              <span>Services</span>\n              <span>Gallery</span>\n              <span>Contact</span>\n            </div>\n          </div>\n          <div class=\"site-hero\">\n            <h2>Sydney&#39;s Trusted Pool Builders</h2>\n            <p>Custom pools, renovations &amp; maintenance. Over 20 years of experience delivering dream backyard transformations across Sydney.</p>\n            <a class=\"site-cta\" href=\"#\">Get a Free Quote</a>\n          </div>\n          <div class=\"chatbot-widget\">\n            <div class=\"cw-header\">\n              <div class=\"cw-avatar\">💬</div>\n              <div class=\"cw-header-text\">\n                <div class=\"cw-name\">Aqua Blue Assistant <span class=\"cw-badge\">AI</span></div>\n                <div class=\"cw-status\">● Online now</div>\n              </div>\n              <div class=\"cw-powered\">Powered by StaxAI</div>\n            </div>\n            <div class=\"cw-messages\">\n              <div class=\"cw-msg bot m1\">Hi! I can help you get a quote for a new pool or renovation. What are you looking for?</div>\n              <div class=\"cw-msg user m2\">I need a quote for a pool renovation \u2014 resurfacing and new tiling</div>\n              <div class=\"cw-msg bot m3\">Great! I&#39;d love to help. Can I ask a few quick questions? What&#39;s the approximate size of your pool?</div>\n              <div class=\"cw-msg user m4\">About 8m x 4m, we&#39;re in Cronulla</div>\n              <div class=\"cw-msg bot m5\">Perfect \u2014 we do a lot of work in the Sutherland Shire! For an 8x4 resurface and retile, you&#39;d be looking at \u002412k\u2013\u002418k. Want to book a free on-site consultation?</div>\n            </div>\n            <div class=\"cw-input-area\">\n              <div class=\"cw-input\">Type a message...</div>\n              <button class=\"cw-send\">➤</button>\n            </div>\n          </div>\n          <div class=\"phone-notif\">\n            <div class=\"notif-icon\">🔔</div>\n            <div class=\"notif-text\">\n              <div class=\"notif-title\">🔥 Hot Lead \u2014 James Williams</div>\n              <div class=\"notif-body\">Pool reno in Cronulla, 8x4m, budget \u002415k\u2013\u002418k. Consultation booked Tue 10am.</div>\n              <div class=\"notif-time\">Just now \u2022 via AI Chatbot</div>\n            </div>\n          </div>\n        </div>\n        <div class=\"preview-tabs\">\n          <div class=\"preview-tab active\">⬛ Interactive Preview</div>\n          <div class=\"preview-tab\">▶ Watch Demo Video</div>\n          <div class=\"preview-tab\">🖼 More Screenshots</div>\n        </div>\n      </div>\n"
  }

};
