import { executeStep } from './executeStep';
import { eventBus } from './eventBus';
import * as store from '../state/store';
import { createHistoryItem } from '../timeline/historyManager';
import { extractAndStoreMemory } from '../memory/memoryExtractor';

/**
 * Runs the sequence of steps in the action plan.
 * Handles state updates, telemetry accumulation, and abort requests.
 */
export async function executePlan(tabId: number, signal: AbortSignal): Promise<void> {
  const currentState = store.getState();
  const steps = currentState.plan?.steps || [];

  if (steps.length === 0) {
    store.addLog('warn', 'No steps to execute in current action plan.');
    return;
  }

  // 1. Initialize run states
  store.updateState({
    status: 'executing',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentStepIndex: 0,
    stepStatuses: steps.map(() => 'pending'),
    stepResults: []
  });

  eventBus.emit('RUN_STARTED', {
    message: `Starting execution of proposed action plan (${steps.length} steps).`
  });

  try {
    // 2. Loop through and execute steps sequentially
    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) {
        throw new DOMException('Execution cancelled by user', 'AbortError');
      }

      const step = steps[i];

      // Update step status to running
      const stepStatuses = [...store.getState().stepStatuses];
      stepStatuses[i] = 'running';
      store.updateState({
        currentStepIndex: i,
        stepStatuses
      });

      eventBus.emit('STEP_STARTED', { stepIndex: i });

      // Run step and gather telemetry
      const stepResult = await executeStep(tabId, step, i, signal);

      // Record step result
      store.addStepResult(stepResult);

      const finalStepStatuses = [...store.getState().stepStatuses];

      if (stepResult.success) {
        finalStepStatuses[i] = 'success';
        store.updateState({ stepStatuses: finalStepStatuses });
        eventBus.emit('STEP_COMPLETED', { stepIndex: i });
      } else {
        finalStepStatuses[i] = 'failed';
        store.updateState({ stepStatuses: finalStepStatuses });

        const errorMsg = stepResult.error || 'Step execution failed';
        eventBus.emit('STEP_FAILED', {
          stepIndex: i,
          error: errorMsg
        });

        throw new Error(errorMsg);
      }

      // Update current page context
      try {
        const tab = await chrome.tabs.get(tabId);
        store.updateState({
          pageUrl: tab.url || '',
          pageTitle: tab.title || ''
        });
      } catch (e) {
        // Tab might be loading or briefly inaccessible
      }

      // Pause briefly between non-wait steps to let page layout settle
      if (step.type !== 'wait' && i < steps.length - 1) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, 1000);
          const onAbort = () => {
            clearTimeout(timeout);
            reject(new DOMException('Execution cancelled by user', 'AbortError'));
          };
          signal.addEventListener('abort', onAbort);
        });
      }
    }

    // 3. Complete run successfully
    store.updateState({
      status: 'success',
      finishedAt: new Date().toISOString()
    });

    eventBus.emit('RUN_FINISHED', {
      message: 'Action plan completed successfully.'
    });

    const historyItem = createHistoryItem(store.getState(), 'success');
    store.addHistoryItem(historyItem);
    eventBus.emit('RUN_RECORDED');

    // Extract and store successful memory pattern
    await extractAndStoreMemory(store.getState(), 'success');

  } catch (err: any) {
    const isAbort = err.name === 'AbortError' || signal.aborted;

    if (isAbort) {
      const finalStepStatuses = [...store.getState().stepStatuses];
      const curIndex = store.getState().currentStepIndex;
      if (curIndex !== null && finalStepStatuses[curIndex] === 'running') {
        finalStepStatuses[curIndex] = 'pending';
      }

      store.updateState({
        status: 'failed',
        stepStatuses: finalStepStatuses,
        finishedAt: new Date().toISOString()
      });

      eventBus.emit('RUN_ABORTED');

      const historyItem = createHistoryItem(store.getState(), 'aborted');
      store.addHistoryItem(historyItem);
      eventBus.emit('RUN_RECORDED');
    } else {
      store.updateState({
        status: 'failed',
        finishedAt: new Date().toISOString()
      });

      eventBus.emit('RUN_FINISHED', {
        error: err.message || String(err)
      });

      const historyItem = createHistoryItem(store.getState(), 'failed');
      store.addHistoryItem(historyItem);
      eventBus.emit('RUN_RECORDED');

      // Extract and store failure memory pattern
      await extractAndStoreMemory(store.getState(), 'failed');
    }
  }
}
