import { FailurePattern, Action } from '@flowly/shared';

export function createFailurePattern(
  domain: string,
  goal: string,
  failedStep: number,
  error: string,
  failedAction?: Action
): FailurePattern {
  return {
    id: Math.random().toString(36).substring(2, 9),
    domain,
    goal,
    failedStep,
    failedAction,
    error,
    timestamp: new Date().toISOString()
  };
}
