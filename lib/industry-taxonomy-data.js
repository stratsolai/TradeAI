// lib/industry-taxonomy-data.js — Services, Products, and Licences for
// each of the 39 industries in the v2.0 taxonomy. Imported by
// lib/industry-taxonomy.js, which exposes the lookup/merge helpers
// consumers call. Per Industry Taxonomy Spec v2.0 §9 and the owner-
// approved Phase 8 mapping (StaxAI-Phase8-Services-Products-Licences-
// Mapping-Proposal-v1_0).
//
// Keyed by industry id (kebab-case matching lib/industry-taxonomy.js).
// Sub-group names that need to coalesce across industries — Site Safety
// Tickets, Industry Memberships, Background Checks — are spelled
// identically wherever they appear so the picker's _mergeGrouped helper
// dedupes them correctly.
//
// Split from lib/industry-taxonomy.js purely for file-size reasons
// (60K-per-file platform ceiling per CLAUDE.md). Logically a single
// source of truth.

export const SERVICES = {

  'building-and-construction': {
    'New Builds & Extensions': ['New Home Construction', 'Home Extensions', 'Granny Flat / Secondary Dwelling', 'Commercial Fit-out', 'Shop Fit-out', 'Office Fit-out'],
    'Renovations & Alterations': ['Renovation (Full Home)', 'Renovation (Single Room)', 'Structural Alterations', 'Load-Bearing Wall Removal', 'Kitchen Cabinetry', 'Bathroom Renovation', 'Laundry Renovation', 'Heritage Restoration'],
    'Carpentry & Joinery': ['Carpentry (Structural)', 'Carpentry (Finish)', 'Framing', 'Custom Joinery', 'Built-in Wardrobes', 'Staircase Construction'],
    'Roofing & Cladding': ['Roofing (New)', 'Roofing (Repairs)', 'Cladding Installation', 'Insulation Installation', 'Weatherboard Repairs'],
    'Doors & Windows': ['Door Installation', 'Window Installation'],
    'Outdoor Structures': ['Pergola Construction', 'Carport Construction', 'Garage Construction', 'Retaining Walls (Structural)'],
    'Site Works & Foundations': ['Demolition (Full)', 'Demolition (Partial)', 'Underpinning', 'Restumping'],
    'Project Services': ['Project Management', 'Site Supervision', 'Defect Rectification']
  },

  'plumbing-and-gas': {
    'General Repairs': ['General Plumbing Repairs', 'Tap Repairs & Replacement', 'Toilet Repairs & Replacement', 'Cistern Repairs', 'Leak Detection', 'Burst Pipe Repairs', 'Pipe Relining', 'Repiping (Full Home)'],
    'Drains & Stormwater': ['Blocked Drain Clearing', 'Drain Camera Inspection', 'Drain Relining', 'Sewer Line Repairs', 'Stormwater Drainage'],
    'Hot Water Systems': ['Hot Water System Installation (Electric)', 'Hot Water System Installation (Gas)', 'Hot Water System Installation (Solar)', 'Hot Water System Installation (Heat Pump)', 'Hot Water System Repairs'],
    'Gas Fitting': ['Gas Fitting (General)', 'Gas Appliance Installation', 'Gas Appliance Repairs', 'Gas Leak Detection', 'Gas Line Installation', 'Gas Compliance Certificate'],
    'Bathroom & Kitchen': ['Bathroom Renovation (Plumbing)', 'Kitchen Plumbing', 'Laundry Plumbing', 'Dishwasher Installation', 'Washing Machine Installation', 'Water Filter Installation'],
    'Roof & Rainwater': ['Roof Plumbing', 'Gutter Installation', 'Gutter Repairs', 'Gutter Cleaning', 'Downpipe Installation', 'Rainwater Tank Installation'],
    'Backflow & Compliance': ['Backflow Prevention Installation', 'Backflow Testing'],
    'Emergency Plumbing': ['Emergency Plumbing']
  },

  'electrical-and-solar': {
    'General Electrical': ['Residential Electrical (General)', 'Commercial Electrical (General)', 'Fault Finding'],
    'Lighting & Power': ['Powerpoint Installation', 'Powerpoint Repairs', 'Light Switch Installation', 'Lighting Installation (Standard)', 'Lighting Installation (Feature)', 'Downlight Installation', 'Ceiling Fan Installation', 'Exhaust Fan Installation'],
    'Switchboards & Wiring': ['Switchboard Upgrade', 'Rewiring (Full Home)', 'Rewiring (Partial)', 'Underground Cabling', 'Meter Box Upgrade', 'Three-Phase Installation'],
    'Solar & EV': ['Solar Panel Installation', 'Solar System Design', 'Solar Battery Installation', 'Solar Inverter Replacement', 'Solar Panel Cleaning', 'Solar System Inspection', 'EV Charger Installation'],
    'Data, Comms & Security': ['Data & Communications Cabling', 'Phone Point Installation', 'TV Antenna Installation', 'CCTV Installation', 'Security System Installation', 'Intercom Installation', 'Home Automation'],
    'Safety & Compliance': ['Safety Switch Installation', 'Smoke Alarm Installation', 'Smoke Alarm Testing & Compliance', 'Electrical Safety Inspection', 'Test & Tag'],
    'Emergency Repairs': ['Emergency Electrical Repairs']
  },

  'hvac-and-refrigeration': {
    'Split & Multi-Head Systems': ['Split System Installation', 'Split System Service', 'Split System Repairs', 'Cassette Unit Installation', 'Cassette Unit Service', 'Multi-Head System Installation'],
    'Ducted Systems': ['Ducted System Installation', 'Ducted System Service', 'Ducted System Repairs', 'Ducted System Zoning'],
    'Heating': ['Gas Heating Installation', 'Gas Heater Service', 'Gas Heater Repairs', 'Hydronic Heating Installation', 'Hydronic Heating Service'],
    'Evaporative Cooling': ['Evaporative Cooling Installation', 'Evaporative Cooling Service', 'Evaporative Cooling Repairs'],
    'Commercial Refrigeration': ['Commercial Refrigeration Installation', 'Commercial Refrigeration Repairs', 'Commercial Refrigeration Maintenance', 'Coolroom Installation', 'Coolroom Repairs', 'Freezer Room Installation', 'Display Fridge Installation', 'Ice Machine Installation'],
    'Air Quality & Ventilation': ['Ventilation System Installation', 'Exhaust System Installation', 'Air Quality Testing', 'Duct Cleaning', 'Filter Replacement'],
    'Service & Repairs': ['Refrigerant Regas', 'Thermostat Installation', 'Smart Thermostat Installation', 'Maintenance Contracts', 'Emergency HVAC Repairs']
  },

  'concreting': {
    'Residential Concreting': ['Driveways', 'Paths & Pathways', 'Slabs (House)', 'Slabs (Garage / Shed)', 'Patios', 'Pool Surrounds'],
    'Decorative Concreting': ['Stencil Concrete', 'Exposed Aggregate', 'Coloured Concrete', 'Polished Concrete', 'Stamped Concrete'],
    'Commercial & Structural': ['Commercial Slabs', 'Industrial Floors', 'Footings & Foundations', 'Tilt Panel Construction', 'Concrete Repairs'],
    'Cutting & Removal': ['Concrete Cutting', 'Concrete Removal', 'Core Drilling']
  },

  'bricklaying': {
    'Bricklaying': ['House Bricklaying', 'Commercial Bricklaying', 'Feature Walls', 'Brick Repairs & Repointing', 'Block Laying'],
    'Stonework & Specialty': ['Stonework', 'Stone Cladding', 'Chimney Construction', 'Chimney Repairs'],
    'Heritage': ['Heritage Brickwork Restoration', 'Tuckpointing']
  },

  'carpentry': {
    'Structural Carpentry': ['Framing', 'Roof Trusses Installation', 'Wall Frames', 'Floor Joists'],
    'Finish Carpentry': ['Skirting & Architrave Installation', 'Cornice Installation', 'Door Installation', 'Window Installation', 'Trim Repairs'],
    'Joinery': ['Custom Joinery', 'Built-in Wardrobes', 'Bookshelves', 'Cabinetry (On-site)', 'Staircase Construction'],
    'Decking & Outdoor': ['Decking Installation', 'Decking Repairs', 'Pergola Construction'],
    'Repairs & Maintenance': ['Timber Floor Repairs', 'Door Repairs', 'Window Frame Repairs']
  },

  'painting-and-decorating': {
    'Interior Painting': ['Interior Painting (per room)', 'Interior Painting (full house)', 'Feature Wall Painting', 'Ceiling Painting', 'Trim & Skirting Painting', 'Door Painting', 'Window Frame Painting'],
    'Exterior Painting': ['Exterior Painting (full house)', 'Exterior Painting (partial)', 'Commercial Painting', 'Deck Staining & Oiling', 'Fence Painting / Staining'],
    'Specialist Coatings': ['Spray Painting', 'Rendering (Cement)', 'Rendering (Acrylic)', 'Texture Coating'],
    'Wallpaper': ['Wallpaper Installation', 'Wallpaper Removal'],
    'Restoration': ['Restoration (Heritage)']
  },

  'plastering-and-ceilings': {
    'Plastering': ['Plastering (Patch Repairs)', 'Plastering (Full Room)', 'Plastering (New Walls)', 'Solid Plaster', 'Set Plaster'],
    'Ceilings & Cornices': ['Ceiling Installation', 'Cornice Installation', 'Cornice Repairs', 'Decorative Ceilings', 'Suspended Ceilings'],
    'Wall Linings': ['Plasterboard Installation', 'Plasterboard Repairs', 'Wet Area Plasterboard']
  },

  'tiling-and-flooring': {
    'Tiling': ['Tiling (Floor)', 'Tiling (Wall)', 'Tiling (Bathroom Full)', 'Tiling (Splashback)', 'Tile Repairs', 'Grout Cleaning & Resealing'],
    'Waterproofing': ['Waterproofing (Bathrooms)', 'Waterproofing (Balconies)', 'Waterproofing (Wet Areas)'],
    'Timber Flooring': ['Timber Floor Installation', 'Timber Floor Sanding', 'Timber Floor Polishing'],
    'Other Flooring': ['Laminate Floor Installation', 'Vinyl Floor Installation', 'Carpet Installation', 'Carpet Removal', 'Epoxy Flooring', 'Concrete Polishing']
  },

  'glazing': {
    'Residential Glazing': ['Window Glass Replacement', 'Glass Splashbacks', 'Mirror Installation', 'Shower Screen Installation', 'Glass Balustrades'],
    'Commercial Glazing': ['Shopfront Glazing', 'Office Partitioning', 'Curtain Walls', 'Commercial Window Installation'],
    'Specialty': ['Double Glazing Installation', 'Safety Glass Installation', 'Tinted Glass Installation', 'Emergency Glass Repairs']
  },

  'landscaping-and-garden-services': {
    'Garden Design & Planting': ['Garden Design & Planning', 'Planting & Garden Beds', 'Hedging & Topiary', 'Tree Planting'],
    'Tree Services': ['Tree Removal', 'Tree Pruning & Lopping', 'Stump Grinding'],
    'Lawns & Irrigation': ['Lawn Installation (Turf)', 'Lawn Installation (Seed)', 'Lawn Mowing', 'Irrigation System Installation', 'Irrigation Repairs & Maintenance'],
    'Garden Maintenance': ['Garden Maintenance (Regular)', 'Rubbish & Green Waste Removal', 'Mulching']
  },

  'outdoor-construction': {
    'Hard Landscaping': ['Retaining Wall Construction', 'Paving & Pathways', 'Decking Installation', 'Decking Repairs', 'Pergola & Gazebo Construction', 'Outdoor Lighting Installation'],
    'Fencing': ['Fencing Installation', 'Fencing Repairs', 'Pool Fencing'],
    'Pools': ['Pool Construction (Fibreglass)', 'Pool Construction (Concrete)', 'Pool Renovation & Resurfacing', 'Pool Cleaning & Maintenance', 'Pool Equipment Installation'],
    'Outdoor Structures': ['Outdoor Kitchens', 'Cubby Houses', 'Sheds (Installation)']
  },

  'fire-and-security-services': {
    'Fire Protection': ['Fire Alarm Installation', 'Fire Alarm Maintenance', 'Sprinkler System Installation', 'Sprinkler System Maintenance', 'Fire Extinguisher Supply & Servicing', 'Emergency Lighting Installation', 'Fire Door Installation & Inspection'],
    'Security Systems': ['Security Alarm Installation', 'Security Alarm Monitoring', 'CCTV Installation', 'CCTV Monitoring', 'Access Control Systems', 'Intercom Systems'],
    'Inspections & Compliance': ['Fire Safety Inspections', 'Annual Fire Safety Statements', 'Security Audits']
  },

  'mechanical-and-appliance-repair': {
    'Whitegoods Repair': ['Washing Machine Repair', 'Dryer Repair', 'Dishwasher Repair', 'Fridge Repair', 'Freezer Repair', 'Oven & Stove Repair', 'Rangehood Repair'],
    'Small Appliance Repair': ['Microwave Repair', 'Coffee Machine Repair', 'Vacuum Repair'],
    'Power Tools & Equipment': ['Power Tool Repair', 'Lawn Mower Servicing', 'Small Engine Repair', 'Chainsaw Servicing'],
    'Installation & Disposal': ['Appliance Installation', 'Old Appliance Removal & Disposal']
  },

  'cleaning-and-maintenance': {
    'Commercial Cleaning': ['Commercial Office Cleaning', 'Commercial Retail Cleaning', 'Industrial Cleaning', 'Warehouse Cleaning', 'Strata Common Area Cleaning', 'Medical / Dental Cleaning', 'Gym / Fitness Cleaning', 'School / Childcare Cleaning'],
    'Residential Cleaning': ['Residential Cleaning (Regular)', 'Residential Cleaning (One-off)', 'Deep Cleaning', 'End of Lease Cleaning', 'Move In / Out Cleaning', 'Spring Cleaning'],
    'Window & Exterior': ['Window Cleaning (Interior)', 'Window Cleaning (Exterior)', 'Window Cleaning (High-Rise)', 'Pressure Washing (Driveway)', 'Pressure Washing (Deck)', 'Pressure Washing (House Exterior)', 'Gutter Cleaning', 'Roof Cleaning', 'Solar Panel Cleaning', 'Bin Cleaning'],
    'Carpets, Floors & Upholstery': ['Carpet Cleaning', 'Upholstery Cleaning', 'Tile & Grout Cleaning', 'Hard Floor Cleaning'],
    'Pest Control': ['Pest Inspection', 'Pest Treatment (General)', 'Pest Treatment (Termite)', 'Pest Treatment (Rodent)', 'Pest Treatment (Cockroach)', 'Pest Treatment (Bed Bug)'],
    'Handyman Services': ['Handyman (General Repairs)', 'Handyman (Furniture Assembly)', 'Handyman (Picture Hanging)', 'Handyman (Door Repairs)', 'Handyman (Lock Repairs)'],
    'Property Maintenance': ['Gutter Repairs', 'Fence Repairs', 'Deck Repairs', 'Property Maintenance (Contract)', 'Garden Maintenance', 'Lawn Mowing', 'Rubbish Removal']
  },

  'real-estate-services': {
    'Sales': ['Property Sales (Commission)', 'Property Sales (Fixed Fee)', 'Property Appraisal', 'Marketing & Listing Services'],
    'Buyer Services': ["Buyer's Agent Services", 'Property Inspection & Reporting'],
    'Property Management': ['Property Management (Residential)', 'Property Management (Commercial)', 'Tenant Selection', 'Lease Renewals', 'Rent Collection', 'Maintenance Coordination'],
    'Auctions & Advisory': ['Auction Services', 'Investment Property Advice']
  },

  'equipment-hire': {
    'Construction Equipment Hire': ['Excavator Hire', 'Skid Steer / Bobcat Hire', 'Scissor Lift Hire', 'Boom Lift Hire', 'Forklift Hire', 'Crane Hire', 'Concrete Mixer Hire', 'Scaffolding Hire'],
    'Power Tool & Small Equipment Hire': ['Power Tool Hire', 'Generator Hire', 'Compressor Hire', 'Pressure Washer Hire'],
    'Event & Party Hire': ['Marquee Hire', 'Tables & Chairs Hire', 'Stage & Lighting Hire', 'Portable Toilet Hire'],
    'Logistics & Vehicle Hire': ['Truck Hire', 'Trailer Hire', 'Ute Hire']
  },

  'food-and-beverage-manufacturing': {
    'Food Production': ['Bakery Production', 'Smallgoods / Butchery (Wholesale)', 'Packaged Food Manufacturing', 'Specialty Food Manufacturing', 'Contract Manufacturing'],
    'Beverage Production': ['Brewing (Beer)', 'Distilling (Spirits)', 'Winemaking', 'Non-Alcoholic Beverage Production', 'Coffee Roasting'],
    'Wholesale & Distribution': ['Wholesale Supply (Restaurants/Cafes)', 'Wholesale Supply (Retail)', 'Private Label Production']
  },

  'metal-fabrication-and-welding': {
    'Steel Fabrication': ['Custom Steel Fabrication', 'Structural Steel Fabrication', 'Steel Frame Fabrication'],
    'Welding': ['Welding (MIG)', 'Welding (TIG)', 'Welding (Stick)'],
    'Aluminium & Stainless': ['Aluminium Fabrication', 'Aluminium Welding', 'Stainless Steel Fabrication', 'Stainless Steel Welding'],
    'Sheet Metal': ['Sheet Metal Work', 'Metal Cutting', 'Metal Bending', 'Metal Rolling'],
    'Architectural & Custom': ['Balustrade Fabrication', 'Handrail Fabrication', 'Gate Fabrication', 'Security Screen Fabrication', 'Trailer Fabrication'],
    'Onsite & Repairs': ['Trailer Repairs', 'Machinery Repairs', 'Onsite Welding'],
    'Coatings & Finishing': ['Powder Coating', 'Galvanising Coordination']
  },

  'industrial-manufacturing': {
    'CNC Machining': ['CNC Machining', 'CNC Laser Cutting', 'CNC Plasma Cutting', 'CNC Waterjet Cutting', 'Lathe Work', 'Milling', 'Drilling'],
    'Production': ['Prototyping', 'Production Runs', 'Assembly Services', 'Design & Engineering'],
    'Plastics & Composites': ['Plastic Moulding', 'Fibreglass Fabrication'],
    'Industrial Repairs': ['Industrial Machinery Repairs', 'Equipment Refurbishment']
  },

  'joinery-and-wood-products': {
    'Custom Joinery': ['Custom Kitchen Manufacture', 'Custom Wardrobe Manufacture', 'Custom Vanity Manufacture', 'Custom Cabinetry'],
    'Timber Products': ['Furniture Manufacture', 'Staircases (Manufactured)', 'Timber Doors & Windows', 'Shop Fittings'],
    'Workshop Services': ['CNC Routing', 'Timber Machining', 'Edging & Lamination', 'Spray Finishing']
  },

  'printing-and-signage': {
    'Printing': ['Digital Printing', 'Offset Printing', 'Large Format Printing', 'Business Cards & Stationery', 'Brochures & Flyers', 'Booklet & Catalogue Printing'],
    'Signage': ['Shop Signage', 'Vehicle Signage / Wraps', 'Building Signage', 'Real Estate Signs', 'Banners & Pull-Up Displays', 'Illuminated Signage', 'LED Signage'],
    'Branding & Wayfinding': ['Wayfinding Signage', 'Trade Show Displays', 'Window Decals'],
    'Design Services': ['Graphic Design', 'Print Layout / Pre-Press']
  },

  'farming-and-agriculture': {
    'Crop Farming': ['Grain Production', 'Vegetable Farming', 'Fruit Orchards', 'Viticulture (Wine Grapes)'],
    'Livestock': ['Beef Cattle', 'Dairy Cattle', 'Sheep (Wool)', 'Sheep (Meat)', 'Poultry', 'Pork'],
    'Agricultural Services': ['Contract Harvesting', 'Contract Spraying', 'Stock Agency', 'Farm Management Consulting'],
    'Speciality Production': ['Hay & Fodder Production', 'Organic Farming', 'Hydroponic Farming']
  },

  'forestry-and-logging': {
    'Logging Operations': ['Timber Harvesting', 'Plantation Logging', 'Native Forest Logging', 'Salvage Logging'],
    'Forest Management': ['Forest Planting', 'Forest Thinning', 'Pruning & Silviculture', 'Fire Management'],
    'Haulage & Processing': ['Log Haulage', 'On-Site Chipping', 'Mill Coordination']
  },

  'fishing-and-aquaculture': {
    'Commercial Fishing': ['Trawl Fishing', 'Line Fishing', 'Net Fishing', 'Crab & Lobster Fishing', 'Prawn Fishing'],
    'Aquaculture': ['Oyster Farming', 'Mussel Farming', 'Fin Fish Farming (Salmon, Barramundi etc.)', 'Prawn Farming', 'Abalone Farming'],
    'Processing & Distribution': ['Seafood Processing', 'Cold Chain Distribution']
  },

  'retail': {
    'Customer Services': ['In-Store Sales', 'Online Sales / E-commerce', 'Click & Collect', 'Home Delivery', 'Gift Wrapping', 'Personal Shopping / Styling'],
    'Product Services': ['Product Demonstrations', 'Repairs & Servicing', 'Custom Orders', 'Installation Services'],
    'Loyalty & Account': ['Loyalty Program', 'Gift Cards', 'Layby / Buy Now Pay Later']
  },

  'hospitality': {
    'Food & Beverage Service': ['Restaurant Dining', 'Cafe Service', 'Takeaway', 'Catering (On-Site)', 'Catering (Off-Site)', 'Function & Events Hosting', 'Bar Service'],
    'Accommodation': ['Hotel Accommodation', 'Motel Accommodation', 'Bed & Breakfast', 'Serviced Apartments', 'Holiday Rentals', 'Caravan Park / Camping'],
    'Specialty Hospitality': ['Tour Operations', 'Event Management', 'Wedding Venue Hire']
  },

  'wholesale-distribution': {
    'Distribution': ['B2B Wholesale Supply', 'Trade Account Management', 'Bulk Order Fulfilment', 'Drop-shipping Services'],
    'Sales & Account': ['Field Sales Representation', 'Trade Showroom', 'Sample & Product Demos'],
    'Logistics': ['Warehousing', 'Order Picking & Packing', 'Distribution Delivery']
  },

  'freight-and-logistics': {
    'Freight Transport': ['Local Delivery (Same Day)', 'Interstate Freight', 'Refrigerated Transport', 'Bulk Haulage', 'Container Transport'],
    'Specialist Transport': ['Heavy Haulage / Oversize Loads', 'Dangerous Goods Transport', 'Livestock Transport', 'Vehicle Transport'],
    'Logistics Services': ['3PL (Third-Party Logistics)', 'Customs Brokerage', 'Freight Forwarding (Domestic)', 'Freight Forwarding (International)'],
    'Courier & Last Mile': ['Courier Services', 'Same-Day Courier', 'Last-Mile Delivery']
  },

  'warehousing-and-storage': {
    'Warehousing': ['Pallet Storage', 'Bulk Storage', 'Climate-Controlled Storage', 'Bonded Warehousing', 'Cold Storage'],
    'Order Fulfilment': ['Pick & Pack', 'E-commerce Fulfilment', 'Returns Management', 'Kitting & Assembly'],
    'Storage Services': ['Self-Storage', 'Document Storage', 'Container Storage']
  },

  'professional-scientific-and-technical-services': {
    'Accounting & Tax': ['Accounting (Monthly)', 'Accounting (Annual)', 'Tax Return Preparation (Individual)', 'Tax Return Preparation (Business)', 'BAS Preparation', 'Financial Statements', 'Audit Services'],
    'Bookkeeping & Payroll': ['Bookkeeping (Monthly)', 'Bookkeeping (Hourly)', 'Payroll Processing'],
    'Business Advisory & Consulting': ['Business Advisory', 'Business Consulting', 'Strategy Consulting', 'Management Consulting'],
    'Legal Services': ['Legal Consultation', 'Contract Review', 'Contract Drafting', 'Conveyancing', 'Wills & Estate Planning', 'Business Legal Services', 'Dispute Resolution'],
    'Architecture & Engineering': ['Architectural Services', 'Structural Engineering', 'Civil Engineering', 'Surveying'],
    'Creative & Communications': ['Graphic Design', 'Branding Services', 'Photography', 'Videography', 'Copywriting']
  },

  'recruitment-and-business-support-services': {
    'Recruitment': ['Permanent Placement', 'Temporary / Contract Placement', 'Executive Search', 'Labour Hire', 'Apprenticeship & Traineeship Hosting'],
    'HR Consulting': ['HR Consulting', 'Workplace Investigations', 'Industrial Relations Advice', 'Performance Management'],
    'Business Support': ['Virtual Assistant Services', 'Bookkeeping Support', 'Administrative Support', 'Customer Service / Call Centre', 'Translation Services']
  },

  'training-and-education': {
    'Vocational Training': ['Accredited Vocational Training (RTO)', 'Short Courses & Workshops', 'Apprenticeship Training', 'Skills Assessment'],
    'Corporate Training': ['Corporate Training & Workshops', 'Leadership Development', 'Compliance Training', 'Soft Skills Training'],
    'Tutoring & Coaching': ['Academic Tutoring', 'Adult Education', 'Language Training', 'Music & Arts Tuition'],
    'Childcare & Early Education': ['Long Day Care', 'Family Day Care', 'Outside School Hours Care', 'Preschool / Kindergarten']
  },

  'media-and-publishing': {
    'Publishing': ['Book Publishing', 'Magazine / Periodical Publishing', 'Newspaper Publishing', 'Online Publishing'],
    'Content & Production': ['Content Creation', 'Editorial Services', 'Podcast Production', 'Video Production', 'Audio Production'],
    'Broadcast & Distribution': ['Radio Broadcasting', 'Television Production', 'Streaming Content Distribution'],
    'Advertising': ['Media Sales', 'Advertising Production']
  },

  'telecommunications-and-it-services': {
    'IT Support': ['IT Support (Hourly)', 'IT Support (Contract)', 'IT Consulting', 'Network Setup', 'Server Maintenance', 'Cloud Services Setup', 'Cybersecurity Assessment'],
    'Telecommunications': ['NBN Connection & Support', 'Business Phone Systems (VoIP)', 'Mobile Fleet Management', 'Network Cabling'],
    'Digital Services': ['Website Development', 'Website Maintenance', 'App Development', 'SEO Services', 'Digital Marketing', 'Social Media Management'],
    'Managed Services': ['Managed IT Services', 'Backup & Disaster Recovery', 'Endpoint Management']
  },

  'health-and-community-services': {
    'Allied Health': ['Physiotherapy', 'Chiropractic', 'Osteopathy', 'Massage Therapy', 'Podiatry', 'Dietetics / Nutrition', 'Exercise Physiology', 'Speech Pathology', 'Occupational Therapy'],
    'Mental Health': ['Psychology', 'Counselling', 'Mental Health Coaching'],
    'Medical & Dental': ['General Practice', 'Specialist Medical Services', 'Dental Services', 'Optometry'],
    'Community Services': ['NDIS Support Services', 'Aged Care (In-Home)', 'Aged Care (Residential)', 'Disability Support', 'Community Outreach'],
    'Wellbeing': ['Personal Training', 'Yoga / Pilates Instruction', 'Beauty Therapy', 'Hairdressing']
  },

  'arts-and-recreation': {
    'Arts & Performance': ['Performing Arts (Music / Theatre / Dance)', 'Visual Arts Production', 'Art Gallery Operations', 'Creative Workshops'],
    'Recreation & Sports': ['Sports Coaching', 'Sports Club Operations', 'Personal Training (Outdoor / Recreational)', 'Adventure / Outdoor Activities', 'Tour Guiding'],
    'Entertainment Venues': ['Cinema', 'Bowling / Indoor Recreation', 'Escape Rooms / Adventure Venues', 'Function & Event Hosting'],
    "Children's Activities": ["Children's Activity Centres", 'Holiday Programs']
  },

  'waste-and-recycling-services': {
    'Waste Collection': ['Commercial Waste Collection', 'Industrial Waste Collection', 'Residential Skip Bin Hire', 'Construction & Demolition Waste'],
    'Recycling': ['General Recycling', 'Cardboard & Paper Recycling', 'Metal Recycling', 'E-Waste Recycling', 'Battery & Hazardous Recycling'],
    'Specialty Services': ['Hazardous Waste Disposal', 'Medical Waste Disposal', 'Confidential Document Destruction', 'Liquid Waste Removal']
  }
};

export const PRODUCTS = {

  'building-and-construction': {
    'Structural Materials': ['Timber (Structural)', 'Timber (Finish)', 'Steel Beams', 'Roofing Materials', 'Insulation Batts', 'Cladding Sheets'],
    'Doors, Windows & Hardware': ['Doors (Interior)', 'Doors (Exterior)', 'Windows', 'Hardware & Fixtures'],
    'Cabinetry & Benchtops': ['Cabinetry (Flatpack)', 'Cabinetry (Custom)', 'Benchtops']
  },

  'plumbing-and-gas': {
    'Hot Water Systems': ['Hot Water Systems (Electric)', 'Hot Water Systems (Gas)', 'Hot Water Systems (Solar)', 'Hot Water Systems (Heat Pump)'],
    'Tapware & Fixtures': ['Toilets', 'Toilet Cisterns', 'Taps (Basin)', 'Taps (Kitchen)', 'Taps (Shower)', 'Showerheads', 'Sinks (Kitchen)', 'Basins (Bathroom)'],
    'Pipes, Tanks & Drainage': ['Gas Appliances', 'Water Filters', 'Rainwater Tanks', 'Guttering (per linear metre)', 'Downpipes']
  },

  'electrical-and-solar': {
    'Solar & EV': ['Solar Panels', 'Solar Inverters', 'Solar Batteries', 'EV Chargers'],
    'Wiring & Power': ['Switchboards', 'Powerpoints', 'Light Switches', 'Data Cables (per metre)'],
    'Lighting & Fans': ['Downlights', 'Ceiling Fans'],
    'Safety & Comms': ['Smoke Alarms', 'Safety Switches', 'TV Antennas', 'CCTV Cameras', 'Security Panels']
  },

  'hvac-and-refrigeration': {
    'Cooling & Heating Units': ['Split System Units', 'Ducted System Units', 'Cassette Units', 'Gas Heaters', 'Evaporative Coolers'],
    'Refrigeration': ['Refrigeration Units', 'Coolroom Panels', 'Display Fridges', 'Ice Machines'],
    'Controls & Filters': ['Thermostats', 'Smart Thermostats', 'Air Filters']
  },

  'concreting': {
    'Materials': ['Ready-Mix Concrete (per m³)', 'Reinforcing Steel / Mesh', 'Concrete Sealer', 'Form Boards']
  },

  'bricklaying': {
    'Materials': ['Bricks', 'Blocks', 'Mortar', 'Sand & Cement']
  },

  'carpentry': {
    'Materials': ['Timber (Structural)', 'Timber (Finish)', 'Decking Timber (per m²)', 'Composite Decking (per m²)', 'Trim & Mouldings']
  },

  'painting-and-decorating': {
    'Paints & Coatings': ['Interior Paint (per litre)', 'Exterior Paint (per litre)', 'Deck Oil / Stain (per litre)'],
    'Wall Coverings': ['Wallpaper (per roll)', 'Render (per bag)']
  },

  'plastering-and-ceilings': {
    'Materials': ['Plaster Compound', 'Plasterboard Sheets', 'Cornices (per linear metre)', 'Jointing Compound']
  },

  'tiling-and-flooring': {
    'Tiles & Flooring': ['Tiles (per m²)', 'Tile Adhesive', 'Grout', 'Timber Flooring (per m²)', 'Laminate Flooring (per m²)', 'Vinyl Flooring (per m²)', 'Carpet (per m²)', 'Underlay (per m²)']
  },

  'glazing': {
    'Glass & Hardware': ['Glass (per m²)', 'Mirrors', 'Shower Screens', 'Splashbacks', 'Window Hardware']
  },

  'landscaping-and-garden-services': {
    'Garden Materials': ['Turf (per m²)', 'Mulch (per m³)', 'Soil & Compost (per m³)', 'Plants (per unit)', 'Garden Edging (per linear metre)'],
    'Irrigation': ['Irrigation Controllers', 'Irrigation Sprinklers']
  },

  'outdoor-construction': {
    'Pool Equipment': ['Pool Pumps', 'Pool Filters', 'Pool Cleaners (Robotic)', 'Pool Chemicals'],
    'Hard Landscaping': ['Pavers (per m²)', 'Decking Timber (per m²)', 'Composite Decking (per m²)', 'Fencing Panels', 'Fencing Posts', 'Retaining Wall Blocks (per unit)', 'Outdoor Lighting Fixtures']
  },

  'fire-and-security-services': {
    'Fire Protection Equipment': ['Smoke Alarms', 'Fire Extinguishers', 'Fire Blankets', 'Emergency Lighting', 'Fire Doors'],
    'Security Equipment': ['Security Alarm Panels', 'CCTV Cameras', 'Access Control Readers', 'Intercoms']
  },

  'mechanical-and-appliance-repair': {
    'Parts & Consumables': ['Appliance Parts', 'Filters', 'Belts & Hoses']
  },

  'cleaning-and-maintenance': {
    'Cleaning Products & Equipment': ['Cleaning Products (commercial supply)', 'Pest Control Products', 'Cleaning Equipment']
  },

  'real-estate-services': {
    'Documents & Reports': ['Appraisal Reports', 'Comparative Market Analysis Reports']
  },

  'equipment-hire': {
    'Fleet for Hire': ['Plant & Machinery', 'Small Tools & Equipment', 'Event Equipment']
  },

  'food-and-beverage-manufacturing': {
    'Manufactured Goods': ['Packaged Food Products', 'Bakery Products', 'Smallgoods', 'Beer / Spirits / Wine', 'Soft Drinks / Juices', 'Coffee Beans / Ground Coffee']
  },

  'metal-fabrication-and-welding': {
    'Raw Materials': ['Steel (per kg / per metre)', 'Aluminium (per kg / per metre)', 'Stainless Steel (per kg / per metre)', 'Sheet Metal (per sheet)', 'Steel Beams', 'Steel Columns'],
    'Architectural & Custom Parts': ['Balustrades', 'Handrails', 'Gates', 'Security Screens', 'Custom Brackets', 'Custom Parts']
  },

  'industrial-manufacturing': {
    'Manufactured Components': ['Custom Machined Parts', 'Production Components', 'Prototype Components']
  },

  'joinery-and-wood-products': {
    'Manufactured Goods': ['Custom Kitchens', 'Custom Wardrobes', 'Custom Cabinetry', 'Timber Doors', 'Timber Furniture', 'Shop Fittings']
  },

  'printing-and-signage': {
    'Print Products': ['Business Cards', 'Brochures', 'Flyers', 'Posters', 'Banners', 'Decals & Stickers']
  },

  'farming-and-agriculture': {
    'Produce': ['Grain', 'Fresh Produce', 'Livestock (Sale)', 'Wool', 'Dairy Products (Raw)', 'Hay & Fodder']
  },

  'forestry-and-logging': {
    'Timber': ['Sawlogs', 'Pulpwood', 'Woodchips', 'Firewood']
  },

  'fishing-and-aquaculture': {
    'Seafood': ['Finfish', 'Crustaceans', 'Molluscs', 'Processed Seafood']
  },

  'retail': {
    'Product Categories': ['Clothing & Footwear', 'Homewares & Furniture', 'Electronics & Appliances', 'Books & Stationery', 'Hardware & Tools', 'Health & Beauty', 'Toys & Games', 'Sporting Goods', 'Specialty Goods']
  },

  'hospitality': {
    'Food & Beverage': ['Menu Items', 'Alcoholic Beverages', 'Non-Alcoholic Beverages'],
    'Merchandise': ['Branded Merchandise', 'Retail Items (Pantry / Gift)']
  },

  'wholesale-distribution': {
    'Wholesale Categories': ['Consumer Goods (Wholesale)', 'Industrial Supplies', 'Food Service / Hospitality Supplies', 'Building Materials (Wholesale)', 'Specialty Wholesale']
  },

  'freight-and-logistics': {
    'Services Only': ['No physical products — service-based industry']
  },

  'warehousing-and-storage': {
    'Services Only': ['No physical products — service-based industry']
  },

  'professional-scientific-and-technical-services': {
    'Documents & Deliverables': ['Reports & Documents', 'Plans & Drawings', 'Creative Assets']
  },

  'recruitment-and-business-support-services': {
    'Documents & Deliverables': ['Position Descriptions', 'Candidate Shortlists', 'HR Policies & Procedures']
  },

  'training-and-education': {
    'Materials': ['Training Materials', 'Course Notes & Workbooks', 'Online Course Access']
  },

  'media-and-publishing': {
    'Published Works': ['Books', 'Magazines', 'Digital Subscriptions', 'Audio / Video Content']
  },

  'telecommunications-and-it-services': {
    'Software & Hardware': ['Software Licences', 'Software Subscriptions', 'Hardware (IT)', 'Cloud Storage Plans']
  },

  'health-and-community-services': {
    'Health & Wellbeing': ['Therapeutic Products', 'Supplements & Nutrition', 'Beauty Products']
  },

  'arts-and-recreation': {
    'Sales': ['Art Sales', 'Tickets', 'Merchandise']
  },

  'waste-and-recycling-services': {
    'Equipment Hire': ['Skip Bins (per size)', 'Bulk Bins', 'Confidential Document Bins']
  }
};

export const LICENCES = {

  'building-and-construction': {
    "Builder's Licences": ["Builder's Licence (Domestic)", "Builder's Licence (Commercial)", "Builder's Licence (Unlimited)", 'Owner Builder Permit', 'Building Practitioner Registration', 'Registered Building Surveyor'],
    'Demolition & Asbestos': ['Demolition Licence', 'Asbestos Removal Licence (Class A)', 'Asbestos Removal Licence (Class B)'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Scaffolding Licence', 'Rigging Licence', 'Crane Operator Licence', 'Forklift Licence', 'Dogging Licence', 'Occupational Health & Safety Certificate', 'First Aid Certificate'],
    'Industry Memberships': ['Master Builders Association Member', 'Housing Industry Association (HIA) Member']
  },

  'plumbing-and-gas': {
    'Plumbing Licences': ['Plumbing Licence (Full)', 'Plumbing Licence (Restricted)', 'Plumbing Contractor Licence', "Drainer's Licence", 'Roof Plumber Licence'],
    'Gas Fitting': ['Gas Fitting Licence', 'Gas Fitting Permit (Type A)', 'Gas Fitting Permit (Type B)'],
    'Specialist Certifications': ['Backflow Prevention Accreditation', 'Water Efficiency Certification (WELS)', 'Thermostatic Mixing Valve (TMV) Certification'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'CPR & First Aid Certificate'],
    'Industry Memberships': ['Master Plumbers Association Member']
  },

  'electrical-and-solar': {
    'Electrical Licences': ['Electrical Licence (Full)', 'Electrical Licence (Restricted)', 'Electrical Contractor Licence', 'Restricted Electrical Licence (Disconnect / Reconnect)', 'Disconnect / Reconnect Authorisation'],
    'Solar & Battery (CEC) Accreditations': ['Clean Energy Council (CEC) Accreditation', 'CEC Solar Design Accreditation', 'CEC Battery Endorsement'],
    'Specialist Registrations': ['Data Cabling Registration', 'Security Installer Licence', 'Test & Tag Competency Certificate', 'Electrical Safety Certificate'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'CPR & First Aid Certificate']
  },

  'hvac-and-refrigeration': {
    'Refrigerant Handling': ['Refrigerant Handling Licence (Full)', 'Restricted Refrigerant Handling Licence', 'ARCTICK Certification', 'Commercial Refrigeration Endorsement'],
    'Mechanical & Trade Licences': ['Refrigeration & Air Conditioning Mechanic Licence', 'Split System Installation Endorsement', 'Gas Fitting Licence', 'Electrical Licence (Restricted)'],
    'Energy Compliance': ['Energy Efficiency Certificate'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'CPR & First Aid Certificate']
  },

  'concreting': {
    'Trade Qualifications': ['Concreter Trade Certificate', 'Concrete Finisher Certification'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Scaffolding Licence', 'Forklift Licence', 'Occupational Health & Safety Certificate', 'First Aid Certificate']
  },

  'bricklaying': {
    'Trade Qualifications': ['Bricklayer Trade Certificate', 'Stonemason Trade Certificate'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Scaffolding Licence', 'First Aid Certificate']
  },

  'carpentry': {
    'Trade Qualifications': ['Carpenter Trade Certificate', 'Carpentry & Joinery Trade Certificate'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'First Aid Certificate']
  },

  'painting-and-decorating': {
    'Painting Licences': ["Painter's Registration", 'Painting Contractor Licence'],
    'Specialist Certifications': ['Lead Paint Removal Certification', 'Asbestos Awareness Certificate', 'Dulux Accredited Painter'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Scaffolding Licence', 'CPR & First Aid Certificate'],
    'Industry Memberships': ['Master Painters Association Member']
  },

  'plastering-and-ceilings': {
    'Trade Qualifications': ['Plasterer Trade Certificate', 'Solid Plasterer Certification'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Scaffolding Licence', 'First Aid Certificate']
  },

  'tiling-and-flooring': {
    'Trade Qualifications': ['Wall & Floor Tiler Trade Certificate', 'Flooring Installer Certification', 'Floor Sanding & Polishing Certification'],
    'Specialist Certifications': ['Waterproofing Licence'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'First Aid Certificate']
  },

  'glazing': {
    'Trade Qualifications': ['Glazier Trade Certificate'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'First Aid Certificate']
  },

  'landscaping-and-garden-services': {
    'Landscaping & Design': ['Landscape Contractor Licence', 'Landscape Designer Registration'],
    'Tree & Arborist': ['Arborist Qualification (AQF Level 3+)', 'Tree Worker Licence', 'Chainsaw Operator Certificate'],
    'Specialist Certifications': ['Pesticide Application Licence', 'Irrigation Association of Australia Member'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'First Aid Certificate']
  },

  'outdoor-construction': {
    'Trade & Specialist': ['Landscape Contractor Licence', 'Pool Builder Licence', 'Pool Safety Inspector Licence', 'Pool Fence Compliance Certificate'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Forklift Licence', 'First Aid Certificate']
  },

  'fire-and-security-services': {
    'Fire Protection': ['Fire Protection Accreditation Scheme (FPAS)', 'Fire Sprinkler Fitter Licence', 'Annual Fire Safety Statement Assessor'],
    'Security': ['Security Installer Licence', 'Master Security Licence', 'Class 2 Security Licence (Monitoring)'],
    'Background Checks': ['National Police Check'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'First Aid Certificate']
  },

  'mechanical-and-appliance-repair': {
    'Trade Qualifications': ['Appliance Service Technician Certification', 'Electrical Licence (Restricted) — for hardwired appliances', 'Refrigerant Handling Licence (Restricted) — for cooling appliances'],
    'Background Checks': ['National Police Check']
  },

  'cleaning-and-maintenance': {
    'Pest Control': ['Pest Management Licence', 'Pest Control Operator Licence', 'Fumigation Licence'],
    'Cleaning Industry Certifications': ['Cleaning Industry Certification (ISSA/BSCAI)', 'IICRC Certification', 'Building Service Contractors Licence', 'Carpet Cleaning Technician Certification'],
    'Hazard & Safety': ['Asbestos Assessor Licence', 'Asbestos Awareness Certificate', 'Chemical Handling Certificate', 'Working at Heights Certificate', 'CPR & First Aid Certificate'],
    'Background Checks': ['National Police Check', 'Working With Children Check', 'Security Licence (for premises access)']
  },

  'real-estate-services': {
    'Real Estate Licences': ['Real Estate Agent Licence (Full)', 'Real Estate Salesperson Registration', 'Property Manager Licence', 'Auctioneer Licence', 'Conveyancer Licence'],
    'Industry Memberships': ['Real Estate Institute of Australia (REIA) Member', 'Real Estate Institute (State) Member'],
    'Compliance & Insurance': ['Professional Indemnity Insurance', 'National Police Check']
  },

  'equipment-hire': {
    'Operations': ['Hire & Rental Industry Association Member', 'Heavy Vehicle Licence', 'Forklift Licence', 'Crane Operator Licence'],
    'Compliance': ['Plant Inspection Certifications', 'Public Liability Insurance'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'First Aid Certificate']
  },

  'food-and-beverage-manufacturing': {
    'Food Safety & Compliance': ['Food Business Licence', 'Food Safety Supervisor Certificate', 'HACCP Certification', 'FSANZ Compliance'],
    'Alcohol Licences': ['Producer / Wholesaler Licence (Liquor)', 'Distillery Licence', 'Brewery Licence', 'Winery Licence'],
    'Quality Standards': ['ISO 22000 (Food Safety Management)', 'Australian Made Certification']
  },

  'metal-fabrication-and-welding': {
    'Welding & Fabrication': ['Welding Certification (AS/NZS 1554)', 'Welding Certification (AS/NZS 2980)', 'Structural Steel Fabrication Certification', 'Boilermaker Trade Certificate', 'Pressure Vessel Welding Certification'],
    'Machining & Operations': ['Forklift Licence', 'Crane Operator Licence', 'Rigging Licence'],
    'Quality Management': ['ISO 9001 Quality Management', 'ISO 3834 Welding Quality'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Occupational Health & Safety Certificate', 'CPR & First Aid Certificate']
  },

  'industrial-manufacturing': {
    'Operations': ['CNC Machinist Qualification', 'Mechanical Engineering Qualification', 'Forklift Licence', 'Crane Operator Licence'],
    'Quality Standards': ['ISO 9001 Quality Management', 'ISO 14001 Environmental Management'],
    'Site Safety Tickets': ['White Card (Construction Induction)', 'Working at Heights Certificate', 'Occupational Health & Safety Certificate', 'First Aid Certificate']
  },

  'joinery-and-wood-products': {
    'Trade Qualifications': ['Cabinet Maker Trade Certificate', 'Joiner Trade Certificate', 'Wood Machinist Certification'],
    'Industry Memberships': ['Cabinet Makers & Designers Association Member', 'Australian Furniture Association Member'],
    'Site Safety': ['Forklift Licence', 'First Aid Certificate']
  },

  'printing-and-signage': {
    'Trade Qualifications': ['Sign Writer Trade Certificate', 'Print Production Certification'],
    'Site Safety': ['Working at Heights Certificate (for installation)', 'Elevated Work Platform Licence'],
    'Background Checks': ['National Police Check']
  },

  'farming-and-agriculture': {
    'Operations': ['Property Identification Code (PIC)', 'Livestock Production Assurance (LPA) Accreditation', 'Chemical User Accreditation (ChemCert / AusChem)'],
    'Specialist Certifications': ['Organic Certification (NASAA / ACO)', 'Biosecurity Compliance'],
    'Vehicle & Machinery': ['Heavy Vehicle Licence', 'Tractor Operator Certificate']
  },

  'forestry-and-logging': {
    'Operations': ['Forestry Operations Licence', 'Chainsaw Operator Certificate', 'Timber Harvester Certification'],
    'Sustainability Certifications': ['Forest Stewardship Council (FSC) Certification', 'Responsible Wood Certification (PEFC)'],
    'Vehicle & Heavy Equipment': ['Heavy Vehicle Licence', 'Forklift Licence']
  },

  'fishing-and-aquaculture': {
    'Fishing Licences': ['Commercial Fishing Licence (State)', 'Commonwealth Fishing Concession', 'Fishing Vessel Registration'],
    'Aquaculture': ['Aquaculture Licence / Permit', 'Fish Farm Registration'],
    'Vessel & Operations': ["Coxswain's Certificate", 'Master <24m Near Coastal Certificate', 'Marine Engine Driver Certificate'],
    'Food Safety': ['Seafood Production HACCP Certification']
  },

  'retail': {
    'Compliance': ['Australian Consumer Law Compliance', 'Public Liability Insurance', 'Product Liability Insurance'],
    'Specialty Licences': ['Tobacco Retailer Licence (where relevant)', 'Liquor Licence — Packaged (where relevant)', 'Firearms Dealer Licence (where relevant)']
  },

  'hospitality': {
    'Food Safety': ['Food Business Licence', 'Food Safety Supervisor Certificate', 'HACCP Certification'],
    'Liquor & Gaming': ['On-Premises Liquor Licence', 'Packaged Liquor Licence', 'Responsible Service of Alcohol (RSA)', 'Responsible Service of Gambling (RSG)'],
    'Accommodation': ['Accommodation Licence (State-specific)', 'STRA Registration (Short-Term Rental)'],
    'Background Checks': ['National Police Check', 'Working With Children Check']
  },

  'wholesale-distribution': {
    'Compliance': ['Public Liability Insurance', 'Product Liability Insurance', 'Trade Practices Compliance'],
    'Specialty Permits': ['Dangerous Goods Storage Licence (where relevant)', 'Liquor Wholesale Licence (where relevant)']
  },

  'freight-and-logistics': {
    'Vehicle Licences': ['Heavy Combination (HC) Licence', 'Multi Combination (MC) Licence', 'Heavy Rigid (HR) Licence', 'Medium Rigid (MR) Licence'],
    'Operations': ['National Heavy Vehicle Accreditation Scheme (NHVAS)', 'Dangerous Goods Driver Licence', 'Forklift Licence'],
    'Specialist': ['Customs Broker Licence', 'International Air Transport Association (IATA) Certification']
  },

  'warehousing-and-storage': {
    'Operations': ['Forklift Licence', 'Crane Operator Licence', 'Warehouse Worker Induction'],
    'Specialty': ['Dangerous Goods Storage Licence', 'Bonded Warehouse Licence', 'Food Storage Licence (cold/dry)'],
    'Compliance': ['Public Liability Insurance', 'ISO 9001 Quality Management']
  },

  'professional-scientific-and-technical-services': {
    'Accounting & Tax': ['CPA Australia Member', 'Chartered Accountant (CA ANZ)', 'Tax Agent Registration (TPB)', 'BAS Agent Registration (TPB)'],
    'Legal': ['Practising Certificate (Law)', 'Conveyancer Licence'],
    'Architecture & Engineering': ['Registered Architect', 'Registered Engineer (RPEng / CPEng)', 'Registered Surveyor'],
    'Quality & Insurance': ['Professional Indemnity Insurance', 'ISO 9001 Quality Management']
  },

  'recruitment-and-business-support-services': {
    'Recruitment & Labour Hire': ['Labour Hire Licence (State)', 'Recruitment & Consulting Services Association (RCSA) Member'],
    'Background Checks': ['National Police Check', 'Working With Children Check'],
    'Compliance': ['Professional Indemnity Insurance']
  },

  'training-and-education': {
    'Education Registration': ['RTO Registration (ASQA)', 'CRICOS Registration (International Students)', 'Certificate IV in Training & Assessment (TAE40116)'],
    'Childcare': ['Approved Provider Status (Childcare)', 'Early Childhood Teacher Registration'],
    'Background Checks': ['Working With Children Check', 'National Police Check', 'First Aid Certificate', 'CPR Certificate']
  },

  'media-and-publishing': {
    'Industry Compliance': ['Australian Press Council Member', 'Copyright Agency Registration'],
    'Broadcast': ['ACMA Broadcasting Licence (where relevant)'],
    'Compliance': ['Professional Indemnity Insurance']
  },

  'telecommunications-and-it-services': {
    'IT & Digital Certifications': ['CompTIA Certification', 'Cisco Certification (CCNA/CCNP)', 'Microsoft Certification', 'AWS Certification', 'Google Ads Certification', 'Meta Blueprint Certification'],
    'Telecommunications': ['Open Cabler Registration (ACMA)', 'Restricted Cabler Registration'],
    'Quality & Information Standards': ['ISO 27001 Information Security', 'Essential Eight Maturity Assessment'],
    'Compliance & Insurance': ['Professional Indemnity Insurance', 'Cyber Liability Insurance']
  },

  'health-and-community-services': {
    'AHPRA Registration (where applicable)': ['AHPRA Registration (Health Profession)', 'Medicare Provider Number'],
    'NDIS & Aged Care': ['NDIS Provider Registration', 'Aged Care Quality & Safety Commission Registration'],
    'Background Checks': ['NDIS Worker Screening Check', 'Working With Children Check', 'National Police Check', 'First Aid Certificate', 'CPR Certificate'],
    'Compliance': ['Professional Indemnity Insurance', 'Public Liability Insurance']
  },

  'arts-and-recreation': {
    'Permits & Compliance': ['Public Liability Insurance', 'Venue Operating Licence', 'Public Performance Licence (APRA AMCOS)'],
    'Coaching & Activities': ['Sport-Specific Coaching Certification', 'Adventure Activities Standard Compliance'],
    'Background Checks': ['Working With Children Check', 'National Police Check', 'First Aid Certificate', 'CPR Certificate']
  },

  'waste-and-recycling-services': {
    'Waste Management': ['EPA Waste Transport Licence', 'Hazardous Waste Handling Licence', 'Asbestos Removal Licence (Class A or B)', 'Trade Waste Permit'],
    'Vehicle & Operations': ['Heavy Vehicle Licence', 'Dangerous Goods Driver Licence', 'Forklift Licence'],
    'Compliance': ['ISO 14001 Environmental Management', 'Public Liability Insurance']
  }
};
