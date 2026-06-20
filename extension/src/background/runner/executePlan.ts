import { executeStep } from './executeStep';
import { eventBus } from './eventBus';
import * as store from '../state/store';
import { createHistoryItem } from '../timeline/historyManager';
import { extractAndStoreMemory } from '../memory/memoryExtractor';
import { captureScreenshot } from '../screenshots/screenshotManager';
import { pruneScreenshots } from '../screenshots/screenshotPruner';
import { buildFailureContext } from '../recovery/failureContextBuilder';
import { requestRecoveryPlan } from '../recovery/recoveryPlanner';
import { composeExecutionPlan } from '../recovery/executionComposer';
import { getRelevantMemories } from '../memory/memoryRetriever';
import { StepStatus } from '@flowly/shared';
import { incrementStepsExecuted, incrementRecoveries } from '../agent/sessionManager';

/**
 * Runs the sequence of steps in the action plan.
 * Handles state updates, telemetry accumulation, failure recovery, and abort requests.
 */
export async function executePlan(tabId: number, signal: AbortSignal): Promise<string[]> {
  const currentState = store.getState();
  const steps = currentState.currentPlan?.steps || [];

  if (steps.length === 0) {
    store.addLog('warn', 'No steps to execute in current action plan.');
    return [];
  }

  const screenshotIds: string[] = [];

  // 1. Initialize run states
  store.updateState({
    status: 'executing',
    startedAt: store.getState().activeSession ? (store.getState().startedAt || new Date().toISOString()) : new Date().toISOString(),
    finishedAt: null,
    currentStepIndex: 0,
    stepStatuses: steps.map(() => 'pending'),
    stepResults: [],
    recoveryHistory: [],
    recoveryStatus: 'idle',
    recoveryReason: ''
  });

  eventBus.emit('RUN_STARTED', {
    message: `Starting execution of proposed action plan (${steps.length} steps).`
  });

  // Capture run start screenshot
  try {
    const sc = await captureScreenshot(tabId, 'run_start');
    if (sc) {
      screenshotIds.push(sc.id);
      eventBus.emit('SCREENSHOT_CAPTURED', { screenshot: sc });
    }
  } catch (err) {
    console.error('Failed to capture initial screenshot:', err);
  }

  try {
    // 2. Loop through and execute steps sequentially
    let i = 0;
    while (true) {
      const stateObj = store.getState();
      const currentSteps = stateObj.currentPlan?.steps || [];
      if (i >= currentSteps.length) {
        break;
      }

      if (signal.aborted) {
        throw new DOMException('Execution cancelled by user', 'AbortError');
      }

      const step = currentSteps[i];

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

      if (store.getState().activeSession) {
        incrementStepsExecuted();
      }

      const finalStepStatuses = [...store.getState().stepStatuses];

      if (stepResult.success) {
        finalStepStatuses[i] = 'success';
        store.updateState({ stepStatuses: finalStepStatuses });
        eventBus.emit('STEP_COMPLETED', { stepIndex: i });

        // Capture step screenshot
        try {
          const sc = await captureScreenshot(tabId, 'step', i);
          if (sc) {
            screenshotIds.push(sc.id);
            eventBus.emit('SCREENSHOT_CAPTURED', { stepIndex: i, screenshot: sc });
          }
        } catch (err) {
          console.error(`Failed to capture screenshot for step ${i}:`, err);
        }

        // If this was a recovery step, and next step is not recovery, mark recovery as succeeded
        const nextStep = currentSteps[i + 1];
        if (step.isRecovery && (!nextStep || !nextStep.isRecovery)) {
          const recoveryHistory = [...store.getState().recoveryHistory];
          if (recoveryHistory.length > 0) {
            recoveryHistory[recoveryHistory.length - 1].success = true;
          }
          store.updateState({
            recoveryStatus: 'succeeded',
            recoveryHistory
          });

          eventBus.emit('RECOVERY_SUCCEEDED', {
            message: `Recovery plan fragment completed successfully. Resuming plan.`
          });
        }

        i++;
      } else {
        // Step failed!
        finalStepStatuses[i] = 'failed';
        store.updateState({ stepStatuses: finalStepStatuses });

        const errorMsg = stepResult.error || 'Step execution failed';
        eventBus.emit('STEP_FAILED', {
          stepIndex: i,
          error: errorMsg
        });

        // Recovery checks
        const recoveryHistory = store.getState().recoveryHistory || [];
        const activeSession = store.getState().activeSession;
        const canAttemptRecovery = 
          !step.isRecovery && 
          (activeSession ? activeSession.totalRecoveries < 2 : recoveryHistory.length < 2);

        if (canAttemptRecovery) {
          const attemptNumber = activeSession
            ? activeSession.totalRecoveries + 1
            : recoveryHistory.length + 1;
          store.addLog('warn', `Step ${i + 1} failed. Starting recovery attempt ${attemptNumber}/2...`);

          if (activeSession) {
            incrementRecoveries();
          }

          store.updateState({
            recoveryStatus: 'started',
            recoveryReason: errorMsg
          });

          eventBus.emit('RECOVERY_STARTED', {
            stepIndex: i,
            error: errorMsg,
            message: `Step ${i + 1} failed: ${errorMsg}. Requesting recovery plan (attempt ${attemptNumber}/2)...`
          });

          try {
            // 1. Build FailureContext
            const failureContext = await buildFailureContext(tabId, i, step, errorMsg, currentSteps);

            // 2. Fetch relevant memories for domain
            const domain = new URL(failureContext.currentUrl).hostname || 'unknown';
            const relevantMemories = getRelevantMemories(domain);

            // 3. Request recovery plan
            const pageState = {
              url: failureContext.currentUrl,
              title: failureContext.currentTitle,
              elements: failureContext.nodes,
              viewport: {
                width: failureContext.viewport.viewportWidth,
                height: failureContext.viewport.viewportHeight,
                scrollY: failureContext.viewport.scrollY
              }
            };

            const recoveryPlan = await requestRecoveryPlan(
              stateObj.goal,
              stateObj.originalPlan!,
              failureContext,
              pageState,
              relevantMemories
            );

            store.addLog('info', `Recovery plan received with ID: ${recoveryPlan.id} containing ${recoveryPlan.steps.length} steps.`);
            
            recoveryPlan.steps.forEach((s, idx) => {
              store.addLog('info', `Recovery Step ${idx + 1}: ${s.type} (Reasoning: ${s.reasoning})`);
            });

            // 4. Compose new current plan
            const composedPlan = composeExecutionPlan(stateObj.currentPlan!, i, recoveryPlan.steps);

            // 5. Update state
            const newStepStatuses = [
              ...finalStepStatuses.slice(0, i),
              ...recoveryPlan.steps.map(() => 'pending' as StepStatus),
              ...finalStepStatuses.slice(i + 1)
            ];

            const newStepResults = (store.getState().stepResults || []).slice(0, i);

            // Add attempt to recovery history
            const newAttempt = {
              attemptNumber,
              failedAction: step,
              reason: errorMsg,
              recoverySteps: recoveryPlan.steps,
              success: false,
              timestamp: new Date().toISOString()
            };

            store.updateState({
              currentPlan: composedPlan,
              stepStatuses: newStepStatuses,
              stepResults: newStepResults,
              recoveryHistory: [...recoveryHistory, newAttempt]
            });

            // Do not increment i, executeComposer maps the next recovery step to index i
            continue;
          } catch (recoveryErr: any) {
            const recErrMsg = recoveryErr.message || String(recoveryErr);
            store.addLog('error', `Recovery attempt failed during planning/composition: ${recErrMsg}`);

            // Record failed attempt in history anyway
            const newAttempt = {
              attemptNumber,
              failedAction: step,
              reason: errorMsg,
              recoverySteps: [],
              success: false,
              timestamp: new Date().toISOString()
            };

            store.updateState({
              recoveryStatus: 'failed',
              recoveryHistory: [...recoveryHistory, newAttempt]
            });

            eventBus.emit('RECOVERY_FAILED', {
              error: recErrMsg,
              message: `Recovery planning failed: ${recErrMsg}`
            });

            throw new Error(errorMsg);
          }
        } else {
          // Cannot recover
          const reason = step.isRecovery 
            ? 'Recursive recovery of recovery plan fragments is not allowed.' 
            : `Max recovery attempts (2) reached.`;

          store.addLog('error', `Cannot recover: ${reason}`);

          // If it was a recovery step, mark the last attempt as success = false
          const updatedRecoveryHistory = [...recoveryHistory];
          if (step.isRecovery && updatedRecoveryHistory.length > 0) {
            updatedRecoveryHistory[updatedRecoveryHistory.length - 1].success = false;
          }

          store.updateState({
            recoveryStatus: 'failed',
            recoveryHistory: updatedRecoveryHistory
          });

          eventBus.emit('RECOVERY_FAILED', {
            error: reason,
            message: `Recovery failed: ${reason}`
          });

          throw new Error(errorMsg);
        }
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
      const freshSteps = store.getState().currentPlan?.steps || [];
      if (step.type !== 'wait' && i < freshSteps.length) {
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

    const finalizeRun = async (status: 'success' | 'failed' | 'aborted') => {
      // Capture run end screenshot
      try {
        const sc = await captureScreenshot(tabId, 'run_end');
        if (sc) {
          screenshotIds.push(sc.id);
          eventBus.emit('SCREENSHOT_CAPTURED', { screenshot: sc });
        }
      } catch (e) {
        console.error('Failed to capture final screenshot:', e);
      }

      const historyItem = createHistoryItem(store.getState(), status, screenshotIds);
      store.addHistoryItem(historyItem);
      eventBus.emit('RUN_RECORDED');

      // Prune old screenshots (keep 3 runs)
      pruneScreenshots(store.getHistory(), 3);
    };

    // 3. Complete run successfully
    store.updateState({
      status: 'success',
      finishedAt: new Date().toISOString()
    });

    eventBus.emit('RUN_FINISHED', {
      message: 'Action plan completed successfully.'
    });

    if (store.getState().activeSession) {
      return screenshotIds;
    }

    await finalizeRun('success');

    // Extract and store successful memory pattern
    await extractAndStoreMemory(store.getState(), 'success');
    return screenshotIds;

  } catch (err: any) {
    const isAbort = err.name === 'AbortError' || signal.aborted;

    const finalizeRun = async (status: 'success' | 'failed' | 'aborted') => {
      try {
        const sc = await captureScreenshot(tabId, 'run_end');
        if (sc) {
          screenshotIds.push(sc.id);
          eventBus.emit('SCREENSHOT_CAPTURED', { screenshot: sc });
        }
      } catch (e) {
        console.error('Failed to capture final screenshot:', e);
      }

      const historyItem = createHistoryItem(store.getState(), status, screenshotIds);
      store.addHistoryItem(historyItem);
      eventBus.emit('RUN_RECORDED');

      pruneScreenshots(store.getHistory(), 3);
    };

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

      if (store.getState().activeSession) {
        throw err;
      }

      await finalizeRun('aborted');
      return screenshotIds;
    } else {
      store.updateState({
        status: 'failed',
        finishedAt: new Date().toISOString()
      });

      eventBus.emit('RUN_FINISHED', {
        error: err.message || String(err)
      });

      if (store.getState().activeSession) {
        throw err;
      }

      await finalizeRun('failed');

      // Extract and store failure memory pattern
      await extractAndStoreMemory(store.getState(), 'failed');
      return screenshotIds;
    }
  }
}
