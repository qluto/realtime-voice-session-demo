import { calculateCost } from './cost-calculator';
import { formatTime, getSessionDuration } from './session-timer';
import { RealtimeSession } from '@openai/agents/realtime';

let usageInterval: number | null = null;
let hasUsageData = false;

export function updateUIUsageStats(session: RealtimeSession) {
  if (!session) return;

  const usage = session.usage;

  // Calculate cost breakdown
  const costBreakdown = calculateCost(usage, 'gpt-realtime');

  // Update usage stats UI elements
  const requestsEl = document.getElementById('stat-requests');
  const inputTokensEl = document.getElementById('stat-input-tokens');
  const outputTokensEl = document.getElementById('stat-output-tokens');
  const totalTokensEl = document.getElementById('stat-total-tokens');
  const cachedTokensEl = document.getElementById('stat-cached-tokens');
  const textTokensEl = document.getElementById('stat-text-tokens');
  const audioTokensEl = document.getElementById('stat-audio-tokens');

  if (requestsEl) requestsEl.textContent = usage.requests.toString();
  if (inputTokensEl) inputTokensEl.textContent = usage.inputTokens.toString();
  if (outputTokensEl) outputTokensEl.textContent = usage.outputTokens.toString();
  if (totalTokensEl) totalTokensEl.textContent = usage.totalTokens.toString();
  if (cachedTokensEl) {
    cachedTokensEl.textContent = costBreakdown.totalCachedTokens.toString();
    cachedTokensEl.className = costBreakdown.totalCachedTokens > 0 ? 'stat-value cached' : 'stat-value';
  }
  if (textTokensEl) {
    textTokensEl.textContent = costBreakdown.totalTextTokens.toString();
  }
  if (audioTokensEl) {
    audioTokensEl.textContent = costBreakdown.totalAudioTokens.toString();
    audioTokensEl.className = costBreakdown.totalAudioTokens > 0 ? 'stat-value' : 'stat-value';
  }

  // Update cost UI elements
  const inputCostEl = document.getElementById('cost-input');
  const cachedInputCostEl = document.getElementById('cost-cached-input');
  const outputCostEl = document.getElementById('cost-output');
  const totalCostEl = document.getElementById('cost-total');
  const savingsEl = document.getElementById('cost-savings');

  if (inputCostEl) inputCostEl.textContent = `$${costBreakdown.inputCost.toFixed(4)}`;
  if (cachedInputCostEl) cachedInputCostEl.textContent = `$${costBreakdown.cachedInputCost.toFixed(4)}`;
  if (outputCostEl) outputCostEl.textContent = `$${costBreakdown.outputCost.toFixed(4)}`;
  if (totalCostEl) totalCostEl.textContent = `$${costBreakdown.totalCost.toFixed(4)}`;
  if (savingsEl) {
    savingsEl.textContent = `$${costBreakdown.savings.toFixed(4)}`;
    savingsEl.className = costBreakdown.savings > 0 ? 'cost-value' : 'cost-value';
  }

  // Mark that we have usage data
  hasUsageData = true;

  // Show/hide summary button based on requests count (4+ exchanges)
  updateSummaryButtonVisibility(session, true);
}

export function updateSummaryButtonVisibility(session: RealtimeSession, isConnected: boolean = true) {
  if (!session) return;

  const summaryControls = document.getElementById('summary-controls');
  if (!summaryControls) return;

  // Show summary button after 4+ requests (indicating sufficient exchange)
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

  // Log the complete usage object to understand the structure
  console.log('🔍 Complete Usage Object:', JSON.stringify(usage, null, 2));

  if (usage.inputTokensDetails && usage.inputTokensDetails.length > 0) {
    console.log('📋 Input Token Details:');
    usage.inputTokensDetails.forEach((details, index) => {
      console.log(`  Request ${index + 1}:`, details);
      if (details.cached_tokens) {
        console.log(`    🚀 Cached Input Tokens: ${details.cached_tokens}`);
      }
      // Check for new structure
      if (details.text_tokens) {
        console.log(`    📝 Text Tokens: ${details.text_tokens}`);
      }
      if (details.audio_tokens) {
        console.log(`    🎵 Audio Tokens: ${details.audio_tokens}`);
      }
      if (details.cached_tokens_details) {
        console.log(`    🚀 Cached Tokens Details:`, details.cached_tokens_details);
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

  // Calculate cost breakdown with current understanding
  const costBreakdown = calculateCost(usage, 'gpt-realtime');

  // Enhanced token breakdown
  if (costBreakdown.totalTextTokens > 0 || costBreakdown.totalAudioTokens > 0) {
    console.log('🎯 Token Type Breakdown:');
    console.log(`  📝 Text Tokens: ${costBreakdown.totalTextTokens}`);
    console.log(`  🎵 Audio Tokens: ${costBreakdown.totalAudioTokens}`);
  }

  // Cost breakdown
  console.log('💰 Cost Breakdown (gpt-realtime pricing):');
  console.log(`  💸 Input Cost: $${costBreakdown.inputCost.toFixed(4)} (${costBreakdown.totalNonCachedTokens} tokens @ $32.00/1M)`);
  console.log(`  🚀 Cached Input Cost: $${costBreakdown.cachedInputCost.toFixed(4)} (${costBreakdown.totalCachedTokens} tokens @ $0.40/1M)`);
  console.log(`  📤 Output Cost: $${costBreakdown.outputCost.toFixed(4)} (${usage.outputTokens} tokens @ $64.00/1M)`);
  console.log(`  🔢 Total Cost: $${costBreakdown.totalCost.toFixed(4)}`);
  if (costBreakdown.savings > 0) {
    console.log(`  💰 Cache Savings: $${costBreakdown.savings.toFixed(4)} (${((costBreakdown.savings / (costBreakdown.totalCost + costBreakdown.savings)) * 100).toFixed(1)}% saved)`);
  }

  console.groupEnd();

  // Update UI
  updateUIUsageStats(session);
}

export function resetUsageStats() {
  // Reset all usage statistics in UI
  const requestsEl = document.getElementById('stat-requests');
  const inputTokensEl = document.getElementById('stat-input-tokens');
  const outputTokensEl = document.getElementById('stat-output-tokens');
  const totalTokensEl = document.getElementById('stat-total-tokens');
  const cachedTokensEl = document.getElementById('stat-cached-tokens');
  const textTokensEl = document.getElementById('stat-text-tokens');
  const audioTokensEl = document.getElementById('stat-audio-tokens');

  if (requestsEl) requestsEl.textContent = '0';
  if (inputTokensEl) inputTokensEl.textContent = '0';
  if (outputTokensEl) outputTokensEl.textContent = '0';
  if (totalTokensEl) totalTokensEl.textContent = '0';
  if (cachedTokensEl) {
    cachedTokensEl.textContent = '0';
    cachedTokensEl.className = 'stat-value';
  }
  if (textTokensEl) textTokensEl.textContent = '0';
  if (audioTokensEl) audioTokensEl.textContent = '0';

  // Reset all cost elements
  const inputCostEl = document.getElementById('cost-input');
  const cachedInputCostEl = document.getElementById('cost-cached-input');
  const outputCostEl = document.getElementById('cost-output');
  const totalCostEl = document.getElementById('cost-total');
  const savingsEl = document.getElementById('cost-savings');

  if (inputCostEl) inputCostEl.textContent = '$0.00';
  if (cachedInputCostEl) cachedInputCostEl.textContent = '$0.00';
  if (outputCostEl) outputCostEl.textContent = '$0.00';
  if (totalCostEl) totalCostEl.textContent = '$0.00';
  if (savingsEl) savingsEl.textContent = '$0.00';

  hasUsageData = false;
}

export function startUsageTracking(session: RealtimeSession) {
  if (usageInterval) {
    clearInterval(usageInterval);
  }

  // Log usage every 10 seconds while connected
  usageInterval = setInterval(() => {
    logUsageInfo(session);
  }, 10000) as unknown as number;

  // Log immediately when starting
  setTimeout(() => logUsageInfo(session), 1000);
}

export function stopUsageTracking(session: RealtimeSession | null) {
  if (usageInterval) {
    clearInterval(usageInterval);
    usageInterval = null;
  }

  // Log final usage when disconnecting
  if (session) {
    logUsageInfo(session);
  }
}

export function getHasUsageData(): boolean {
  return hasUsageData;
}
