import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cleanAndParseJSON } from '@/lib/schemaNormalizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function callLLMProvider(systemPrompt: string, userPrompt: string): Promise<string> {
  const activeConfig = await db.llmConfiguration.findFirst({
    where: { isActive: true },
  });

  const provider = activeConfig?.provider || 'LM_STUDIO';
  const modelName = activeConfig?.modelName || 'lmstudio-community';
  const apiKey = activeConfig?.apiKey || '';
  const baseUrl = activeConfig?.baseUrl || 'http://localhost:1234/v1';

  if (provider === 'LM_STUDIO') {
    let cleanedUrl = baseUrl.trim().replace(/\/$/, '');
    if (!cleanedUrl.endsWith('/v1')) {
      cleanedUrl = `${cleanedUrl}/v1`;
    }
    const response = await fetch(`${cleanedUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.15,
        max_tokens: 25000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LM Studio returned an error: ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '';
  }

  if (provider === 'OPENAI') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.15
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI returned an error: ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'ANTHROPIC') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.15
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic returned an error: ${errText}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'GOOGLE') {
    const isInteractionsModel = modelName.includes('3.5') || modelName.includes('interactions');
    
    if (isInteractionsModel) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: modelName,
          input: userPrompt,
          system_instruction: systemPrompt,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
          }
        }),
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini returned an error: ${errText}`);
      }
      
      const data = await response.json();
      const outputStep = data.steps?.find((s: any) => s.type === 'model_output');
      return outputStep?.content?.[0]?.text || '';
    } else {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }]
            }
          ],
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            temperature: 0.15,
            response_mime_type: 'application/json',
          }
        }),
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini returned an error: ${errText}`);
      }
      
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  }

  throw new Error(`Unsupported provider: ${provider}`);
}


export async function POST(req: Request) {
  try {
    const { orgId, functionId, userPrompt = '' } = await req.json();

    if (!orgId || !functionId) {
      return NextResponse.json({ error: 'orgId and functionId are required' }, { status: 400 });
    }

    const org = await db.organization.findUnique({ where: { id: orgId } });
    const func = await db.businessFunction.findUnique({ where: { id: functionId } });

    if (!org || !func) {
      return NextResponse.json({ error: 'Organization or Business Function not found' }, { status: 404 });
    }

    // Construct high-quality fallback data tailored to this function & industry
    const fnName = func.name.toLowerCase();
    let fallbackData: any = {
      processes: [
        {
          name: "Process Scoping & Resource Management",
          description: "Initialize, scope, and plan standard business function workflows.",
          children: [
            { name: "Resource Allocation", description: "Allocate team resources, tools, and technical budgets." },
            { name: "Activity Scheduling & Prioritization", description: "Schedule roadmap tasks, execution checkpoints, and dependency milestones." },
            { name: "SLA Definition & Monitoring", description: "Define and track service level agreement metrics for key deliverables." }
          ]
        },
        {
          name: "Core Operational Execution & Quality Review",
          description: "Execute the core workflow steps and run multi-step QA validation reviews.",
          children: [
            { name: "Operational Workflow Execution", description: "Perform standard operating tasks and capture input-output telemetry." },
            { name: "Quality Assurance & Compliance Review", description: "Validate output parameters against operational guidelines." },
            { name: "Defect Remediation & Optimization", description: "Remediate and adjust any identified process exceptions or runtime failures." }
          ]
        },
        {
          name: "Governance, Auditing & Documentation Maintenance",
          description: "Enforce audit controls, access compliance, and standard operating procedures (SOP).",
          children: [
            { name: "Process Telemetry Compliance Auditing", description: "Audit execution logs, data mappings, and credentials regularly." },
            { name: "SOP Iteration & Performance Review", description: "Evaluate operational benchmarks and update formal process documentation." }
          ]
        }
      ],
      projects: [
        {
          name: `${func.name} Operations Mapping`,
          description: `Map systems, metrics, and data sources for the ${func.name} function.`
        },
        {
          name: `${func.name} Process Integration & Registry`,
          description: `Integrate and unify data registries and operational tools for the ${func.name} function.`
        }
      ],
      objectives: [
        {
          name: "Optimize Enterprise Operational Excellence",
          description: "Standardize process excellence, compliance protocols, and execution controls across all divisions.",
          level: "ORGANIZATION"
        },
        {
          name: `Optimize ${func.name} Operational Cycle Times`,
          description: `Streamline operational workflow steps and execution cycles for ${func.name}.`,
          level: "FUNCTION"
        }
      ]
    };
    const isCart = (org.name || '').toLowerCase().includes('kite') ||
                   (org.industry || '').toLowerCase().includes('car-t') ||
                   (org.industry || '').toLowerCase().includes('vein') ||
                   (org.industry || '').toLowerCase().includes('cell therapy') ||
                   (org.industry || '').toLowerCase().includes('cell & gene') ||
                   (org.description || '').toLowerCase().includes('car-t') ||
                   (org.description || '').toLowerCase().includes('vein to vein');

    const isPharma = fnName.includes('clinical') || fnName.includes('r&d') || fnName.includes('medic') || fnName.includes('research') ||
                     org.industry?.toLowerCase().includes('pharm') || org.industry?.toLowerCase().includes('life') || 
                     org.industry?.toLowerCase().includes('biotech') || org.name.toLowerCase().includes('pharma') || 
                     org.name.toLowerCase().includes('kite') || isCart;

    if (fnName.includes('access') || fnName.includes('formulary') || fnName.includes('reimburse')) {
      if (isPharma) {
        fallbackData = {
          processes: [
            {
              name: "Formulary Submission & P&T Advocacy",
              description: "Compile and present clinical and cost-value dossiers to Pharmacy & Therapeutics (P&T) committees.",
              children: [
                { name: "HEOR Dossier Validation", description: "Validate Health Economics and Outcomes Research endpoints and cost-effectiveness models." },
                { name: "P&T Board Review Liaison", description: "Liaise with health plan directors and clinical pharmacists to address evidence gaps." },
                { name: "Dossier Customization & Localization", description: "Tailor AMCP dossiers to local regional health plan demographics." },
                { name: "Clinical Evidence Pack Compiling", description: "Aggregate peer-reviewed publications, safety reports, and trial data packages." }
              ]
            },
            {
              name: "Pricing & Reimbursement Contracting",
              description: "Negotiate pricing models, discounts, and value-based contracts with payers.",
              children: [
                { name: "Government Pricing Audit", description: "Maintain Medicaid, 340B, and federal ceiling price compliance." },
                { name: "Value Contract Negotiation", description: "Construct risk-sharing agreements linked to patient real-world outcomes." },
                { name: "Rebate Schedule Modeller", description: "Model gross-to-net financial impact under progressive rebate tiers." }
              ]
            },
            {
              name: "Payer Policy & Coverage Determination Tracking",
              description: "Monitor, analyze, and map regional payer policy determinations and prior authorization rules.",
              children: [
                { name: "Prior Authorization Grid Mapping", description: "Map clinical criteria and prior authorization step-therapy protocols." },
                { name: "Medical Policy Bulletin Review", description: "Scan payer medical policy updates to capture tier changes or restrictions." },
                { name: "Coverage Denials Analytics", description: "Track denial rates, patterns, and appeal success rates across major payers." }
              ]
            },
            {
              name: "Channel Strategy & Distribution Logistics",
              description: "Design pharmacy network strategies and specialty distribution channel structures.",
              children: [
                { name: "Specialty Pharmacy Network Selection", description: "Qualify specialty pharmacy partners based on cold-chain and clinical capabilities." },
                { name: "Copay Card & Patient Assistance Design", description: "Structure copay offset programs to support launch accessibility." },
                { name: "Trade & Wholesale Contracting", description: "Negotiate inventory management agreements with major drug wholesalers." }
              ]
            }
          ],
          projects: [
            {
              name: "Market Access & Payer Policy Mapping System",
              description: "Map payer segments, HEOR evidence packages, prior authorization rules, and value-based pricing rules."
            },
            {
              name: "Gross-To-Net Pricing & Rebate Optimization Hub",
              description: "Consolidate rebate logs, government pricing compliance audits, and Medicaid ceiling trackers."
            }
          ],
          objectives: [
            {
              name: "Accelerate Product Patient Launch Velocity",
              description: "Ensure therapeutic coverage reaches peak targets within 6 months of FDA launch approval.",
              level: "ORGANIZATION"
            },
            {
              name: "Accelerate Formulary Inclusion Velocity",
              description: "Minimize time-to-market for therapeutic assets through optimized dossier filing.",
              level: "FUNCTION"
            },
            {
              name: "Optimize Value-Based Contracting Performance",
              description: "Ensure risk-sharing pricing metrics align with clinical trial data feeds.",
              level: "PROCESS",
              processName: "Pricing & Reimbursement Contracting"
            },
            {
              name: "Minimize Prior Authorization Patient Access Barriers",
              description: "Design copay support structures and step-therapy appeals channels to limit therapy delay.",
              level: "PROCESS",
              processName: "Payer Policy & Coverage Determination Tracking"
            }
          ]
        };
      } else {
        fallbackData = {
          processes: [
            {
              name: "Contract Management & Pricing Strategy",
              description: "Set pricing lists, discounts, and contract parameters with major clients.",
              children: [
                { name: "Price Sheet Auditing", description: "Audit list prices against contract sheets." },
                { name: "Reimbursement Policy Tracking", description: "Monitor external insurance reimbursement updates." },
                { name: "Client Discount Modeling", description: "Model gross-to-net margins on high-volume contract pricing." }
              ]
            },
            {
              name: "Payer Alignment & Account Strategy",
              description: "Align regional payer directories with commercial product accounts.",
              children: [
                { name: "Payer Directory Reconciliation", description: "Verify active payer listings." },
                { name: "Coverage Exception Processing", description: "Track non-standard policy coverage approvals." }
              ]
            }
          ],
          projects: [
            {
              name: "Commercial Pricing & Policy Mapping",
              description: "Map core billing systems, contract agreements, and pricing policies."
            }
          ],
          objectives: [
            {
              name: "Maximize Contract Compliance Rate",
              description: "Ensure client orders align perfectly with contracted price matrixes.",
              level: "FUNCTION"
            }
          ]
        };
      }
    } else if (fnName.includes('marketing') || fnName.includes('brand')) {
      if (isPharma) {
        fallbackData = {
          processes: [
            {
              name: "Brand Strategy & Campaign Coordination",
              description: "Design multi-channel brand marketing campaigns aligned with FDA approved indications.",
              children: [
                { name: "Indication Message Mapping", description: "Draft core brand messages for healthcare providers." },
                { name: "Regulatory Ad-Promo Review", description: "Ensure promotional materials pass OPDP compliance." }
              ]
            },
            {
              name: "KOL Engagement & Advisory Boards",
              description: "Partner with medical Key Opinion Leaders to validate therapeutic positioning.",
              children: [
                { name: "KOL Speaker Training", description: "Coordinate speaker bureau briefing and slide decks." },
                { name: "Medical Advisory Panels", description: "Host panels to gather clinical insights on standard of care." }
              ]
            }
          ],
          projects: [
            {
              name: "Pharma Brand Marketing & KOL Registry Ontology",
              description: "Map target physician segments, promotional channel metrics, and advisory boards."
            }
          ],
          objectives: [
            {
              name: "Increase Brand Patient Share of Voice",
              description: "Elevate brand message awareness and adoption rates across major prescriber channels.",
              level: "FUNCTION"
            },
            {
              name: "Align Campaign Messaging with KOL Consensus",
              description: "Incorporate expert physician panel insights into brand marketing materials.",
              level: "PROCESS",
              processName: "KOL Engagement & Advisory Boards"
            }
          ]
        };
      } else {
        fallbackData = {
          processes: [
            {
              name: "Multi-Channel Campaign Strategy",
              description: "Design digital, print, and event marketing campaigns.",
              children: [
                { name: "Content Copywriting", description: "Draft marketing and advertising copy." },
                { name: "Ad Spend Optimization", description: "Distribute budget across media channels." }
              ]
            }
          ],
          projects: [
            {
              name: "Brand Engagement Lifecycle Mapping",
              description: "Map user journeys, ad channels, and customer acquisition metrics."
            }
          ],
          objectives: [
            {
              name: "Maximize Ad Campaign ROI",
              description: "Improve customer acquisition cost (CAC) and campaign performance metrics.",
              level: "FUNCTION"
            }
          ]
        };
      }
    } else if (fnName.includes('sales') || fnName.includes('market') || fnName.includes('commercial') || fnName.includes('field')) {
      if (isPharma) {
        fallbackData = {
          processes: [
            {
              name: "Physician Detailing & Field Engagement",
              description: "Execute clinical detailing visits to targeted prescribers by medical sales reps.",
              children: [
                { name: "Clinical Slide Presentation", description: "Deliver safety profiles and clinical efficacy details to physicians." },
                { name: "Territory Target Alignment", description: "Optimize medical representative route schedules based on prescriber segment value." },
                { name: "Field Detailing Compliance Auditing", description: "Audit slide message delivery alignment with FDA-approved indications." },
                { name: "HCP Feedback Loop Capture", description: "Log medical inquiry requests and physician objections during rep visits." }
              ]
            },
            {
              name: "Sample Distribution & PDMA Compliance",
              description: "Distribute drug samples securely under the Prescription Drug Marketing Act guidelines.",
              children: [
                { name: "Electronic Signature Logging", description: "Verify and log physician sample receipt signatures." },
                { name: "Sample Vault Reconciliation", description: "Audit physical sample storage inventory." },
                { name: "PDMA Discrepancy Resolution", description: "Track and resolve signature discrepancies and inventory variances." }
              ]
            },
            {
              name: "Key Account Management & Hospital Formulary Sales",
              description: "Manage relationships with IDNs, hospital buying groups, and formulary decision-makers.",
              children: [
                { name: "Account Profiling & Tiering", description: "Evaluate hospital purchase history, patient volume, and formulary access." },
                { name: "Hospital Contracting & Discounts", description: "Negotiate GPO price tiers and therapeutic class rebate programs." },
                { name: "Payer Alignment Liaison", description: "Liaise with regional commercial payers to match local formulary tiers." }
              ]
            },
            {
              name: "CRM Management & Detailing Effectiveness Analytics",
              description: "Analyze CRM activity data to measure sales rep reach, frequency, and message recall.",
              children: [
                { name: "Prescription Data Enrichment", description: "Map IQVIA DDD prescriber volume to territory reps." },
                { name: "Message Recall Analytics", description: "Conduct post-detail message recall surveys with target HCPs." },
                { name: "Rep Performance Dashboarding", description: "Generate incentive compensation and target reach dashboards." }
              ]
            }
          ],
          projects: [
            {
              name: "Pharma Sales & Physician Detailing Ontology",
              description: "Map detail slide messages, target physician profiles, and sales compliance rules."
            },
            {
              name: "Key Account & IDN Contracting Visibility System",
              description: "Consolidate GPO purchase histories, discount tiers, and hospital formulary listings."
            }
          ],
          objectives: [
            {
              name: "Maximize Enterprise Revenue Growth",
              description: "Accelerate global brand share growth and target physician prescribing rates across key therapeutic areas.",
              level: "ORGANIZATION"
            },
            {
              name: "Maximize Physician Detailing Message Adherence",
              description: "Align sales representative slide messaging with target clinical outcomes.",
              level: "FUNCTION"
            },
            {
              name: "Ensure Zero PDMA Sample Audit Deviations",
              description: "Reconcile sample inventory sheets and signature logs with 100% compliance.",
              level: "PROCESS",
              processName: "Sample Distribution & PDMA Compliance"
            },
            {
              name: "Accelerate Hospital Formulary Inclusion Timeframe",
              description: "Decrease contract negotiation duration and speed up initial drug order placements inside IDNs.",
              level: "PROCESS",
              processName: "Key Account Management & Hospital Formulary Sales"
            }
          ]
        };
      } else {
        fallbackData = {
          processes: [
            {
              name: "Lead Generation & Scoring",
              description: "Identify and score potential sales prospects.",
              children: [
                { name: "Inbound Capture", description: "Capture leads from web/events." },
                { name: "Lead Score Assignment", description: "Compute lead prioritization score." }
              ]
            },
            {
              name: "Opportunity Management",
              description: "Nurture qualified leads through the sales pipeline.",
              children: [
                { name: "Solution Pitching", description: "Present offerings to clients." },
                { name: "Deal Negotiation", description: "Finalize contracts and terms." }
              ]
            }
          ],
          projects: [
            {
              name: "Lead-to-Cash Lifecycle Mapping",
              description: "Map sales pipelines, CRM data sources, and conversion metrics."
            }
          ],
          objectives: [
            {
              name: "Shorten Sales Pipeline Cycle Time",
              description: "Accelerate opportunity conversion velocity across sales channels.",
              level: "FUNCTION"
            }
          ]
        };
      }
    } else if (fnName.includes('supply') || fnName.includes('logistics') || fnName.includes('manufactur') || fnName.includes('qual')) {
      if (isPharma) {
        fallbackData = {
          processes: [
            {
              name: "Cold Chain Cold Storage Validation",
              description: "Verify that drug shipments remain within temperature constraints throughout transit.",
              children: [
                { name: "Data Logger Reading", description: "Examine temp logger charts upon warehouse receipt." },
                { name: "Deviation Action Trigger", description: "Quarantine batch if temp ranges are breached." }
              ]
            },
            {
              name: "DSCSA Serialization Tracking",
              description: "Track package-level drug serialization to meet Drug Supply Chain Security Act mandates.",
              children: [
                { name: "2D Barcode Verification", description: "Scan and log individual packaging serial codes." },
                { name: "Chain of Custody Handshake", description: "Update electronic pedigree database." }
              ]
            }
          ],
          projects: [
            {
              name: "Pharma Cold Chain & DSCSA Ontology",
              description: "Map physical storage checkpoints, temperature data logs, and pedigree serialization rules."
            }
          ],
          objectives: [
            {
              name: "Achieve Zero Cold Chain Transgressions",
              description: "Maintain strict temperature validation compliance for all biological shipments.",
              level: "PROCESS",
              processName: "Cold Chain Cold Storage Validation"
            },
            {
              name: "Fully Comply with DSCSA Pedigree Track & Trace",
              description: "Implement package-level 2D pedigree scan verifications at every custody exchange.",
              level: "FUNCTION"
            }
          ]
        };
      } else {
        fallbackData = {
          processes: [
            {
              name: "Inventory & Warehousing",
              description: "Track raw material and product inventory levels.",
              children: [
                { name: "Receiving & Logging", description: "Log incoming freight." },
                { name: "Cycle Counting", description: "Verify shelf counts." }
              ]
            },
            {
              name: "Procurement & Sourcing",
              description: "Source and select raw materials vendors.",
              children: [
                { name: "Vendor RFQ Dispatch", description: "Request quotes." },
                { name: "Purchase Order Issue", description: "Confirm buy orders." }
              ]
            }
          ],
          projects: [
            {
              name: "Procure-to-Pay Supply Chain Mapping",
              description: "Map supplier management systems, warehouse logistics, and inventory metrics."
            }
          ],
          objectives: [
            {
              name: "Minimize Order Replenishment Latency",
              description: "Improve buy-order cycle times and warehouse stocking levels.",
              level: "FUNCTION"
            }
          ]
        };
      }
    } else if (fnName.includes('clinical') || fnName.includes('r&d') || fnName.includes('medic') || fnName.includes('research')) {
      fallbackData = {
        processes: [
          {
            name: "Clinical Trial Design",
            description: "Design clinical study protocols and parameters.",
            children: [
              { name: "Cohort Definition", description: "Define patient cohorts." },
              { name: "Endpoint Mapping", description: "Map trial endpoints." }
            ]
          },
          {
            name: "Data Lock & Analysis",
            description: "Secure clinical database and analyze efficacy data.",
            children: [
              { name: "Query Resolution", description: "Resolve clinical data discrepancies." },
              { name: "Statistical Compute", description: "Compute trial results." }
            ]
          }
        ],
        projects: [
          {
            name: "Clinical Registry Data Grounding",
            description: "Map clinical trial datasets, patient registries, and efficacy metrics."
          }
        ],
        objectives: [
          {
            name: "Reduce Clinical Trial Patient Onboarding Latency",
            description: "Optimize patient screening, recruitment, and cohort matching processes.",
            level: "FUNCTION"
          },
          {
            name: "Accelerate Statistical Clinical Study Auditing",
            description: "Streamline clinical query resolution times prior to data locking.",
            level: "PROCESS",
            processName: "Data Lock & Analysis"
          }
        ]
      };
    }    // CAR-T Specific Fallback Overrides
    if (isCart) {
      if (fnName.includes('enroll') || fnName.includes('schedul') || fnName.includes('v2v') || fnName.includes('vein') || fnName.includes('apheresis') || fnName.includes('site') || fnName.includes('supply') || fnName.includes('logistics') || fnName.includes('manufactur') || fnName.includes('qual')) {
        fallbackData = {
          processes: [
            {
              name: "Patient Apheresis Scheduling & Slot Allocation",
              description: "Coordinate patient leukapheresis dates with manufacturing slot availability.",
              children: [
                { name: "Verify Clinical Slot Capacity", description: "Query central cell processing slots for active manufacturing weeks." },
                { name: "Lock Apheresis Appointment", description: "Schedule blood collection at certified clinical apheresis center." },
                { name: "Initiate Chain of Identity (COI)", description: "Generate unique patient/batch identifier tags and COI record." }
              ]
            },
            {
              name: "Vein-to-Vein Operations Tracking",
              description: "Monitor end-to-end autologous manufacturing and delivery lifecycle.",
              children: [
                { name: "Leukapheresis Collection Verification", description: "Verify patient ID, collection volume, and cell viability indicators." },
                { name: "COI/COC Serialization Handshake", description: "Scan cryogenic courier container codes to match digital COI." },
                { name: "Patient Infusion Readiness Audit", description: "Validate pre-conditioning chemotherapy status and final product release." }
              ]
            }
          ],
          projects: [
            {
              name: "Vein-to-Vein Digital Orchestration Platform",
              description: "Integrate slot scheduling, COI/COC tracking, and courier telemetry."
            }
          ],
          objectives: [
            {
              name: "Minimize End-to-End Vein-to-Vein Cycle Time",
              description: "Target a standard V2V duration of under 21 days for all enrolled patients.",
              level: "FUNCTION"
            },
            {
              name: "Enforce 100% Chain of Identity Compliance",
              description: "Ensure zero mismatch incidents between patient collections and engineered CAR-T infusions.",
              level: "PROCESS",
              processName: "Vein-to-Vein Operations Tracking"
            }
          ]
        };
      } else if (fnName.includes('access') || fnName.includes('reimburse')) {
        fallbackData = {
          processes: [
            {
              name: "Value-Based Payer Contracting",
              description: "Negotiate performance-linked outcomes contracts for high-cost cell therapies.",
              children: [
                { name: "Outcomes Registry Tracking", description: "Collect real-world evidence and patient remission rates at 6/12 months." },
                { name: "Reimbursement Milestone Auditing", description: "Verify patient response parameters to trigger scheduled payer disbursements." }
              ]
            }
          ],
          projects: [
            {
              name: "CAR-T Reimbursement & Value Contract Tracker",
              description: "Map clinical outcomes registries to billing/reimbursement claim systems."
            }
          ],
          objectives: [
            {
              name: "Accelerate Time-to-Coverage Determination",
              description: "Reduce insurance approval and prior-authorization latency to under 72 hours from patient enrollment.",
              level: "FUNCTION"
            }
          ]
        };
      }
    }

    let cartInstruction = '';
    if (isCart) {
      cartInstruction = `\nSPECIAL CAR-T / CELL THERAPY MODEL REQUIREMENT: This is a CAR-T / Cell Therapy (autologous vein-to-vein model) organization. You MUST explicitly tailor the processes, solutions, and objectives to autologous cell therapy workflows. This includes patient slot scheduling, leukapheresis, Chain of Custody (COC) and Chain of Identity (COI), ultra-cold / cryogenic logistics, cell manufacturing/engineering (processing, activation, transduction, expansion), Quality Control release testing, and patient re-infusion. Avoid generic small molecule R&D/manufacturing.`;
    }

    const systemPrompt = `You are a specialist enterprise architecture and domain ontology modeller.
CRITICAL INSTRUCTION: You MUST tailor all suggested business processes, sub-processes, projects, and objectives/AI missions to the SPECIFIC organization name ("${org.name}"), its industry vertical ("${org.industry || 'General'}"), its description ("${org.description || ''}"), and the selected business function ("${func.name}").${cartInstruction}

COMPREHENSIVENESS REQUIREMENT:
1. "processes": Suggest at least 4 to 6 major end-to-end business processes for this function, each having at least 3 to 4 granular sub-processes/activities. They must cover the full scope of the function comprehensively.
2. "projects" (Business Solutions): Suggest at least 2 to 3 projects/solutions.
3. "objectives" (AI Missions / Objectives): Suggest at least 4 to 6 key objectives. You must generate:
   - At least 1-2 cross-functional objectives with level "ORGANIZATION" that span across business functions for this organization vertical.
   - At least 2 objectives with level "FUNCTION" that are specific to the "${func.name}" function.
   - At least 2 process-aligned objectives with level "PROCESS" that align directly to one of the names in your "processes" list.

Do NOT suggest generic or vanilla items (e.g. do not just suggest generic "Sales Lead Capture" or "Optimize Operations").
Instead, suggest specialized clinical/industry-specific items.

CRITICAL RULES:
1. NO INTERNAL REASONING: Do NOT emit internal thoughts, scratchpad monologue, or thinking tags (<think>...</think>).
2. START IMMEDIATELY: Start on token 1 with the opening '{' brace.
3. RAW JSON ONLY: Respond with ONLY a valid JSON object (with no additional explanation, commentary, or markdown fences) matching this schema:
{
  "processes": [
    {
      "name": "Process Name",
      "description": "Process Desc",
      "children": [
        { "name": "Sub-process Name", "description": "Sub-process Desc" }
      ]
    }
  ],
  "projects": [
    { "name": "Project Name", "description": "Project Desc" }
  ],
  "objectives": [
    { "name": "Objective Name", "description": "Objective Desc", "level": "ORGANIZATION" },
    { "name": "Function Objective Name", "description": "Function Objective Desc", "level": "FUNCTION" }
  ]
}`;

    const reply = await callLLMProvider(systemPrompt, userPrompt || `Suggest processes and projects for ${func.name}`);
    const data = cleanAndParseJSON(reply, fallbackData);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error generating AI proposals:', error);
    return NextResponse.json({ error: `AI generation failed: ${error.message}` }, { status: 500 });
  }
}
