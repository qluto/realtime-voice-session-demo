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
}> {
  const highlights: Array<{
    title: string;
    insight: string;
    impact?: string;
  }> = [];

  // Find the most active repo
  const sortedRepos = Array.from(stats.byRepo.entries())
    .sort((a, b) => (b[1].commits + b[1].prs) - (a[1].commits + a[1].prs));

  if (sortedRepos.length > 0) {
    const [repoName, repoStats] = sortedRepos[0];
    const shortName = repoName.split('/').pop() || repoName;

    highlights.push({
      title: `主な活動: ${shortName}`,
      insight: `${repoStats.commits}件のコミットと${repoStats.prs}件のPR`,
      impact: 'shipped'
    });
  }

  // Find significant PR activity
  const prEvents = events.filter(e => e.type === 'PullRequestEvent' && e.payload.action === 'opened');
  if (prEvents.length > 0) {
    const latestPR = prEvents[0];
    const title = latestPR.payload.pull_request?.title || 'Pull request';

    highlights.push({
      title: title.length > 60 ? title.substring(0, 57) + '...' : title,
      insight: 'プルリクエストを作成',
      impact: 'quality'
    });
  }

  // Find review activity
  if (stats.reviews > 0) {
    highlights.push({
      title: `コードレビュー活動`,
      insight: `${stats.reviews}件のPRをレビュー`,
      impact: 'collaboration'
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
      focus: `${repo?.language || '開発'}作業で${repoStats.commits}件のコミット。`
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
    ? `${stats.byRepo.size}個のリポジトリで${stats.commits}件のコミット${stats.pullRequests > 0 ? `、${stats.pullRequests}件のPR` : ''}${stats.reviews > 0 ? `、${stats.reviews}件のレビュー` : ''}`
    : '開発アクティビティなし';

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
    details: {
      repositories: repositoryDetails,
      velocityComparison: {
        lastWeekCommits: avgCommitsPerWeek,
        delta
      }
    },
    generatedAt: generatedAt.toISOString()
  };
}
