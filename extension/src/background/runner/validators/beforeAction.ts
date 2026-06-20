import { Action, ContentRequest, ContentResponse } from '@flowly/shared';

/**
 * Validates the target element state before execution.
 * Checks element existence, visibility, and enabled status.
 */
export async function beforeAction(tabId: number, action: Action): Promise<void> {
  if (!action.elementId) {
    return; // Non-element actions (scroll, wait, navigate) don't require element validation
  }

  const response = await new Promise<ContentResponse | null>((resolve) => {
    const request: ContentRequest = {
      type: 'VALIDATE_ELEMENT_REQUEST',
      elementId: action.elementId!
    };
    chrome.tabs.sendMessage(tabId, request, (res) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(res || null);
      }
    });
  });

  if (!response || response.type !== 'VALIDATE_ELEMENT_RESPONSE') {
    throw new Error(`Failed to validate element "${action.elementId}": content script did not respond.`);
  }

  if (!response.exists) {
    throw new Error(`Element with ID "${action.elementId}" does not exist in the current page DOM.`);
  }

  if (!response.visible) {
    throw new Error(`Element with ID "${action.elementId}" exists but is not visible.`);
  }

  if (!response.enabled) {
    throw new Error(`Element with ID "${action.elementId}" exists but is currently disabled.`);
  }
}
