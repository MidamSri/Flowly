import { PlanRequest, ActionPlan, SemanticNode, StepHistoryItem, DomainMemory } from '@flowly/shared';

/**
 * Communicates with the local planner Fastify server to generate plans.
 */
export async function requestActionPlan(
  goal: string,
  url: string,
  elements: SemanticNode[],
  history: StepHistoryItem[],
  relevantMemories?: DomainMemory | null
): Promise<ActionPlan> {
  const payload: PlanRequest = {
    goal,
    url,
    elements,
    history,
    relevantMemories
  };

  const response = await fetch('http://localhost:3000/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Planner Server error (HTTP ${response.status}): ${text}`);
  }

  const data = await response.json();
  return data as ActionPlan;
}
