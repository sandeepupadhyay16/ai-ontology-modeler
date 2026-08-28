import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

function cleanAndParseJSON(reply: string, fallbackData: any): any {
  let jsonString = reply.trim();
  try {
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
    return JSON.parse(jsonString);
  } catch (e) {
    return fallbackData;
  }
}

export async function POST(req: Request) {
  try {
    const { industry, businessFunction, processName } = await req.json();

    const scopeText = processName 
      ? `Business Process / Sub-process: "${processName}" (under Business Function: "${businessFunction}")`
      : `Business Function: "${businessFunction}" level (cross-process)`;

    const isCart = (industry || '').toLowerCase().includes('car-t') ||
                   (industry || '').toLowerCase().includes('vein') ||
                   (industry || '').toLowerCase().includes('cell therapy') ||
                   (industry || '').toLowerCase().includes('cell & gene');

    let cartInstruction = '';
    if (isCart) {
      cartInstruction = `\nSPECIAL CAR-T / CELL THERAPY MODEL REQUIREMENT: This is a CAR-T / Cell Therapy (autologous vein-to-vein model) organization. You MUST explicitly tailor the objectives to autologous cell therapy workflows (e.g., cell manufacturing, Chain of Custody (COC), Chain of Identity (COI), patient leukapheresis, cryogenic logistics, cell expansion, release testing, re-infusion, or cell therapy value-based contracting/payer prior authorization grids).`;
    }

    const systemPrompt = `You are a strategic AI enterprise advisor.
Your goal is to suggest exactly 4 high-value, highly specific Business Objectives & AI Missions for the given scope:
- Industry: ${industry || 'General'}
- Scope: ${scopeText}
${cartInstruction}

Do NOT generate generic goals like "Increase efficiency" or "Boost sales".
Refuse generic phrasing. Instead, generate target-driven business objectives or AI agent missions tailored to this vertical (e.g., "Maximize formulary approval velocity for therapeutic launches" or "Automate clinical trial cohort mismatch detection").

CRITICAL RULES:
1. NO INTERNAL REASONING: Do NOT emit internal thoughts, scratchpad monologue, or thinking tags (<think>...</think>).
2. START IMMEDIATELY: Start on token 1 with the opening '{' brace.
3. RAW JSON ONLY: Respond with ONLY a valid JSON object containing an array of exactly 4 strings in this format:
{
  "objectives": [
    "Objective 1",
    "Objective 2",
    "Objective 3",
    "Objective 4"
  ]
}`;

    let fallbackData = {
      objectives: [
        `Optimize ${businessFunction} operational cycle times`,
        `Automate system integrations across ${businessFunction} processes`,
        `Implement AI-driven anomaly detection in ${processName || businessFunction}`,
        `Deploy cognitive assistant agents for ${processName || businessFunction} stakeholders`
      ]
    };

    if (isCart) {
      const bfLower = businessFunction.toLowerCase();
      if (bfLower.includes('enroll') || bfLower.includes('schedul') || bfLower.includes('v2v') || bfLower.includes('vein') || bfLower.includes('apheresis')) {
        fallbackData = {
          objectives: [
            "Minimize end-to-end vein-to-vein (V2V) cycle times below 21 days",
            "Achieve 100% Chain of Identity (COI) compliance during apheresis and infusing procedures",
            "Automate patient clinical slot allocation notifications for treatment centers",
            "Deploy AI verification agent to audit pre-conditioning chemotherapy checklist"
          ]
        };
      } else if (bfLower.includes('logistics') || bfLower.includes('supply') || bfLower.includes('cryo')) {
        fallbackData = {
          objectives: [
            "Eliminate cryogenic logistics temperature excursions above -150C",
            "Implement real-time GPS & thermal telemetry audit logs for LN2 dry shippers",
            "Minimize delivery cycle latency between apheresis site and manufacturing facility",
            "Automate Chain of Custody verification scans at transport handoff checkpoints"
          ]
        };
      } else if (bfLower.includes('manufactur') || bfLower.includes('cell') || bfLower.includes('processing')) {
        fallbackData = {
          objectives: [
            "Maximize CAR-T cell manufacturing success rate and bioreactor yield",
            "Streamline out-of-specification (OOS) batch deviation root-cause analysis",
            "Automate sterility and mycoplasma testing certificate verification checks",
            "Optimize T-cell selection and viral vector transduction efficiency logs"
          ]
        };
      }
    }

    const reply = await callLLMProvider(systemPrompt, `Generate objectives for ${industry} - ${businessFunction}`);
    const data = cleanAndParseJSON(reply, fallbackData);

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
