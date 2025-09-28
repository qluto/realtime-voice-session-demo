import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

let session: RealtimeSession | null = null;
let isConnected = false;
let usageInterval: number | null = null;
let hasUsageData = false;

// OpenAI Audio Pricing (per 1M tokens) - Updated as of latest pricing
const OPENAI_PRICING = {
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

function calculateCost(usage: any, modelName: string = 'gpt-realtime') {
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

function updateUIUsageStats() {
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
}

function logUsageInfo() {
  if (!session) return;

  const usage = session.usage;

  console.group('🔍 OpenAI API Usage Statistics');
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
  updateUIUsageStats();
}

function resetUsageStats() {
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

function startUsageTracking() {
  if (usageInterval) {
    clearInterval(usageInterval);
  }

  // Log usage every 10 seconds while connected
  usageInterval = setInterval(() => {
    logUsageInfo();
  }, 10000) as unknown as number;

  // Log immediately when starting
  setTimeout(logUsageInfo, 1000);
}

function stopUsageTracking() {
  if (usageInterval) {
    clearInterval(usageInterval);
    usageInterval = null;
  }

  // Log final usage when disconnecting
  if (session) {
    logUsageInfo();
  }
}

export function setupVoiceAgent() {
  const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')!;
  const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect-btn')!;
  const newSessionBtn = document.querySelector<HTMLButtonElement>('#new-session-btn')!;
  const statusElement = document.querySelector<HTMLSpanElement>('#status')!;
  const statusIndicator = document.querySelector('.status-indicator')!;

  updateConnectionStatus(false);

  connectBtn.addEventListener('click', async () => {
    try {
      await connectToVoiceAgent();
    } catch (error) {
      console.error('Failed to connect:', error);
      alert('Failed to connect to voice agent. Please check your ephemeral token and try again.');
    }
  });

  disconnectBtn.addEventListener('click', () => {
    disconnectFromVoiceAgent();
  });

  newSessionBtn.addEventListener('click', async () => {
    try {
      await connectToVoiceAgent();
    } catch (error) {
      console.error('Failed to start new session:', error);
      alert('Failed to start new session. Please try again.');
    }
  });

  function updateConnectionStatus(connected: boolean, connecting: boolean = false) {
    isConnected = connected;

    if (connecting) {
      statusElement.textContent = 'Connecting...';
      statusIndicator.className = 'status-indicator connecting';
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      newSessionBtn.style.display = 'none';
    } else {
      statusElement.textContent = connected ? 'Connected' : 'Disconnected';
      statusIndicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
      connectBtn.disabled = connected;
      disconnectBtn.disabled = !connected;

      // Show new session button when disconnected and we have usage data
      if (!connected && hasUsageData) {
        connectBtn.style.display = 'none';
        newSessionBtn.style.display = 'inline-block';
      } else {
        connectBtn.style.display = 'inline-block';
        newSessionBtn.style.display = 'none';
      }
    }

    // Show/hide usage stats - keep visible if we have usage data
    const usageStatsEl = document.getElementById('usage-stats');
    if (usageStatsEl) {
      // Show if connected OR if we have usage data from a previous session
      usageStatsEl.style.display = (connected || hasUsageData) ? 'block' : 'none';
    }

    // Update usage stats title when disconnected but showing final stats
    const usageTitle = usageStatsEl?.querySelector('h3');
    if (usageTitle) {
      if (connected) {
        usageTitle.textContent = '📊 Usage Statistics (Live)';
        usageTitle.style.color = '#22c55e';
      } else if (hasUsageData) {
        usageTitle.textContent = '📊 Final Usage Statistics';
        usageTitle.style.color = '#f97316';
      } else {
        usageTitle.textContent = '📊 Usage Statistics';
        usageTitle.style.color = '#22c55e';
      }
    }
  }

  async function generateEphemeralToken(): Promise<string> {
    statusElement.textContent = 'Generating token...';

    try {
      const response = await fetch('http://localhost:3001/api/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Token generation failed: ${errorData.error}`);
      }

      const data = await response.json();
      console.log('✅ New ephemeral token generated');
      return data.token;
    } catch (error) {
      console.error('❌ Failed to generate ephemeral token:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate ephemeral token: ${errorMessage}`);
    }
  }

  async function connectToVoiceAgent() {
    let ephemeralToken: string;

    // Reset usage stats for new session
    resetUsageStats();

    // Show connecting status
    updateConnectionStatus(false, true);

    try {
      // Generate a new ephemeral token automatically
      ephemeralToken = await generateEphemeralToken();
      // Create the agent
      const agent = new RealtimeAgent({
        name: 'Assistant',
        instructions: 'You are a helpful AI assistant. Speak naturally and conversationally. Be friendly, concise, and helpful.',
      });

      // Create the session
      session = new RealtimeSession(agent, {
        model: 'gpt-realtime',
      });

      // Set up event listeners before connecting
      session.on('transport_event', (event) => {
        console.log('Transport event:', event);
        if (event.type === 'session.created') {
          console.log('Connected to OpenAI Realtime API');
          updateConnectionStatus(true);
          startUsageTracking();
        } else if (event.type === 'error' || event.type === 'close') {
          console.log('Disconnected from OpenAI Realtime API');
          stopUsageTracking();
          updateConnectionStatus(false);
        }
      });

      session.on('error', (error) => {
        console.error('Session error:', error);
        alert(`Error: ${error.error || 'Unknown error occurred'}`);
        stopUsageTracking();
        updateConnectionStatus(false);
      });

      // Connect to the session
      await session.connect({
        apiKey: ephemeralToken
      });

      // Fallback: if no 'connected' event is fired, manually update status
      setTimeout(() => {
        if (session && !isConnected) {
          console.log('Voice agent connected! You can now speak to the assistant.');
          updateConnectionStatus(true);
        }
      }, 1000);

    } catch (error) {
      console.error('Connection failed:', error);
      updateConnectionStatus(false);
      throw error;
    }
  }

  function disconnectFromVoiceAgent() {
    console.log('Disconnecting from voice agent...');

    // Stop usage tracking and log final stats
    stopUsageTracking();

    if (session) {
      try {
        session.close();
      } catch (error) {
        console.error('Error during disconnect:', error);
      }
      session = null;
    }

    // Force update connection status
    updateConnectionStatus(false);
    console.log('Disconnected from voice agent');
  }

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    if (session) {
      session.close();
    }
  });
}