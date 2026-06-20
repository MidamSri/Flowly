import { HistoryItem, RunnerState, ReplayTimelineItem } from '@flowly/shared';
import { buildReplayTimeline } from './replayBuilder';

export interface ExportedTrace {
  version: number;
  id: string;
  goal: string;
  status: 'success' | 'failed' | 'aborted';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pageUrl?: string;
  pageTitle?: string;
  plan: any;
  stepResults: any[];
  timeline: ReplayTimelineItem[];
}

/**
 * Constructs a HistoryItem from the final runner execution state.
 */
export function createHistoryItem(
  state: RunnerState,
  status: 'success' | 'failed' | 'aborted'
): HistoryItem {
  const startedAt = state.startedAt || new Date().toISOString();
  const finishedAt = state.finishedAt || new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const timeline = buildReplayTimeline(state.plan, state.stepResults || []);

  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  return {
    id: uniqueId,
    goal: state.goal,
    startedAt,
    finishedAt,
    durationMs,
    status,
    pageTitle: state.pageTitle,
    pageUrl: state.pageUrl,
    plan: state.plan || {
      goal: state.goal,
      steps: [],
      reasoning: 'No plan was generated.',
      confidence: 0,
      isGoalAchieved: false
    },
    stepResults: state.stepResults || [],
    timeline
  };
}

/**
 * Prepares a completed history run for JSON trace export with rich metadata.
 */
export function formatTraceForExport(item: HistoryItem): string {
  const trace: ExportedTrace = {
    version: 1,
    id: item.id,
    goal: item.goal,
    status: item.status,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    durationMs: item.durationMs,
    pageUrl: item.pageUrl,
    pageTitle: item.pageTitle,
    plan: item.plan,
    stepResults: item.stepResults,
    timeline: item.timeline
  };
  return JSON.stringify(trace, null, 2);
}
