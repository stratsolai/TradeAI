window.PANEL_TOOL = {
  id: "bi",
  icon: "\uD83D\uDCCA",
  title: ["Business", "Intelligence"],
  tagline: "AI-powered business advisory \u2014 your virtual Board of Directors",
  description: "The Business Intelligence Dashboard analyses everything the platform knows about your business \u2014 Content Library items, accounting data, job management data, tool outputs, and your Business Profile \u2014 to produce actionable insights, risk alerts, and opportunity recommendations. This is not a dashboard of charts. It is an AI that thinks about your business and tells you what you need to know.",
  benefits: [
    "AI advisory across six business modules \u2014 financial health, customers, operations, market intelligence, strategy, and risk",
    "Cross-source insights that connect dots across your accounting, job management, and content data",
    "Risk and opportunity alerts that surface things you would not otherwise notice",
    "Interactive mini-chat \u2014 ask questions about any insight and get tailored advice",
    "Strategic Plan integration \u2014 track progress and align operations with your goals"
  ],
  price: "$69",
  priceId: "price_1T4dClHnoVvjo5gxjSvoi4ky",
  status: "built",
  roi: {
    inputs: [
      { id: "revenue", label: "Monthly Revenue", min: 10000, max: 500000, def: 80000, step: 5000, prefix: "$" },
      { id: "customers", label: "Active Customers", min: 5, max: 200, def: 25, step: 1 },
      { id: "jobs", label: "Jobs Per Month", min: 5, max: 100, def: 20, step: 1 }
    ],
    outputs: [
      { id: "res-risks", label: "Risks Identified" },
      { id: "res-opportunities", label: "Opportunities Found" },
      { id: "res-savings", label: "Potential Savings" },
      { id: "res-growth", label: "Growth Potential" }
    ],
    calculate: function(vals) {
      var revenue = vals["revenue"];
      var customers = vals["customers"];
      var jobs = vals["jobs"];
      var risks = Math.round(customers * 0.12 + jobs * 0.08);
      var opportunities = Math.round(jobs * 0.15 + 2);
      var savings = Math.round(revenue * 0.03);
      var growth = Math.round(revenue * 0.08);
      return {
        "res-risks": risks,
        "res-opportunities": opportunities,
        "res-savings": "$" + savings.toLocaleString(),
        "res-growth": "$" + growth.toLocaleString()
      };
    }
  },
  steps: [
    { icon: "\u26A1", title: "Activate", desc: "Subscribe and your BI Dashboard is ready. It immediately starts analysing your connected data sources." },
    { icon: "\uD83D\uDD17", title: "Connect", desc: "Link your accounting, job management, and other tools. The more you connect, the smarter your insights." },
    { icon: "\uD83D\uDCCA", title: "Insights", desc: "Your AI Board of Directors delivers actionable insights, risk alerts, and opportunity recommendations." }
  ],
  preview: {
    type: "static",
    html: "",
    css: "",
    animationCSS: "",
    videoUrl: "",
    screenshots: [],
    comingSoonLabel: "Dashboard Preview Coming Soon"
  },
  connectionChecklist: true
};

(function() {
  var origRender = window.renderPanel;
  if (!origRender) return;

  window.renderPanel = function(tool) {
    origRender(tool);
    if (tool.id === 'bi' && tool.connectionChecklist) {
      renderBIChecklist();
    }
  };

  function renderBIChecklist() {
    var sb = window.supabaseClient;
    if (!sb) return;

    sb.auth.getUser().then(function(res) {
      var user = res.data && res.data.user;
      if (!user) return;

      Promise.all([
        sb.from('profiles').select('industry, address_state, cl_xero_accounts, cl_quickbooks_accounts, cl_servicem8_accounts, business_name').eq('id', user.id).single(),
        sb.from('content_library').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'approved'),
        sb.from('strategic_plans').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        sb.from('user_tools').select('tool_id').eq('user_id', user.id).eq('tool_id', 'news-digest').eq('is_active', true)
      ]).then(function(results) {
        var profile = results[0].data || {};
        var clCount = results[1].count || 0;
        var spCount = results[2].count || 0;
        var idActive = false;
        if (results[3].data) {
          for (var i = 0; i < results[3].data.length; i++) {
            if (results[3].data[i].tool_id === 'id') idActive = true;
          }
        }

        var hasAccounting = (Array.isArray(profile.cl_xero_accounts) && profile.cl_xero_accounts.length > 0) ||
                            (Array.isArray(profile.cl_quickbooks_accounts) && profile.cl_quickbooks_accounts.length > 0);
        var hasJobMgmt = Array.isArray(profile.cl_servicem8_accounts) && profile.cl_servicem8_accounts.length > 0;
        var hasProfile = !!(profile.industry && profile.address_state);
        var hasCL = clCount > 0;
        var hasSP = spCount > 0;

        var checks = [];
        checks.push({ ok: hasCL, label: 'Content Library' + (hasCL ? ' \u2014 ' + clCount + ' items available for analysis' : ''), hint: hasCL ? '' : 'Add content to your Content Library to enhance analysis' });
        checks.push({ ok: hasProfile, label: 'Business Profile' + (hasProfile ? ' \u2014 Industry: ' + (profile.industry || '') + ', Location: ' + (profile.address_state || '') : ''), hint: hasProfile ? '' : 'Complete your Business Profile in Account settings' });
        checks.push({ ok: hasAccounting, label: 'Accounting' + (hasAccounting ? ' \u2014 Connected' : ''), hint: hasAccounting ? '' : 'Connect Xero, QuickBooks, or MYOB to unlock financial insights' });
        checks.push({ ok: hasJobMgmt, label: 'Job Management' + (hasJobMgmt ? ' \u2014 Connected' : ''), hint: hasJobMgmt ? '' : 'Connect ServiceM8, Buildxact, Fergus, or Tradify for operational insights' });
        checks.push({ ok: hasSP, label: 'Strategic Plan' + (hasSP ? ' \u2014 Plan created' : ''), hint: hasSP ? '' : 'Create your plan to unlock strategic alignment tracking' });
        checks.push({ ok: idActive, label: 'Industry News' + (idActive ? ' \u2014 Active' : ''), hint: idActive ? '' : 'Activate to enhance market intelligence' });

        var fullCount = 0;
        var limitedList = [];
        var fullList = [];
        var moduleMap = {
          2: 'Financial Health',
          3: 'Operational Performance',
          4: 'Market Intelligence',
          5: 'Strategic Alignment'
        };
        if (hasAccounting) { fullList.push('Financial Health'); fullList.push('Customer & Revenue'); } else { limitedList.push('Financial Health'); limitedList.push('Customer & Revenue'); }
        if (hasJobMgmt) { fullList.push('Operational Performance'); } else { limitedList.push('Operational Performance'); }
        if (idActive) { fullList.push('Market Intelligence'); } else { limitedList.push('Market Intelligence'); }
        if (hasSP) { fullList.push('Strategic Alignment'); } else { limitedList.push('Strategic Alignment'); }
        fullList.push('Risk & Opportunity Alerts');

        var html = '<div style="max-width:540px;margin:32px 0 0;padding:28px;border-radius:16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);">';
        html += '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:18px;font-weight:700;color:#fff;margin-bottom:16px;text-transform:uppercase;letter-spacing:1px;">Your Data Sources</div>';
        for (var c = 0; c < checks.length; c++) {
          var item = checks[c];
          var icon = item.ok ? '\u2705' : '\u274C';
          var textColour = item.ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)';
          html += '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">';
          html += '<span style="font-size:16px;line-height:1.4;">' + icon + '</span>';
          html += '<div>';
          html += '<div style="font-size:15px;color:' + textColour + ';font-weight:600;">' + item.label + '</div>';
          if (!item.ok && item.hint) {
            html += '<div style="font-size:13px;color:rgba(255,255,255,0.45);margin-top:2px;">' + item.hint + '</div>';
          }
          html += '</div></div>';
        }
        html += '<div style="margin-top:20px;padding:14px 16px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font-size:14px;color:rgba(255,255,255,0.75);line-height:1.6;">';
        html += 'BI is most powerful with multiple data sources connected. The more you connect, the smarter your insights.';
        if (fullList.length > 0) {
          html += '<div style="margin-top:10px;"><strong style="color:rgba(255,255,255,0.9);">Full access to:</strong> ' + fullList.join(', ') + '</div>';
        }
        if (limitedList.length > 0) {
          html += '<div style="margin-top:4px;"><strong style="color:rgba(255,255,255,0.9);">Limited access to:</strong> ' + limitedList.join(', ') + '</div>';
        }
        html += '</div></div>';

        var descEl = document.getElementById('panel-desc');
        if (descEl) {
          descEl.insertAdjacentHTML('afterend', html);
        }
      }).catch(function(err) {
        console.error('[BI Panel] Checklist error:', err);
      });
    });
  }
})();
