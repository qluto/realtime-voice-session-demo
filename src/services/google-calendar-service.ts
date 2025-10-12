import type { IntegrationSnapshot } from '../voice-agent';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  attendees?: Array<{ email: string }>;
}

interface GoogleCalendarData {
  events: CalendarEvent[];
  syncedAt: string;
}

function formatDateForLabel(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekRangeLabel(now = new Date()): string {
  const start = new Date(now);
  const currentDay = start.getDay();
  const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
  start.setDate(start.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDateForLabel(start)} to ${formatDateForLabel(end)}`;
}

function categorizeEvent(event: CalendarEvent): string {
  const summary = event.summary?.toLowerCase() || '';
  const description = event.description?.toLowerCase() || '';
  const text = `${summary} ${description}`;

  if (text.match(/focus|deep work|coding|development|writing/)) {
    return 'Deep Work';
  } else if (text.match(/mentor|coaching|1:1|one-on-one/)) {
    return 'Coaching & Mentoring';
  } else if (text.match(/meeting|sync|standup|review|demo/)) {
    return 'Collaboration';
  } else if (text.match(/personal|break|lunch|exercise|workout/)) {
    return 'Recharge';
  } else if (event.attendees && event.attendees.length > 2) {
    return 'Collaboration';
  } else if (event.attendees && event.attendees.length > 0) {
    return 'Collaboration';
  }

  return 'Other';
}

function calculateDuration(event: CalendarEvent): number {
  if (!event.start.dateTime || !event.end.dateTime) return 0;

  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60); // hours
}

function identifyHighlights(events: CalendarEvent[]): Array<{
  title: string;
  insight: string;
  impact?: string;
  reflectionPrompt: string;
}> {
  const highlights: Array<{
    title: string;
    insight: string;
    impact?: string;
    reflectionPrompt: string;
  }> = [];

  // Find longest focus block
  const focusEvents = events.filter(e => categorizeEvent(e) === 'Deep Work');
  if (focusEvents.length > 0) {
    const longestFocus = focusEvents.reduce((longest, current) =>
      calculateDuration(current) > calculateDuration(longest) ? current : longest
    );

    if (calculateDuration(longestFocus) >= 1) {
      const startTime = new Date(longestFocus.start.dateTime!);
      highlights.push({
        title: `${longestFocus.summary} (${startTime.toLocaleDateString('en-US', { weekday: 'short' })} ${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })})`,
        insight: `Dedicated ${calculateDuration(longestFocus).toFixed(1)} hours to focused work without interruption.`,
        impact: 'flow',
        reflectionPrompt: 'What protected that focus block and how can you replicate it?'
      });
    }
  }

  // Find important meetings (with many attendees or keywords)
  const importantMeetings = events.filter(e => {
    const summary = e.summary?.toLowerCase() || '';
    return (e.attendees && e.attendees.length >= 3) ||
           summary.match(/strategy|planning|review|quarterly|okr/);
  });

  if (importantMeetings.length > 0) {
    const meeting = importantMeetings[0];
    const startTime = new Date(meeting.start.dateTime!);
    highlights.push({
      title: `${meeting.summary} (${startTime.toLocaleDateString('en-US', { weekday: 'short' })} ${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })})`,
      insight: `Coordinated with ${meeting.attendees?.length || 0} participants on strategic alignment.`,
      impact: 'energizing',
      reflectionPrompt: `What from this meeting feels important to carry into next week?`
    });
  }

  // Find mentoring sessions
  const mentoringEvents = events.filter(e => categorizeEvent(e) === 'Coaching & Mentoring');
  if (mentoringEvents.length > 0) {
    const mentoring = mentoringEvents[0];
    const startTime = new Date(mentoring.start.dateTime!);
    highlights.push({
      title: `${mentoring.summary} (${startTime.toLocaleDateString('en-US', { weekday: 'short' })} ${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })})`,
      insight: 'Created space for reflection and growth with a team member.',
      impact: 'reflective',
      reflectionPrompt: 'What insights emerged from this conversation that you want to act on?'
    });
  }

  return highlights.slice(0, 3); // Return top 3 highlights
}

export function transformGoogleCalendarData(data: GoogleCalendarData): IntegrationSnapshot {
  const { events, syncedAt } = data;
  const generatedAt = new Date(syncedAt);
  const timeframe = getWeekRangeLabel(generatedAt);

  // Calculate time by theme
  const timeByTheme: Record<string, number> = {};
  events.forEach(event => {
    const theme = categorizeEvent(event);
    const duration = calculateDuration(event);
    timeByTheme[theme] = (timeByTheme[theme] || 0) + duration;
  });

  // Identify late evening meetings (potential energy drains)
  const lateEveningMeetings = events.filter(event => {
    if (!event.start.dateTime) return false;
    const hour = new Date(event.start.dateTime).getHours();
    return hour >= 19;
  });

  // Generate summary
  const totalMeetingHours = (timeByTheme['Collaboration'] || 0) + (timeByTheme['Coaching & Mentoring'] || 0);
  const focusHours = timeByTheme['Deep Work'] || 0;
  const summary = focusHours > 5
    ? `You protected ${focusHours.toFixed(1)} hours for deep work while balancing ${totalMeetingHours.toFixed(1)} hours of meetings.${lateEveningMeetings.length > 0 ? ` ${lateEveningMeetings.length} late-evening session(s) may have impacted energy—consider recovery planning.` : ''}`
    : `Heavy collaboration week with ${totalMeetingHours.toFixed(1)} hours in meetings. Consider blocking more focus time next week.`;

  const highlights = identifyHighlights(events);

  // Energy signals
  const energySignals: string[] = [];
  if (focusHours > 5) {
    energySignals.push('Deep work blocks consistently protected—maintain this pattern.');
  }
  if (lateEveningMeetings.length > 0) {
    energySignals.push(`${lateEveningMeetings.length} late-evening meeting(s)—consider guardrails after 19:00 to preserve energy.`);
  }
  if (totalMeetingHours > 20) {
    energySignals.push('Meeting load is high—look for opportunities to decline or delegate.');
  }

  return {
    timeframe,
    summary,
    totals: {
      focusHours: focusHours,
      meetingHours: timeByTheme['Collaboration'] || 0,
      mentoringHours: timeByTheme['Coaching & Mentoring'] || 0,
      personalTimeHours: timeByTheme['Recharge'] || 0
    },
    highlights,
    reflectionPrompts: [
      'Which meeting energized you the most and what made it work?',
      'Where did meetings or context switching erode your focus?',
      'What personal time ritual helped you reset heading into the weekend?'
    ],
    recommendations: [
      focusHours < 5 ? 'Block at least 2-hour focus windows early in the day before meetings begin.' : 'Maintain your current focus block discipline.',
      lateEveningMeetings.length > 0 ? 'Move late meetings earlier or convert to async updates to protect recovery time.' : 'Keep evening boundaries in place.',
      totalMeetingHours > 15 ? 'Review recurring meetings and identify candidates for reduced frequency.' : 'Meeting balance looks sustainable.'
    ],
    details: {
      timeByTheme: Object.entries(timeByTheme).map(([theme, hours]) => ({ theme, hours })),
      energySignals,
      upcomingPreparation: [
        'Review next week calendar and block focus time proactively.',
        'Identify any high-stakes meetings that need preparation.'
      ]
    },
    generatedAt: generatedAt.toISOString()
  };
}
