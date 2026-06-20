import { buildAccessibilityTree } from './parser/accessibilityTree';
import { click, type, scroll, wait } from './executor/elementActions';
import { isVisible } from './parser/visibility';
import { ContentRequest, ContentResponse } from '@flowly/shared';

console.log('%c[Flowly] Perception Layer Content Script Loaded & Listening', 'color: #6366f1; font-weight: bold; font-size: 14px;');

// Run initial perception parse for developer visibility and test automation compatibility
try {
  const initialNodes = buildAccessibilityTree();
  console.log(`[Flowly] Bootstrapped perception layer. Scraped ${initialNodes.length} nodes on startup.`);
} catch (err) {
  console.error('[Flowly] Startup perception scrape failed:', err);
}

chrome.runtime.onMessage.addListener((request: ContentRequest, sender, sendResponse) => {
  console.log('[Flowly Content] Received request:', request);

  if (request.type === 'PARSE_PAGE_REQUEST') {
    try {
      const nodes = buildAccessibilityTree();
      const response: ContentResponse = {
        type: 'PARSE_PAGE_RESPONSE',
        success: true,
        nodes,
        url: window.location.href,
        title: document.title
      };
      sendResponse(response);
    } catch (error: any) {
      const response: ContentResponse = {
        type: 'PARSE_PAGE_RESPONSE',
        success: false,
        nodes: [],
        url: window.location.href,
        title: document.title,
        error: error.message || String(error)
      };
      sendResponse(response);
    }
    return true; // Keep message channel open for async response
  }

  if (request.type === 'EXECUTE_ACTION_REQUEST') {
    const action = request.action;
    (async () => {
      try {
        switch (action.type) {
          case 'click':
            if (!action.elementId) {
              throw new Error('elementId is required for click action');
            }
            await click(action.elementId);
            break;
          case 'type':
            if (!action.elementId) {
              throw new Error('elementId is required for type action');
            }
            await type(action.elementId, action.value || '', action);
            break;
          case 'scroll':
            const dir = action.value === 'up' ? 'up' : 'down';
            await scroll(dir);
            break;
          case 'wait':
            await wait(action.waitMs || 1000);
            break;
          case 'navigate':
            if (!action.value) {
              throw new Error('value (URL) is required for navigate action');
            }
            window.location.href = action.value;
            break;
          default:
            throw new Error(`Unsupported action type: ${(action as any).type}`);
        }
        
        const response: ContentResponse = {
          type: 'EXECUTE_ACTION_RESPONSE',
          success: true
        };
        sendResponse(response);
      } catch (error: any) {
        console.error('[Flowly Content] Action execution failed:', error);
        const response: ContentResponse = {
          type: 'EXECUTE_ACTION_RESPONSE',
          success: false,
          error: error.message || String(error)
        };
        sendResponse(response);
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (request.type === 'VALIDATE_ELEMENT_REQUEST') {
    try {
      const el = document.querySelector(`[data-flowly-id="${request.elementId}"]`) as HTMLElement | null;
      if (!el) {
        sendResponse({
          type: 'VALIDATE_ELEMENT_RESPONSE',
          success: true,
          exists: false,
          visible: false,
          enabled: false
        });
      } else {
        const visible = isVisible(el);
        const isDisabled = el.hasAttribute('disabled') || 
                           el.getAttribute('aria-disabled') === 'true' || 
                           (el as any).disabled === true;
        const enabled = !isDisabled;

        sendResponse({
          type: 'VALIDATE_ELEMENT_RESPONSE',
          success: true,
          exists: true,
          visible,
          enabled
        });
      }
    } catch (error: any) {
      sendResponse({
        type: 'VALIDATE_ELEMENT_RESPONSE',
        success: false,
        exists: false,
        visible: false,
        enabled: false,
        error: error.message || String(error)
      });
    }
    return true;
  }

  if (request.type === 'GET_VIEWPORT_REQUEST') {
    try {
      sendResponse({
        type: 'GET_VIEWPORT_RESPONSE',
        success: true,
        viewport: {
          scrollX: window.scrollX || window.pageXOffset || 0,
          scrollY: window.scrollY || window.pageYOffset || 0,
          viewportWidth: window.innerWidth || document.documentElement.clientWidth || 0,
          viewportHeight: window.innerHeight || document.documentElement.clientHeight || 0
        }
      });
    } catch (error: any) {
      sendResponse({
        type: 'GET_VIEWPORT_RESPONSE',
        success: false,
        error: error.message || String(error)
      });
    }
    return true;
  }
});
