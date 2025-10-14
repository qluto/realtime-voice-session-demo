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
    return '集中作業';
  } else if (text.match(/mentor|coaching|1:1|one-on-one/)) {
    return 'コーチング・メンタリング';
  } else if (text.match(/meeting|sync|standup|review|demo/)) {
    return 'コラボレーション';
  } else if (text.match(/personal|break|lunch|exercise|workout/)) {
    return 'リチャージ';
  } else if (event.attendees && event.attendees.length > 2) {
    return 'コラボレーション';
  } else if (event.attendees && event.attendees.length > 0) {
    return 'コラボレーション';
  }

  return 'その他';
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
}> {
  const highlights: Array<{
    title: string;
    insight: string;
    impact?: string;
  }> = [];

  // Find longest focus block
  const focusEvents = events.filter(e => categorizeEvent(e) === '集中作業');
  if (focusEvents.length > 0) {
    const longestFocus = focusEvents.reduce((longest, current) =>
      calculateDuration(current) > calculateDuration(longest) ? current : longest
    );

    if (calculateDuration(longestFocus) >= 1) {
      const startTime = new Date(longestFocus.start.dateTime!);
      highlights.push({
        title: `${longestFocus.summary} (${startTime.toLocaleDateString('ja-JP', { weekday: 'short' })} ${startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })})`,
        insight: `${calculateDuration(longestFocus).toFixed(1)}時間の集中作業`,
        impact: 'flow'
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
      title: `${meeting.summary} (${startTime.toLocaleDateString('ja-JP', { weekday: 'short' })} ${startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })})`,
      insight: `${meeting.attendees?.length || 0}名参加のミーティング`,
      impact: 'energizing'
    });
  }

  // Find mentoring sessions
  const mentoringEvents = events.filter(e => categorizeEvent(e) === 'コーチング・メンタリング');
  if (mentoringEvents.length > 0) {
    const mentoring = mentoringEvents[0];
    const startTime = new Date(mentoring.start.dateTime!);
    highlights.push({
      title: `${mentoring.summary} (${startTime.toLocaleDateString('ja-JP', { weekday: 'short' })} ${startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })})`,
      insight: '1on1セッション',
      impact: 'reflective'
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
  const totalMeetingHours = (timeByTheme['コラボレーション'] || 0) + (timeByTheme['コーチング・メンタリング'] || 0);
  const focusHours = timeByTheme['集中作業'] || 0;
  const summary = `集中作業${focusHours.toFixed(1)}時間、ミーティング${totalMeetingHours.toFixed(1)}時間${lateEveningMeetings.length > 0 ? `、19:00以降のミーティング${lateEveningMeetings.length}件` : ''}`;

  const highlights = identifyHighlights(events);

  // Patterns observed
  const patterns: string[] = [];
  if (focusHours > 5) {
    patterns.push(`週${focusHours.toFixed(1)}時間の集中作業時間を確保`);
  }
  if (lateEveningMeetings.length > 0) {
    patterns.push(`19:00以降に${lateEveningMeetings.length}件のミーティング`);
  }
  if (totalMeetingHours > 20) {
    patterns.push(`週${totalMeetingHours.toFixed(1)}時間のミーティング`);
  }
  if (timeByTheme['リチャージ'] && timeByTheme['リチャージ'] > 0) {
    patterns.push(`個人時間${timeByTheme['リチャージ'].toFixed(1)}時間`);
  }

  return {
    timeframe,
    summary,
    totals: {
      focusHours: focusHours,
      meetingHours: timeByTheme['コラボレーション'] || 0,
      mentoringHours: timeByTheme['コーチング・メンタリング'] || 0,
      personalTimeHours: timeByTheme['リチャージ'] || 0
    },
    highlights,
    details: {
      timeByTheme: Object.entries(timeByTheme).map(([theme, hours]) => ({ theme, hours })),
      patterns
    },
    generatedAt: generatedAt.toISOString()
  };
}
