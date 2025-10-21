// OpenAI Audio Pricing (per 1M tokens) - Updated as of latest pricing
export const OPENAI_PRICING = {
  'gpt-realtime': {
    input: 32.00,
    cachedInput: 0.40,
    output: 64.00
  },
  'gpt-4o-realtime-preview': {
    input: 40.00,
    cachedInput: 2.50,
    output: 80.00
  },
  'gpt-4o-mini-realtime-preview': {
    input: 10.00,
    cachedInput: 0.30,
    output: 20.00
  },
  'gpt-audio': {
    input: 40.00,
    cachedInput: 0,
    output: 80.00
  },
  'gpt-4o-audio-preview': {
    input: 40.00,
    cachedInput: 0,
    output: 80.00
  },
  'gpt-4o-mini-audio-preview': {
    input: 10.00,
    cachedInput: 0,
    output: 20.00
  }
} as const;

export interface CostBreakdown {
  inputCost: number;
  cachedInputCost: number;
  outputCost: number;
  totalCost: number;
  totalCachedTokens: number;
  totalNonCachedTokens: number;
  totalTextTokens: number;
  totalAudioTokens: number;
  savings: number;
}

export function calculateCost(usage: any, modelName: string = 'gpt-realtime'): CostBreakdown {
  const pricing = OPENAI_PRICING[modelName as keyof typeof OPENAI_PRICING] || OPENAI_PRICING['gpt-realtime'];

  // Initialize token counters
  let totalCachedTokens = 0;
  let totalTextTokens = 0;
  let totalAudioTokens = 0;
  let totalNonCachedTokens = usage.inputTokens;

  // Check if using new detailed token structure
  if (usage.inputTokensDetails && usage.inputTokensDetails.length > 0) {
    usage.inputTokensDetails.forEach((details: any) => {
      // Handle new structure with text_tokens, audio_tokens, cached_tokens
      if (details.text_tokens !== undefined || details.audio_tokens !== undefined) {
        totalTextTokens += details.text_tokens || 0;
        totalAudioTokens += details.audio_tokens || 0;

        // Handle cached tokens - could be in cached_tokens or cached_tokens_details
        if (details.cached_tokens !== undefined) {
          totalCachedTokens += details.cached_tokens;
        } else if (details.cached_tokens_details) {
          totalCachedTokens += (details.cached_tokens_details.text_tokens || 0) +
                              (details.cached_tokens_details.audio_tokens || 0);
        }
      } else {
        // Handle old structure
        totalCachedTokens += details.cached_tokens || 0;
      }
    });

    // Non-cached tokens = total input - cached tokens
    totalNonCachedTokens = Math.max(0, usage.inputTokens - totalCachedTokens);
  }

  // Calculate costs (pricing is per 1M tokens)
  const inputCost = (totalNonCachedTokens / 1_000_000) * pricing.input;
  const cachedInputCost = (totalCachedTokens / 1_000_000) * pricing.cachedInput;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + cachedInputCost + outputCost;

  return {
    inputCost,
    cachedInputCost,
    outputCost,
    totalCost,
    totalCachedTokens,
    totalNonCachedTokens,
    totalTextTokens,
    totalAudioTokens,
    savings: ((totalCachedTokens / 1_000_000) * (pricing.input - pricing.cachedInput))
  };
}