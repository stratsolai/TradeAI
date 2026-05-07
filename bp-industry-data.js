window.BP_INDUSTRY_DATA = {

  groups: [
    { id: 'building-construction', name: 'Building & Construction', icon: '\u{1F3E0}' },
    { id: 'electrical-solar',      name: 'Electrical & Solar',      icon: '⚡' },
    { id: 'plumbing-gas',          name: 'Plumbing & Gas',          icon: '\u{1F527}' },
    { id: 'hvac-refrigeration',    name: 'HVAC & Refrigeration',    icon: '❄️' },
    { id: 'landscaping-outdoor',   name: 'Landscaping & Outdoor',   icon: '\u{1F333}' },
    { id: 'painting-finishing',    name: 'Painting & Finishing',    icon: '\u{1F3A8}' },
    { id: 'fabrication-manufacturing', name: 'Fabrication & Manufacturing', icon: '\u{1F528}' },
    { id: 'cleaning-maintenance',  name: 'Cleaning & Maintenance',  icon: '\u{1F9F9}' },
    { id: 'service-professional',  name: 'Service & Professional',  icon: '\u{1F4CB}' }
  ],

  // Services, products, and licences are organised into industry-specific
  // sub-groups so the BP chip pickers can render them as alphabetised
  // collapsible sections (BP UX Improvements Spec v1.0 §2). Each industry
  // value is an object: { 'Sub-group Name': [items...] }. Items within a
  // group are not pre-sorted here — getMerged* helpers sort A-Z.

  services: {
    'Building & Construction': {
      'New Builds & Extensions': [
        'New Home Construction', 'Home Extensions', 'Granny Flat / Secondary Dwelling',
        'Commercial Fit-out', 'Shop Fit-out', 'Office Fit-out'
      ],
      'Renovations & Alterations': [
        'Renovation (Full Home)', 'Renovation (Single Room)', 'Structural Alterations',
        'Load-Bearing Wall Removal', 'Kitchen Cabinetry', 'Bathroom Renovation',
        'Laundry Renovation', 'Heritage Restoration'
      ],
      'Carpentry & Joinery': [
        'Carpentry (Structural)', 'Carpentry (Finish)', 'Framing',
        'Custom Joinery', 'Built-in Wardrobes', 'Staircase Construction'
      ],
      'Roofing & Cladding': [
        'Roofing (New)', 'Roofing (Repairs)', 'Cladding Installation',
        'Insulation Installation', 'Weatherboard Repairs'
      ],
      'Doors & Windows': [
        'Door Installation', 'Window Installation'
      ],
      'Outdoor Structures': [
        'Pergola Construction', 'Carport Construction', 'Garage Construction',
        'Retaining Walls (Structural)'
      ],
      'Site Works & Foundations': [
        'Demolition (Full)', 'Demolition (Partial)', 'Underpinning', 'Restumping'
      ],
      'Project Services': [
        'Project Management', 'Site Supervision', 'Defect Rectification'
      ]
    },
    'Electrical & Solar': {
      'General Electrical': [
        'Residential Electrical (General)', 'Commercial Electrical (General)', 'Fault Finding'
      ],
      'Lighting & Power': [
        'Powerpoint Installation', 'Powerpoint Repairs', 'Light Switch Installation',
        'Lighting Installation (Standard)', 'Lighting Installation (Feature)',
        'Downlight Installation', 'Ceiling Fan Installation', 'Exhaust Fan Installation'
      ],
      'Switchboards & Wiring': [
        'Switchboard Upgrade', 'Rewiring (Full Home)', 'Rewiring (Partial)',
        'Underground Cabling', 'Meter Box Upgrade', 'Three-Phase Installation'
      ],
      'Solar & EV': [
        'Solar Panel Installation', 'Solar System Design', 'Solar Battery Installation',
        'Solar Inverter Replacement', 'Solar Panel Cleaning', 'Solar System Inspection',
        'EV Charger Installation'
      ],
      'Data, Comms & Security': [
        'Data & Communications Cabling', 'Phone Point Installation', 'TV Antenna Installation',
        'CCTV Installation', 'Security System Installation', 'Intercom Installation',
        'Home Automation'
      ],
      'Safety & Compliance': [
        'Safety Switch Installation', 'Smoke Alarm Installation',
        'Smoke Alarm Testing & Compliance', 'Electrical Safety Inspection', 'Test & Tag'
      ],
      'Emergency Repairs': [
        'Emergency Electrical Repairs'
      ]
    },
    'Plumbing & Gas': {
      'General Repairs': [
        'General Plumbing Repairs', 'Tap Repairs & Replacement',
        'Toilet Repairs & Replacement', 'Cistern Repairs', 'Leak Detection',
        'Burst Pipe Repairs', 'Pipe Relining', 'Repiping (Full Home)'
      ],
      'Drains & Stormwater': [
        'Blocked Drain Clearing', 'Drain Camera Inspection', 'Drain Relining',
        'Sewer Line Repairs', 'Stormwater Drainage'
      ],
      'Hot Water Systems': [
        'Hot Water System Installation (Electric)', 'Hot Water System Installation (Gas)',
        'Hot Water System Installation (Solar)', 'Hot Water System Installation (Heat Pump)',
        'Hot Water System Repairs'
      ],
      'Gas Fitting': [
        'Gas Fitting (General)', 'Gas Appliance Installation', 'Gas Appliance Repairs',
        'Gas Leak Detection', 'Gas Line Installation', 'Gas Compliance Certificate'
      ],
      'Bathroom & Kitchen': [
        'Bathroom Renovation (Plumbing)', 'Kitchen Plumbing', 'Laundry Plumbing',
        'Dishwasher Installation', 'Washing Machine Installation', 'Water Filter Installation'
      ],
      'Roof & Rainwater': [
        'Roof Plumbing', 'Gutter Installation', 'Gutter Repairs', 'Gutter Cleaning',
        'Downpipe Installation', 'Rainwater Tank Installation'
      ],
      'Backflow & Compliance': [
        'Backflow Prevention Installation', 'Backflow Testing'
      ],
      'Emergency Plumbing': [
        'Emergency Plumbing'
      ]
    },
    'HVAC & Refrigeration': {
      'Split & Multi-Head Systems': [
        'Split System Installation', 'Split System Service', 'Split System Repairs',
        'Cassette Unit Installation', 'Cassette Unit Service',
        'Multi-Head System Installation'
      ],
      'Ducted Systems': [
        'Ducted System Installation', 'Ducted System Service', 'Ducted System Repairs',
        'Ducted System Zoning'
      ],
      'Heating': [
        'Gas Heating Installation', 'Gas Heater Service', 'Gas Heater Repairs',
        'Hydronic Heating Installation', 'Hydronic Heating Service'
      ],
      'Evaporative Cooling': [
        'Evaporative Cooling Installation', 'Evaporative Cooling Service',
        'Evaporative Cooling Repairs'
      ],
      'Commercial Refrigeration': [
        'Commercial Refrigeration Installation', 'Commercial Refrigeration Repairs',
        'Commercial Refrigeration Maintenance', 'Coolroom Installation', 'Coolroom Repairs',
        'Freezer Room Installation', 'Display Fridge Installation', 'Ice Machine Installation'
      ],
      'Air Quality & Ventilation': [
        'Ventilation System Installation', 'Exhaust System Installation',
        'Air Quality Testing', 'Duct Cleaning', 'Filter Replacement'
      ],
      'Service & Repairs': [
        'Refrigerant Regas', 'Thermostat Installation', 'Smart Thermostat Installation',
        'Maintenance Contracts', 'Emergency HVAC Repairs'
      ]
    },
    'Landscaping & Outdoor': {
      'Garden Design & Planting': [
        'Garden Design & Planning', 'Planting & Garden Beds',
        'Hedging & Topiary', 'Tree Removal', 'Tree Pruning & Lopping'
      ],
      'Lawns & Irrigation': [
        'Lawn Installation (Turf)', 'Lawn Installation (Seed)',
        'Irrigation System Installation', 'Irrigation Repairs & Maintenance'
      ],
      'Hard Landscaping': [
        'Retaining Wall Construction', 'Paving & Pathways',
        'Decking Installation', 'Decking Repairs',
        'Pergola & Gazebo Construction', 'Outdoor Lighting Installation',
        'Fencing Installation', 'Fencing Repairs'
      ],
      'Pools': [
        'Pool Construction (Fibreglass)', 'Pool Construction (Concrete)',
        'Pool Renovation & Resurfacing', 'Pool Fencing',
        'Pool Cleaning & Maintenance', 'Pool Equipment Installation'
      ],
      'Concreting': [
        'Concreting (Driveways)', 'Concreting (Paths & Slabs)',
        'Concreting (Decorative / Stencil)'
      ],
      'Maintenance': [
        'Garden Maintenance (Regular)', 'Rubbish & Green Waste Removal'
      ]
    },
    'Painting & Finishing': {
      'Interior Painting': [
        'Interior Painting (per room)', 'Interior Painting (full house)',
        'Feature Wall Painting', 'Ceiling Painting', 'Trim & Skirting Painting',
        'Door Painting', 'Window Frame Painting'
      ],
      'Exterior Painting': [
        'Exterior Painting (full house)', 'Exterior Painting (partial)',
        'Commercial Painting', 'Deck Staining & Oiling', 'Fence Painting / Staining'
      ],
      'Specialist Coatings': [
        'Spray Painting', 'Rendering (Cement)', 'Rendering (Acrylic)', 'Texture Coating'
      ],
      'Wallpaper & Plastering': [
        'Wallpaper Installation', 'Wallpaper Removal',
        'Plastering (Patch Repairs)', 'Plastering (Full Room)', 'Plastering (New Walls)',
        'Cornice Installation', 'Cornice Repairs'
      ],
      'Tiling & Waterproofing': [
        'Tiling (Floor)', 'Tiling (Wall)', 'Tiling (Bathroom Full)', 'Tiling (Splashback)',
        'Waterproofing', 'Tile Repairs', 'Grout Cleaning & Resealing'
      ],
      'Flooring': [
        'Timber Floor Installation', 'Timber Floor Sanding', 'Timber Floor Polishing',
        'Laminate Floor Installation', 'Vinyl Floor Installation',
        'Carpet Installation', 'Carpet Removal', 'Epoxy Flooring', 'Concrete Polishing'
      ],
      'Restoration': [
        'Restoration (Heritage)'
      ]
    },
    'Fabrication & Manufacturing': {
      'Steel Fabrication': [
        'Custom Steel Fabrication', 'Structural Steel Fabrication',
        'Steel Frame Fabrication'
      ],
      'Welding': [
        'Welding (MIG)', 'Welding (TIG)', 'Welding (Stick)'
      ],
      'Aluminium & Stainless': [
        'Aluminium Fabrication', 'Aluminium Welding',
        'Stainless Steel Fabrication', 'Stainless Steel Welding'
      ],
      'Sheet Metal': [
        'Sheet Metal Work', 'Metal Cutting', 'Metal Bending', 'Metal Rolling'
      ],
      'CNC Machining': [
        'CNC Machining', 'CNC Laser Cutting', 'CNC Plasma Cutting', 'CNC Waterjet Cutting',
        'Lathe Work', 'Milling', 'Drilling'
      ],
      'Architectural & Custom': [
        'Balustrade Fabrication', 'Handrail Fabrication', 'Gate Fabrication',
        'Security Screen Fabrication', 'Trailer Fabrication'
      ],
      'Onsite & Repairs': [
        'Trailer Repairs', 'Machinery Repairs', 'Onsite Welding', 'Prototyping',
        'Production Runs', 'Assembly Services'
      ],
      'Coatings & Finishing': [
        'Powder Coating', 'Galvanising Coordination', 'Design & Engineering'
      ]
    },
    'Cleaning & Maintenance': {
      'Commercial Cleaning': [
        'Commercial Office Cleaning', 'Commercial Retail Cleaning', 'Industrial Cleaning',
        'Warehouse Cleaning', 'Strata Common Area Cleaning', 'Medical / Dental Cleaning',
        'Gym / Fitness Cleaning', 'School / Childcare Cleaning'
      ],
      'Residential Cleaning': [
        'Residential Cleaning (Regular)', 'Residential Cleaning (One-off)',
        'Deep Cleaning', 'End of Lease Cleaning', 'Move In / Out Cleaning', 'Spring Cleaning'
      ],
      'Window & Exterior': [
        'Window Cleaning (Interior)', 'Window Cleaning (Exterior)',
        'Window Cleaning (High-Rise)', 'Pressure Washing (Driveway)',
        'Pressure Washing (Deck)', 'Pressure Washing (House Exterior)',
        'Gutter Cleaning', 'Roof Cleaning', 'Solar Panel Cleaning', 'Bin Cleaning'
      ],
      'Carpets, Floors & Upholstery': [
        'Carpet Cleaning', 'Upholstery Cleaning', 'Tile & Grout Cleaning', 'Hard Floor Cleaning'
      ],
      'Pest Control': [
        'Pest Inspection', 'Pest Treatment (General)', 'Pest Treatment (Termite)',
        'Pest Treatment (Rodent)', 'Pest Treatment (Cockroach)', 'Pest Treatment (Bed Bug)'
      ],
      'Handyman Services': [
        'Handyman (General Repairs)', 'Handyman (Furniture Assembly)',
        'Handyman (Picture Hanging)', 'Handyman (Door Repairs)', 'Handyman (Lock Repairs)'
      ],
      'Property Maintenance': [
        'Gutter Repairs', 'Fence Repairs', 'Deck Repairs',
        'Property Maintenance (Contract)', 'Garden Maintenance', 'Lawn Mowing',
        'Rubbish Removal'
      ]
    },
    'Service & Professional': {
      'Accounting & Tax': [
        'Accounting (Monthly)', 'Accounting (Annual)',
        'Tax Return Preparation (Individual)', 'Tax Return Preparation (Business)',
        'BAS Preparation', 'Financial Statements', 'Audit Services'
      ],
      'Bookkeeping & Payroll': [
        'Bookkeeping (Monthly)', 'Bookkeeping (Hourly)', 'Payroll Processing'
      ],
      'Business Advisory & Consulting': [
        'Business Advisory', 'Business Consulting', 'Strategy Consulting',
        'Management Consulting', 'HR Consulting', 'Recruitment Services'
      ],
      'Legal': [
        'Legal Consultation', 'Contract Review', 'Contract Drafting', 'Conveyancing',
        'Wills & Estate Planning', 'Business Legal Services', 'Dispute Resolution'
      ],
      'Property Services': [
        'Property Sales (Commission)', 'Property Sales (Fixed Fee)', 'Property Management',
        'Property Appraisal', 'Buyer’s Agent Services'
      ],
      'IT & Technology': [
        'IT Support (Hourly)', 'IT Support (Contract)', 'IT Consulting',
        'Network Setup', 'Server Maintenance', 'Cloud Services Setup',
        'Cybersecurity Assessment'
      ],
      'Digital': [
        'Website Development', 'Website Maintenance', 'SEO Services',
        'Digital Marketing', 'Social Media Management', 'Graphic Design', 'Branding Services'
      ],
      'Creative & Other': [
        'Photography', 'Videography', 'Training & Workshops'
      ]
    }
  },

  products: {
    'Building & Construction': {
      'Structural Materials': [
        'Timber (Structural)', 'Timber (Finish)', 'Steel Beams',
        'Roofing Materials', 'Insulation Batts', 'Cladding Sheets'
      ],
      'Doors, Windows & Hardware': [
        'Doors (Interior)', 'Doors (Exterior)', 'Windows', 'Hardware & Fixtures'
      ],
      'Cabinetry & Benchtops': [
        'Cabinetry (Flatpack)', 'Cabinetry (Custom)', 'Benchtops'
      ]
    },
    'Electrical & Solar': {
      'Solar & EV': [
        'Solar Panels', 'Solar Inverters', 'Solar Batteries', 'EV Chargers'
      ],
      'Wiring & Power': [
        'Switchboards', 'Powerpoints', 'Light Switches', 'Data Cables (per metre)'
      ],
      'Lighting & Fans': [
        'Downlights', 'Ceiling Fans'
      ],
      'Safety & Comms': [
        'Smoke Alarms', 'Safety Switches', 'TV Antennas', 'CCTV Cameras', 'Security Panels'
      ]
    },
    'Plumbing & Gas': {
      'Hot Water Systems': [
        'Hot Water Systems (Electric)', 'Hot Water Systems (Gas)',
        'Hot Water Systems (Solar)', 'Hot Water Systems (Heat Pump)'
      ],
      'Tapware & Fixtures': [
        'Toilets', 'Toilet Cisterns', 'Taps (Basin)', 'Taps (Kitchen)', 'Taps (Shower)',
        'Showerheads', 'Sinks (Kitchen)', 'Basins (Bathroom)'
      ],
      'Pipes, Tanks & Drainage': [
        'Gas Appliances', 'Water Filters', 'Rainwater Tanks',
        'Guttering (per linear metre)', 'Downpipes'
      ]
    },
    'HVAC & Refrigeration': {
      'Cooling & Heating Units': [
        'Split System Units', 'Ducted System Units', 'Cassette Units',
        'Gas Heaters', 'Evaporative Coolers'
      ],
      'Refrigeration': [
        'Refrigeration Units', 'Coolroom Panels', 'Display Fridges', 'Ice Machines'
      ],
      'Controls & Filters': [
        'Thermostats', 'Smart Thermostats', 'Air Filters'
      ]
    },
    'Landscaping & Outdoor': {
      'Garden Materials': [
        'Turf (per m²)', 'Mulch (per m³)', 'Soil & Compost (per m³)',
        'Plants (per unit)', 'Garden Edging (per linear metre)'
      ],
      'Pool Equipment': [
        'Pool Pumps', 'Pool Filters', 'Pool Cleaners (Robotic)', 'Pool Chemicals'
      ],
      'Hard Landscaping & Lighting': [
        'Pavers (per m²)', 'Decking Timber (per m²)', 'Composite Decking (per m²)',
        'Fencing Panels', 'Fencing Posts',
        'Irrigation Controllers', 'Irrigation Sprinklers',
        'Retaining Wall Blocks (per unit)', 'Outdoor Lighting Fixtures'
      ]
    },
    'Painting & Finishing': {
      'Paints & Coatings': [
        'Interior Paint (per litre)', 'Exterior Paint (per litre)',
        'Deck Oil / Stain (per litre)'
      ],
      'Wall & Ceiling Materials': [
        'Wallpaper (per roll)', 'Plaster Compound', 'Render (per bag)',
        'Cornices (per linear metre)'
      ],
      'Flooring & Tiles': [
        'Tiles (per m²)', 'Tile Adhesive', 'Grout',
        'Timber Flooring (per m²)', 'Laminate Flooring (per m²)',
        'Vinyl Flooring (per m²)', 'Carpet (per m²)', 'Underlay (per m²)'
      ]
    },
    'Fabrication & Manufacturing': {
      'Raw Materials': [
        'Steel (per kg / per metre)', 'Aluminium (per kg / per metre)',
        'Stainless Steel (per kg / per metre)', 'Sheet Metal (per sheet)',
        'Steel Beams', 'Steel Columns'
      ],
      'Architectural & Custom Parts': [
        'Balustrades', 'Handrails', 'Gates', 'Security Screens',
        'Custom Brackets', 'Custom Parts'
      ]
    },
    'Cleaning & Maintenance': {
      'Cleaning Products & Equipment': [
        'Cleaning Products (commercial supply)', 'Pest Control Products', 'Cleaning Equipment'
      ]
    },
    'Service & Professional': {
      'Software & Subscriptions': [
        'Software Licences', 'Software Subscriptions'
      ],
      'Documents & Hardware': [
        'Reports & Documents', 'Training Materials', 'Hardware (IT)'
      ]
    }
  },

  licences: {
    'Building & Construction': {
      "Builder's Licences": [
        'Builder’s Licence (Domestic)', 'Builder’s Licence (Commercial)',
        'Builder’s Licence (Unlimited)', 'Owner Builder Permit',
        'Building Practitioner Registration', 'Registered Building Surveyor'
      ],
      'Demolition & Asbestos': [
        'Demolition Licence', 'Asbestos Removal Licence (Class A)',
        'Asbestos Removal Licence (Class B)'
      ],
      'Site Safety Tickets': [
        'White Card (Construction Induction)', 'Working at Heights Certificate',
        'Scaffolding Licence', 'Rigging Licence', 'Crane Operator Licence',
        'Forklift Licence', 'Dogging Licence',
        'Occupational Health & Safety Certificate', 'First Aid Certificate'
      ],
      'Industry Memberships': [
        'Master Builders Association Member', 'Housing Industry Association (HIA) Member'
      ]
    },
    'Electrical & Solar': {
      'Electrical Licences': [
        'Electrical Licence (Full)', 'Electrical Licence (Restricted)',
        'Electrical Contractor Licence',
        'Restricted Electrical Licence (Disconnect / Reconnect)',
        'Disconnect / Reconnect Authorisation'
      ],
      'Solar & Battery (CEC) Accreditations': [
        'Clean Energy Council (CEC) Accreditation',
        'CEC Solar Design Accreditation', 'CEC Battery Endorsement'
      ],
      'Specialist Registrations': [
        'Data Cabling Registration', 'Security Installer Licence',
        'Test & Tag Competency Certificate', 'Electrical Safety Certificate'
      ],
      'Site Safety Tickets': [
        'White Card (Construction Induction)', 'Working at Heights Certificate',
        'CPR & First Aid Certificate'
      ]
    },
    'Plumbing & Gas': {
      'Plumbing Licences': [
        'Plumbing Licence (Full)', 'Plumbing Licence (Restricted)',
        'Plumbing Contractor Licence', 'Drainer’s Licence', 'Roof Plumber Licence'
      ],
      'Gas Fitting': [
        'Gas Fitting Licence', 'Gas Fitting Permit (Type A)', 'Gas Fitting Permit (Type B)'
      ],
      'Specialist Certifications': [
        'Backflow Prevention Accreditation',
        'Water Efficiency Certification (WELS)',
        'Thermostatic Mixing Valve (TMV) Certification'
      ],
      'Site Safety Tickets': [
        'White Card (Construction Induction)', 'Working at Heights Certificate',
        'CPR & First Aid Certificate'
      ],
      'Industry Memberships': [
        'Master Plumbers Association Member'
      ]
    },
    'HVAC & Refrigeration': {
      'Refrigerant Handling': [
        'Refrigerant Handling Licence (Full)', 'Restricted Refrigerant Handling Licence',
        'ARCTICK Certification', 'Commercial Refrigeration Endorsement'
      ],
      'Mechanical & Trade Licences': [
        'Refrigeration & Air Conditioning Mechanic Licence',
        'Split System Installation Endorsement',
        'Gas Fitting Licence', 'Electrical Licence (Restricted)'
      ],
      'Energy Compliance': [
        'Energy Efficiency Certificate'
      ],
      'Site Safety Tickets': [
        'White Card (Construction Induction)', 'Working at Heights Certificate',
        'CPR & First Aid Certificate'
      ]
    },
    'Landscaping & Outdoor': {
      'Landscaping & Design': [
        'Landscape Contractor Licence', 'Landscape Designer Registration'
      ],
      'Tree & Arborist': [
        'Arborist Qualification (AQF Level 3+)', 'Tree Worker Licence',
        'Chainsaw Operator Certificate'
      ],
      'Pools & Safety': [
        'Pool Builder Licence', 'Pool Safety Inspector Licence',
        'Pool Fence Compliance Certificate'
      ],
      'Specialist Certifications': [
        'Pesticide Application Licence', 'Irrigation Association of Australia Member'
      ],
      'Site Safety Tickets': [
        'White Card (Construction Induction)', 'Working at Heights Certificate',
        'Forklift Licence', 'Traffic Control Certificate', 'CPR & First Aid Certificate'
      ]
    },
    'Painting & Finishing': {
      'Painting Licences': [
        'Painter’s Registration', 'Painting Contractor Licence'
      ],
      'Specialist Certifications': [
        'Lead Paint Removal Certification', 'Asbestos Awareness Certificate',
        'Waterproofing Licence', 'Floor Sanding & Polishing Certification',
        'Dulux Accredited Painter'
      ],
      'Site Safety Tickets': [
        'White Card (Construction Induction)', 'Working at Heights Certificate',
        'Scaffolding Licence', 'CPR & First Aid Certificate'
      ],
      'Industry Memberships': [
        'Master Painters Association Member'
      ]
    },
    'Fabrication & Manufacturing': {
      'Welding & Fabrication': [
        'Welding Certification (AS/NZS 1554)', 'Welding Certification (AS/NZS 2980)',
        'Structural Steel Fabrication Certification', 'Boilermaker Trade Certificate',
        'Pressure Vessel Welding Certification'
      ],
      'Machining & Operations': [
        'CNC Machinist Qualification', 'Forklift Licence', 'Crane Operator Licence',
        'Rigging Licence'
      ],
      'Quality Management': [
        'ISO 9001 Quality Management', 'ISO 3834 Welding Quality'
      ],
      'Site Safety Tickets': [
        'White Card (Construction Induction)', 'Working at Heights Certificate',
        'Occupational Health & Safety Certificate', 'CPR & First Aid Certificate'
      ]
    },
    'Cleaning & Maintenance': {
      'Pest Control': [
        'Pest Management Licence', 'Pest Control Operator Licence', 'Fumigation Licence'
      ],
      'Cleaning Industry Certifications': [
        'Cleaning Industry Certification (ISSA/BSCAI)', 'IICRC Certification',
        'Building Service Contractors Licence',
        'Carpet Cleaning Technician Certification'
      ],
      'Hazard & Safety': [
        'Asbestos Assessor Licence', 'Asbestos Awareness Certificate',
        'Chemical Handling Certificate', 'Working at Heights Certificate',
        'CPR & First Aid Certificate'
      ],
      'Background Checks': [
        'National Police Check', 'Working With Children Check',
        'Security Licence (for premises access)'
      ]
    },
    'Service & Professional': {
      'Accounting & Tax': [
        'CPA Australia Member', 'Chartered Accountant (CA ANZ)',
        'Tax Agent Registration (TPB)', 'BAS Agent Registration (TPB)'
      ],
      'Legal & Property': [
        'Australian Financial Services Licence (AFSL)', 'Practising Certificate (Law)',
        'Real Estate Agent Licence', 'Conveyancer Licence'
      ],
      'IT & Digital Certifications': [
        'CompTIA Certification', 'Cisco Certification (CCNA/CCNP)',
        'Microsoft Certification', 'AWS Certification',
        'Google Ads Certification', 'Meta Blueprint Certification'
      ],
      'Quality & Information Standards': [
        'ISO 9001 Quality Management', 'ISO 27001 Information Security'
      ],
      'Compliance & Insurance': [
        'Professional Indemnity Insurance', 'National Police Check',
        'Working With Children Check', 'CPR & First Aid Certificate'
      ]
    }
  },

  pricingTypes: [
    { value: 'hourly', label: 'Hourly Rate' },
    { value: 'fixed', label: 'Fixed Price' },
    { value: 'range', label: 'Price Range' },
    { value: 'quote', label: 'Quote Required' }
  ],

  serviceAreaOptions: [
    'Local (under 25km)', 'Regional (25-100km)', 'State-wide', 'National', 'International'
  ],

  paymentMethodOptions: [
    'Cash', 'Bank Transfer / EFT', 'Credit Card', 'Debit Card', 'EFTPOS',
    'PayPal', 'Afterpay / Zip Pay', 'Invoice (payment terms)'
  ],

  responseTimeOptions: [
    'Same day', 'Within 24 hours', 'Within 48 hours', 'Within 1 week', 'Varies — contact us'
  ],

  afterHoursOptions: [
    'Not available', 'Emergency only', 'Available'
  ],

  // Merge sub-grouped data across multiple selected industries.
  // Returns an ordered array: [ { name, items[A-Z] }, ... ].
  // Sub-groups with the same name across industries are coalesced
  // (e.g. "Site Safety Tickets" appears once, with deduplicated items).
  _mergeGrouped: function(industries, dataKey) {
    if (!Array.isArray(industries)) industries = [industries];
    var merged = {};
    var order = [];
    var seen = {};
    var data = this[dataKey] || {};
    for (var i = 0; i < industries.length; i++) {
      var groups = data[industries[i]] || {};
      for (var groupName in groups) {
        if (!Object.prototype.hasOwnProperty.call(groups, groupName)) continue;
        if (!merged[groupName]) {
          merged[groupName] = [];
          order.push(groupName);
        }
        var list = groups[groupName];
        for (var j = 0; j < list.length; j++) {
          var key = groupName + '|' + list[j];
          if (!seen[key]) { seen[key] = true; merged[groupName].push(list[j]); }
        }
      }
    }
    return order.map(function(name) {
      return { name: name, items: merged[name].slice().sort(function(a, b) { return a.localeCompare(b); }) };
    });
  },

  getMergedServices: function(industries) { return this._mergeGrouped(industries, 'services'); },
  getMergedProducts: function(industries) { return this._mergeGrouped(industries, 'products'); },
  getMergedLicences: function(industries) { return this._mergeGrouped(industries, 'licences'); },

  getGroupByName: function(name) {
    return this.groups.find(function(g) { return g.name === name; }) || null;
  }
};
