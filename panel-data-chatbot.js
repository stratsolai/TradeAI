window.PANEL_TOOL = {
  id: "chatbot",
  icon: "💬",
  title: ["AI Website", "Chatbot"],
  tagline: "Your 24/7 sales team that never sleeps ✨",
  description: "An AI chatbot answers customer enquiries, qualifies leads, and books jobs – 24/7. It learns your business from your emails, your website, your content library, or FAQs you add yourself. Every answer goes through your approval before it goes live. It keeps learning as it goes.",
  benefits: [
    "Answers customer enquiries 24/7 – even when you are on-site",
    "Qualifies leads and books jobs automatically",
    "Learns from your emails, website and content library",
    "Every FAQ approved by you before it goes live",
    "Gets smarter with every customer interaction"
  ],
  price: "$79",
  status: "built",
  roi: {
    inputs: [
      { id: "visitors", label: "Website Visitors Per Month", min: 100, max: 5000, def: 500, step: 50 },
      { id: "missed", label: "After-Hours Enquiries You Miss", min: 1, max: 100, def: 12, step: 1 },
      { id: "jobval", label: "Average Job Value", min: 500, max: 20000, def: 4500, step: 500, prefix: "$" }
    ],
    outputs: [
      { id: "res-leads", label: "Leads Captured" },
      { id: "res-afterhours", label: "After-Hours Saves" },
      { id: "res-booked", label: "Jobs Booked" },
      { id: "res-revenue", label: "Potential Revenue" }
    ],
    calculate: function(vals) {
      var visitors = vals["visitors"];
      var missed = vals["missed"];
      var jobval = vals["jobval"];
      var leads = Math.round(visitors * 0.04);
      var afterhours = missed;
      var booked = Math.round((leads + afterhours) * 0.85);
      var revenue = booked * jobval;
      return {
        "res-leads": leads,
        "res-afterhours": afterhours,
        "res-booked": booked,
        "res-revenue": "$" + revenue.toLocaleString()
      };
    }
  },
  steps: [
    { icon: "⚡", title: "Activate", desc: "Subscribe and the chatbot is ready to configure from your dashboard." },
    { icon: "⚙️", title: "Settings", desc: "Connect your website, emails, and content library so the AI learns your business." },
    { icon: "🚀", title: "Live", desc: "Paste one line of code on your website and your AI chatbot is live 24/7." }
  ],
  preview: {
    type: "interactive",
    html: "<div class=\"cb-demo\"><div class=\"cb-header\"><span class=\"cb-dot\"></span><span class=\"cb-title\">StaxAI Chat</span></div><div class=\"cb-msgs\" id=\"cb-msgs\"><div class=\"cb-msg cb-bot\">Hi! How can I help you today?</div></div><div class=\"cb-input-row\"><input class=\"cb-input\" id=\"cb-input\" type=\"text\" placeholder=\"Type a message...\"><button class=\"cb-send\" onclick=\"cbSend()\">Send</button></div></div>",
    css: ".cb-demo{background:#1e2d47;border-radius:12px;padding:0;overflow:hidden;max-width:380px;margin:0 auto;font-family:'DM Sans',sans-serif}.cb-header{background:#c4622a;padding:12px 16px;display:flex;align-items:center;gap:8px}.cb-dot{width:10px;height:10px;background:#fff;border-radius:50%;opacity:0.9}.cb-title{color:#fff;font-weight:700;font-size:15px}.cb-msgs{padding:16px;min-height:160px;display:flex;flex-direction:column;gap:10px}.cb-msg{padding:9px 13px;border-radius:10px;font-size:14px;max-width:85%;line-height:1.5}.cb-bot{background:#253554;color:rgba(255,255,255,0.85);align-self:flex-start}.cb-user{background:#c4622a;color:#fff;align-self:flex-end}.cb-input-row{display:flex;gap:8px;padding:12px 16px;background:#172035}.cb-input{flex:1;background:#253554;border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 12px;color:#fff;font-size:14px;outline:none}.cb-send{background:#c4622a;color:#fff;border:none;border-radius:7px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:14px}",
    animationCSS: "",
    videoUrl: "",
    screenshots: [],
    comingSoonLabel: ""
  }
};

function cbSend() {
  var input = document.getElementById("cb-input");
  var msgs = document.getElementById("cb-msgs");
  if (!input || !msgs || !input.value.trim()) return;
  var userMsg = document.createElement("div");
  userMsg.className = "cb-msg cb-user";
  userMsg.textContent = input.value.trim();
  msgs.appendChild(userMsg);
  input.value = "";
  setTimeout(function() {
    var botMsg = document.createElement("div");
    botMsg.className = "cb-msg cb-bot";
    botMsg.textContent = "Thanks for reaching out. Let me find the best solution for you — can I grab your name and number?";
    msgs.appendChild(botMsg);
    msgs.scrollTop = msgs.scrollHeight;
  }, 800);
  msgs.scrollTop = msgs.scrollHeight;
}