import { calculateCost } from './cost-calculator';
import { formatTime, getSessionDuration } from './session-timer';
import { RealtimeSession } from '@openai/agents/realtime';

let usageInterval: number | null = null;
let hasUsageData = false;

export function updateSummaryButtonVisibility(session: RealtimeSession, isConnected: boolean = true) {
  if (!session) return;

  const summaryControls = document.getElementById('summary-controls');
  if (!summaryControls) return;

  if (session.usage.requests >= 4 && isConnected) {
    summaryControls.style.display = 'flex';
  } else {
    summaryControls.style.display = 'none';
  }
}

export function logUsageInfo(session: RealtimeSession) {
  if (!session) return;

  const usage = session.usage;
  const sessionDuration = getSessionDuration();

  console.group('🔍 OpenAI API Usage Statistics');
  console.log(`⏱️  Session Duration: ${formatTime(sessionDuration)}`);
  console.log(`📊 Requests: ${usage.requests}`);
  console.log(`📥 Input Tokens: ${usage.inputTokens}`);
  console.log(`📤 Output Tokens: ${usage.outputTokens}`);
  console.log(`🔢 Total Tokens: ${usage.totalTokens}`);

  console.log('🔍 Complete Usage Object:', JSON.stringify(usage, null, 2));

  if (usage.inputTokensDetails && usage.inputTokensDetails.length > 0) {
    console.log('📋 Input Token Details:');
    usage.inputTokensDetails.forEach((details, index) => {
      console.log(`  Request ${index + 1}:`, details);
      if (details.cached_tokens) {
        console.log(`    🚀 Cached Input Tokens: ${details.cached_tokens}`);
      }
      if (details.text_tokens) {
        console.log(`    📝 Text Tokens: ${details.text_tokens}`);
      }
      if (details.audio_tokens) {
        console.log(`    🎵 Audio Tokens: ${details.audio_tokens}`);
      }
      if (details.cached_tokens_details) {
        console.log('    🚀 Cached Tokens Details:', details.cached_tokens_details);
      }
    });
  }

  if (usage.outputTokensDetails && usage.outputTokensDetails.length > 0) {
    console.log('📋 Output Token Details:');
    usage.outputTokensDetails.forEach((details, index) => {
      console.log(`  Request ${index + 1}:`, details);
      if (details.text_tokens) {
        console.log(`    📝 Text Tokens: ${details.text_tokens}`);
      }
      if (details.audio_tokens) {
        console.log(`    🎵 Audio Tokens: ${details.audio_tokens}`);
      }
    });
  }

  const costBreakdown = calculateCost(usage, 'gpt-realtime');

  if (costBreakdown.totalTextTokens > 0 || costBreakdown.totalAudioTokens > 0) {
    console.log('🎯 Token Type Breakdown:');
    console.log(`  📝 Text Tokens: ${costBreakdown.totalTextTokens}`);
    console.log(`  🎵 Audio Tokens: ${costBreakdown.totalAudioTokens}`);
  }

  console.log('💰 Cost Breakdown (gpt-realtime pricing):');
  console.log(`  💸 Input Cost: $${costBreakdown.inputCost.toFixed(4)} (${costBreakdown.totalNonCachedTokens} tokens @ $32.00/1M)`);
  console.log(`  🚀 Cached Input Cost: $${costBreakdown.cachedInputCost.toFixed(4)} (${costBreakdown.totalCachedTokens} tokens @ $0.40/1M)`);
  console.log(`  📤 Output Cost: $${costBreakdown.outputCost.toFixed(4)} (${usage.outputTokens} tokens @ $64.00/1M)`);
  console.log(`  🔢 Total Cost: $${costBreakdown.totalCost.toFixed(4)}`);
  if (costBreakdown.savings > 0) {
    const totalWithoutSavings = costBreakdown.totalCost + costBreakdown.savings;
    const savingsPercentage = totalWithoutSavings > 0 ? (costBreakdown.savings / totalWithoutSavings) * 100 : 0;
    console.log(`  💰 Cache Savings: $${costBreakdown.savings.toFixed(4)} (${savingsPercentage.toFixed(1)}% saved)`);
  }

  console.groupEnd();

  if (usage.requests > 0) {
    hasUsageData = true;
  }

  updateSummaryButtonVisibility(session, true);
}

export function resetUsageStats() {
  hasUsageData = false;

  const summaryControls = document.getElementById('summary-controls');
  if (summaryControls) {
    summaryControls.style.display = 'none';
  }
}

export function startUsageTracking(session: RealtimeSession) {
  if (usageInterval) {
    clearInterval(usageInterval);
  }

  usageInterval = setInterval(() => {
    logUsageInfo(session);
  }, 10000) as unknown as number;

  setTimeout(() => logUsageInfo(session), 1000);
}

export function stopUsageTracking(session: RealtimeSession | null) {
  if (usageInterval) {
    clearInterval(usageInterval);
    usageInterval = null;
  }

  if (session) {
    logUsageInfo(session);
  }
}

export function getHasUsageData(): boolean {
  return hasUsageData;
}
