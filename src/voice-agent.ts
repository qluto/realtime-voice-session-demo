import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import {
  addMessageToLog,
  addConversationEndMarker,
  clearConversationLog,
  showConversationLog,
  hideConversationLog
} from './utils/conversation-logger';
import {
  startSessionTimer,
  stopSessionTimer
} from './utils/session-timer';
import {
  startUsageTracking,
  stopUsageTracking,
  resetUsageStats,
  getHasUsageData
} from './utils/usage-tracker';
import {
  showRecordingIndicator,
  hideRecordingIndicator,
  startSpeakingAnimation,
  stopSpeakingAnimation
} from './utils/speaking-animation';

let session: RealtimeSession | null = null;
let isConnected = false;





export function setupVoiceAgent() {
  const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')!;
  const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect-btn')!;
  const newSessionBtn = document.querySelector<HTMLButtonElement>('#new-session-btn')!;
  const requestSummaryBtn = document.querySelector<HTMLButtonElement>('#request-summary-btn')!;
  const statusElement = document.querySelector<HTMLSpanElement>('#status')!;
  const statusIndicator = document.querySelector('.status-indicator')!

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

  requestSummaryBtn.addEventListener('click', async () => {
    if (!session || !isConnected) return;

    try {
      // Add user message to conversation log
      addMessageToLog('user', 'セッションのまとめを要求しました。');

      // Send text message to request session summary
      session.sendMessage({
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: '今までの会話を基に、今週の振り返りの重要なポイントをまとめてください。セッションを自然にクロージングに向けてください。'
        }]
      });

      // Hide the summary button after use
      const summaryControls = document.getElementById('summary-controls');
      if (summaryControls) {
        summaryControls.style.display = 'none';
      }

      console.log('📝 Summary request sent to coach');
    } catch (error) {
      console.error('Failed to send summary request:', error);
      alert('Failed to request summary. Please try again.');
    }
  });

  function updateConnectionStatus(connected: boolean, connecting: boolean = false) {
    isConnected = connected;
    const hasUsageData = getHasUsageData();

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
      hideConversationLog(hasUsageData);
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

        // Log ALL events for complete debugging
        console.log(`⏰ ${new Date().toLocaleTimeString()} - EVENT: ${event.type}:`, event);

        // Specifically look for audio-related events
        if (event.type.includes('audio')) {
          console.log(`🔊 AUDIO EVENT: ${event.type}`, event);
        }
        if (event.type === 'session.created') {
          console.log('Connected to OpenAI Realtime API');
          updateConnectionStatus(true);
          startUsageTracking(session!);
          startSessionTimer();
        } else if (event.type === 'error' || event.type === 'close') {
          console.log('Disconnected from OpenAI Realtime API');
          stopUsageTracking(session);
          stopSessionTimer();
          stopSpeakingAnimation();
          hideRecordingIndicator();

          // Hide summary controls on error/close
          const summaryControls = document.getElementById('summary-controls');
          if (summaryControls) {
            summaryControls.style.display = 'none';
          }

          updateConnectionStatus(false);
        } else if (event.type === 'input_audio_buffer.speech_started') {
          // User started speaking - stop any coach animation
          console.log('User started speaking - stopping coach animation');
          stopSpeakingAnimation();
          showRecordingIndicator();
        } else if (event.type === 'input_audio_buffer.speech_stopped') {
          // User stopped speaking
          console.log('User stopped speaking');
          hideRecordingIndicator();
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
            console.log('🎵 Assistant audio delta:', transcript);
          }
        } else if (event.type === 'response.audio_transcript.done') {
          // Complete audio transcript from assistant
          const transcript = event.transcript;
          if (transcript && transcript.trim()) {
            console.log('📝 Adding assistant audio transcript:', transcript);
            const messageId = `audio_transcript_${Date.now()}_${Math.random()}`;
            const messageElement = addMessageToLog('assistant', transcript.trim(), undefined, messageId);
            console.log('🎵 Starting animation after audio transcript done');
            startSpeakingAnimation(messageElement);
          }
        } else if (event.type === 'response.output_audio_transcript.done') {
          // Complete output audio transcript from assistant
          const transcript = event.transcript;
          if (transcript && transcript.trim()) {
            console.log('📝 Adding assistant output audio transcript:', transcript);
            const messageId = `output_audio_transcript_${Date.now()}_${Math.random()}`;
            const messageElement = addMessageToLog('assistant', transcript.trim(), undefined, messageId);
            console.log('🎵 Starting animation after output audio transcript done');
            startSpeakingAnimation(messageElement);
          }
        } else if (event.type === 'output_audio_buffer.stopped') {
          // Audio playback completed - this is the actual event that fires
          console.log('🔊 Audio playback stopped - stopping animation');
          stopSpeakingAnimation();
        } else if (event.type === 'response.audio.delta') {
          // Audio chunks being played
          console.log('🔊 Audio delta - audio is being played');
        } else if (event.type === 'response.audio.done') {
          // Audio playback completed (backup)
          console.log('🔊 Audio done - stopping animation');
          stopSpeakingAnimation();
        } else if (event.type === 'response.done') {
          // Response completed - DO NOT stop animation here, let audio events handle it
          console.log('🎯 Response done - NOT stopping animation, waiting for audio events');

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
        stopUsageTracking(session);
        stopSessionTimer();
        stopSpeakingAnimation();
        hideRecordingIndicator();

        // Hide summary controls on error
        const summaryControls = document.getElementById('summary-controls');
        if (summaryControls) {
          summaryControls.style.display = 'none';
        }

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
    stopUsageTracking(session);
    // Stop session timer
    stopSessionTimer();

    // Clean up speaking animations and recording indicator
    stopSpeakingAnimation();
    hideRecordingIndicator();

    // Hide summary controls on disconnect
    const summaryControls = document.getElementById('summary-controls');
    if (summaryControls) {
      summaryControls.style.display = 'none';
    }

    // Add conversation end marker before disconnecting
    addConversationEndMarker();

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