import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

type FallbackProviderName =
  | 'groq'
  | 'openrouter'
  | 'cloudflare'
  | 'mistral'
  | 'cohere'
  | 'nvidia'
  | 'zai'
  | 'requesty';

interface ProviderDefinition {
  name: FallbackProviderName;
  endpoint: string;
  apiKey: string;
  models: string[];
  protocol: 'openai' | 'cohere';
  headers?: Record<string, string>;
  trialOnly?: boolean;
}

const DEFAULT_MODELS: Record<FallbackProviderName, string[]> = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen3.8-27b', 'llama-3.1-8b-instant'],
  openrouter: ['deepseek/deepseek-v4.1-flash:free', 'nvidia/nemotron:free'],
  cloudflare: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  mistral: ['mistral-small-latest', 'open-mistral-nemo'],
  cohere: ['command-r', 'command-r-plus'],
  nvidia: ['nvidia/llama-3.1-70b-instruct', 'deepseek-ai/deepseek-v4.1-flash'],
  zai: ['glm-4.7-flash', 'glm-4.5-flash'],
  requesty: [],
};

function parseModelOverrides(): Partial<Record<FallbackProviderName, string[]>> {
  try {
    const parsed = JSON.parse(env.AI_TEXT_FALLBACK_MODELS_JSON || '{}') as Record<string, unknown>;
    const result: Partial<Record<FallbackProviderName, string[]>> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const models = value
        .filter((model): model is string => typeof model === 'string')
        .map((model) => model.trim())
        .filter((model) => model.length > 0);
      if (models.length > 0) result[name as FallbackProviderName] = models;
    }
    return result;
  } catch {
    return {};
  }
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const direct = record.text ?? record.output_text;
  if (typeof direct === 'string') return direct.trim();
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const message = first.message as Record<string, unknown> | undefined;
    const content = message?.content ?? first.text ?? first.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      const parts = content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            const candidate = part as Record<string, unknown>;
            if (typeof candidate.text === 'string') return candidate.text;
            if (typeof candidate.content === 'string') return candidate.content;
          }
          return '';
        })
        .filter((part) => part.length > 0);
      return parts.join('\n').trim();
    }
  }
  return '';
}

export class AiTextFallbackService {
  async answerQuestion(
    prompt: string,
    options: { ignoreHermetic?: boolean } = {}
  ): Promise<string | null> {
    if (!env.AI_TEXT_FALLBACK_ENABLED) return null;
    if (process.env.HERMETIC_TEST === 'true' && !options.ignoreHermetic) return null;

    const overrides = parseModelOverrides();
    const providers = this.buildProviders(overrides);
    const order = env.AI_TEXT_FALLBACK_PROVIDER_ORDER.split(',')
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0);

    const attempted = new Set<string>();
    for (const name of order) {
      const provider = providers.find((candidate) => candidate.name === name);
      if (!provider || attempted.has(provider.name)) continue;
      attempted.add(provider.name);

      if (provider.trialOnly && env.IS_PRODUCTION && !env.AI_ALLOW_TRIAL_PROVIDERS) {
        continue;
      }

      for (const model of provider.models) {
        try {
          const text = await this.callProvider(provider, model, prompt);
          if (text) return text;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`AI text fallback failed for ${provider.name}/${model}; continuing`, {
            error: message,
          });
        }
      }
    }

    return null;
  }

  private buildProviders(
    overrides: Partial<Record<FallbackProviderName, string[]>>
  ): ProviderDefinition[] {
    const modelsFor = (name: FallbackProviderName): string[] =>
      overrides[name] ?? DEFAULT_MODELS[name];

    const definitions: ProviderDefinition[] = [
      {
        name: 'groq',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: env.GROQ_API_KEY,
        models: modelsFor('groq'),
        protocol: 'openai',
      },
      {
        name: 'openrouter',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: env.OPENROUTER_API_KEY,
        models: modelsFor('openrouter'),
        protocol: 'openai',
        headers: {
          'HTTP-Referer': env.APP_URL,
          'X-Title': 'Earth Talk',
        },
      },
      {
        name: 'cloudflare',
        endpoint: env.CLOUDFLARE_ACCOUNT_ID
          ? `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`
          : '',
        apiKey: env.CLOUDFLARE_API_TOKEN,
        models: modelsFor('cloudflare'),
        protocol: 'openai',
      },
      {
        name: 'mistral',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        apiKey: env.MISTRAL_API_KEY,
        models: modelsFor('mistral'),
        protocol: 'openai',
      },
      {
        name: 'nvidia',
        endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
        apiKey: env.NVIDIA_API_KEY,
        models: modelsFor('nvidia'),
        protocol: 'openai',
      },
      {
        name: 'zai',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        apiKey: env.ZAI_API_KEY,
        models: modelsFor('zai'),
        protocol: 'openai',
      },
      {
        name: 'requesty',
        endpoint: 'https://router.requesty.ai/v1/chat/completions',
        apiKey: env.REQUESTY_API_KEY,
        models: modelsFor('requesty'),
        protocol: 'openai',
      },
      {
        name: 'cohere',
        endpoint: 'https://api.cohere.com/v2/chat',
        apiKey: env.COHERE_API_KEY,
        models: modelsFor('cohere'),
        protocol: 'cohere',
        trialOnly: true,
      },
    ];

    return definitions.filter(
      (provider) => provider.apiKey.length > 0 && provider.endpoint.length > 0
    );
  }

  private async callProvider(
    provider: ProviderDefinition,
    model: string,
    prompt: string
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TEXT_FALLBACK_TIMEOUT_MS);

    try {
      const body =
        provider.protocol === 'cohere'
          ? { model, message: prompt, temperature: 0.2, max_tokens: 800 }
          : {
              model,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2,
              max_tokens: 800,
            };

      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${provider.apiKey}`,
          ...(provider.headers ?? {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      return extractResponseText(payload);
    } finally {
      clearTimeout(timer);
    }
  }
}

export const aiTextFallbackService = new AiTextFallbackService();
