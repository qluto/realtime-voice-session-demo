let lastAssistantMessageId: string | null = null;

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function addMessageToLog(role: 'user' | 'assistant', content: string, timestamp?: Date, messageId?: string): HTMLElement {
  const logContainer = document.getElementById('log-container');
  if (!logContainer) return document.createElement('div');

  // Prevent duplicate assistant messages
  if (role === 'assistant' && messageId) {
    if (lastAssistantMessageId === messageId) {
      console.log('🔄 Skipping duplicate assistant message:', messageId);
      const lastMessage = getLastAssistantMessage();
      return lastMessage || document.createElement('div');
    }
    lastAssistantMessageId = messageId;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  if (messageId) {
    messageDiv.setAttribute('data-message-id', messageId);
  }

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
  if (typeof logContainer.scrollTo === 'function') {
    logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: 'smooth' });
  } else {
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  updateTranscriptCopyButtonVisibility();

  return messageDiv;
}

export function addConversationEndMarker() {
  const logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  const endMarkerDiv = document.createElement('div');
  endMarkerDiv.className = 'conversation-end-marker';
  endMarkerDiv.textContent = '-- conversation ended --';

  logContainer.appendChild(endMarkerDiv);

  // Auto-scroll to bottom
  if (typeof logContainer.scrollTo === 'function') {
    logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: 'smooth' });
  } else {
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  updateTranscriptCopyButtonVisibility();
}

export function clearConversationLog() {
  const logContainer = document.getElementById('log-container');
  if (logContainer) {
    logContainer.innerHTML = '';
  }
  lastAssistantMessageId = null;

  // Hide summary controls when clearing conversation
  const summaryControls = document.getElementById('summary-controls');
  if (summaryControls) {
    summaryControls.style.display = 'none';
  }

  updateTranscriptCopyButtonVisibility();
}

export function showConversationLog() {
  const conversationLog = document.getElementById('conversation-log');
  const instructions = document.getElementById('instructions');

  if (conversationLog) {
    conversationLog.style.display = 'flex';
  }
  if (instructions) {
    instructions.style.display = 'none';
  }
}

export function hideConversationLog(hasUsageData: boolean) {
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

  if (!hasMessages) {
    updateTranscriptCopyButtonVisibility();
  }
}

export function getLastAssistantMessage(): HTMLElement | null {
  const logContainer = document.getElementById('log-container');
  if (!logContainer) return null;

  const messages = logContainer.querySelectorAll('.message.assistant');
  return messages.length > 0 ? messages[messages.length - 1] as HTMLElement : null;
}

function updateTranscriptCopyButtonVisibility() {
  const copyButton = document.getElementById('copy-transcript-btn') as HTMLButtonElement | null;
  if (!copyButton) return;

  const logContainer = document.getElementById('log-container');
  const hasMessages = !!logContainer && logContainer.querySelector('.message');

  if (!copyButton.dataset.defaultLabel) {
    copyButton.dataset.defaultLabel = copyButton.innerHTML;
  }

  copyButton.style.display = hasMessages ? 'inline-flex' : 'none';

  if (!hasMessages) {
    copyButton.classList.remove('copied');
    if (copyButton.dataset.defaultLabel) {
      copyButton.innerHTML = copyButton.dataset.defaultLabel;
    }
  }
}
