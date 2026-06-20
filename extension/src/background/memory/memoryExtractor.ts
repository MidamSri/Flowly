import { RunnerState } from '@flowly/shared';
import { createSuccessfulPattern } from './models/SuccessfulPattern';
import { createFailurePattern } from './models/FailurePattern';
import { addPattern } from './memoryStore';
import { eventBus } from '../runner/eventBus';

/**
 * Extracts memory pattern from a completed run state and saves it to the store.
 */
export async function extractAndStoreMemory(state: RunnerState, status: 'success' | 'failed'): Promise<void> {
  const urlString = state.pageUrl || '';
  if (!urlString) return;

  let domain = 'unknown';
  try {
    domain = new URL(urlString).hostname;
  } catch (e) {
    // Skip if URL is invalid (e.g. empty or chrome internal page)
    return;
  }

  if (status === 'success') {
    const actions = state.plan?.steps || [];
    if (actions.length === 0) return;

    const pattern = createSuccessfulPattern(domain, state.goal, actions);
    await addPattern(domain, { success: pattern });

    eventBus.emit('MEMORY_CREATED', {
      message: `Successfully extracted and saved pattern for goal: "${state.goal}" on ${domain}.`
    });
  } else if (status === 'failed') {
    if (!state.stepStatuses) return;
    
    // Find first failed step (0-indexed)
    const failedStepIndex = state.stepStatuses.indexOf('failed');
    if (failedStepIndex === -1) return;

    const failedStep = failedStepIndex + 1; // 1-indexed for clarity
    const failedAction = state.plan?.steps ? state.plan.steps[failedStepIndex] : undefined;
    const error = state.stepResults?.[failedStepIndex]?.error || 'Step execution failed';

    const pattern = createFailurePattern(domain, state.goal, failedStep, error, failedAction);
    await addPattern(domain, { failure: pattern });

    eventBus.emit('MEMORY_CREATED', {
      message: `Recorded failure pattern at step ${failedStep} for goal: "${state.goal}" on ${domain}.`
    });
  }
}
