import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ontologyId } = await params;

    const ontology = await db.ontology.findUnique({
      where: { id: ontologyId },
      include: {
        concepts: {
          select: { label: true, conceptType: true }
        }
      }
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    const industry = ontology.industry || 'General';
    const businessFunction = ontology.businessFunction || 'General';
    const objective = ontology.objective || 'General Expansion';
    const currentConceptLabels = ontology.concepts.map(c => `${c.label} (${c.conceptType})`).join(', ');

    const lmStudioUrl = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';

    const systemPrompt = `You are the AI Ontology Suggestion Agent.
Your task is to generate next-step prompt suggestions to expand the active ontology.
The suggestions must be highly contextual to the active industry, business function, and business objective.

JTBD & DSRP INTEGRATION GUIDELINE:
- Incorporate Jobs to be Done (JTBD) and DSRP systems thinking.
- Include recommendations for user Jobs represented as Process concepts prefixed with '[JOB] ' (e.g. '[JOB] MinimizeTreatmentDelay').
- Include recommendations for Desired Outcomes represented as Metric concepts prefixed with '[OUTCOME] ' (e.g. '[OUTCOME] ReductionInFailureRates').
- Encourage linking Jobs and Outcomes to standard operational processes and entities.

CONTEXT PROFILE:
- Industry: ${industry}
- Business Function: ${businessFunction}
- Business Objective: ${objective}
- Existing Concepts in Graph: [${currentConceptLabels}]

You must output a single, valid JSON object containing exactly 4 arrays of string suggestion prompts (keep each suggestion short, active, and click-to-run, e.g. "Add PhysicianEngagement and CongressEvents processes"):
{
  "concepts": [
    "Context-specific suggestion to add processes/entities/personas/jobs"
  ],
  "metrics": [
    "Context-specific suggestion to define key metrics/KPIs/outcomes"
  ],
  "cqs": [
    "Context-specific suggestion to add competency questions"
  ],
  "driverTrees": [
    "Context-specific suggestion to model causal driver trees and feedback cycles"
  ]
}

Generate 3-4 suggestions per category. Return ONLY the JSON object. Do not wrap in markdown code blocks or add any other text.`;

    let suggestions;
    try {
      const response = await fetch(`${lmStudioUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'lmstudio-community',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Generate contextual suggestions.' }
          ],
          temperature: 0.2
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let reply = data.choices[0]?.message?.content || '';
        
        // Clean reply string
        let jsonString = reply.trim();
        if (jsonString.includes('</think>')) {
          const parts = jsonString.split('</think>');
          jsonString = parts[parts.length - 1].trim();
        }
        if (jsonString.includes('```')) {
          const matches = jsonString.match(/```(?:json)?([\s\S]*?)```/);
          if (matches && matches[1]) {
            jsonString = matches[1].trim();
          }
        }
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }
        suggestions = JSON.parse(jsonString);
      }
    } catch (e) {
      console.warn('LM Studio suggestions fetch failed, using fallback suggestions.', e);
    }

    // Fallback static domain-accurate suggestions if LLM is unavailable or fails to parse
    if (!suggestions) {
      if (industry.toLowerCase().includes('pharm') || businessFunction.toLowerCase().includes('sales')) {
        suggestions = {
          concepts: [
            "Add PhysicianEngagement and CongressEvents processes",
            "Model the MedicalScienceLiaison (MSL) and Patient support roles",
            "Link ProductPortfolio entity to TreatmentAdministration process"
          ],
          metrics: [
            "Define PatientAwarenessRate and ReimbursementApprovalRate KPIs",
            "Add TargetSegmentCoverage and SalesCallFrequency metrics",
            "Create EfficacyRating and HEORAnalyticsApproved percentage metrics"
          ],
          cqs: [
            "Add CQ: What is the correlation between speaker program frequency and physician awareness?",
            "Add CQ: Which accounts have high unmet need but low sales call coverage?",
            "Add CQ: How does reimbursement approval delay affect patients treated count?"
          ],
          driverTrees: [
            "Model a reinforcing feedback loop for PhysicianAwareness driven by SalesCalls and congresses",
            "Construct a causal driver tree for patients treated access and reimbursement coverage",
            "Create a balancing loop for pricing discounts against HEOR efficacy metrics"
          ]
        };
      } else {
        suggestions = {
          concepts: [
            "Add CustomerJourney and Acquisition channels",
            "Model the operations team role and inventory objects",
            "Link digital touchpoints to transaction events"
          ],
          metrics: [
            "Define CustomerConversionRate and CustomerRetentionRate KPIs",
            "Add LeadToOpportunityRatio and CostPerAcquisition metrics",
            "Create InventoryTurnoverRatio and FulfilmentSpeed indicators"
          ],
          cqs: [
            "Add CQ: Which marketing channels yield the highest conversion rate?",
            "Add CQ: What is the customer churn rate by segment?",
            "Add CQ: How does delivery speed correlate with customer retention?"
          ],
          driverTrees: [
            "Model a causal tree for CustomerLifetimeValue (LTV) driven by retention and purchase frequency",
            "Construct a causal cycle for lead generation against conversion costs",
            "Create an operational efficiency driver tree"
          ]
        };
      }
    }

    return NextResponse.json(suggestions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate suggestions' }, { status: 500 });
  }
}
