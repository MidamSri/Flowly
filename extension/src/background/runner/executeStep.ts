import { Action, ActionResult, ContentRequest, ContentResponse, ViewportData } from '@flowly/shared';
import { beforeAction } from './validators/beforeAction';
import { afterAction } from './validators/afterAction';
import { eventBus } from './eventBus';
import { wait, waitForElement, waitForNavigation, waitForStability } from './waitConditions';
import * as store from '../state/store';

/**
 * Sends a message to fetch viewport coordinates from the content script.
 */
async function fetchViewportData(tabId: number): Promise<ViewportData | undefined> {
  return new Promise((resolve) => {
    const request: ContentRequest = { type: 'GET_VIEWPORT_REQUEST' };
    chrome.tabs.sendMessage(tabId, request, (response: ContentResponse | undefined) => {
      if (chrome.runtime.lastError || !response || response.type !== 'GET_VIEWPORT_RESPONSE') {
        resolve(undefined);
      } else {
        resolve(response.viewport);
      }
    });
  });
}

/**
 * Executes a single step against the target tab.
 * Performs validation, handles loading events, and returns detailed ActionResult telemetry.
 */
export async function executeStep(
  tabId: number,
  action: Action,
  stepIndex: number,
  signal: AbortSignal
): Promise<ActionResult> {
  const startTime = Date.now();

  // Find node descriptor from last parsed nodes for the ActionResult
  const nodes = store.getLastParsedNodes();
  const targetNode = action.elementId ? nodes.find((n) => n.id === action.elementId) : undefined;
  const nodeId = action.elementId;
  const nodeRole = targetNode?.type;
  const nodeText = targetNode?.text;

  // Gather initial page state (URL, Title, Viewport)
  let beforeUrl = '';
  let beforeTitle = '';
  let beforeViewport: ViewportData | undefined;

  try {
    const tab = await chrome.tabs.get(tabId);
    beforeUrl = tab.url || '';
    beforeTitle = tab.title || '';
    beforeViewport = await fetchViewportData(tabId);
  } catch (err) {
    // Ignore transient frame errors
  }

  try {
    if (signal.aborted) {
      throw new DOMException('Execution cancelled by user', 'AbortError');
    }

    // 1. Wait for element to exist/become visible if we're targeting one
    if (action.elementId) {
      // Allow up to 5 seconds for the element to appear/stabilize in the DOM
      await waitForElement(tabId, action.elementId, 5000).catch(() => {
        // Log a warning but let the validator below throw the actual execution failure
      });
    }

    if (signal.aborted) {
      throw new DOMException('Execution cancelled by user', 'AbortError');
    }

    // 2. Element validation checks before action
    await beforeAction(tabId, action);

    if (signal.aborted) {
      throw new DOMException('Execution cancelled by user', 'AbortError');
    }

    // 3. Execution of the action itself
    let actionResponse: ContentResponse | undefined;

    if (action.type === 'wait') {
      const waitMs = action.waitMs || 1000;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, waitMs);
        const onAbort = () => {
          clearTimeout(timeout);
          reject(new DOMException('Execution cancelled by user', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort);
      });
      actionResponse = { type: 'EXECUTE_ACTION_RESPONSE', success: true };
    } else if (action.type === 'navigate') {
      if (!action.value) {
        throw new Error('value (URL) is required for navigate action');
      }
      
      // Update tab URL directly
      await chrome.tabs.update(tabId, { url: action.value });
      
      // Wait for the new page load and layout stability
      await waitForStability(tabId, 15000);
      actionResponse = { type: 'EXECUTE_ACTION_RESPONSE', success: true };
    } else {
      // Dispatch click/type/scroll to content script
      actionResponse = await new Promise<ContentResponse>((resolve, reject) => {
        const onAbort = () => {
          reject(new DOMException('Execution cancelled by user', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort);

        const request: ContentRequest = {
          type: 'EXECUTE_ACTION_REQUEST',
          action
        };

        chrome.tabs.sendMessage(tabId, request, (res) => {
          signal.removeEventListener('abort', onAbort);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate with content script.'));
            return;
          }
          if (!res) {
            reject(new Error('Received empty response from content script.'));
            return;
          }
          resolve(res);
        });
      });

      if (actionResponse && !actionResponse.success) {
        throw new Error(actionResponse.error || 'Action failed in content script');
      }

      // Check if the action triggered page loading (standard page navigation)
      await wait(200); // Small pause for browser status to transition
      const currentTab = await chrome.tabs.get(tabId).catch(() => null);
      if (currentTab && currentTab.status === 'loading') {
        await waitForStability(tabId, 15000);
      }
    }

    if (signal.aborted) {
      throw new DOMException('Execution cancelled by user', 'AbortError');
    }

    // 4. Gather final page state (URL, Title, Viewport)
    let afterUrl = beforeUrl;
    let afterTitle = beforeTitle;
    let afterViewport: ViewportData | undefined;

    try {
      const tab = await chrome.tabs.get(tabId);
      afterUrl = tab.url || '';
      afterTitle = tab.title || '';
      afterViewport = await fetchViewportData(tabId);
    } catch (err) {
      // Ignore transition errors
    }

    // 5. Element validation checks after action
    await afterAction(tabId, action);

    // 6. Navigation detection
    if (beforeUrl !== afterUrl || beforeTitle !== afterTitle) {
      eventBus.emit('NAVIGATION_DETECTED', {
        beforeUrl,
        afterUrl,
        beforeTitle,
        afterTitle
      });
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      durationMs,
      beforeUrl,
      afterUrl,
      beforeTitle,
      afterTitle,
      beforeViewport,
      afterViewport,
      nodeId,
      nodeRole,
      nodeText
    };

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const isAbort = err.name === 'AbortError' || signal.aborted;

    return {
      success: false,
      durationMs,
      beforeUrl,
      nodeId,
      nodeRole,
      nodeText,
      error: isAbort ? 'Execution cancelled by user' : (err.message || String(err))
    };
  }
}
