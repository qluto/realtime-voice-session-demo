import type { IntegrationSnapshot } from '../voice-agent';

interface GitHubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: {
    id: number;
    name: string;
  };
  payload: any;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  updated_at: string;
  language?: string;
}

interface GitHubData {
  username: string;
  events: GitHubEvent[];
  repos: GitHubRepo[];
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

function analyzeEvents(events: GitHubEvent[]) {
  const stats = {
    commits: 0,
    pullRequests: 0,
    reviews: 0,
    issuesClosed: 0,
    byRepo: new Map<string, { commits: number; prs: number; reviews: number }>()
  };

  events.forEach(event => {
    const repoName = event.repo.name;

    if (!stats.byRepo.has(repoName)) {
      stats.byRepo.set(repoName, { commits: 0, prs: 0, reviews: 0 });
    }
    const repoStats = stats.byRepo.get(repoName)!;

    switch (event.type) {
      case 'PushEvent':
        const commitCount = event.payload.commits?.length || 0;
        stats.commits += commitCount;
        repoStats.commits += commitCount;
        break;

      case 'PullRequestEvent':
        if (event.payload.action === 'opened') {
          stats.pullRequests++;
          repoStats.prs++;
        }
        break;

      case 'PullRequestReviewEvent':
      case 'PullRequestReviewCommentEvent':
        stats.reviews++;
        repoStats.reviews++;
        break;

      case 'IssuesEvent':
        if (event.payload.action === 'closed') {
          stats.issuesClosed++;
        }
        break;
    }
  });

  return stats;
}

function identifyHighlights(events: GitHubEvent[], stats: ReturnType<typeof analyzeEvents>): Array<{
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

  // Find the most active repo
  const sortedRepos = Array.from(stats.byRepo.entries())
    .sort((a, b) => (b[1].commits + b[1].prs) - (a[1].commits + a[1].prs));

  if (sortedRepos.length > 0) {
    const [repoName, repoStats] = sortedRepos[0];
    const shortName = repoName.split('/').pop() || repoName;

    highlights.push({
      title: `Primary focus: ${shortName}`,
      insight: `Shipped ${repoStats.commits} commit(s) and ${repoStats.prs} PR(s), establishing clear momentum.`,
      impact: 'shipped',
      reflectionPrompt: 'What helped you deliver progress on this project, and how can you reuse that approach?'
    });
  }

  // Find significant PR activity
  const prEvents = events.filter(e => e.type === 'PullRequestEvent' && e.payload.action === 'opened');
  if (prEvents.length > 0) {
    const latestPR = prEvents[0];
    const title = latestPR.payload.pull_request?.title || 'Pull request';

    highlights.push({
      title: title.length > 60 ? title.substring(0, 57) + '...' : title,
      insight: 'Proposed changes that advance project goals.',
      impact: 'quality',
      reflectionPrompt: 'What quality standards did you maintain, and what support would help you sustain them?'
    });
  }

  // Find review activity
  if (stats.reviews > 0) {
    highlights.push({
      title: `Code reviews contributed`,
      insight: `Reviewed ${stats.reviews} PR(s), supporting team velocity and code quality.`,
      impact: 'collaboration',
      reflectionPrompt: 'Where do you want to keep showing up in code reviews next week?'
    });
  }

  return highlights.slice(0, 3);
}

function generateRepositoryDetails(stats: ReturnType<typeof analyzeEvents>, repos: GitHubRepo[]) {
  const activeRepos = Array.from(stats.byRepo.entries())
    .sort((a, b) => (b[1].commits + b[1].prs) - (a[1].commits + a[1].prs))
    .slice(0, 5);

  return activeRepos.map(([repoName, repoStats]) => {
    const repo = repos.find(r => r.full_name === repoName);
    const shortName = repoName.split('/').pop() || repoName;

    return {
      name: shortName,
      commits: repoStats.commits,
      pullRequests: repoStats.prs,
      reviews: repoStats.reviews,
      focus: `${repo?.language || 'Development'} work with ${repoStats.commits} commit(s).`
    };
  });
}

export function transformGitHubData(data: GitHubData): IntegrationSnapshot {
  const { events, repos, syncedAt } = data;
  const generatedAt = new Date(syncedAt);
  const timeframe = getWeekRangeLabel(generatedAt);

  const stats = analyzeEvents(events);
  const highlights = identifyHighlights(events, stats);
  const repositoryDetails = generateRepositoryDetails(stats, repos);

  // Calculate velocity comparison (mock for now, could be enhanced with historical data)
  const avgCommitsPerWeek = stats.commits > 0 ? stats.commits : 15;
  const delta = stats.commits > avgCommitsPerWeek
    ? `+${Math.round(((stats.commits - avgCommitsPerWeek) / avgCommitsPerWeek) * 100)}%`
    : `${Math.round(((stats.commits - avgCommitsPerWeek) / avgCommitsPerWeek) * 100)}%`;

  const summary = stats.commits > 0
    ? `You shipped ${stats.commits} commit(s) across ${stats.byRepo.size} ${stats.byRepo.size === 1 ? 'repository' : 'repositories'}${stats.pullRequests > 0 ? ` with ${stats.pullRequests} PR(s)` : ''}.${stats.reviews > 0 ? ` Code reviews stayed consistent with ${stats.reviews} contribution(s).` : ''}`
    : 'Limited development activity this week. Consider whether this aligns with your current priorities.';

  return {
    timeframe,
    summary,
    totals: {
      commits: stats.commits,
      pullRequests: stats.pullRequests,
      reviews: stats.reviews,
      issuesClosed: stats.issuesClosed
    },
    highlights,
    reflectionPrompts: [
      'Which commit or pull request are you most proud of and why?',
      'Where did you notice friction in the workflow that you want to remove?',
      'How did collaboration show up in code reviews, and what do you want to continue or change?'
    ],
    recommendations: [
      stats.commits > 20 ? 'High commit velocity—ensure documentation keeps pace with code changes.' : 'Consider blocking dedicated coding time to increase development momentum.',
      stats.reviews === 0 ? 'No reviews recorded—look for opportunities to support teammates through code review.' : 'Maintain consistent review participation to support team quality.',
      stats.pullRequests > 3 ? 'Multiple PRs opened—consider pairing to get faster feedback and reduce WIP.' : 'Keep shipping incremental changes through focused PRs.'
    ],
    details: {
      repositories: repositoryDetails,
      velocityComparison: {
        lastWeekCommits: avgCommitsPerWeek,
        delta
      },
      blockers: repositoryDetails.length === 0 ? ['No development activity detected—verify integration or discuss priorities.'] : []
    },
    generatedAt: generatedAt.toISOString()
  };
}
