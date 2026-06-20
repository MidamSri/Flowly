import { AgentSession, IterationSummary } from '@flowly/shared';
import * as store from '../state/store';

let currentSession: AgentSession | null = null;

export function getActiveSession(): AgentSession | null {
  return currentSession;
}

export function createSession(goal: string): AgentSession {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  currentSession = {
    id,
    goal,
    status: 'running',
    startedAt: new Date().toISOString(),
    currentIteration: 1,
    totalStepsExecuted: 0,
    totalRecoveries: 0,
    iterationHistory: []
  };

  store.updateState({ activeSession: currentSession });
  return currentSession;
}

export function updateSession(partial: Partial<AgentSession>): void {
  if (currentSession) {
    currentSession = { ...currentSession, ...partial };
    store.updateState({ activeSession: currentSession });
  }
}

export function incrementStepsExecuted(count: number = 1): void {
  if (currentSession) {
    currentSession.totalStepsExecuted += count;
    store.updateState({ activeSession: { ...currentSession } });
  }
}

export function incrementRecoveries(count: number = 1): void {
  if (currentSession) {
    currentSession.totalRecoveries += count;
    store.updateState({ activeSession: { ...currentSession } });
  }
}

export function incrementIteration(): void {
  if (currentSession) {
    currentSession.currentIteration += 1;
    store.updateState({ activeSession: { ...currentSession } });
  }
}

export function addIterationSummary(summary: IterationSummary): void {
  if (currentSession) {
    currentSession.iterationHistory.push(summary);
    store.updateState({ activeSession: { ...currentSession } });
  }
}

export function terminateSession(status: 'completed' | 'failed' | 'aborted'): void {
  if (currentSession) {
    currentSession = {
      ...currentSession,
      status,
      completedAt: new Date().toISOString()
    };
    store.updateState({ activeSession: currentSession });
    currentSession = null;
  }
}

export function clearActiveSession(): void {
  currentSession = null;
  store.updateState({ activeSession: null });
}
