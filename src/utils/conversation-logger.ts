import type { IntegrationSnapshot } from '../voice-agent';

let lastAssistantMessageId: string | null = null;

type ToolServiceActivity = {
  service: string;
  displayName: string;
  lastSynced: string | null;
  connectedSince: string | null;
  snapshot: IntegrationSnapshot | null;
};

type ToolSnapshotPayload = {
  toolName: string;
  timeframe: string;
  generatedAt?: string;
  services: ToolServiceActivity[];
  missing?: string[];
};

function formatMetricLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function formatMetricValue(value: number): string {
  if (Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (Number.isInteger(value)) return value.toString();
  if (abs >= 100) return Math.round(value).toString();
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
}

function formatIsoDatetime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatServiceName(service: string): string {
  if (service === 'google_calendar') return 'Google Calendar';
  if (service === 'github') return 'GitHub';
  return service
    .replace(/_/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

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

export function addToolSnapshotToLog(payload: ToolSnapshotPayload): HTMLElement | null {
  const logContainer = document.getElementById('log-container');
  if (!logContainer) return null;

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message tool';

  const messageHeader = document.createElement('div');
  messageHeader.className = 'message-header';

  const messageRole = document.createElement('span');
  messageRole.className = 'message-role';
  messageRole.textContent = '🛠 ツール情報';

  const messageTimestamp = document.createElement('span');
  messageTimestamp.className = 'message-timestamp';
  messageTimestamp.textContent = formatTimestamp(new Date());

  messageHeader.appendChild(messageRole);
  messageHeader.appendChild(messageTimestamp);

  const messageContent = document.createElement('div');
  messageContent.className = 'message-content tool-content';

  const titleEl = document.createElement('div');
  titleEl.className = 'tool-call-title';
  const readableToolName = payload.toolName
    .replace(/_/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
  titleEl.textContent = `関数呼び出し · ${readableToolName}`;
  messageContent.appendChild(titleEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'tool-call-meta';
  const metaParts = [`期間: ${payload.timeframe}`];
  if (payload.generatedAt) {
    const generatedAt = formatIsoDatetime(payload.generatedAt);
    if (generatedAt) {
      metaParts.push(`生成日時 ${generatedAt}`);
    }
  }
  metaEl.textContent = metaParts.join(' · ');
  messageContent.appendChild(metaEl);

  if (payload.services.length === 0) {
    const emptyInfo = document.createElement('p');
    emptyInfo.className = 'tool-service-empty';
    emptyInfo.textContent = '連携済みのアクティビティソースがありません。Google CalendarまたはGitHubを連携すると、週次インサイトを確認できます。';
    messageContent.appendChild(emptyInfo);
  }

  payload.services.forEach((service) => {
    const section = document.createElement('section');
    section.className = 'tool-service';

    const header = document.createElement('div');
    header.className = 'tool-service-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'tool-service-name';
    nameEl.textContent = service.displayName || formatServiceName(service.service);
    header.appendChild(nameEl);

    const syncLabel = formatIsoDatetime(service.lastSynced);
    if (syncLabel) {
      const syncEl = document.createElement('span');
      syncEl.className = 'tool-service-sync';
      syncEl.textContent = `同期済み ${syncLabel}`;
      header.appendChild(syncEl);
    }

    section.appendChild(header);

    if (!service.snapshot) {
      const emptyEl = document.createElement('p');
      emptyEl.className = 'tool-service-empty';
      emptyEl.textContent = 'データが見つかりませんでした。もう一度同期してスナップショットを更新してください。';
      section.appendChild(emptyEl);
      messageContent.appendChild(section);
      return;
    }

    const summaryEl = document.createElement('p');
    summaryEl.className = 'tool-service-summary';
    summaryEl.textContent = service.snapshot.summary;
    section.appendChild(summaryEl);

    const totals = Object.entries(service.snapshot.totals || {});
    if (totals.length > 0) {
      const metricsWrapper = document.createElement('div');
      metricsWrapper.className = 'tool-metric-grid';
      totals.forEach(([key, value]) => {
        const metric = document.createElement('div');
        metric.className = 'tool-metric';

        const label = document.createElement('span');
        label.className = 'tool-metric-label';
        label.textContent = formatMetricLabel(key);

        const metricValue = document.createElement('span');
        metricValue.className = 'tool-metric-value';
        metricValue.textContent = formatMetricValue(typeof value === 'number' ? value : Number(value));

        metric.appendChild(label);
        metric.appendChild(metricValue);
        metricsWrapper.appendChild(metric);
      });
      section.appendChild(metricsWrapper);
    }

    if (service.snapshot.highlights?.length) {
      const highlightWrapper = document.createElement('div');
      highlightWrapper.className = 'tool-section';

      const highlightTitle = document.createElement('div');
      highlightTitle.className = 'tool-section-title';
      highlightTitle.textContent = 'ハイライト';
      highlightWrapper.appendChild(highlightTitle);

      const highlightList = document.createElement('ul');
      highlightList.className = 'tool-list';
      service.snapshot.highlights.slice(0, 3).forEach((highlight) => {
        const item = document.createElement('li');
        item.className = 'tool-list-item';

        const itemTitle = document.createElement('span');
        itemTitle.className = 'tool-highlight-title';
        itemTitle.textContent = highlight.title;
        item.appendChild(itemTitle);

        const itemDetail = document.createElement('span');
        itemDetail.className = 'tool-highlight-detail';
        itemDetail.textContent = highlight.insight;
        item.appendChild(itemDetail);

        highlightList.appendChild(item);
      });

      highlightWrapper.appendChild(highlightList);
      section.appendChild(highlightWrapper);
    }

    messageContent.appendChild(section);
  });

  if (payload.missing && payload.missing.length > 0) {
    const missingEl = document.createElement('div');
    missingEl.className = 'tool-missing-note';
    const services = payload.missing.map((service) => formatServiceName(service)).join(', ');
    missingEl.textContent = `未連携のサービス: ${services}`;
    messageContent.appendChild(missingEl);
  }

  messageDiv.appendChild(messageHeader);
  messageDiv.appendChild(messageContent);
  logContainer.appendChild(messageDiv);

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
  endMarkerDiv.textContent = '-- 会話が終了しました --';

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
  const activityButton = document.getElementById('activity-request-btn') as HTMLButtonElement | null;

  if (!copyButton && !activityButton) return;

  const logContainer = document.getElementById('log-container');
  const hasMessages = !!logContainer && logContainer.querySelector('.message');

  if (copyButton) {
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

  if (activityButton) {
    activityButton.style.display = hasMessages ? 'inline-flex' : 'none';
    activityButton.disabled = !hasMessages;
  }
}
