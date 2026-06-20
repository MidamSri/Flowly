import { Action, ActionPlan } from '@flowly/shared';

/**
 * Composes a new current plan by combining the completed steps,
 * the recovery steps (flagged with isRecovery: true), and the remaining steps.
 */
export function composeExecutionPlan(
  currentPlan: ActionPlan,
  failedStepIndex: number,
  recoverySteps: Action[]
): ActionPlan {
  const completedSteps = currentPlan.steps.slice(0, failedStepIndex);

  const markedRecoverySteps = recoverySteps.map((step) => ({
    ...step,
    isRecovery: true
  }));

  const remainingSteps = currentPlan.steps.slice(failedStepIndex + 1);

  const composedSteps = [
    ...completedSteps,
    ...markedRecoverySteps,
    ...remainingSteps
  ];

  return {
    ...currentPlan,
    steps: composedSteps
  };
}
