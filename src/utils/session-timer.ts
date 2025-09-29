let sessionStartTime: Date | null = null;
let sessionTimerInterval: number | null = null;
let sessionDuration = 0; // in seconds

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function startSessionTimer() {
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

export function stopSessionTimer() {
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

export function resetSessionTimer() {
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

export function getSessionDuration(): number {
  return sessionDuration;
}