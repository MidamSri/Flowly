import { SuccessfulPattern, Action } from '@flowly/shared';

export function createSuccessfulPattern(
  domain: string,
  goal: string,
  actions: Action[]
): SuccessfulPattern {
  return {
    id: Math.random().toString(36).substring(2, 9),
    domain,
    goal,
    timestamp: new Date().toISOString(),
    actions
  };
}
