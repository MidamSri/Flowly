import { Action, ContentRequest, ContentResponse, ExecutionEvent, SemanticNode } from '@flowly/shared';
import * as store from '../state/store';

/**
 * Helper to generate human-readable details for DOM elements in logs.
 */
function getElementDescriptor(node: SemanticNode): string {
  const name = node.text || node.ariaLabel || node.placeholder || '';
  const nameQuoted = name ? ` "${name}"` : '';
  return `${node.type}${nameQuoted} (${node.id})`;
}

/**
 * Runs the sequence of steps in the current action plan on the target tab.
 * Supports cancellation via AbortSignal.
 */
export async function executePlan(tabId: number, signal: AbortSignal): Promise<void> {
  const currentState = store.getState();
  const steps = currentState.plan?.steps || [];
  
  if (steps.length === 0) {
    store.addLog('warn', 'No steps to execute.');
    return;
  }

  // Update overall run state
  store.updateState({
    status: 'executing',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentStepIndex: 0,
    stepStatuses: steps.map(() => 'pending')
  });

  store.emitExecutionEvent({
    type: 'RUN_STARTED',
    timestamp: new Date().toISOString(),
    message: 'Starting execution of proposed action plan.'
  });

  store.addLog('info', `Starting action plan execution: ${steps.length} steps.`);

  try {
    for (let i = 0; i < steps.length; i++) {
      // 1. Check for abort signal before beginning step
      if (signal.aborted) {
        throw new DOMException('Execution cancelled by user', 'AbortError');
      }

      const step = steps[i];
      
      // Update store for active step
      const stepStatuses = [...store.getState().stepStatuses];
      stepStatuses[i] = 'running';
      store.updateState({
        currentStepIndex: i,
        stepStatuses
      });

      store.emitExecutionEvent({
        type: 'STEP_STARTED',
        stepIndex: i,
        timestamp: new Date().toISOString()
      });

      // Find node information for pretty logs if applicable
      const nodes = store.getLastParsedNodes();
      const node = step.elementId ? nodes.find(n => n.id === step.elementId) : undefined;
      const targetDesc = node ? getElementDescriptor(node) : step.elementId || 'viewport';

      let stepStartMessage = `Step ${i + 1}/${steps.length}: `;
      switch (step.type) {
        case 'click':
          stepStartMessage += `Clicking ${targetDesc}`;
          break;
        case 'type':
          stepStartMessage += `Typing "${step.value}" into ${targetDesc}`;
          break;
        case 'scroll':
          stepStartMessage += `Scrolling viewport ${step.value}`;
          break;
        case 'wait':
          stepStartMessage += `Waiting ${step.waitMs || 1000}ms`;
          break;
        case 'navigate':
          stepStartMessage += `Navigating to URL "${step.value}"`;
          break;
      }
      store.addLog('info', stepStartMessage);

      // 2. Dispatch execution request to Content Script
      const requestPayload: ContentRequest = {
        type: 'EXECUTE_ACTION_REQUEST',
        action: step
      };

      const result = await new Promise<ContentResponse>((resolve, reject) => {
        // Support timeout/abort during the message sending phase
        const onAbort = () => {
          reject(new DOMException('Execution cancelled by user', 'AbortError'));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort);

        chrome.tabs.sendMessage(tabId, requestPayload, (response: ContentResponse | undefined) => {
          signal.removeEventListener('abort', onAbort);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate with content script.'));
            return;
          }
          if (!response) {
            reject(new Error('Received empty response from content script.'));
            return;
          }
          resolve(response);
        });
      });

      if (!result.success) {
        throw new Error(result.error || 'Action failed in content script');
      }

      // Step completed successfully
      const finalStepStatuses = [...store.getState().stepStatuses];
      finalStepStatuses[i] = 'success';
      store.updateState({ stepStatuses: finalStepStatuses });

      store.emitExecutionEvent({
        type: 'STEP_COMPLETED',
        stepIndex: i,
        timestamp: new Date().toISOString()
      });

      // Update current page context logs
      try {
        const tab = await chrome.tabs.get(tabId);
        store.updateState({
          pageUrl: tab.url || '',
          pageTitle: tab.title || ''
        });
      } catch (e) {
        // Tab might be in navigation state or closed
      }

      // Sleep briefly after actions to let layouts settle (except wait, which does its own wait)
      if (step.type !== 'wait') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, 1500);
          const onAbort = () => {
            clearTimeout(timeout);
            reject(new DOMException('Execution cancelled by user', 'AbortError'));
          };
          signal.addEventListener('abort', onAbort);
        });
      }
    }

    // Full run succeeded
    store.updateState({
      status: 'success',
      finishedAt: new Date().toISOString()
    });

    store.emitExecutionEvent({
      type: 'RUN_FINISHED',
      timestamp: new Date().toISOString(),
      message: 'Action plan executed successfully.'
    });

    store.addLog('info', 'All proposed steps completed successfully!');

  } catch (err: any) {
    const isAbort = err.name === 'AbortError' || signal.aborted;

    if (isAbort) {
      // Mark current executing step as failed or pending
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

      store.emitExecutionEvent({
        type: 'RUN_ABORTED',
        timestamp: new Date().toISOString(),
        message: 'Execution aborted by the user.'
      });

      store.addLog('warn', 'Execution cancelled by user.');
    } else {
      // Step failed
      const curIndex = store.getState().currentStepIndex;
      const finalStepStatuses = [...store.getState().stepStatuses];
      if (curIndex !== null) {
        finalStepStatuses[curIndex] = 'failed';
      }

      store.updateState({
        status: 'failed',
        stepStatuses: finalStepStatuses,
        finishedAt: new Date().toISOString()
      });

      store.emitExecutionEvent({
        type: 'STEP_FAILED',
        stepIndex: curIndex ?? undefined,
        timestamp: new Date().toISOString(),
        error: err.message || String(err)
      });

      store.emitExecutionEvent({
        type: 'RUN_FINISHED',
        timestamp: new Date().toISOString(),
        message: `Execution failed: ${err.message || String(err)}`
      });

      store.addLog('error', `Execution failed at step ${(curIndex ?? 0) + 1}: ${err.message || String(err)}`);
    }
  }
}
