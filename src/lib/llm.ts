import { db } from '@/lib/db';
import http from 'http';
import { setGlobalDispatcher, Agent } from 'undici';

// Override global Node.js HTTP server request and headers timeouts (default is 5 mins) to 15 mins
if (http.Server && http.Server.prototype) {
  http.Server.prototype.headersTimeout = 900000;
  http.Server.prototype.requestTimeout = 900000;
  http.Server.prototype.keepAliveTimeout = 900000;
}

// Override global Node.js client-side fetch timeouts (default is 5 mins) to 15 mins
setGlobalDispatcher(new Agent({
  headersTimeout: 900000,
  bodyTimeout: 900000,
  connectTimeout: 900000,
}));

/** Low-level provider invocation, shared by every LLM call site (extraction, generation, taxonomy, etc). */
export async function callLLMProvider(systemPrompt: string, userPrompt: string): Promise<string> {
  const activeConfig = await db.llmConfiguration.findFirst({
    where: { isActive: true },
  });

  // Dev-only convenience: with no configured provider, use GEMINI_API_KEY so local
  // runs work without LM Studio. Production must configure LlmConfiguration explicitly —
  // we do NOT want unconfigured prod silently routing prompts to an external provider.
  const envFallbackProvider =
    process.env.NODE_ENV !== 'production' && process.env.GEMINI_API_KEY ? 'GOOGLE' : 'LM_STUDIO';

  const provider = activeConfig?.provider || envFallbackProvider;
  const modelName = activeConfig?.modelName || (provider === 'GOOGLE' ? 'gemini-flash-latest' : 'lmstudio-community');
  const apiKey = activeConfig?.apiKey || (provider === 'GOOGLE' ? (process.env.GEMINI_API_KEY || '') : '');
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
      signal: AbortSignal.timeout(900000),
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.15,
        max_tokens: 130000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LM Studio returned an error: ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
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
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.15,
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
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 4000,
        temperature: 0.15,
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
          },
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
              parts: [{ text: userPrompt }],
            },
          ],
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          generationConfig: {
            temperature: 0.15,
            response_mime_type: 'application/json',
          },
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

/** Strips <think> blocks / markdown fences and repairs truncated JSON before parsing an LLM reply. */
export function cleanAndParseJSON(reply: string): any {
  let jsonString = reply.trim();

  // Strip thinking tags if present in reasoning models (e.g. <think>...</think>)
  if (jsonString.includes('</think>')) {
    const parts = jsonString.split('</think>');
    jsonString = parts[parts.length - 1].trim();
  } else if (jsonString.includes('<think>')) {
    const startThink = jsonString.indexOf('<think>');
    const endThink = jsonString.indexOf('</think>');
    if (startThink !== -1 && endThink !== -1) {
      jsonString = (jsonString.substring(0, startThink) + jsonString.substring(endThink + 8)).trim();
    }
  }

  // Clean markdown code blocks if present
  if (jsonString.includes('```')) {
    const matches = jsonString.match(/```(?:json)?([\s\S]*?)```/);
    if (matches && matches[1]) {
      jsonString = matches[1].trim();
    }
  }

  const firstBrace = jsonString.indexOf('{');
  const lastBrace = jsonString.lastIndexOf('}');
  if (firstBrace !== -1) {
    if (lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    } else {
      jsonString = jsonString.substring(firstBrace);
      let openBraces = 0;
      let openBrackets = 0;
      for (let i = 0; i < jsonString.length; i++) {
        if (jsonString[i] === '{') openBraces++;
        else if (jsonString[i] === '}') openBraces--;
        else if (jsonString[i] === '[') openBrackets++;
        else if (jsonString[i] === ']') openBrackets--;
      }
      while (openBrackets > 0) {
        jsonString += ']';
        openBrackets--;
      }
      while (openBraces > 0) {
        jsonString += '}';
        openBraces--;
      }
    }
  }
  return JSON.parse(jsonString);
}
