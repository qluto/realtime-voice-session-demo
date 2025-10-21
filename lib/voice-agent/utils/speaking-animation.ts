import { showConversationLog } from './conversation-logger';

let currentSpeakingMessage: HTMLElement | null = null;
let recordingIndicator: HTMLElement | null = null;

export function showRecordingIndicator() {
  if (recordingIndicator) return; // Already showing

  const logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  recordingIndicator = document.createElement('div');
  recordingIndicator.className = 'recording-indicator';
  recordingIndicator.innerHTML = `
    <span class="coach-icon">🧘‍♀️</span>
    コーチが聞いています
    <span class="dots">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  `;

  logContainer.appendChild(recordingIndicator);
  if (typeof logContainer.scrollTo === 'function') {
    logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: 'smooth' });
  } else {
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // Show conversation log if it's hidden
  showConversationLog();
}

export function hideRecordingIndicator() {
  if (recordingIndicator && recordingIndicator.parentNode) {
    recordingIndicator.parentNode.removeChild(recordingIndicator);
    recordingIndicator = null;
  }
}

export function startSpeakingAnimation(messageElement: HTMLElement) {
  // Stop any previous speaking animation
  stopSpeakingAnimation();

  currentSpeakingMessage = messageElement;
  currentSpeakingMessage.classList.add('speaking');
  console.log('🎵 Started speaking animation');
}

export function stopSpeakingAnimation() {
  if (currentSpeakingMessage) {
    currentSpeakingMessage.classList.remove('speaking');
    currentSpeakingMessage = null;
    console.log('🎵 Stopped speaking animation');
  }
}
