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
  originalPlan: any;
  currentPlan: any;
  stepResults: any[];
  timeline: ReplayTimelineItem[];
  recoveryHistory?: any[];
}

/**
 * Constructs a HistoryItem from the final runner execution state.
 */
export function createHistoryItem(
  state: RunnerState,
  status: 'success' | 'failed' | 'aborted',
  screenshotIds?: string[]
): HistoryItem {
  const startedAt = state.startedAt || new Date().toISOString();
  const finishedAt = state.finishedAt || new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const timeline = buildReplayTimeline(state.currentPlan, state.stepResults || []);

  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  const fallbackPlan = {
    goal: state.goal,
    steps: [],
    reasoning: 'No plan was generated.',
    confidence: 0,
    isGoalAchieved: false
  };

  return {
    id: uniqueId,
    goal: state.goal,
    startedAt,
    finishedAt,
    durationMs,
    status,
    pageTitle: state.pageTitle,
    pageUrl: state.pageUrl,
    originalPlan: state.originalPlan || fallbackPlan,
    currentPlan: state.currentPlan || fallbackPlan,
    stepResults: state.stepResults || [],
    timeline,
    screenshotIds: screenshotIds || [],
    recoveryHistory: state.recoveryHistory || []
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
    originalPlan: item.originalPlan,
    currentPlan: item.currentPlan,
    stepResults: item.stepResults,
    timeline: item.timeline,
    recoveryHistory: item.recoveryHistory
  };
  return JSON.stringify(trace, null, 2);
}
