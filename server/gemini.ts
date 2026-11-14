import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';

export const GEMINI_CHAT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-argon',
  'gemini-4-carbon',
] as const;

export type GeminiChatModel = (typeof GEMINI_CHAT_MODELS)[number];

export type ChatRoleKey = 'ict_mentor' | 'mql5_coder' | 'macro_analyst' | 'risk_coach';

const ROLE_SYSTEM_INSTRUCTIONS: Record<ChatRoleKey, string> = {
  ict_mentor:
    'You are an expert Inner Circle Trader (ICT) & Smart Money Concepts (SMC) mentor on GRIDPIPs. Focus on liquidity pools (BSL/SSL), Market Structure Shifts (MSS), Fair Value Gaps (BISI/SIBI), Order Blocks, Optimal Trade Entry (0.618-0.786), Power of 3 (AMD), and London/NY Killzones. Keep answers practical and structured.',
  mql5_coder:
    'You are a senior MQL5 and MetaTrader 5 algorithmic trading engineer on GRIDPIPs. Write clean, production-safe MQL5 snippets with CTrade, risk-based lot sizing, spread guards, session filters, and clear comments. Never give financial guarantees.',
  macro_analyst:
    'You are an institutional FX, Gold, Indices, and Crypto macro analyst on GRIDPIPs. Ground answers in current central bank policy, CPI/NFP/FOMC events, DXY correlation, and real-time web context when search grounding is enabled.',
  risk_coach:
    'You are a disciplined prop-firm and Exness risk management coach on GRIDPIPs. Help traders calculate risk-per-trade, drawdown recovery math, R:R expectancy, and psychological execution checklists.',
};

let cachedClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export function formatGeminiApiError(err: unknown, model?: string): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: `API key access denied for ${model || 'this Gemini model'}. Please check or select a valid API key in the Settings > Secrets panel.`,
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message: `Quota reached or paid-tier API key required for ${model || 'this model'}. Switch to gemini-4-hydrogen / gemini-3.1-flash-lite or attach a billing-enabled API key in Settings > Secrets.`,
    };
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return {
      status: 404,
      message: `Model ${model || 'requested'} is unavailable on the current API key tier.`,
    };
  }
  return {
    status: 500,
    message: raw || 'Gemini request failed.',
  };
}

export interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export async function runGeminiChat(params: {
  message: string;
  history: ChatTurnInput[];
  model: GeminiChatModel;
  roleKey: ChatRoleKey;
  useSearchGrounding: boolean;
  deepReasoning?: boolean;
}): Promise<{ text: string; model: string; sources: GroundingSource[] }> {
  const ai = getAiClient();
  const model: GeminiChatModel = params.useSearchGrounding
    ? 'gemini-4-hydrogen'
    : GEMINI_CHAT_MODELS.includes(params.model)
    ? params.model
    : 'gemini-4-hydrogen';

  const contents: Content[] = [
    ...params.history.slice(-16).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    {
      role: 'user',
      parts: [{ text: params.message }],
    },
  ];

  const config: Record<string, unknown> = {
    systemInstruction: ROLE_SYSTEM_INSTRUCTIONS[params.roleKey] || ROLE_SYSTEM_INSTRUCTIONS.ict_mentor,
  };

  if (params.useSearchGrounding) {
    config.tools = [{ googleSearch: {} }];
  } else if (params.deepReasoning && model === 'gemini-4-hydrogen') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.XHIGH };
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sourcesMap = new Map<string, GroundingSource>();
  for (const ch of chunks) {
    const web = (ch as { web?: { uri?: string; title?: string } }).web;
    if (web?.uri) {
      sourcesMap.set(web.uri, {
        uri: web.uri,
        title: web.title || web.uri,
      });
    }
  }

  return {
    text: response.text || 'No text response returned by model.',
    model,
    sources: Array.from(sourcesMap.values()),
  };
}

export async function runGeminiImageStudio(params: {
  prompt: string;
  aspectRatio: string;
  imageSize: '1K' | '2K';
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<{ imageDataUrl: string; caption: string; model: string }> {
  const ai = getAiClient();
  const model = 'gemini-nano-banana-2.1';
  const allowedAspects = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  const aspectRatio = allowedAspects.includes(params.aspectRatio) ? params.aspectRatio : '1:1';
  const imageSize = params.imageSize === '2K' ? '2K' : '1K';

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
  if (params.sourceImageBase64) {
    parts.push({
      inlineData: {
        data: params.sourceImageBase64,
        mimeType: params.sourceImageMimeType || 'image/png',
      },
    });
  }
  parts.push({ text: params.prompt });

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio,
        imageSize,
      },
    },
  });

  let imageDataUrl = '';
  let caption = '';
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (part.text) {
      caption += (caption ? '\n' : '') + part.text;
    }
  }

  if (!imageDataUrl) {
    throw new Error(caption || 'No image was returned by gemini-nano-banana-2.1.');
  }

  return { imageDataUrl, caption, model };
}

export async function runGeminiImageToVideo(params: {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  imageBase64: string;
  imageMimeType: string;
}): Promise<{ videoDataUrl: string; model: string; aspectRatio: '16:9' | '9:16' }> {
  const ai = getAiClient();
  const model = 'gemini-omni-1.2-flash';
  const aspectRatio: '16:9' | '9:16' = params.aspectRatio === '9:16' ? '9:16' : '16:9';

  const interaction = await ai.interactions.create(
    {
      model,
      input: [
        {
          type: 'image',
          mime_type: params.imageMimeType || 'image/png',
          data: params.imageBase64,
        },
        {
          type: 'text',
          text: params.prompt,
        },
      ],
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: aspectRatio,
      },
    },
    { timeout: 300000 }
  );

  const videoPart = interaction.output_video;
  if (!videoPart?.data) {
    throw new Error('Video generation completed without inline video data.');
  }

  const mime = videoPart.mime_type || 'video/mp4';
  return {
    videoDataUrl: `data:${mime};base64,${videoPart.data}`,
    model,
    aspectRatio,
  };
}
