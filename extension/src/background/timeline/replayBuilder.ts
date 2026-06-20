import { ActionPlan, ActionResult, ReplayTimelineItem } from '@flowly/shared';

/**
 * Transforms an ActionPlan and step ActionResults into a unified list of ReplayTimelineItems.
 * Handles missing steps or incomplete runs by marking them as executed: false.
 */
export function buildReplayTimeline(
  plan: ActionPlan | null,
  stepResults: ActionResult[] = []
): ReplayTimelineItem[] {
  if (!plan) return [];

  return plan.steps.map((step, index) => {
    const result = stepResults[index];
    const executed = !!result;

    return {
      stepIndex: index,
      type: step.type,
      elementId: step.elementId,
      value: step.value,
      reasoning: step.reasoning,
      executed,
      success: result?.success,
      durationMs: result?.durationMs,
      error: result?.error,
      nodeRole: result?.nodeRole,
      nodeText: result?.nodeText,
      beforeUrl: result?.beforeUrl,
      afterUrl: result?.afterUrl,
      beforeTitle: result?.beforeTitle,
      afterTitle: result?.afterTitle,
      isRecovery: step.isRecovery
    };
  });
}
