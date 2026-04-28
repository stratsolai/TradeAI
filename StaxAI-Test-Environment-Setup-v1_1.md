# StaxAI
# TEST ENVIRONMENT SETUP GUIDE
## Complete test data environment for end-to-end platform testing

| Item | Detail |
|------|--------|
| Version | v1.1 — April 2026 |
| Purpose | Create a realistic, internally-consistent test business for full platform testing |
| Target Completion | 1 week setup, then ongoing testing |
| Test Business | Coastal Built Pty Ltd — Residential Builder, Mid North Coast NSW |

---

## 1. The Test Business

### 1a. Business Profile

| Field | Value |
|-------|-------|
| Legal Name | Coastal Built Pty Ltd |
| Trading Name | Coastal Built |
| ABN | 12 345 678 901 |
| Business Structure | Company |
| Industry | Residential Building & Construction |
| Location | Port Macquarie, NSW 2444 |
| Years in Business | 12 years (established 2014) |
| Team Size | 8 (owner + 7 employees) |
| Annual Revenue | ~$2.4M |
| Website | www.coastalbuilt.com.au (fictional) |

### 1b. Business Description

Coastal Built is a mid-sized residential builder operating on the Mid North Coast of NSW, primarily servicing Port Macquarie, Wauchope, Kempsey, and surrounding areas. The company specialises in custom homes, knockdown-rebuilds, renovations, and coastal-style builds suited to the region.

The business has grown steadily over 12 years, with a strong reputation for quality craftsmanship and reliability. Owner-operator James Mitchell holds a NSW Builder Licence (Class 1) and manages a team including a site supervisor, four carpenters, an apprentice, and an office administrator.

### 1c. Services Offered

- Custom new home builds ($400K - $1.2M)
- Knockdown and rebuild projects
- Major renovations and extensions
- Deck and outdoor living spaces
- Granny flats and secondary dwellings
- Project management for owner-builders

### 1d. Target Customers

- Homeowners planning custom builds
- Sea-changers relocating to the Mid North Coast
- Families upgrading or extending existing homes
- Investors building granny flats for rental income
- Retirees downsizing with knockdown-rebuild

### 1e. Key Team Members

| Name | Role | Notes |
|------|------|-------|
| James Mitchell | Owner / Director | Holds Builder Licence, 25 years in industry |
| Sarah Mitchell | Office Manager | Handles admin, invoicing, scheduling |
| Dave Thompson | Site Supervisor | 15 years experience, manages day-to-day site ops |
| Mark Ellis | Lead Carpenter | 10 years with company |
| Chris Nguyen | Carpenter | 5 years with company |
| Ben O'Brien | Carpenter | 3 years with company |
| Jake Sullivan | Carpenter | 2 years with company |
| Tyler James | Apprentice | 2nd year apprenticeship |

---

## 2. Systems to Set Up

Each system below needs to be created/configured and connected to StaxAI. The data across all systems must be internally consistent (same customers, same jobs, same suppliers).

### 2a. Email (Gmail)

| Item | Detail |
|------|--------|
| Account to create | coastalbuilt.demo@gmail.com (or similar available name) |
| Purpose | Test email scanning, Content Library imports, supplier monitoring |
| Content needed | 40-50 emails covering: customer enquiries, quote requests, supplier invoices, licence reminders, council correspondence, subcontractor comms, tender notifications |
| Setup method | Create Gmail account, then send emails TO this account from another account to simulate received mail |

Claude will generate: 40-50 realistic email subjects and bodies as a document. You'll need to send these to the Gmail account to populate the inbox.

### 2b. Google Drive

| Item | Detail |
|------|--------|
| Account | Same Google account as Gmail above |
| Purpose | Test drive imports, document scanning, Content Library population |
| Content needed | Business documents including: quotes, contracts, scope of works, safety plans, insurance certificates, licence copies, site photos, council approvals, subcontractor agreements |
| Setup method | Upload documents to Drive, organise in folders |

Claude will generate: Document templates and content for 30-40 files. You'll download and upload to Drive.

### 2c. Accounting — Xero

| Item | Detail |
|------|--------|
| Account type | Xero Demo Company OR Xero Partner Sandbox |
| Purpose | Test accounting integration, financial insights, BI Module 1-2 |
| Content needed | 12 months of realistic data: 60-80 invoices, 100+ bills, customer contacts, supplier contacts, chart of accounts, bank transactions |
| Setup method | Option A: Use Xero Demo Company (pre-populated, generic). Option B: Partner Sandbox with manual/CSV import of custom data |

Xero Demo Company: Xero provides a pre-populated demo company for testing. The data is generic (not construction-specific) but functional. Good for quick setup.

Xero Partner Sandbox: If you have Xero Partner status, you get sandbox access where you can create custom data. More work but more realistic.

Claude will generate: Customer list (25 contacts), supplier list (15 contacts), and invoice/bill data as CSV files ready for import. Also bank transaction descriptions for reconciliation testing.

### 2d. Job Management — ServiceM8

| Item | Detail |
|------|--------|
| Account type | ServiceM8 Trial or Demo Mode |
| Purpose | Test job management integration, operational insights, BI Module 3 |
| Content needed | 50-80 jobs across various statuses: completed, in progress, quoted, scheduled. Mix of job types and values. |
| Setup method | Create trial account, manually enter jobs OR check if CSV import available |

Claude will generate: Job list with descriptions, values, dates, statuses, and customer links. Format TBC based on ServiceM8 import capabilities.

### 2e. Social Media — Meta (Facebook & Instagram)

| Item | Detail |
|------|--------|
| Accounts needed | Facebook Page (test), Instagram Business Account (test), Meta Business Portfolio |
| Purpose | Test social posting, scheduling, Facebook/Instagram connection, Predis graphics |
| Content needed | Business Profile with brand colours, tone of voice, tagline populated. CL Projects with 5-10 test customers/projects for Customer Story journeys |
| Setup method | Create test Facebook Page, connect Instagram Business, link to Meta Business Portfolio, connect to StaxAI via OAuth |

Note: Meta App Review must be completed before OAuth connections work for non-test users. For testing, add the test account as a test user in the Meta Developer Console.

### 2f. Chatbot — Test Website

| Item | Detail |
|------|--------|
| Accounts needed | Test website or HTML page to embed chatbot widget |
| Purpose | Test chatbot widget embedding, lead capture, AI responses, notification emails |
| Content needed | Business Profile populated, Knowledge Base content in Content Library |
| Setup method | Create simple test HTML page (can be a local file or hosted on any free static host), embed chatbot widget code, test conversations |

### 2g. Design Visualiser — REimagine Home API

| Item | Detail |
|------|--------|
| Accounts needed | REimagine Home API key (pending — email sent) |
| Purpose | Test design visualisation, before/after generation, style transfers |
| Content needed | Sample property/room photos for testing, Business Profile with brand colours |
| Setup method | Configure API key in Vercel env vars, upload test images |

Note: DV API integration is blocked on REimagine Home API access. Skip DV testing until API access is confirmed.

### 2h. StaxAI Platform

| Item | Detail |
|------|--------|
| Account | New test user account in StaxAI |
| Business Profile | Populated with Coastal Built details including brand colours, tone of voice, tagline |
| Connections | Gmail, Google Drive, Xero, ServiceM8, Facebook, Instagram all connected |
| Tools to test | All tools — BI, Strategic Plan, Industry News, Email Assistant, Social Media, Chatbot, Design Visualiser |
| Content Library | Populated via email scans, drive imports, tool outputs |

---

## 3. Data Claude Will Generate

The following data sets will be created to populate the test environment. All data is internally consistent — the same customers, suppliers, and jobs appear across all systems.

### 3a. Customer List (25 contacts)

Mix of customer types for a residential builder:

- 10 x Custom home build clients (high value, $400K-$1M+)
- 5 x Renovation/extension clients (mid value, $80K-$250K)
- 5 x Deck/outdoor living clients (lower value, $25K-$60K)
- 3 x Granny flat clients (mid value, $120K-$180K)
- 2 x Project management only clients

Each customer record includes: Name, address (Mid North Coast NSW), phone, email, job history summary, total revenue.

### 3b. Supplier List (15 contacts)

Realistic suppliers for a residential builder:

- Timber & building materials: Mitre 10 Port Macquarie, Bowens
- Electrical: Local electrical subcontractor
- Plumbing: Local plumbing subcontractor
- Concrete: Mid North Coast Concrete
- Roofing: Coastal Roofing Solutions
- Windows/doors: Wideline Windows, Corinthian Doors
- Kitchen/bathroom: Local suppliers
- Scaffolding hire
- Skip bins / waste removal
- Insurance broker
- Accountant

### 3c. Job History (60 jobs)

12 months of job data with realistic distribution:

| Status | Count | Description |
|--------|-------|-------------|
| Completed | 35 | Finished jobs with invoices paid |
| In Progress | 8 | Active jobs on site |
| Quoted | 12 | Quotes sent, awaiting response |
| Scheduled | 5 | Jobs booked, not yet started |

Each job includes: Customer link, job type, description, quoted value, actual value (if complete), start date, completion date, site address, status, notes.

### 3d. Invoice Data (65 invoices)

Matching the job history:

- Progress claims for large builds (multiple invoices per job)
- Final invoices for completed jobs
- Mix of paid, overdue, and outstanding
- Realistic payment patterns (some slow payers)

### 3e. Bill Data (120 bills)

Supplier bills matching job activity:

- Materials purchases linked to jobs
- Subcontractor invoices
- Regular overheads (insurance, phone, subscriptions)
- Mix of paid and outstanding

### 3f. Email Content (45 emails)

Realistic inbox for a builder:

| Category | Count | Examples |
|----------|-------|----------|
| Customer enquiries | 10 | New build enquiry, quote request, variation request |
| Supplier/subcontractor | 12 | Invoice attached, quote for materials, availability check |
| Council/compliance | 5 | DA approval, inspection booking, compliance certificate |
| Licencing/insurance | 4 | Licence renewal reminder, insurance certificate, CPD reminder |
| Industry/tenders | 6 | HIA newsletter, tender notification, industry news |
| Internal/staff | 5 | Site update, leave request, safety issue |
| General business | 3 | Accountant, bank, software subscription |

### 3g. Drive Documents (35 files)

Organised folder structure with realistic documents:

| Folder | Contents |
|--------|----------|
| /Quotes | 5-6 quote documents (PDF style) |
| /Contracts | 3-4 signed contracts |
| /Insurance | Public liability, workers comp, contract works certificates |
| /Licences | Builder licence, WHS cards, trade certificates |
| /Safety | WHS policy, site safety plan, SWMS templates |
| /Projects/[ClientName] | Project-specific docs: scope, variations, photos, approvals |
| /Suppliers | Subcontractor agreements, credit applications |
| /Templates | Quote template, contract template, variation form |

### 3h. CL Projects Data (10 project records)

Test project records for the Content Library Projects tab and SM Customer Story journeys:

| Project | Customer | Type | Status | Testimonial |
|---------|----------|------|--------|-------------|
| Harris Beach House | Tom & Lisa Harris | Custom build | Completed | "Coastal Built made our dream home a reality. James and the team were professional from start to finish." |
| Peterson Renovation | Mark Peterson | Major renovation | Completed | "We could not be happier with our renovation. The attention to detail was outstanding." |
| Chen Granny Flat | David Chen | Granny flat | Completed | "Quick, clean, and exactly what we wanted. Great value for money." |
| Williams Deck | Karen Williams | Deck/outdoor | Completed | "The deck has completely transformed our outdoor area. We use it every day." |
| O'Neill Extension | Patrick O'Neill | Extension | Completed | "From quote to completion, Coastal Built delivered on every promise." |
| Murphy Kitchen | Angela Murphy | Renovation | Completed | Placeholder — no testimonial yet |
| Baxter New Home | Craig & Jenny Baxter | Custom build | In Progress | N/A — project ongoing |
| Tan Knockdown | Michael Tan | Knockdown-rebuild | In Progress | N/A — project ongoing |
| Stewart Granny Flat | Louise Stewart | Granny flat | Quoted | N/A — not started |
| Davies Outdoor Living | Rob Davies | Deck/outdoor | Scheduled | N/A — not started |

Each record includes: customer_name, customer_email, customer_phone, customer_website (where applicable), services_provided, project_value, project_status, testimonial_text, logo_permission (false by default).

### 3i. Sample Photos for SM Testing

Photos needed for social media Journey testing:

| Category | Count | Description |
|----------|-------|-------------|
| Completed job photos | 5-6 | Finished builds — exterior and interior shots |
| Team/workspace photos | 3-4 | Team on site, workshop, tools, morning briefing |
| Product/material photos | 2-3 | Timber frames, custom cabinetry, outdoor decking |
| Before/after pairs | 2-3 | Renovation before and after (same angle) |
| Event/promotional | 1-2 | Open home, display village, trade show |

Source: Use royalty-free stock photos from Unsplash or Pexels tagged with construction, building, renovation, or Australian homes. Save to Google Drive /Photos folder.

### 3j. Sample Photos for DV Testing

Photos needed for Design Visualiser testing:

| Category | Count | Description |
|----------|-------|-------------|
| Room interiors | 5-6 | Living room, kitchen, bathroom, bedroom, outdoor area |
| Property exteriors | 3-4 | Front elevation, side view, streetscape |
| Style references | 2-3 | Coastal style, modern minimalist, Hamptons style |

Source: Use royalty-free stock photos from Unsplash or Pexels. Save to Google Drive /DV-Test-Images folder.

---

## 4. Setup Sequence

Complete these steps in order. Allow approximately 1 week for full setup.

### Phase 1: Create Accounts (Day 1)

1. Create Gmail account: coastalbuilt.demo@gmail.com
2. Create Google Drive folders in same account
3. Set up Xero Demo Company or Partner Sandbox
4. Create ServiceM8 trial account
5. Create test Facebook Page for Coastal Built
6. Connect Instagram Business account to Facebook Page
7. Link both to Meta Business Portfolio
8. Create new StaxAI test user account

### Phase 2: Generate Data (Day 2-3)

1. Request Claude generate customer list — review and refine
2. Request Claude generate supplier list — review and refine
3. Request Claude generate job history — review and refine
4. Request Claude generate invoice/bill data — review and refine
5. Request Claude generate email content — review and refine
6. Request Claude generate drive documents — review and refine
7. Request Claude generate CL Projects data — review and refine
8. Download sample photos for SM and DV testing

### Phase 3: Populate Systems (Day 4-5)

1. Xero: Import or enter contacts, invoices, bills
2. ServiceM8: Enter jobs, link to customers
3. Gmail: Send generated emails to test inbox
4. Google Drive: Upload generated documents and photos
5. StaxAI: Complete Business Profile for Coastal Built (including brand colours, tone of voice, tagline via Marketing Theme wizard)

### Phase 4: Connect & Test (Day 6-7)

**Core Platform:**

1. Connect Gmail to StaxAI — run email scan
2. Connect Google Drive to StaxAI — import documents
3. Connect Xero to StaxAI — verify financial data flows
4. Connect ServiceM8 to StaxAI — verify job data flows
5. Activate BI tool — verify all modules populate
6. Create Strategic Plan — verify SP flow
7. Test Industry News with Construction industry

**Email Assistant (EA):**

8. Connect Gmail in EA Settings
9. Run email scan — verify emails appear in EA
10. Test email flagging/starring — verify flag persists in Gmail
11. Test email categorisation — verify categories assigned correctly
12. Test reply suggestions — verify AI generates relevant suggestions
13. Test batch processing — flag/categorise multiple emails
14. Verify scanned emails appear in Content Library imports

**Social Media Manager (SM):**

15. Connect Facebook Page in SM Settings — verify Connected status
16. Connect Instagram Business in SM Settings — verify Connected status
17. Create a Finished Job Post — test full Journey wizard flow
18. Create a Customer Story/Testimonial — test CL Projects integration
19. Create a Behind the Scenes post — test media upload
20. Create an Industry Insight post — test News Digest integration
21. Test Save as Draft flow — verify post appears in Drafts tab
22. Test Schedule for Later flow — verify post appears in Scheduled tab with correct date/time
23. Test Post Now flow — verify post publishes to Facebook and appears in Published tab
24. Test Campaign wizard — create Marketing Plan, review posts, approve, launch
25. Verify posts appear in correct management tabs (Drafts, Scheduled, Published)
26. Verify calendar view in Scheduled tab shows posts on correct dates
27. Test campaign management — pause, resume, end campaign

**Chatbot:**

28. Configure chatbot settings — greeting message, brand colours, knowledge sources
29. Generate embed code from chatbot settings
30. Create test HTML page and embed chatbot widget code
31. Test visitor conversation flow — ask questions about Coastal Built services
32. Verify lead capture — submit name/email/phone via chatbot and check database
33. Verify notification email sends when lead is captured
34. Test widget appearance on mobile (resize browser or use device)

**Design Visualiser (DV):**

35. Upload test room/property image
36. Generate visualisation with different styles (coastal, modern, Hamptons)
37. Test before/after comparison view
38. Test download functionality
39. Test save to Content Library
40. Verify mobile responsiveness

Note: DV testing steps 35-40 are blocked until REimagine Home API access is confirmed. Skip and return when available.

**End-to-End:**

41. Verify all tool outputs appear in Content Library Tool Outputs tab
42. Verify Business Profile data is used correctly across all tools
43. Verify session expiry redirects to login from all tools
44. Test all tools on mobile (social.html, email-assistant.html, news-digest.html)

---

## 5. Data Consistency Rules

All generated data must follow these rules to ensure internal consistency:

### 5a. Customer Consistency

- Same customer names appear in: Xero contacts, ServiceM8 clients, emails, job records, CL Projects
- Customer addresses are real Mid North Coast NSW locations
- Invoice totals per customer match job values

### 5b. Job Consistency

- Every completed job has corresponding invoice(s)
- Job values are realistic for the work type
- Job dates create a realistic 12-month timeline
- In-progress jobs have progress claims but not final invoices

### 5c. Supplier Consistency

- Same supplier names appear in: Xero contacts, bills, emails
- Bill amounts are realistic for a builder's costs
- Material purchases roughly correlate with job activity

### 5d. Timeline Consistency

- All data covers the same 12-month period
- Seasonal patterns reflect construction industry (slower Dec-Jan)
- Recent data (last 30-90 days) is most detailed for BI testing

### 5e. CL Projects Consistency

- CL Projects customer names match Xero/ServiceM8 customer records
- Completed projects have testimonial text where noted
- Project values match corresponding Xero invoices
- Project statuses match ServiceM8 job statuses

---

## 6. What You'll Need to Do Manually

Some tasks cannot be automated and require manual effort:

| Task | Effort | Notes |
|------|--------|-------|
| Create Gmail account | 5 min | Standard Google signup |
| Send emails to test inbox | 30-60 min | Copy/paste email content, send from another account |
| Upload files to Drive | 15 min | Download generated files, upload to folders |
| Download sample photos | 15 min | From Unsplash/Pexels for SM and DV testing |
| Xero data entry | 1-3 hours | Depends on import options available |
| ServiceM8 job entry | 1-2 hours | Manual entry unless import available |
| StaxAI Business Profile | 15 min | Fill in form with Coastal Built details including Marketing Theme wizard |
| Create test Facebook Page | 10 min | Create Page, add profile image, basic info |
| Connect Instagram Business | 10 min | Link Instagram Business account to Facebook Page |
| Create test HTML for chatbot | 10 min | Simple HTML page with widget embed code |
| Connect integrations | 30 min | OAuth flows for each connection (Gmail, Drive, Xero, ServiceM8, Facebook, Instagram) |
| Testing | 4-6 hours | End-to-end testing across all tools |

Total estimated manual effort: 8-14 hours spread across setup week.

---

## 7. Next Steps

When you're ready to begin setup:

1. Confirm this plan works for your needs
2. Create the accounts (Gmail, Xero, ServiceM8, Facebook Page, Instagram Business, StaxAI test user)
3. Return to Claude and request each data set in turn:
   - "Generate the customer list for Coastal Built"
   - "Generate the supplier list for Coastal Built"
   - "Generate the job history for Coastal Built"
   - "Generate the email content for Coastal Built"
   - "Generate the drive documents for Coastal Built"
   - "Generate the CL Projects data for Coastal Built"
4. Review each data set, request refinements if needed
5. Download sample photos from Unsplash/Pexels
6. Populate the systems
7. Connect to StaxAI and test

This test environment can also be used for demos, screenshots, video walkthroughs, and marketing materials. Keep the data realistic and professional.

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | April 2026 | Initial document. Core platform testing: Gmail, Google Drive, Xero, ServiceM8, BI, Strategic Plan, Industry News. |
| v1.1 | April 2026 | Added Social Media Manager (Section 2e, 3h, 3i, Phase 4 steps 15-27). Added Chatbot (Section 2f, Phase 4 steps 28-34). Added Email Assistant testing steps (Phase 4 steps 8-14). Added Design Visualiser (Section 2g, 3j, Phase 4 steps 35-40). Added CL Projects test data (Section 3h). Added sample photos for SM and DV (Sections 3i, 3j). Updated Phase 1/2/3 with new accounts and data sets. Updated manual effort estimates. Added end-to-end cross-tool testing (Phase 4 steps 41-44). Added CL Projects consistency rules (Section 5e). |

End of document.
