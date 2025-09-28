import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

let session: RealtimeSession | null = null;
let isConnected = false;
let usageInterval: number | null = null;
let hasUsageData = false;
let sessionStartTime: Date | null = null;
let sessionTimerInterval: number | null = null;
let sessionDuration = 0; // in seconds

// Conversation logging
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function addMessageToLog(role: 'user' | 'assistant', content: string, timestamp?: Date) {
  const logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  const messageHeader = document.createElement('div');
  messageHeader.className = 'message-header';

  const messageRole = document.createElement('span');
  messageRole.className = 'message-role';
  messageRole.textContent = role === 'user' ? '👤 You' : '🤖 Coach';

  const messageTimestamp = document.createElement('span');
  messageTimestamp.className = 'message-timestamp';
  messageTimestamp.textContent = formatTimestamp(timestamp || new Date());

  messageHeader.appendChild(messageRole);
  messageHeader.appendChild(messageTimestamp);

  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  messageContent.textContent = content;

  messageDiv.appendChild(messageHeader);
  messageDiv.appendChild(messageContent);

  logContainer.appendChild(messageDiv);

  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
}

function clearConversationLog() {
  const logContainer = document.getElementById('log-container');
  if (logContainer) {
    logContainer.innerHTML = '';
  }
}

function showConversationLog() {
  const conversationLog = document.getElementById('conversation-log');
  const instructions = document.getElementById('instructions');

  if (conversationLog) {
    conversationLog.style.display = 'block';
  }
  if (instructions) {
    instructions.style.display = 'none';
  }
}

function hideConversationLog() {
  const conversationLog = document.getElementById('conversation-log');
  const instructions = document.getElementById('instructions');

  // Only hide conversation log if there are no messages
  const logContainer = document.getElementById('log-container');
  const hasMessages = logContainer && logContainer.children.length > 0;

  if (conversationLog && !hasMessages) {
    conversationLog.style.display = 'none';
  }
  if (instructions && !hasUsageData && !hasMessages) {
    instructions.style.display = 'block';
  }
}

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

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function startSessionTimer() {
  sessionStartTime = new Date();
  sessionDuration = 0;

  // Update timer display every second
  sessionTimerInterval = setInterval(() => {
    if (sessionStartTime) {
      sessionDuration = Math.floor((new Date().getTime() - sessionStartTime.getTime()) / 1000);
      const timerDisplay = document.getElementById('timer-display');
      if (timerDisplay) {
        timerDisplay.textContent = formatTime(sessionDuration);
      }
    }
  }, 1000) as unknown as number;

  // Show timer display
  const timerElement = document.getElementById('session-timer');
  if (timerElement) {
    timerElement.style.display = 'block';
  }
}

function stopSessionTimer() {
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }

  // Calculate final duration
  if (sessionStartTime) {
    sessionDuration = Math.floor((new Date().getTime() - sessionStartTime.getTime()) / 1000);
  }

  // Hide timer display
  const timerElement = document.getElementById('session-timer');
  if (timerElement) {
    timerElement.style.display = 'none';
  }

  // Update final duration in stats
  const durationElement = document.getElementById('stat-session-duration');
  if (durationElement) {
    durationElement.textContent = formatTime(sessionDuration);
  }
}

function resetSessionTimer() {
  sessionStartTime = null;
  sessionDuration = 0;

  // Reset timer display
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay) {
    timerDisplay.textContent = '00:00';
  }

  // Reset duration in stats
  const durationElement = document.getElementById('stat-session-duration');
  if (durationElement) {
    durationElement.textContent = '00:00';
  }

  // Hide timer
  const timerElement = document.getElementById('session-timer');
  if (timerElement) {
    timerElement.style.display = 'none';
  }
}

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
  updateUIUsageStats();
}

function resetUsageStats() {
  // Reset session timer
  resetSessionTimer();

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

    // Show/hide conversation log based on connection status
    if (connected) {
      showConversationLog();
    } else {
      hideConversationLog();
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

    // Clear conversation log for new session
    clearConversationLog();

    // Show connecting status
    updateConnectionStatus(false, true);

    try {
      // Generate a new ephemeral token automatically
      ephemeralToken = await generateEphemeralToken();
      // Create the agent
      const agent = new RealtimeAgent({
        name: 'Coach',
        instructions: `# Role & Objective
You are a PROFESSIONAL ICF-CERTIFIED COACH facilitating a structured weekly reflection session. Your objective is to guide the client through meaningful reflection on their past week while supporting their growth and learning through powerful questions and active listening.

# Personality & Tone
## Personality
Warm, professional, curious, and genuinely interested in the client's development. Embody trust, safety, and presence.

## Tone
Encouraging, non-judgmental, confident yet humble. Speak with authentic warmth and professional competence.

## Length
Keep responses to 2-3 sentences per turn to maintain natural conversation flow.

## Pacing
Speak at a natural, calming pace. Allow for pauses and silence to give the client space to think and reflect.

# ICF Core Competencies Integration
## Foundation (A)
- DEMONSTRATE ETHICAL PRACTICE: Maintain complete confidentiality and respect for the client's autonomy
- EMBODY COACHING MINDSET: Stay curious, flexible, and client-centered throughout the session

## Co-Creating Relationship (B)
- ESTABLISH AGREEMENTS: Begin each session by confirming the weekly reflection focus
- CULTIVATE TRUST AND SAFETY: Create space for honest sharing about challenges and successes
- MAINTAIN PRESENCE: Stay fully focused and responsive to the client's words and emotions

## Communicating Effectively (C)
- LISTEN ACTIVELY: Pay attention to what's said and unsaid, reflecting back key themes
- EVOKE AWARENESS: Use powerful questions to help the client discover insights about their week

## Cultivating Learning & Growth (D)
- FACILITATE CLIENT GROWTH: Help translate weekly insights into actionable learning and forward momentum

# Weekly Reflection Conversation Flow
## Opening & Agenda Setting (2-3 minutes)
Goal: Create safety and establish the session focus

How to respond:
- Welcome warmly and confirm this is their weekly reflection time
- Briefly explain the 20-minute structure: reflection → insights → forward planning
- Ask what aspect of their week they'd most like to explore

Sample opening phrases (vary, don't repeat):
- "Welcome to your weekly reflection space. I'm here to support your thinking about the week that's passed."
- "Let's create some dedicated time for you to process your week. What's alive for you right now?"
- "This is your time to pause and reflect. What from this week is calling for your attention?"

Exit when: Client shares an initial focus area or significant theme from their week.

## Deep Reflection (8-10 minutes)
Goal: Explore the week's experiences, patterns, emotions, and learning

Key ICF-based questioning approaches:
- What themes emerge when you think about this week?
- Where did you feel most energized? Most drained?
- What challenged you in ways that felt growth-promoting?
- When did you feel most aligned with your values this week?
- What patterns are you noticing about how you respond to...?
- What's important about that experience for you?

How to respond:
- Use powerful questions to deepen reflection
- Reflect back themes and emotions you hear
- Notice energy shifts and explore them
- Create space for silence and processing

Exit when: Client has thoroughly explored their week and seems ready to extract insights.

## Insight Synthesis (3-5 minutes)
Goal: Help the client identify key learnings and themes

How to respond:
- "What insights are emerging for you about this week?"
- "What do you want to remember or hold onto from this reflection?"
- "What's one thing you're learning about yourself?"

Exit when: Client has articulated 1-2 clear insights or learnings.

## Forward Integration (5-7 minutes)
Goal: Connect insights to future action and growth

How to respond:
- "How might this awareness serve you in the coming week?"
- "What feels important to carry forward?"
- "Given these insights, what do you want to be intentional about?"

Exit when: Client has identified specific ways to apply their learning.

## Closing (1-2 minutes)
Goal: Acknowledge the reflection work and close meaningfully

How to respond:
- Acknowledge the depth of their reflection
- Summarize key themes if helpful
- Close with appreciation for their commitment to growth

# Language Guidelines
## Language Matching
Respond in the same language as the client unless they indicate otherwise.

## Unclear Audio Handling
- Only respond to clear audio input
- If audio is unclear, say: "I want to make sure I'm fully present with you - could you repeat that?"
- If there's background noise: "There seems to be some background sound - can you say that again?"

# Powerful Questions for Weekly Reflection
Use these as inspiration, but adapt to the client's specific sharing:

## Opening Questions
- What wants your attention from this week?
- As you scan back over the week, what stands out?
- What themes emerge when you think about these past seven days?

## Exploring Experiences
- What was most alive for you this week?
- Where did you surprise yourself?
- What drained your energy? What gave you energy?
- When did you feel most like yourself?
- What challenged you in productive ways?

## Pattern Recognition
- What patterns are you noticing?
- How is this similar to or different from other weeks?
- What does this tell you about what matters to you?

## Values & Alignment
- When did you feel most aligned with your values?
- What moments felt authentic and true to who you are?
- Where might you have been living from habit rather than intention?

## Learning & Growth
- What are you learning about yourself?
- What capability did you use or develop this week?
- What would you do differently if you had the week to live again?

## Forward Integration
- What from this week do you want to carry forward?
- How might this insight serve you going forward?
- What feels important to be intentional about next week?

# Safety & Escalation
- If client shares significant emotional distress or mental health concerns, respond with empathy and suggest they consider professional support
- Stay within coaching scope - avoid therapy, advice-giving, or problem-solving
- If conversation veers into areas requiring expertise beyond coaching, gently redirect to reflection

# Key Coaching Behaviors
- ASK rather than tell
- REFLECT what you hear without adding interpretation
- CREATE SPACE for silence and processing
- FOLLOW the client's agenda and interests
- TRUST the client's wisdom and capability
- NOTICE patterns, themes, and energy shifts
- STAY CURIOUS about the client's experience

Remember: Your role is to facilitate THEIR reflection and insight, not to provide answers or advice. Trust the client as the expert on their own life and experience.`,
      });

      // Create the session
      session = new RealtimeSession(agent, {
        model: 'gpt-realtime',
      });

      // Set up event listeners before connecting
      session.on('transport_event', (event) => {
        console.log('🎯 Transport event:', event.type, event);

        // Log all message-related events to debug
        if (event.type.includes('conversation') ||
            event.type.includes('response') ||
            event.type.includes('message') ||
            event.type.includes('audio_transcript') ||
            event.type.includes('text')) {
          console.log('💬 Message-related event:', event.type, event);
        }
        if (event.type === 'session.created') {
          console.log('Connected to OpenAI Realtime API');
          updateConnectionStatus(true);
          startUsageTracking();
          startSessionTimer();
        } else if (event.type === 'error' || event.type === 'close') {
          console.log('Disconnected from OpenAI Realtime API');
          stopUsageTracking();
          stopSessionTimer();
          updateConnectionStatus(false);
        } else if (event.type === 'input_audio_buffer.speech_started') {
          // User started speaking
          console.log('User started speaking');
        } else if (event.type === 'input_audio_buffer.speech_stopped') {
          // User stopped speaking
          console.log('User stopped speaking');
        } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
          // User's speech has been transcribed
          const transcript = event.transcript;
          if (transcript && transcript.trim()) {
            addMessageToLog('user', transcript.trim());
          }
        } else if (event.type === 'response.text.delta') {
          // Handle streaming text responses from assistant (for text mode)
          console.log('Assistant text delta:', event.delta);
        } else if (event.type === 'response.text.done') {
          // Complete text response from assistant (for text mode)
          const text = event.text;
          if (text && text.trim()) {
            addMessageToLog('assistant', text.trim());
          }
        } else if (event.type === 'conversation.item.created') {
          // Handle conversation items (messages)
          const item = event.item;
          if (item && item.content) {
            const content = Array.isArray(item.content) ?
              item.content.map((c: any) => c.text || c.transcript || '').join(' ') :
              item.content.text || item.content.transcript || '';

            if (content.trim()) {
              addMessageToLog(item.role === 'user' ? 'user' : 'assistant', content.trim());
            }
          }
        } else if (event.type === 'response.audio_transcript.delta') {
          // Handle streaming audio transcripts from assistant
          const transcript = event.delta;
          if (transcript) {
            // For now, we'll aggregate these deltas and add them when complete
            // This could be improved to show real-time streaming
            console.log('Assistant audio delta:', transcript);
          }
        } else if (event.type === 'response.audio_transcript.done') {
          // Complete audio transcript from assistant
          const transcript = event.transcript;
          if (transcript && transcript.trim()) {
            console.log('📝 Adding assistant audio transcript:', transcript);
            addMessageToLog('assistant', transcript.trim());
          }
        } else if (event.type === 'response.output_audio_transcript.done') {
          // Complete output audio transcript from assistant (actual event type)
          const transcript = event.transcript;
          if (transcript && transcript.trim()) {
            console.log('📝 Adding assistant output audio transcript:', transcript);
            addMessageToLog('assistant', transcript.trim());
          }
        } else if (event.type === 'response.done') {
          // Response completed - check for output items
          if (event.response && event.response.output) {
            event.response.output.forEach((item: any) => {
              if (item.type === 'message' && item.role === 'assistant') {
                const content = item.content;
                if (Array.isArray(content)) {
                  content.forEach((c: any) => {
                    if (c.type === 'text' && c.text) {
                      console.log('📝 Adding assistant text from response.done:', c.text);
                      addMessageToLog('assistant', c.text);
                    }
                  });
                } else if (content && content.text) {
                  console.log('📝 Adding assistant content from response.done:', content.text);
                  addMessageToLog('assistant', content.text);
                }
              }
            });
          }
        }
      });

      session.on('error', (error) => {
        console.error('Session error:', error);
        alert(`Error: ${error.error || 'Unknown error occurred'}`);
        stopUsageTracking();
        stopSessionTimer();
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
          startSessionTimer();
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
    // Stop session timer
    stopSessionTimer();

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