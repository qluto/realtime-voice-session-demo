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
import { SessionAnalyzer } from './session-analyzer';
import type { PhaseKey } from './session-analyzer';

let session: RealtimeSession | null = null;
let isConnected = false;
let sessionAnalyzer: SessionAnalyzer | null = null;

const tokenEndpoint = import.meta.env.VITE_TOKEN_ENDPOINT || '/api/generate-token';





export function setupVoiceAgent() {
  const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')!;
  const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect-btn')!;
  const newSessionBtn = document.querySelector<HTMLButtonElement>('#new-session-btn')!;
  const statusElement = document.querySelector<HTMLSpanElement>('#status')!;
  const statusIndicator = document.querySelector('.status-indicator')!
  const progressPanel = document.querySelector<HTMLElement>('#progress-panel')
  const currentPhaseEl = document.querySelector<HTMLElement>('#current-phase')
  const progressNotesEl = document.querySelector<HTMLElement>('#progress-notes')
  const closureSuggestionEl = document.querySelector<HTMLElement>('#closure-suggestion')
  const closureMessageEl = document.querySelector<HTMLElement>('#closure-message')
  const autoSummaryToggle = document.querySelector<HTMLInputElement>('#auto-summary-toggle')
  const acceptSummaryBtn = document.querySelector<HTMLButtonElement>('#accept-summary-btn')
  const continueSessionBtn = document.querySelector<HTMLButtonElement>('#continue-session-btn')
  const requestSummaryBtn = document.querySelector<HTMLButtonElement>('#request-summary-btn');
  const copyTranscriptBtn = document.querySelector<HTMLButtonElement>('#copy-transcript-btn');

  const phaseFillElements: Record<PhaseKey, HTMLElement | null> = {
    opening: document.querySelector<HTMLElement>('[data-phase-fill="opening"]'),
    reflection: document.querySelector<HTMLElement>('[data-phase-fill="reflection"]'),
    insight: document.querySelector<HTMLElement>('[data-phase-fill="insight"]'),
    integration: document.querySelector<HTMLElement>('[data-phase-fill="integration"]'),
    closing: document.querySelector<HTMLElement>('[data-phase-fill="closing"]')
  }

  const phaseScoreElements: Record<PhaseKey, HTMLElement | null> = {
    opening: document.querySelector<HTMLElement>('[data-phase-score="opening"]'),
    reflection: document.querySelector<HTMLElement>('[data-phase-score="reflection"]'),
    insight: document.querySelector<HTMLElement>('[data-phase-score="insight"]'),
    integration: document.querySelector<HTMLElement>('[data-phase-score="integration"]'),
    closing: document.querySelector<HTMLElement>('[data-phase-score="closing"]')
  }

  updateConnectionStatus(false);

  async function requestSessionSummary(triggeredByAnalyzer = false) {
    if (!session || !isConnected) return;

    try {
      sessionAnalyzer?.markSummaryInitiated();

      addMessageToLog('user', 'セッションのまとめを要求しました。');

      session.sendMessage({
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: '今までの会話を基に、今週の振り返りの重要なポイントをまとめてください。セッションを自然にクロージングに向けてください。'
        }]
      });

      if (closureSuggestionEl) {
        closureSuggestionEl.style.display = 'none';
      }

      console.log('📝 Summary request sent to coach');
    } catch (error) {
      console.error('Failed to send summary request:', error);
      if (!triggeredByAnalyzer) {
        alert('Failed to request summary. Please try again.');
      }
    }
  }

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


  if (autoSummaryToggle) {
    autoSummaryToggle.addEventListener('change', () => {
      sessionAnalyzer?.setAutoSummaryEnabled(autoSummaryToggle.checked);
    });
  }

  if (acceptSummaryBtn) {
    acceptSummaryBtn.addEventListener('click', async () => {
      if (sessionAnalyzer) {
        await sessionAnalyzer.acceptClosureSuggestion();
      } else {
        await requestSessionSummary(false);
      }
    });
  }

  if (continueSessionBtn) {
    continueSessionBtn.addEventListener('click', () => {
      if (sessionAnalyzer) {
        sessionAnalyzer.declineClosureSuggestion();
      } else if (closureSuggestionEl) {
        closureSuggestionEl.style.display = 'none';
      }
    });
  }

  if (requestSummaryBtn) {
    requestSummaryBtn.addEventListener('click', () => {
      requestSessionSummary(false);
    });
  }

  if (copyTranscriptBtn) {
    copyTranscriptBtn.addEventListener('click', async () => {
      const logContainer = document.getElementById('log-container');
      if (!logContainer) return;

      const messages = Array.from(logContainer.querySelectorAll<HTMLElement>('.message'));
      if (messages.length === 0) return;

      const transcript = messages
        .map((message) => {
          const role = message.classList.contains('user') ? 'You' : 'Coach';
          const timestamp = message.querySelector<HTMLElement>('.message-timestamp')?.textContent?.trim();
          const content = message.querySelector<HTMLElement>('.message-content')?.textContent?.trim() || '';
          const header = timestamp ? `[${timestamp}] ${role}` : role;
          return `${header}\n${content}`;
        })
        .join('\n\n');

      const tryClipboard = async () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(transcript);
          return true;
        }
        return false;
      };

      let copied = false;
      try {
        copied = transcript.length > 0 ? await tryClipboard() : false;
      } catch (error) {
        console.error('Failed to write transcript via clipboard API:', error);
        copied = false;
      }

      if (!copied && transcript.length > 0) {
        const helper = document.createElement('textarea');
        helper.value = transcript;
        helper.setAttribute('readonly', 'true');
        helper.style.position = 'absolute';
        helper.style.left = '-9999px';
        document.body.appendChild(helper);
        helper.select();
        try {
          copied = document.execCommand('copy');
        } catch (error) {
          console.error('Fallback copy failed:', error);
          copied = false;
        } finally {
          document.body.removeChild(helper);
        }
      }

      if (copied) {
        copyTranscriptBtn.classList.add('copied');
        const originalLabel = copyTranscriptBtn.getAttribute('data-label') || copyTranscriptBtn.innerHTML;
        if (!copyTranscriptBtn.getAttribute('data-label')) {
          copyTranscriptBtn.setAttribute('data-label', originalLabel);
        }
        copyTranscriptBtn.innerHTML = '<span aria-hidden="true">✅</span><span>コピーしました</span>';
        setTimeout(() => {
          const saved = copyTranscriptBtn.getAttribute('data-label');
          if (saved) {
            copyTranscriptBtn.innerHTML = saved;
          }
          copyTranscriptBtn.classList.remove('copied');
        }, 2000);
      } else {
        alert('コピーに失敗しました。ブラウザ設定をご確認ください。');
      }
    });
  }

  function updateConnectionStatus(connected: boolean, connecting: boolean = false) {
    isConnected = connected;
    const hasUsageData = getHasUsageData();

    if (connecting) {
      statusElement.textContent = '接続中...';
      statusIndicator.className = 'status-indicator connecting';
      // Hide all buttons during connection
      connectBtn.style.display = 'none';
      connectBtn.disabled = true;
      disconnectBtn.style.display = 'none';
      disconnectBtn.disabled = true;
      newSessionBtn.style.display = 'none';
      newSessionBtn.disabled = true;
    } else if (connected) {
      statusElement.textContent = '接続済み';
      statusIndicator.className = 'status-indicator connected';
      // Show only disconnect button when connected
      connectBtn.style.display = 'none';
      connectBtn.disabled = true;
      disconnectBtn.style.display = 'inline-block';
      disconnectBtn.disabled = false;
      newSessionBtn.style.display = 'none';
      newSessionBtn.disabled = true;
    } else {
      statusElement.textContent = '切断済み';
      statusIndicator.className = 'status-indicator disconnected';
      // Show appropriate button when disconnected
      if (hasUsageData) {
        connectBtn.style.display = 'none';
        connectBtn.disabled = true;
        disconnectBtn.style.display = 'none';
        disconnectBtn.disabled = true;
        newSessionBtn.style.display = 'inline-block';
        newSessionBtn.disabled = false;
      } else {
        connectBtn.style.display = 'inline-block';
        connectBtn.disabled = false;
        disconnectBtn.style.display = 'none';
        disconnectBtn.disabled = true;
        newSessionBtn.style.display = 'none';
        newSessionBtn.disabled = true;
      }
    }

    // Show/hide usage stats - keep visible if we have usage data
    const usageStatsEl = document.getElementById('usage-stats');
    if (usageStatsEl) {
      // Show if connected OR if we have usage data from a previous session
      usageStatsEl.style.display = (connected || hasUsageData) ? 'flex' : 'none';
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
    statusElement.textContent = 'トークン生成中...';

    try {
      const response = await fetch(tokenEndpoint, {
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

# CRITICAL: Avoid Question Repetition
- ALWAYS review the conversation history before asking questions
- NEVER repeat similar questions or topics already explored
- If a topic has been discussed, approach it from a completely different angle or move to unexplored areas
- Build on previous responses rather than asking variations of the same question

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
## Opening & Agenda Setting (1-2 minutes)
Goal: Create safety and establish the session focus

How to respond:
- Welcome warmly and confirm this is their weekly reflection time
- Briefly explain the 10-minute structure: reflection → insights → forward planning
- Ask what aspect of their week they'd most like to explore

Sample opening phrases (vary, don't repeat):
- "Welcome to your weekly reflection space. I'm here to support your thinking about the week that's passed."
- "Let's create some dedicated time for you to process your week. What's alive for you right now?"
- "This is your time to pause and reflect. What from this week is calling for your attention?"

Exit when: Client shares an initial focus area or significant theme from their week.

## Deep Reflection (4-5 minutes)
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

## Insight Synthesis (2-3 minutes)
Goal: Help the client identify key learnings and themes

How to respond:
- "What insights are emerging for you about this week?"
- "What do you want to remember or hold onto from this reflection?"
- "What's one thing you're learning about yourself?"

Exit when: Client has articulated 1-2 clear insights or learnings.

## Forward Integration (2-3 minutes)
Goal: Connect insights to future action and growth

How to respond (choose ONE approach based on conversation flow):
- **Awareness Application**: "How might this awareness serve you in the coming week?"
- **Value Extraction**: "What from today's reflection feels most important to carry forward?"
- **Intentional Action**: "Given these insights, what specific area do you want to be intentional about?"

IMPORTANT: Select the approach that builds most naturally on what the client has already shared, avoiding repetition of explored themes.

Exit when: Client has identified specific ways to apply their learning.

## Closing (1 minute)
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

## Forward Integration (avoid repetition - choose based on unexplored angles)
- **Future Application**: What from this week do you want to carry forward?
- **Growth Leverage**: How might this insight serve you going forward?
- **Intentional Focus**: What feels important to be intentional about next week?
- **Integration Support**: What support or reminder would help you apply this learning?
- **Obstacle Awareness**: What might get in the way of applying this insight, and how will you navigate that?

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
- **AVOID REPETITION**: Before asking any question, mentally check if similar ground has been covered
- **BUILD FORWARD**: Use previous responses as foundation for deeper or different exploration

# Anti-Repetition Guidelines
1. **Before each question**: Scan recent conversation for similar themes or questions
2. **If topic was discussed**: Either go deeper into an unexplored aspect or move to a completely different area
3. **When in doubt**: Ask about something that builds on their last response rather than starting fresh
4. **Integration phase**: Choose ONE focused direction rather than asking multiple similar "next week" questions

Remember: Your role is to facilitate THEIR reflection and insight, not to provide answers or advice. Trust the client as the expert on their own life and experience. AVOID asking questions that sound like variations of what you've already explored.`,
      });

      // Create the session
      session = new RealtimeSession(agent, {
        model: 'gpt-realtime',
      });

      sessionAnalyzer?.dispose();
      sessionAnalyzer = new SessionAnalyzer({
        session,
        controls: {
          panel: progressPanel || null,
          phaseFills: phaseFillElements,
          phaseScores: phaseScoreElements,
          currentPhase: currentPhaseEl || null,
          progressNotes: progressNotesEl || null,
          closureContainer: closureSuggestionEl || null,
          closureMessage: closureMessageEl || null
        },
        initialAutoSummary: autoSummaryToggle?.checked ?? true,
        onRequestSummary: () => requestSessionSummary(true)
      });

      if (autoSummaryToggle) {
        sessionAnalyzer.setAutoSummaryEnabled(autoSummaryToggle.checked);
      }

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
          sessionAnalyzer?.dispose();
          sessionAnalyzer = null;


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

        sessionAnalyzer?.handleTransportEvent(event);
      });

      session.on('error', (error) => {
        console.error('Session error:', error);
        alert(`Error: ${error.error || 'Unknown error occurred'}`);
        stopUsageTracking(session);
        stopSessionTimer();
        stopSpeakingAnimation();
        hideRecordingIndicator();


        sessionAnalyzer?.dispose();
        sessionAnalyzer = null;
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


    sessionAnalyzer?.dispose();
    sessionAnalyzer = null;

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
