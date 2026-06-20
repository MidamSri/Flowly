import { FailureContext, ActionPlan, PageState, DomainMemory, RecoveryPlan, RecoverRequest } from '@flowly/shared';

/**
 * Communicates with the local planner Fastify server to generate a corrective plan fragment.
 */
export async function requestRecoveryPlan(
  goal: string,
  originalPlan: ActionPlan,
  failureContext: FailureContext,
  pageState: PageState,
  relevantMemories?: DomainMemory | null
): Promise<RecoveryPlan> {
  const payload: RecoverRequest = {
    goal,
    originalPlan,
    failureContext,
    pageState,
    relevantMemories
  };

  const response = await fetch('http://localhost:3000/api/recover', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Planner Server recover error (HTTP ${response.status}): ${text}`);
  }

  const data = await response.json();
  return data as RecoveryPlan;
}
