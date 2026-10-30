import { AiProvider } from './aiProvider.js';

/**
 * Google Gemini Provider (via native fetch to Google AI Studio / Gemini REST API)
 */
export class GeminiAiProvider extends AiProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'gemini';
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = config.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.timeoutMs = config.timeoutMs || 15000;
  }

  async checkHealth() {
    if (!this.apiKey) {
      return { available: false, provider: 'gemini', reason: 'GEMINI_API_KEY is not configured.' };
    }
    return { available: true, provider: 'gemini', model: this.model };
  }

  async generateInvestigationResponse({ prompt, evidenceContext, conversationHistory = [], options = {} }) {
    if (!this.apiKey) {
      throw new Error('Gemini provider unavailable: GEMINI_API_KEY is not configured.');
    }

    const systemInstruction = `You are the InfraPulse AI Incident Investigation Assistant.
Explain deterministic RCA results, evaluate telemetry evidence, and recommend safe diagnostic checks.
RULES:
1. Deterministic RCA candidate rankings are authoritative. Never alter or contest them.
2. Every ID in referencedEvidence MUST exist in the provided evidenceCatalog.
3. Respond with strict JSON matching:
{
  "answer": "string",
  "summary": "string",
  "referencedEvidence": ["id"],
  "supportingSignals": ["string"],
  "contradictorySignals": ["string"],
  "uncertainties": ["string"],
  "suggestedDiagnostics": [{"action": "string", "reason": "string", "service": "string", "motivatingEvidence": "string", "expectedInformationGained": "string"}],
  "requiresHumanVerification": true
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model || this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{
            parts: [{ text: `EVIDENCE CONTEXT:\n${JSON.stringify(evidenceContext, null, 2)}\n\nQUESTION: ${prompt}` }]
          }],
          generationConfig: {
            response_mime_type: 'application/json',
            maxOutputTokens: options.maxTokens || 1200,
            temperature: 0.2
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${txt}`);
      }

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(rawText);
    } finally {
      clearTimeout(timeout);
    }
  }
}

