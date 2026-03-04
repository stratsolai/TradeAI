# TradeAI Pro — Panel v5 Build Specification
Version: 1.0 — March 2026
Reference: panel-mockup-v5.html (live at trade-ai-seven-blue.vercel.app/panel-mockup-v5.html)
Purpose: Complete build spec for panel.html so it can be rebuilt in any session without reading the mockup file.

---

## ARCHITECTURE
- File: panel.html
- Reads ?tool= URL param to populate content dynamically from tools-data.js
- Slide-up animation on load: panelSlideUp 0.38s cubic-bezier(0.16,1,0.3,1)
- If no ?tool= param: redirect to tools.html
- Back button: if came from same origin go back, else go to tools.html
- CTA buttons link to: login.html?tab=signup&tool=[toolId]

---

## COLOUR PALETTE (v5 Warm)
--burnt-orange: #c4622a   (primary accent, top bar bg, CTA buttons, step labels)
--copper: #d4844a         (warm accents, tagline text, icon gradient)
--gold: #d4a04a           (section labels, warm gradient)
--cream: #e8d5b8          (browser chrome bg in See It In Action)
--deep-blue: #1e3a5f      (ROI card header bg, step 3 card bg)
--navy: #162d4a           (ROI results dark tiles, main page bg)
--steel-blue: #2c5a82     (step cards bg gradient)
--dark-bg: #0d1628        (page background)
--card-bg: #172035        (card backgrounds)
--teal-check: #4a9d8f     (benefit checkmark icons)

---

## SECTION 1: TOP BAR
Fixed at top, full width, background: #c4622a (burnt-orange).
Height: ~44px. Padding: 0 20px.
Layout: flex, space-between, align-center.

LEFT SIDE:
- "← Back" text link (white, 13px, DM Sans, not bold)
- "›" separator (white, opacity 0.6)
- "All Tools" text (white, 13px, opacity 0.8)
- "›" separator (white, opacity 0.6)  
- Tool name e.g. "AI Website Chatbot" (white, 13px, font-weight 600)
- This is populated dynamically: id="panel-breadcrumb" on the tool name span

CENTER (scrolling ticker):
- Pill-shaped container, dark background (#00000033), border-radius 20px
- Left: emoji 🎯 (or similar bundle icon)
- Text cycles/scrolls: "Starter — 3 tools from $197/mo" then "Growth — 6 tools from $374/mo" etc.
- Right: "Bundle →" button — white text, semi-transparent border, border-radius 12px, padding 4px 12px, 12px font

RIGHT SIDE:
- X close button — circular, white border, white X, ~28px diameter
- onclick: window.history.back() or navigate to tools.html

---

## SECTION 2: HERO / TOOL HEADER
Background: dark (#0d1628). Padding: 40px 40px 0 40px. Max-width content area.

ICON:
- Orange rounded square: width 64px, height 64px, border-radius 16px
- Background: linear-gradient(135deg, #d4844a, #c4622a)
- White chat bubble SVG inside (for chatbot tool — other tools use their own SVG)
- Chat bubble SVG: viewBox="0 0 24 24", path: M 20 2 H 4 c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z, fill white
- id="panel-icon" on the outer square div (JS replaces innerHTML with SVG)

BADGES (below icon, flex row, gap 8px):
- "● LIVE NOW" — teal/green background (#1a6b5a or similar dark teal), teal text, green dot, border-radius 20px, padding 4px 14px, 11px font, font-weight 600
- "⚡ QUICK WIN" — dark outline badge, same height, border: 1px solid rgba(255,255,255,0.3), border-radius 20px

TITLE (below badges):
- Line 1: e.g. "AI WEBSITE" — white, Barlow Condensed, ~52px, font-weight 800, uppercase, letter-spacing -1px
- Line 2: e.g. "CHATBOT" — burnt-orange (#c4622a), same font/size
- id="panel-title" on wrapper div, JS sets innerHTML with two spans: class="line1" and class="line2"

TAGLINE:
- Playfair Display, italic, ~20px, colour: #d4844a (copper)
- For chatbot: "Your 24/7 sales team that never sleeps ✨"
- id="panel-tagline"

DESCRIPTION:
- DM Sans, 16px, line-height 1.6, colour: rgba(255,255,255,0.85)
- id="panel-desc"

BENEFITS LIST:
- Each item: teal checkmark SVG (circle with tick, fill #4a9d8f) + text
- DM Sans, 15px, white
- 5 items per tool
- id="panel-benefits", JS populates with li elements

PRICE + CTA ROW:
- Flex row, align-center, gap 16px
- Price: large text e.g. "$79" (Barlow Condensed, 36px, white, bold) + "/mth" (14px, muted)
- id="panel-price" on the price element
- CTA button: "Start 14 Day Free Trial →" — burnt-orange background, white text, border-radius 10px, padding 14px 28px, DM Sans 15px bold
- id="cta-btn" href="login.html?tab=signup&tool=[toolId]"
- ORDER: price FIRST, then button

---

## SECTION 3: ROI CALCULATOR (YOUR IMPACT CALCULATOR)
Outer card: border-radius 20px, overflow hidden, margin: 40px 40px.

HEADER BAR:
- Background: linear-gradient(135deg, #1e3a5f, #2c5a82)
- Padding: 18px 24px
- Left: emoji 📊 (or colourful bar chart emoji) + "YOUR IMPACT CALCULATOR" text
- Text: uppercase, letter-spacing 2px, font-size 13px, font-weight 700, colour white

INPUTS PANEL:
- Background: #fdf6ee (warm cream/off-white)
- Padding: 32px
- Border-radius on bottom portion

Each slider field (3 sliders for chatbot tool):
- Label: uppercase, 11px, letter-spacing 1.5px, colour #8b7355, font-weight 600, margin-bottom 4px
- Value display: Barlow Condensed, 42px, font-weight 700, colour #2d1f0e
  - For dollar values: prefix with $ sign
- Slider input: type="range", custom styled
  - Track: gradient from burnt-orange left of thumb to light grey right
  - Thumb: burnt-orange circle, ~20px
  - Full width

CHATBOT TOOL SLIDERS:
1. Label: "WEBSITE VISITORS PER MONTH", min:100, max:5000, default:500, step:50, no prefix
2. Label: "AFTER-HOURS ENQUIRIES YOU MISS", min:1, max:50, default:12, step:1, no prefix
3. Label: "AVERAGE JOB VALUE", min:500, max:20000, default:4500, step:500, prefix: "$"

RESULTS SECTION:
- Label above: "YOUR MONTHLY RESULTS" — uppercase, 11px, letter-spacing 2px, centred, colour #8b7355
- 2x2 grid of result tiles
- Tile 1 (top-left): ORANGE bg (#c4622a), large number, label "LEADS CAPTURED" — id result-leads
- Tile 2 (top-right): DARK BLUE bg (#1e3a5f), large number, label "AFTER-HOURS SAVES" — id result-afterhours  
- Tile 3 (bottom-left): DARK BLUE bg (#1e3a5f), large number, label "JOBS BOOKED" — id result-jobs
- Tile 4 (bottom-right): ORANGE bg (#c4622a), large number with $ prefix, label "POTENTIAL REVENUE" — id result-revenue
- Numbers: Barlow Condensed, 48px, white, bold
- Labels: uppercase, 11px, letter-spacing 1px, white opacity 0.8

CHATBOT CALCULATION LOGIC:
- leads = Math.round(visitors * 0.08)
- afterHours = missedEnquiries  
- jobs = Math.round(missedEnquiries * 0.4) (note: uses missedEnquiries not leads... was 20 from 12 in mockup... actually Math.round(missedEnquiries * 1.67))
  - Actually from mockup: visitors=500, missed=12, jobval=4500 → leads=40, afterhours=12, jobs=20, revenue=90k
  - So: leads = visitors * 0.08, afterhours = missed, jobs = Math.round(missed * 1.67), revenue = jobs * jobval
- revenue displayed as e.g. "90k" (divide by 1000, append k) if >= 1000

---

## SECTION 4: SEE IT IN ACTION
Background: dark (#0d1628). Padding: 80px 40px.

SECTION LABEL (centred):
- "—— SEE IT IN ACTION ——" in burnt-orange, uppercase, 12px, letter-spacing 3px
- Decorative lines either side (CSS or em-dashes)

HEADING (centred):
- Line 1: "What Your Customers" — white, Playfair Display or similar serif, ~40px
- Line 2: "Will Experience" — burnt-orange (#c4622a), same font/size, italic weight
- Combined: large centred heading

SUBHEADING (centred):
- "A real conversation — AI qualifying a lead while you're on-site"
- Italic, colour rgba(255,255,255,0.6), ~16px

BROWSER MOCKUP:
- Outer container: cream/warm background (#e8d5b8 or similar), border-radius 16px, max-width ~860px, centred, margin-top 40px
- Browser chrome row at top: 3 circles (red #ff5f57, yellow #ffbd2e, green #28c840) + address bar (white, rounded, "yourbusiness.com.au" text)
- Website content inside browser: dark blue background (#162d4a or similar)
  - Left panel: business name/logo area + heading "Sydney's Trusted Pool Builders" (bold white) + description text + orange CTA button "Get a Free Quote →"
  - Right panel: chat widget showing conversation:
    - User message (dark blue pill): "new tiling"
    - Bot response (white bubble): "Great! I'd love to help. Can I ask a few quick questions? What's the approximate size of your pool?"
    - User message with badge: "About 8m x 4m, we're in" + "⚡ Powered by TradeAI Pro" badge below
    - Bot response: price range info + consultation offer
    - Input bar at bottom: "Type a message..." + orange send button (circle with arrow)

TAB BAR below browser:
- Cream background, border-radius 12px, padding 12px 20px, max-width ~860px, centred
- 3 tabs: "📱 Interactive Preview" (active — white bg, shadow), "▶ Watch Demo Video", "📸 More Screenshots"
- Active tab: white background, slight shadow, rounded

CAPTION below tabs:
- "✦ This is how it actually looks on your website ✦"
- Small, centred, muted colour, with decorative stars

---

## SECTION 5: HOW IT WORKS
Background: dark (#0d1628). Padding: 80px 40px.

SECTION LABEL (centred):
- "—— HOW IT WORKS ——" burnt-orange, uppercase, 12px, letter-spacing 3px

HEADING (centred):
- "Live in Minutes, " (Playfair Display or serif, italic, burnt-orange/copper, ~40px) + "Not Days" (white, bold, same size)
- Combined on one line

STEPS GRID:
- 3 cards in a row (or 2+1 on mobile)
- Card 1 and 2: warm cream background (#fdf6ee), border-radius 16px, padding 32px 24px, text-align center
- Card 3: light blue-grey background (#dce8f5 or similar), border-radius 16px

Each card structure:
- Step number badge: orange rounded square (~32px), white number text, positioned top-centre
- SVG illustration (tool-specific, ~60px)
- Step label: uppercase, burnt-orange, letter-spacing 2px, font-weight 700, 13px (e.g. "ACTIVATE", "SETTINGS", "LIVE")
- Description: DM Sans, 14-15px, centred, dark text (#3d2b1f or similar), line-height 1.5

CHATBOT STEPS:
Step 1 — ACTIVATE:
- Icon: plug/socket SVG (electrical plug outline, brown/burnt-orange colour)
- Text: "Start your free trial and connect your Gmail or website — AI reads your business and creates FAQs in minutes"

Step 2 — SETTINGS:
- Icon: settings/sliders SVG (horizontal sliders with dots, with green checkmark badge top-right)
- Text: "Set your greeting, tone, and booking preferences. Review AI-suggested answers — nothing goes live without your OK"

Step 3 — LIVE:
- Icon: rocket SVG (illustrated rocket with orange flames, small dots around)
- Background: light blue-grey (#dce8f5)
- Step number badge: darker steel blue (#2c5a82) instead of orange
- Text: "Your chatbot is live on your website — qualifying leads, booking jobs, and notifying you of hot prospects 24/7"

---

## SECTION 6: PRICING FOOTER CARD
Centred card, max-width ~460px, margin: 40px auto 80px auto.
Background: dark brown/near-black with slight warm tint (#1a0f08 or #2a1505), border-radius 20px.
Orange top border: 2px solid #c4622a at very top, OR the card has an orange border all around with slight glow.
Padding: 48px 40px.
Text-align: centre.

PRICE:
- Large: e.g. "$79" — Barlow Condensed, ~72px, font-weight 800
- Colour: #e8c49a (warm cream/peach — NOT pure white)
- "/mth" is NOT shown here (it's shown in the hero section instead)
- Below price: "per month" in italic, copper/gold colour (#d4844a), ~18px, Playfair Display

CHECKMARK ROW:
- "✓ Cancel anytime" — small, white/muted, centred, ~14px

CTA BUTTON:
- "Start 14 Day Free Trial →"
- Full width of card (or close to it)
- Background: #c4622a (burnt-orange)
- White text, DM Sans, 16px, font-weight 600
- Border-radius: 12px
- Padding: 16px
- Margin-top: 24px
- id="cta-btn-footer"

---

## DYNAMIC POPULATION — JS LOGIC
On DOMContentLoaded:
1. Parse ?tool= from URL
2. Find tool in CORE_TOOLS array (from tools-data.js)
3. If not found: redirect to tools.html
4. Set document.title = tool.title[0] + ' ' + tool.title[1] + ' | TradeAI Pro'
5. Set panel-breadcrumb innerHTML = tool.title[0] + ' ' + tool.title[1]
6. Set panel-icon: inject SVG based on tool.toolId (or use tool.icon emoji as fallback)
7. Set live badge: show if tool.status === 'built', hide if 'pending'
8. Set panel-title innerHTML: '<span class="line1">' + tool.title[0] + '</span><br><span class="line2">' + tool.title[1] + '</span>'
9. Set panel-tagline textContent = tool.tagline
10. Set panel-desc textContent = tool.desc
11. Set panel-benefits innerHTML: tool.benefits.map(b => '<li>..checkmark svg.. ' + b + '</li>').join('')
12. Set panel-price innerHTML: tool.price + '<span>/mth</span>'
13. Set cta-btn and cta-btn-footer href = 'login.html?tab=signup&tool=' + tool.toolId
14. Render ROI calculator from tool.roi.inputs array
15. Attach ROI slider event listeners — update values and recalculate on input
16. ROI calculate: call new Function() with slider values, update result tiles
17. Render steps from tool.steps array

ICON SVG MAP (by toolId):
- chatbot: white chat bubble (M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z)
- social: camera/image icon
- email: envelope icon
- strategic-plan: chart/graph icon
- news-digest: newspaper icon
- bi: bar chart icon
- All others: use tool.icon emoji inside the orange square

---

## CSS CLASS NAMES (must match exactly)
.panel-topbar — fixed top bar
.topbar-left — breadcrumb area
.topbar-center — scrolling bundle ticker
.topbar-right — X close button
.panel-hero — hero section container
.tool-meta — icon + badges area
.tool-icon-wrap — orange square containing SVG
.tool-badges — flex row of badges
.badge-live — LIVE NOW badge
.badge-quickwin — QUICK WIN badge
.tool-title — title wrapper (line1 + line2 spans)
.tool-tagline — italic tagline
.tool-desc — description paragraph
.benefits-list — ul of benefits
.benefit-item — li with checkmark + text
.benefit-icon — teal checkmark SVG
.cta-row — price + button row
.btn-cta-primary — orange trial button
.roi-card — outer ROI card
.roi-header — dark blue header bar
.roi-body — cream inputs area
.calc-field — each slider group
.calc-label — uppercase slider label
.calc-value — large number display
.range-slider — styled range input
.roi-results-label — YOUR MONTHLY RESULTS text
.roi-results — 2x2 grid of result tiles
.result-item — individual result tile
.result-item.orange — orange variant
.result-item.dark — dark blue variant
.result-number — large number in tile
.result-label — small label in tile
.see-it-section — See It In Action container
.section-label — orange "—— LABEL ——" text
.section-heading — large centred heading
.browser-mockup — outer cream browser container
.browser-chrome — top bar with circles + address bar
.browser-content — dark website content area
.chat-widget — right side chat panel
.preview-tabs — tab bar below browser
.steps-section — How It Works container
.steps-grid — 3-column grid
.step-card — individual step card
.step-card.step-3 — light blue card (3rd step)
.step-number — orange badge with number
.step-icon — SVG illustration area
.step-label — uppercase step title
.step-desc — description text
.pricing-footer — bottom pricing card section
.price-card — dark brown card
.price-big — large price number
.price-period — "per month" italic text
.price-cancel — cancel anytime line
