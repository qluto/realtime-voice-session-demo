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
import { SessionAnalyzer, type CoachingAnalysis, type ModeKey } from './session-analyzer';
import {
  getPersonalityPreset,
  getSessionPurposePreset,
  defaultPersonalityId,
  defaultPurposeId,
  personalityPresets,
  type PersonalityPreset,
  type SessionPurposePreset,
  coachingModeGuides,
  coachingModeOrder,
  type CoachingMode
} from './utils/prompt-presets.ts';

let session: RealtimeSession | null = null;
let isConnected = false;
let sessionAnalyzer: SessionAnalyzer | null = null;

const tokenEndpoint = import.meta.env.VITE_TOKEN_ENDPOINT || '/api/generate-token';

const STORAGE_KEYS = {
  questionnaire: 'voiceCoach.questionnaire',
  purpose: 'voiceCoach.purpose',
  sidebarHidden: 'voiceCoach.sidebarHidden'
} as const;

const coachFoundations = `# ICF Core Competencies Integration
## Foundation (A)
- DEMONSTRATE ETHICAL PRACTICE: Maintain complete confidentiality and respect for the client's autonomy
- EMBODY COACHING MINDSET: Stay curious, flexible, and client-centred throughout the session

## Co-Creating Relationship (B)
- ESTABLISH AGREEMENTS: Confirm scope, desired outcomes, and the client's ownership of the agenda
- CULTIVATE TRUST AND SAFETY: Create space for honest sharing about challenges and successes
- MAINTAIN PRESENCE: Stay fully focused and responsive to the client's words and emotions

## Communicating Effectively (C)
- LISTEN ACTIVELY: Pay attention to what's said and unsaid, reflecting back key themes
- EVOKE AWARENESS: Use powerful questions to help the client discover insights that matter to them

## Cultivating Learning & Growth (D)
- FACILITATE CLIENT GROWTH: Support translating insight into intentional forward motion

# Language Guidelines
## Language Matching
Respond in the same language as the client unless they indicate otherwise.

## Unclear Audio Handling
- Only respond to clear audio input
- If audio is unclear, say: "I want to make sure I'm fully present with you - could you repeat that?"
- If there's background noise: "There seems to be some background sound - can you say that again?"

# Safety & Escalation
- If the client shares significant emotional distress or mental health concerns, respond with empathy and suggest they consider professional support
- Stay within coaching scope—avoid therapy, advice-giving, or problem-solving
- If conversation veers into areas requiring expertise beyond coaching, gently redirect toward reflection

# Key Coaching Behaviors
- ASK rather than tell
- REFLECT what you hear without adding interpretation
- CREATE SPACE for silence and processing
- FOLLOW the client's agenda and interests
- TRUST the client's wisdom and capability
- NOTICE patterns, themes, and energy shifts
- STAY CURIOUS about the client's experience

# Anti-Repetition Guidelines
1. **Before each question**: Scan recent conversation for similar themes or questions
2. **If a topic was discussed**: Either go deeper into an unexplored aspect or move to a completely different area
3. **When in doubt**: Ask about something that builds on their last response rather than starting fresh
4. **Integration phase**: Choose ONE focused direction rather than asking multiple similar "next" questions

Remember: Your role is to facilitate THEIR reflection and insight, not to provide answers or advice. AVOID asking questions that sound like variations of what has already been explored.`;

type DynamicPromptContext = {
  mode?: CoachingMode
  summary?: string
  rationale?: string
  coachFocus?: string
  questions?: string[]
  confidence?: Partial<Record<CoachingMode, number>>
}

function renderModeSection(mode: CoachingMode, purpose: SessionPurposePreset): string {
  const guide = coachingModeGuides[mode];
  const questionLines = guide.questionSeeds.map((item) => `- ${item}`).join('\n');
  const moveLines = guide.coachingMoves.map((item) => `- ${item}`).join('\n');
  const watchLines = guide.watchOuts.map((item) => `- ${item}`).join('\n');
  const purposeNote = purpose.modeBiases[mode]
    ? `Purpose nuance: ${purpose.modeBiases[mode]}`
    : 'Purpose nuance: Use responsively based on client signals.';

  return `## ${guide.label}
${guide.description}
Intention: ${guide.intention}
${purposeNote}

Question seeds to keep fresh:
${questionLines}

High-leverage moves:
${moveLines}

Watch-outs:
${watchLines}`;
}

function formatConfidenceSnapshot(confidence?: Partial<Record<CoachingMode, number>>): string {
  if (!confidence) return 'Live confidence pending — stay observant and choose the most resonant mode.';
  const parts = coachingModeOrder.map((mode) => {
    const value = Math.max(0, Math.min(1, confidence[mode] ?? 0));
    const percent = Math.round(value * 100);
    return `${coachingModeGuides[mode].label}: ${percent}%`;
  });
  return parts.join(', ');
}

function buildLiveCompassSection(purpose: SessionPurposePreset, dynamic?: DynamicPromptContext): string {
  if (!dynamic || !dynamic.mode) {
    const defaultMode = purpose.defaultMode;
    const guide = coachingModeGuides[defaultMode];
    const bias = purpose.modeBiases[defaultMode] ?? guide.intention;
    const fallbackQuestions = guide.questionSeeds.slice(0, 2).map((item) => `- ${item}`).join('\n');
    return `# Live Conversation Compass
Current guidance: Begin with ${guide.label} mode to honour what matters now.
Why: ${bias}
Confidence snapshot: ${formatConfidenceSnapshot()}
Ask 1-2 of these to open space:
${fallbackQuestions}
Flow into other modes as soon as client signals clarity or new needs.`;
  }

  const guide = coachingModeGuides[dynamic.mode];
  const lines: string[] = [`Current mode: ${guide.label}`];
  if (dynamic.summary) lines.push(`Mini-summary: ${dynamic.summary}`);
  if (dynamic.rationale) lines.push(`Why now: ${dynamic.rationale}`);
  if (dynamic.coachFocus) lines.push(`Next focus: ${dynamic.coachFocus}`);
  lines.push(`Confidence snapshot: ${formatConfidenceSnapshot(dynamic.confidence)}`);

  const questionList = (dynamic.questions && dynamic.questions.length > 0
    ? dynamic.questions
    : guide.questionSeeds.slice(0, 2)
  ).map((item) => `- ${item}`).join('\n');

  lines.push('Ask 1-2 of these questions next:');
  lines.push(questionList);
  lines.push('Stay agile—pivot to another mode when the client indicates a new need or readiness.');

  return `# Live Conversation Compass
${lines.join('\n')}`;
}

function buildAgentInstructions(
  personality: PersonalityPreset,
  purpose: SessionPurposePreset,
  preferenceDirectives: string[] = [],
  dynamicContext?: DynamicPromptContext
): string {
  const emphasisLines = purpose.emphasis.map((item) => `- ${item}`).join('\n');
  const modeSections = coachingModeOrder.map((mode) => renderModeSection(mode, purpose)).join('\n\n');

  const sections = [
    `# Role & Objective
${purpose.roleStatement}`,
    `# Personality & Tone
## Personality
${personality.personality}

## Tone
${personality.tone}

## Length
${personality.length}

## Pacing
${personality.pacing}

## Response Focus
${personality.responseFocus}`,
    `# Session Purpose Highlights — ${purpose.label}
${purpose.focusStatement}

${emphasisLines}`,
    `# Coaching Mode Compass
${modeSections}`,
    buildLiveCompassSection(purpose, dynamicContext)
  ];

  if (preferenceDirectives.length > 0) {
    sections.push(`# Session Personalization Cues
${preferenceDirectives.map((directive) => `- ${directive}`).join('\n')}`);
  }

  sections.push(coachFoundations);

  return sections.join('\n\n');
}

type PersonalityId = PersonalityPreset['id'];
type QuestionnaireQuestionId = 'pace' | 'support' | 'emotion';

const questionnaireQuestionIds: QuestionnaireQuestionId[] = ['pace', 'support', 'emotion'];

const personalityScoreBaseline: Record<PersonalityId, number> = {
  'warm-professional': 1.5,
  'direct-challenger': 0.8,
  'mindful-reflective': 1.5
};

const personalityQuestionScores: Record<QuestionnaireQuestionId, Record<string, Partial<Record<PersonalityId, number>>>> = {
  pace: {
    steady: {
      'warm-professional': 2,
      'mindful-reflective': 2
    },
    dynamic: {
      'direct-challenger': 3,
      'warm-professional': 1
    },
    spacious: {
      'mindful-reflective': 3,
      'warm-professional': 1
    }
  },
  support: {
    affirming: {
      'warm-professional': 3,
      'mindful-reflective': 1
    },
    challenging: {
      'direct-challenger': 3,
      'warm-professional': 1
    },
    reflective: {
      'mindful-reflective': 3,
      'warm-professional': 2
    }
  },
  emotion: {
    warm: {
      'warm-professional': 3,
      'mindful-reflective': 1
    },
    balanced: {
      'direct-challenger': 2,
      'warm-professional': 2
    },
    gentle: {
      'mindful-reflective': 3,
      'warm-professional': 1
    }
  }
};

const personalityQuestionRationales: Record<QuestionnaireQuestionId, Record<string, string>> = {
  pace: {
    steady: '落ち着いたテンポを望んだため、安心感のあるスタイルを優先しました。',
    dynamic: 'テンポ良く進めたいニーズから、チャレンジングで推進力のあるスタイルを重視しました。',
    spacious: '余白を大切にしたい選択から、マインドフルに寄り添うスタイルを強調しました。'
  },
  support: {
    affirming: '励ましと受容を求める回答により、温かくプロフェッショナルな支援を推奨しています。',
    challenging: '率直さと挑戦を求める回答から、ストレッチをかけるスタイルが合いやすいと判断しました。',
    reflective: '静かな内省を支えてほしい回答に基づき、丁寧に問いかけるスタイルを選びました。'
  },
  emotion: {
    warm: '感情を適度に共有してほしい回答により、温かい関わりを重視しています。',
    balanced: '感情表現は控えめが良いとの回答から、クールで明晰なスタイルを選択しました。',
    gentle: '穏やかな共感を求める回答のため、マインドフルな落ち着きに比重を置きました。'
  }
};

const preferenceDirectiveTexts: Record<QuestionnaireQuestionId, Record<string, string>> = {
  pace: {
    steady: 'Keep the coaching tempo steady and grounded, leaving reflective pauses for the client.',
    dynamic: 'Maintain an upbeat, forward-moving cadence that keeps momentum while staying attentive.',
    spacious: 'Offer a gently paced cadence with generous silence so the client can process internally.'
  },
  support: {
    affirming: 'Lead with affirming reflections before inviting new perspectives or questions.',
    challenging: 'Provide candid, future-facing challenges that stretch thinking while honouring agency.',
    reflective: 'Mirror language softly and use open questions that deepen inner reflection.'
  },
  emotion: {
    warm: 'Express calibrated warmth and emotional resonance when acknowledging the client\'s experiences.',
    balanced: 'Keep emotional expression measured and composed, focusing on clarity and structure.',
    gentle: 'Offer soothing empathy and name shifts in tone or sensations with a soft presence.'
  }
};

const preferenceSummaryTexts: Record<QuestionnaireQuestionId, Record<string, string>> = {
  pace: {
    steady: '落ち着いたテンポで進めたい',
    dynamic: 'テンポよく前進したい',
    spacious: '余白を重視したい'
  },
  support: {
    affirming: '励ましと受容を重視',
    challenging: 'ストレッチと挑戦を歓迎',
    reflective: '静かな内省サポートを希望'
  },
  emotion: {
    warm: '適度な感情共有が安心',
    balanced: '感情表現は控えめが良い',
    gentle: '柔らかな共感を求める'
  }
};

type QuestionnaireResponses = Partial<Record<QuestionnaireQuestionId, string>>;

type PersonalityRecommendation = {
  personalityId: PersonalityId;
  rationale: string[];
  preferenceDirectives: string[];
  preferenceSummaries: string[];
};

function computePersonalityRecommendation(responses: QuestionnaireResponses): PersonalityRecommendation {
  const aggregateScores: Record<PersonalityId, number> = {} as Record<PersonalityId, number>;

  personalityPresets.forEach((preset) => {
    aggregateScores[preset.id] = personalityScoreBaseline[preset.id] ?? 0;
  });

  const rationale: string[] = [];
  const preferenceDirectives: string[] = [];
  const preferenceSummaries: string[] = [];

  questionnaireQuestionIds.forEach((questionId) => {
    const responseValue = responses[questionId];
    if (!responseValue) {
      return;
    }
    const scoreMap = personalityQuestionScores[questionId]?.[responseValue];
    if (scoreMap) {
      Object.entries(scoreMap).forEach(([personalityId, score]) => {
        const id = personalityId as PersonalityId;
        aggregateScores[id] += score ?? 0;
      });
    }
    const rationaleText = personalityQuestionRationales[questionId]?.[responseValue];
    if (rationaleText) {
      rationale.push(rationaleText);
    }
    const directive = preferenceDirectiveTexts[questionId]?.[responseValue];
    if (directive) {
      preferenceDirectives.push(directive);
    }
    const summary = preferenceSummaryTexts[questionId]?.[responseValue];
    if (summary) {
      preferenceSummaries.push(summary);
    }
  });

  let bestPersonalityId: PersonalityId = defaultPersonalityId;
  let bestScore = Number.NEGATIVE_INFINITY;

  personalityPresets.forEach((preset) => {
    const score = aggregateScores[preset.id];
    if (score > bestScore) {
      bestScore = score;
      bestPersonalityId = preset.id;
    } else if (score === bestScore && preset.id === defaultPersonalityId) {
      bestPersonalityId = preset.id;
    }
  });

  return {
    personalityId: bestPersonalityId,
    rationale,
    preferenceDirectives,
    preferenceSummaries
  };
}





export function setupVoiceAgent() {
  const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')!;
  const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect-btn')!;
  const newSessionBtn = document.querySelector<HTMLButtonElement>('#new-session-btn')!;
  const statusElement = document.querySelector<HTMLSpanElement>('#status')!;
  const statusIndicator = document.querySelector('.status-indicator')!
  const purposeSelect = document.querySelector<HTMLSelectElement>('#purpose-select')
  const purposeDescriptionEl = document.querySelector<HTMLElement>('#purpose-description')
  const coachCalibratorForm = document.querySelector<HTMLFormElement>('#coach-calibrator')
  const coachRecommendationLabel = document.querySelector<HTMLElement>('#coach-recommendation-label')
  const coachRecommendationDescription = document.querySelector<HTMLElement>('#coach-recommendation-description')
  const coachRecommendationRationale = document.querySelector<HTMLElement>('#coach-recommendation-rationale')
  const configSidebar = document.querySelector<HTMLElement>('#config-sidebar')
  const configSidebarSurface = document.querySelector<HTMLElement>('#config-sidebar-surface')
  const configSidebarBackdrop = document.querySelector<HTMLElement>('#config-sidebar-backdrop')
  const configOpenBtn = document.querySelector<HTMLButtonElement>('#config-open-btn')
  const configCloseBtn = document.querySelector<HTMLButtonElement>('#config-close-btn')
  const progressPanel = document.querySelector<HTMLElement>('#progress-panel')
  const currentModeEl = document.querySelector<HTMLElement>('#current-mode')
  const progressNotesEl = document.querySelector<HTMLElement>('#progress-notes')
  const closureSuggestionEl = document.querySelector<HTMLElement>('#closure-suggestion')
  const closureMessageEl = document.querySelector<HTMLElement>('#closure-message')
  const autoSummaryToggle = document.querySelector<HTMLInputElement>('#auto-summary-toggle')
  const acceptSummaryBtn = document.querySelector<HTMLButtonElement>('#accept-summary-btn')
  const continueSessionBtn = document.querySelector<HTMLButtonElement>('#continue-session-btn')
  const requestSummaryBtn = document.querySelector<HTMLButtonElement>('#request-summary-btn');
  const copyTranscriptBtn = document.querySelector<HTMLButtonElement>('#copy-transcript-btn');
  const modalityToggle = document.querySelector<HTMLElement>('#modality-toggle');
  const modalityButtons = modalityToggle
    ? Array.from(modalityToggle.querySelectorAll<HTMLButtonElement>('.modality-option'))
    : [];
  const textChatForm = document.querySelector<HTMLFormElement>('#text-chat-form');
  const textChatInput = document.querySelector<HTMLTextAreaElement>('#text-chat-input');
  const textChatSubmit = document.querySelector<HTMLButtonElement>('#text-chat-submit');
  const textChatHint = document.querySelector<HTMLElement>('#text-chat-hint');
  let isTextChatComposing = false;

  const coachCalibratorInputs = coachCalibratorForm
    ? Array.from(coachCalibratorForm.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    : [];
  const coachOptionLabels = coachCalibratorForm
    ? Array.from(coachCalibratorForm.querySelectorAll<HTMLLabelElement>('.coach-option'))
    : [];

  const defaultRecommendationMessage = '回答すると、もっとも相性の良いコーチスタイルをご案内します。';
  let activePersonalityId: PersonalityId = defaultPersonalityId;
  let questionnaireIsComplete = false;
  let lastPreferenceDirectives: string[] = [];
  let currentPersonalityPreset = getPersonalityPreset(activePersonalityId);
  let currentPurposePreset = getSessionPurposePreset(defaultPurposeId);
  let lastInstructionsSent: string | null = null;
  let lastDynamicContext: DynamicPromptContext | null = null;
  let lastOutputModalities: ('audio' | 'text')[] | null = null;

  type Modality = 'voice' | 'text';
  let currentModality: Modality = 'voice';
  const suppressedPurposeSet = new Set(['coaching-analysis', 'closure-readiness']);
  const suppressedResponseIds = new Set<string>();
  const suppressedItemIds = new Set<string>();
  const pendingLocalUserMessages: string[] = [];

  const normalizeForDedup = (value: string) => value.trim().replace(/\s+/g, ' ');

  const recordLocalUserMessage = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    pendingLocalUserMessages.push(normalizeForDedup(trimmed));
    return addMessageToLog('user', trimmed);
  };

  const computeInstructions = (dynamic?: DynamicPromptContext) =>
    buildAgentInstructions(currentPersonalityPreset, currentPurposePreset, lastPreferenceDirectives, dynamic);

  const getDesiredOutputModalities = (): ('audio' | 'text')[] =>
    currentModality === 'text' ? ['text'] : ['audio', 'text'];

  const modalitiesAreEqual = (
    previous: ('audio' | 'text')[] | null,
    next: ('audio' | 'text')[]
  ) => {
    if (!previous) return false;
    if (previous.length !== next.length) return false;
    for (let index = 0; index < next.length; index += 1) {
      if (previous[index] !== next[index]) {
        return false;
      }
    }
    return true;
  };

  const updateTextSubmitState = () => {
    if (!textChatSubmit) return;
    const trimmed = textChatInput?.value.trim() ?? '';
    const enable = currentModality === 'text' && isConnected;
    textChatSubmit.disabled = !enable || trimmed.length === 0;
  };

  const refreshTextChatState = () => {
    const isTextMode = currentModality === 'text';
    const enable = isTextMode && isConnected;

    if (textChatForm) {
      textChatForm.style.display = isTextMode ? 'flex' : 'none';
    }

    if (textChatInput) {
      textChatInput.disabled = !enable;
      if (!enable) {
        textChatInput.value = textChatInput.value.trim();
      }
    }

    if (textChatHint) {
      textChatHint.style.display = isTextMode ? 'block' : 'none';
      if (isTextMode) {
        textChatHint.textContent = enable
          ? 'テキストでメッセージを送信できます。'
          : '接続後にテキストでメッセージを送信できます。';
      }
    }

    updateTextSubmitState();
  };

  const updateModalityUI = () => {
    modalityButtons.forEach((button) => {
      const modality = button.dataset.modality as Modality | undefined;
      const isActive = modality === currentModality;
      button.classList.toggle('is-selected', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    refreshTextChatState();
  };

  const updateMicrophoneState = () => {
    if (!session) return;
    const shouldMute = currentModality === 'text';
    try {
      session.mute(shouldMute);
      console.log(
        shouldMute
          ? '🔇 Microphone muted because text mode is active'
          : '🎙️ Microphone unmuted for voice mode'
      );
    } catch (error) {
      console.error('Failed to update microphone state:', error);
    }

    if (shouldMute) {
      hideRecordingIndicator();
    }
  };

  const setCurrentModality = (modality: Modality) => {
    if (currentModality === modality) return;
    currentModality = modality;
    lastOutputModalities = null;
    updateModalityUI();
    updateMicrophoneState();
    if (session) {
      syncSessionInstructions(lastDynamicContext);
    }
  };

  const maybeSuppressResponse = (response: any): boolean => {
    if (!response) return false;
    const purpose = response.metadata?.purpose || response.metadata?.Purpose;
    if (purpose && suppressedPurposeSet.has(String(purpose))) {
      if (response.id) {
        suppressedResponseIds.add(response.id);
      }
      return true;
    }
    return false;
  };

  const recordSuppressedItemId = (item: any) => {
    const itemId = item?.id;
    if (typeof itemId === 'string' && itemId.length > 0) {
      suppressedItemIds.add(itemId);
    }
  };

  const syncSessionInstructions = (dynamic?: DynamicPromptContext | null) => {
    if (!session) return;
    const effectiveContext = dynamic ?? undefined;
    const instructions = computeInstructions(effectiveContext);
    const desiredModalities = getDesiredOutputModalities();
    const instructionsChanged = instructions !== lastInstructionsSent;
    const modalitiesChanged = !modalitiesAreEqual(lastOutputModalities, desiredModalities);
    if (!instructionsChanged && !modalitiesChanged) {
      return;
    }
    try {
      session.transport.updateSessionConfig({
        instructions,
        outputModalities: desiredModalities
      });
      lastInstructionsSent = instructions;
      lastOutputModalities = [...desiredModalities];
      console.log('🧭 Updated live coaching instructions', {
        mode: effectiveContext?.mode,
        hasDynamic: Boolean(effectiveContext),
        modalities: desiredModalities.join(', ')
      });
    } catch (error) {
      console.error('Failed to update session instructions:', error);
    }
  };

  const handleAnalysisUpdate = (analysis: CoachingAnalysis) => {
    lastDynamicContext = {
      mode: analysis.mode,
      summary: analysis.summary,
      rationale: analysis.rationale,
      coachFocus: analysis.coachFocus,
      questions: analysis.questions,
      confidence: analysis.confidence
    };
    syncSessionInstructions(lastDynamicContext);
  };

  const modeFillElements: Record<ModeKey, HTMLElement | null> = {
    reflective: document.querySelector<HTMLElement>('[data-mode-fill="reflective"]'),
    discovery: document.querySelector<HTMLElement>('[data-mode-fill="discovery"]'),
    actionable: document.querySelector<HTMLElement>('[data-mode-fill="actionable"]'),
    cognitive: document.querySelector<HTMLElement>('[data-mode-fill="cognitive"]')
  }

  const modeScoreElements: Record<ModeKey, HTMLElement | null> = {
    reflective: document.querySelector<HTMLElement>('[data-mode-score="reflective"]'),
    discovery: document.querySelector<HTMLElement>('[data-mode-score="discovery"]'),
    actionable: document.querySelector<HTMLElement>('[data-mode-score="actionable"]'),
    cognitive: document.querySelector<HTMLElement>('[data-mode-score="cognitive"]')
  }

  const storageAvailable = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

  const getStoredQuestionnaire = (): QuestionnaireResponses | null => {
    if (!storageAvailable) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.questionnaire);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Failed to read stored questionnaire responses:', error);
      return null;
    }
  };

  const setStoredQuestionnaire = (responses: QuestionnaireResponses | null) => {
    if (!storageAvailable) return;
    try {
      if (!responses || Object.keys(responses).length === 0) {
        window.localStorage.removeItem(STORAGE_KEYS.questionnaire);
      } else {
        window.localStorage.setItem(STORAGE_KEYS.questionnaire, JSON.stringify(responses));
      }
    } catch (error) {
      console.warn('Failed to persist questionnaire responses:', error);
    }
  };

  const getStoredPurpose = (): string | null => {
    if (!storageAvailable) return null;
    try {
      return window.localStorage.getItem(STORAGE_KEYS.purpose);
    } catch (error) {
      console.warn('Failed to read stored session purpose:', error);
      return null;
    }
  };

  const setStoredPurpose = (value: string | null) => {
    if (!storageAvailable) return;
    try {
      if (value) {
        window.localStorage.setItem(STORAGE_KEYS.purpose, value);
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.purpose);
      }
    } catch (error) {
      console.warn('Failed to persist session purpose:', error);
    }
  };

  const getStoredSidebarHidden = (): boolean => {
    if (!storageAvailable) return false;
    try {
      return window.localStorage.getItem(STORAGE_KEYS.sidebarHidden) === 'true';
    } catch (error) {
      console.warn('Failed to read stored sidebar state:', error);
      return false;
    }
  };

  const setStoredSidebarHidden = (hidden: boolean) => {
    if (!storageAvailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.sidebarHidden, String(hidden));
    } catch (error) {
      console.warn('Failed to persist sidebar state:', error);
    }
  };

  const storedQuestionnaire = getStoredQuestionnaire();
  const storedPurpose = getStoredPurpose();
  const storedSidebarHidden = getStoredSidebarHidden();
  let storedSidebarPreference = storedSidebarHidden;
  let hasAppliedStoredSidebarPreference = false;

  const setSidebarOpen = (
    open: boolean,
    options: { persist?: boolean; focusTarget?: 'close' | 'trigger' | null } = {}
  ) => {
    const { persist = true, focusTarget = null } = options;
    if (configSidebar) {
      configSidebar.classList.toggle('is-open', open);
      configSidebar.setAttribute('aria-hidden', String(!open));
    }
    if (configSidebarBackdrop) {
      configSidebarBackdrop.classList.toggle('is-open', open);
    }
    if (configOpenBtn) {
      configOpenBtn.setAttribute('aria-expanded', String(open));
    }

    if (open) {
      document.body.classList.add('config-sidebar-open');
      if (focusTarget === 'close' && !(configCloseBtn?.disabled)) {
        configCloseBtn?.focus();
      }
    } else {
      document.body.classList.remove('config-sidebar-open');
      if (focusTarget === 'trigger' && !(configOpenBtn?.disabled)) {
        configOpenBtn?.focus();
      }
    }

    if (persist) {
      setStoredSidebarHidden(!open);
      storedSidebarPreference = !open;
    }
  };

  const updateSidebarControlsAvailability = () => {
    const lockControls = !questionnaireIsComplete;
    if (configCloseBtn) {
      configCloseBtn.disabled = lockControls;
    }
    if (configOpenBtn) {
      if (lockControls) {
        configOpenBtn.setAttribute('aria-disabled', 'true');
        configOpenBtn.disabled = true;
      } else {
        configOpenBtn.removeAttribute('aria-disabled');
        configOpenBtn.disabled = false;
      }
    }
  };

  setSidebarOpen(configSidebar?.classList.contains('is-open') ?? false, { persist: false });

  const refreshCoachOptionClasses = () => {
    coachOptionLabels.forEach((label) => {
      const input = label.querySelector<HTMLInputElement>('input[type="radio"]');
      if (!input) return;
      if (input.checked) {
        label.classList.add('is-selected');
      } else {
        label.classList.remove('is-selected');
      }
    });
  };

  const collectQuestionnaireResponses = (): QuestionnaireResponses => {
    const responses: QuestionnaireResponses = {};
    questionnaireQuestionIds.forEach((questionId) => {
      const fieldset = coachCalibratorForm?.querySelector(`[data-question-id="${questionId}"]`);
      const selected = fieldset?.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      if (selected) {
        responses[questionId] = selected.value;
      }
    });
    return responses;
  };

  const updateCoachRecommendation = () => {
    const responses = collectQuestionnaireResponses();
    if (storageAvailable) {
      setStoredQuestionnaire(Object.keys(responses).length > 0 ? responses : null);
    }
    const complete = questionnaireQuestionIds.every((questionId) => Boolean(responses[questionId]));
    questionnaireIsComplete = complete;
    updateSidebarControlsAvailability();

    if (!complete) {
      activePersonalityId = defaultPersonalityId;
      lastPreferenceDirectives = [];
      const fallbackPreset = getPersonalityPreset(activePersonalityId);
      currentPersonalityPreset = fallbackPreset;
      if (coachRecommendationLabel) {
        coachRecommendationLabel.textContent = fallbackPreset.label;
      }
      if (coachRecommendationDescription) {
        coachRecommendationDescription.textContent = defaultRecommendationMessage;
      }
      if (coachRecommendationRationale) {
        coachRecommendationRationale.style.display = 'none';
        coachRecommendationRationale.textContent = '';
      }
      hasAppliedStoredSidebarPreference = false;
      storedSidebarPreference = false;
      setSidebarOpen(true, { persist: false });
      if (session) {
        syncSessionInstructions(lastDynamicContext);
      }
      return;
    }

    const recommendation = computePersonalityRecommendation(responses);
    activePersonalityId = recommendation.personalityId;
    lastPreferenceDirectives = recommendation.preferenceDirectives;
    const preset = getPersonalityPreset(activePersonalityId);
    currentPersonalityPreset = preset;

    if (coachRecommendationLabel) {
      coachRecommendationLabel.textContent = preset.label;
    }
    if (coachRecommendationDescription) {
      coachRecommendationDescription.textContent = preset.description;
    }
    if (coachRecommendationRationale) {
      const summaries = recommendation.preferenceSummaries;
      const rationaleText = recommendation.rationale;
      const combinedMessages = [...summaries, ...rationaleText];
      if (combinedMessages.length > 0) {
        coachRecommendationRationale.textContent = combinedMessages.join('／');
        coachRecommendationRationale.style.display = 'block';
      } else {
        coachRecommendationRationale.textContent = '';
        coachRecommendationRationale.style.display = 'none';
      }
    }

    if (session) {
      syncSessionInstructions(lastDynamicContext);
    }

    if (!hasAppliedStoredSidebarPreference) {
      setSidebarOpen(!storedSidebarPreference, { persist: false });
      hasAppliedStoredSidebarPreference = true;
    }
  };

  const updatePurposeDescription = () => {
    const preset = getSessionPurposePreset(purposeSelect?.value || defaultPurposeId);
    currentPurposePreset = preset;
    if (purposeDescriptionEl) {
      purposeDescriptionEl.textContent = preset.description;
    }
  };

  if (purposeSelect && !purposeSelect.value) {
    purposeSelect.value = defaultPurposeId;
  }

  if (purposeSelect && storedPurpose && Array.from(purposeSelect.options).some((option) => option.value === storedPurpose)) {
    purposeSelect.value = storedPurpose;
  }

  if (storedQuestionnaire) {
    questionnaireQuestionIds.forEach((questionId) => {
      const storedValue = storedQuestionnaire[questionId];
      if (!storedValue) return;
      const input = coachCalibratorForm?.querySelector<HTMLInputElement>(`input[type="radio"][name="coach-q-${questionId}"][value="${storedValue}"]`);
      if (input) {
        input.checked = true;
      }
    });
  }

  if (coachCalibratorInputs.length > 0) {
    coachCalibratorInputs.forEach((input) => {
      input.addEventListener('change', () => {
        refreshCoachOptionClasses();
        updateCoachRecommendation();
      });
    });
  }

  if (modalityButtons.length > 0) {
    modalityButtons.forEach((button, index) => {
      button.addEventListener('click', () => {
        const modality = (button.dataset.modality as Modality | undefined) ?? 'voice';
        setCurrentModality(modality);
      });

      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const offset = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = (index + offset + modalityButtons.length) % modalityButtons.length;
        const nextButton = modalityButtons[nextIndex];
        nextButton.focus();
        const modality = (nextButton.dataset.modality as Modality | undefined) ?? 'voice';
        setCurrentModality(modality);
      });
    });
  }

  if (textChatInput) {
    textChatInput.addEventListener('input', updateTextSubmitState);
  }

  updateModalityUI();

  if (purposeSelect) {
    purposeSelect.addEventListener('change', () => {
      updatePurposeDescription();
      setStoredPurpose(purposeSelect.value || null);
      if (session) {
        syncSessionInstructions(lastDynamicContext);
      }
    });
  }

  if (configOpenBtn) {
    configOpenBtn.addEventListener('click', () => {
      setSidebarOpen(true, { persist: false, focusTarget: 'close' });
    });
  }

  if (configCloseBtn) {
    configCloseBtn.addEventListener('click', () => {
      if (!questionnaireIsComplete) return;
      setSidebarOpen(false, { focusTarget: 'trigger' });
    });
  }

  if (configSidebarBackdrop) {
    configSidebarBackdrop.addEventListener('click', () => {
      if (!questionnaireIsComplete) return;
      setSidebarOpen(false, { focusTarget: 'trigger' });
    });
  }

  if (configSidebarSurface) {
    configSidebarSurface.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && questionnaireIsComplete) {
        event.preventDefault();
        setSidebarOpen(false, { focusTarget: 'trigger' });
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (!questionnaireIsComplete) return;
    if (!configSidebar?.classList.contains('is-open')) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (configSidebarSurface?.contains(target)) return;
    if (configOpenBtn?.contains(target)) return;
    setSidebarOpen(false, { focusTarget: 'trigger' });
  });

  refreshCoachOptionClasses();
  updateCoachRecommendation();
  updatePurposeDescription();

  if (configSidebar?.classList.contains('is-open')) {
    document.body.classList.add('config-sidebar-open');
  } else {
    document.body.classList.remove('config-sidebar-open');
  }

  updateConnectionStatus(false);

  async function requestSessionSummary(triggeredByAnalyzer = false) {
    if (!session || !isConnected) return;

    try {
      sessionAnalyzer?.markSummaryInitiated();

      recordLocalUserMessage('セッションのまとめを要求しました。');

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

  if (textChatForm && textChatInput) {
    textChatInput.addEventListener('input', updateTextSubmitState);
    textChatInput.addEventListener('compositionstart', () => {
      isTextChatComposing = true;
    });
    textChatInput.addEventListener('compositionend', () => {
      isTextChatComposing = false;
      updateTextSubmitState();
    });
    textChatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }
      if (event.isComposing || isTextChatComposing) {
        return;
      }
      if (currentModality !== 'text') {
        return;
      }
      event.preventDefault();
      if (textChatSubmit?.disabled) {
        return;
      }
      const requestSubmit = (textChatForm as HTMLFormElement & {
        requestSubmit?: (submitter?: HTMLElement) => void
      }).requestSubmit;
      if (typeof requestSubmit === 'function') {
        requestSubmit.call(textChatForm);
      } else {
        textChatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    textChatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!session || !isConnected || currentModality !== 'text') {
        if (textChatHint) {
          textChatHint.textContent = '接続後にテキストでメッセージを送信できます。';
          textChatHint.style.display = 'block';
        }
        return;
      }

      const message = textChatInput.value.trim();
      if (!message) {
        updateTextSubmitState();
        return;
      }

      recordLocalUserMessage(message);

      try {
        session.sendMessage({
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: message
            }
          ]
        });
        textChatInput.value = '';
        updateTextSubmitState();
        textChatInput.focus();
      } catch (error) {
        console.error('Failed to send text message:', error);
        alert('メッセージの送信に失敗しました。接続状態を確認してください。');
      }
    });
  }

  function updateConnectionStatus(connected: boolean, connecting: boolean = false) {
    isConnected = connected;
    const hasUsageData = getHasUsageData();

    if (purposeSelect) {
      purposeSelect.disabled = connected || connecting;
    }
    coachCalibratorInputs.forEach((input) => {
      input.disabled = connected || connecting;
    });

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

    // Show/hide conversation log based on connection status
    if (connected) {
      showConversationLog();
    } else {
      hideConversationLog(hasUsageData);
    }

    refreshTextChatState();
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
      if (!questionnaireIsComplete) {
        console.warn('Coach style questionnaire is incomplete. Using default personality preset.');
      }
      const personalityPreset = getPersonalityPreset(activePersonalityId);
      const purposePreset = getSessionPurposePreset(purposeSelect?.value || defaultPurposeId);
      currentPersonalityPreset = personalityPreset;
      currentPurposePreset = purposePreset;
      lastDynamicContext = null;
      lastOutputModalities = null;
      suppressedResponseIds.clear();
      suppressedItemIds.clear();

      const instructions = buildAgentInstructions(personalityPreset, purposePreset, lastPreferenceDirectives);
      lastInstructionsSent = instructions;
      const initialModalities = getDesiredOutputModalities();
      lastOutputModalities = [...initialModalities];

      console.log('🎛️ Starting session with presets:', {
        personality: personalityPreset.id,
        purpose: purposePreset.id,
        questionnaireCompleted: questionnaireIsComplete,
        preferenceDirectives: lastPreferenceDirectives
      });

      // Create the agent
      const agent = new RealtimeAgent({
        name: 'Coach',
        instructions
      });

      // Create the session
      session = new RealtimeSession(agent, {
        model: 'gpt-realtime',
        config: {
          outputModalities: initialModalities
        }
      });

      if (currentModality === 'text') {
        updateMicrophoneState();
      }

      sessionAnalyzer?.dispose();
      sessionAnalyzer = new SessionAnalyzer({
        session,
        controls: {
          panel: progressPanel || null,
          modeFills: modeFillElements,
          modeScores: modeScoreElements,
          currentMode: currentModeEl || null,
          progressNotes: progressNotesEl || null,
          closureContainer: closureSuggestionEl || null,
          closureMessage: closureMessageEl || null
        },
        initialAutoSummary: autoSummaryToggle?.checked ?? true,
        onRequestSummary: () => requestSessionSummary(true),
        onAnalysisUpdate: handleAnalysisUpdate
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
        if (event.type === 'response.created') {
          maybeSuppressResponse(event.response);
        } else if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
          if (event.response_id && suppressedResponseIds.has(event.response_id)) {
            recordSuppressedItemId(event.item);
          }
        }
        if (event.type === 'session.created') {
          console.log('Connected to OpenAI Realtime API');
          updateConnectionStatus(true);
          updateMicrophoneState();
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
            recordLocalUserMessage(transcript);
          }
        } else if (event.type === 'response.output_text.delta') {
          // Handle streaming text responses from assistant (for text mode)
          if (!event.response_id || !suppressedResponseIds.has(event.response_id)) {
            console.log('Assistant text delta:', event.delta);
          }
        } else if (event.type === 'response.output_text.done') {
          // Complete text response from assistant (for text mode)
          if (!event.response_id || !suppressedResponseIds.has(event.response_id)) {
            const text = event.text;
            if (text && text.trim()) {
              addMessageToLog('assistant', text.trim());
            }
          }
        } else if (event.type === 'conversation.item.created' || event.type === 'conversation.item.added') {
          // Handle conversation items (messages)
          const item = event.item;
          if (item && item.content) {
            if (!suppressedItemIds.has(item.id)) {
              const content = Array.isArray(item.content) ?
                item.content.map((c: any) => c.text || c.transcript || '').join(' ') :
                item.content.text || item.content.transcript || '';

              const trimmedContent = content.trim();
              if (trimmedContent) {
                let shouldLog = true;
                if (item.role === 'user') {
                  const normalizedContent = normalizeForDedup(trimmedContent);
                  const pendingIndex = pendingLocalUserMessages.indexOf(normalizedContent);
                  if (pendingIndex !== -1) {
                    pendingLocalUserMessages.splice(pendingIndex, 1);
                    shouldLog = false;
                  }
                }
                if (shouldLog) {
                  addMessageToLog(item.role === 'user' ? 'user' : 'assistant', trimmedContent);
                }
              }
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

          const response = event.response;
          const suppressed = maybeSuppressResponse(response);
          if (suppressed) {
            (response?.output ?? []).forEach((item: any) => recordSuppressedItemId(item));
          } else if (response && response.output) {
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
          updateMicrophoneState();
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
    lastInstructionsSent = null;
    lastDynamicContext = null;
    lastOutputModalities = null;
    suppressedResponseIds.clear();
    suppressedItemIds.clear();

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
