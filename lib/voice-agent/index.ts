import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime'
import {
  addMessageToLog,
  addConversationEndMarker,
  clearConversationLog,
  showConversationLog,
  hideConversationLog
} from './utils/conversation-logger'
import {
  startSessionTimer,
  stopSessionTimer
} from './utils/session-timer'
import {
  startUsageTracking,
  stopUsageTracking,
  resetUsageStats,
  getHasUsageData
} from './utils/usage-tracker'
import {
  showRecordingIndicator,
  hideRecordingIndicator,
  startSpeakingAnimation,
  stopSpeakingAnimation
} from './utils/speaking-animation'
import { SessionAnalyzer, type PhaseKey } from './session-analyzer/index.ts'
import {
  getPersonalityPreset,
  getSessionPurposePreset,
  defaultPersonalityId,
  defaultPurposeId
} from './utils/prompt-presets.ts'
import { buildAgentInstructions, type DynamicPromptContext } from './prompt-builder.ts'
import {
  computePersonalityRecommendation,
  questionnaireQuestionIds,
  type PersonalityId,
  type QuestionnaireResponses
} from './personality-recommendation.ts'

declare global {
  interface Window {
    __voiceAgentInitialized?: boolean
  }
}

let session: RealtimeSession | null = null;
let isConnected = false;
let sessionAnalyzer: SessionAnalyzer | null = null;

const tokenEndpoint = process.env.NEXT_PUBLIC_TOKEN_ENDPOINT || '/api/generate-token'

const STORAGE_KEYS = {
  questionnaire: 'voiceCoach.questionnaire',
  purpose: 'voiceCoach.purpose',
  sidebarHidden: 'voiceCoach.sidebarHidden'
} as const;

export function setupVoiceAgent() {
  if (typeof window === 'undefined') return
  if (window.__voiceAgentInitialized) return
  window.__voiceAgentInitialized = true
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
  const currentPhaseEl = document.querySelector<HTMLElement>('#current-phase')
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
  let hasSentInitialGreeting = false;

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
  const suppressedPurposeSet = new Set(['progress-score', 'closure-readiness', 'summary-consent-eval']);
  const suppressedResponseIds = new Set<string>();
  const suppressedItemIds = new Set<string>();
  const pendingLocalUserMessages: string[] = [];
  const SUMMARY_DISCONNECT_DELAY = 1500;
  let summaryResponseId: string | null = null;
  let summaryAwaitingCompletion = false;
  let summaryWaitingForPlaybackStop = false;
  let summaryAutoDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const normalizeForDedup = (value: string) => value.trim().replace(/\s+/g, ' ');

  const recordLocalUserMessage = (raw: string, options: { log?: boolean } = {}) => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    pendingLocalUserMessages.push(normalizeForDedup(trimmed))
    if (options.log === false) return null
    return addMessageToLog('user', trimmed)
  }

  const resetSummaryTracking = () => {
    summaryAwaitingCompletion = false;
    summaryResponseId = null;
    summaryWaitingForPlaybackStop = false;
    if (summaryAutoDisconnectTimer) {
      clearTimeout(summaryAutoDisconnectTimer);
      summaryAutoDisconnectTimer = null;
    }
  }

  const scheduleSummaryAutoDisconnect = () => {
    if (summaryAutoDisconnectTimer) return;
    summaryAutoDisconnectTimer = setTimeout(() => {
      summaryAutoDisconnectTimer = null;
      disconnectFromVoiceAgent();
    }, SUMMARY_DISCONNECT_DELAY);
  }

  const getGreetingForCurrentTime = () => {
    const hour = new Date().getHours()
    if (hour < 5) return 'こんばんは'
    if (hour < 11) return 'おはようございます'
    if (hour < 18) return 'こんにちは'
    if (hour < 22) return 'こんばんは'
    return 'こんばんは'
  }

  const sendInitialGreeting = () => {
    if (!session) return
    if (hasSentInitialGreeting) return
    const greeting = getGreetingForCurrentTime()
    if (!greeting) return
    try {
      recordLocalUserMessage(greeting, { log: false })
      session.sendMessage({
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: greeting
        }]
      })
      hasSentInitialGreeting = true
      console.log('🙋 Sent automatic greeting message to agent:', greeting)
    } catch (error) {
      console.error('Failed to send initial greeting:', error)
    }
  }

  const computeInstructions = (dynamic?: DynamicPromptContext) =>
    buildAgentInstructions(currentPersonalityPreset, currentPurposePreset, lastPreferenceDirectives, dynamic);

  const getDesiredOutputModalities = (): ('audio' | 'text')[] =>
    currentModality === 'text' ? ['text'] : ['audio'];

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

  const phaseFillElements: Record<PhaseKey, HTMLElement | null> = {
    goal: document.querySelector<HTMLElement>('[data-phase-fill="goal"]'),
    reality: document.querySelector<HTMLElement>('[data-phase-fill="reality"]'),
    options: document.querySelector<HTMLElement>('[data-phase-fill="options"]'),
    will: document.querySelector<HTMLElement>('[data-phase-fill="will"]')
  }

  const phaseScoreElements: Record<PhaseKey, HTMLElement | null> = {
    goal: document.querySelector<HTMLElement>('[data-phase-score="goal"]'),
    reality: document.querySelector<HTMLElement>('[data-phase-score="reality"]'),
    options: document.querySelector<HTMLElement>('[data-phase-score="options"]'),
    will: document.querySelector<HTMLElement>('[data-phase-score="will"]')
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
      resetSummaryTracking();
      summaryAwaitingCompletion = true;
      summaryResponseId = null;

      recordLocalUserMessage('セッションのまとめを要求しました。');

      const summaryPrompt = '今までの会話を基に、今週の振り返りの重要なポイントをまとめてください。セッションを自然にクロージングに向けてください。';
      const desiredModalities = getDesiredOutputModalities();
      summaryWaitingForPlaybackStop = desiredModalities.includes('audio');

      session.sendMessage({
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: summaryPrompt
        }]
      });

      if (closureSuggestionEl) {
        closureSuggestionEl.style.display = 'none';
      }

      console.log('📝 Summary request sent to coach');
    } catch (error) {
      console.error('Failed to send summary request:', error);
      resetSummaryTracking();
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
      hasSentInitialGreeting = false;
      suppressedResponseIds.clear();
      suppressedItemIds.clear();
      resetSummaryTracking();

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
        if (event.type === 'response.created') {
          const response = event.response;
          if (response?.metadata?.purpose === 'session-summary') {
            summaryAwaitingCompletion = true;
            summaryResponseId = response.id || null;
            console.log('🧾 Summary response started', { responseId: summaryResponseId, viaMetadata: true });
          } else if (summaryAwaitingCompletion && !summaryResponseId && response?.id) {
            summaryResponseId = response.id;
            console.log('🧾 Summary response started', { responseId: summaryResponseId, viaFirstResponse: true });
          }
          maybeSuppressResponse(response);
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
          sendInitialGreeting();
        } else if (event.type === 'error' || event.type === 'close') {
          console.log('Disconnected from OpenAI Realtime API');
          stopUsageTracking(session);
          stopSessionTimer();
          stopSpeakingAnimation();
          hideRecordingIndicator();
          resetSummaryTracking();
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

          if (summaryAwaitingCompletion && response) {
            const purpose = response.metadata?.purpose || response.metadata?.Purpose;
            const responseId = response.id || event.response_id || null;
            if (purpose === 'session-summary' || (summaryResponseId && responseId && summaryResponseId === responseId)) {
              summaryAwaitingCompletion = false;
              summaryResponseId = null;
              if (summaryWaitingForPlaybackStop) {
                console.log('✅ Summary response finished, waiting for audio playback to stop before disconnecting');
              } else {
                console.log('✅ Summary response finished in text mode, scheduling auto disconnect');
                scheduleSummaryAutoDisconnect();
              }
            }
          }
        } else if (event.type === 'output_audio_buffer.stopped') {
          // Audio playback completed - this is the actual event that fires
          console.log('🔊 Audio playback stopped - stopping animation');
          stopSpeakingAnimation();
          if (summaryWaitingForPlaybackStop) {
            summaryWaitingForPlaybackStop = false;
            console.log('✅ Summary audio playback stopped, scheduling auto disconnect');
            scheduleSummaryAutoDisconnect();
          }
        } else if (event.type === 'response.audio.delta') {
          // Audio chunks being played
          console.log('🔊 Audio delta - audio is being played');
        } else if (event.type === 'response.audio.done') {
          // Audio playback completed (backup)
          console.log('🔊 Audio done - stopping animation');
          stopSpeakingAnimation();
          if (summaryWaitingForPlaybackStop) {
            summaryWaitingForPlaybackStop = false;
            console.log('✅ Summary audio done event detected, scheduling auto disconnect');
            scheduleSummaryAutoDisconnect();
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


        resetSummaryTracking();
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
          sendInitialGreeting();
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
    hasSentInitialGreeting = false;
    suppressedResponseIds.clear();
    suppressedItemIds.clear();
    resetSummaryTracking();

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
