import { Action, FailureContext, SemanticNode, ViewportData, ContentRequest, ContentResponse } from '@flowly/shared';
import { captureScreenshot } from '../screenshots/screenshotManager';

/**
 * Builds a limited subset of semantic nodes:
 * - If there is a target element, it slices 25 nodes before and 25 nodes after it.
 * - Otherwise, it filters to nodes currently in the viewport (up to 50 nodes).
 */
export function getNearestNodes(
  nodes: SemanticNode[],
  failedAction: Action,
  viewport: ViewportData
): SemanticNode[] {
  if (nodes.length <= 50) {
    return nodes;
  }

  const targetId = failedAction.elementId;
  if (targetId) {
    const targetIndex = nodes.findIndex((n) => n.id === targetId);
    if (targetIndex !== -1) {
      const start = Math.max(0, targetIndex - 25);
      const end = Math.min(nodes.length, targetIndex + 26);
      return nodes.slice(start, end);
    }
  }

  // Viewport nodes filter (rect y-coordinates are viewport-relative)
  const viewportNodes = nodes.filter((node) => {
    if (!node.rect) return true;
    const top = node.rect.y;
    const bottom = node.rect.y + node.rect.height;
    return top < viewport.viewportHeight && bottom > 0;
  });

  if (viewportNodes.length > 0) {
    return viewportNodes.slice(0, 50);
  }

  return nodes.slice(0, 50);
}

/**
 * Constructs the FailureContext package when a step fails.
 */
export async function buildFailureContext(
  tabId: number,
  failedStepIndex: number,
  failedAction: Action,
  error: string,
  allSteps: Action[]
): Promise<FailureContext> {
  // 1. Fetch current page elements, URL, Title
  const pageData = await new Promise<{ nodes: SemanticNode[]; url: string; title: string }>((resolve) => {
    const request: ContentRequest = { type: 'PARSE_PAGE_REQUEST' };
    chrome.tabs.sendMessage(tabId, request, (response: ContentResponse | undefined) => {
      if (chrome.runtime.lastError || !response || response.type !== 'PARSE_PAGE_RESPONSE' || !response.success) {
        chrome.tabs.get(tabId).then((tab) => {
          resolve({
            nodes: [],
            url: tab.url || '',
            title: tab.title || ''
          });
        }).catch(() => {
          resolve({ nodes: [], url: '', title: '' });
        });
      } else {
        resolve({
          nodes: response.nodes,
          url: response.url,
          title: response.title
        });
      }
    });
  });

  // 2. Fetch viewport data
  const viewport: ViewportData = await new Promise((resolve) => {
    const request: ContentRequest = { type: 'GET_VIEWPORT_REQUEST' };
    chrome.tabs.sendMessage(tabId, request, (response: ContentResponse | undefined) => {
      if (chrome.runtime.lastError || !response || response.type !== 'GET_VIEWPORT_RESPONSE' || !response.viewport) {
        resolve({ scrollX: 0, scrollY: 0, viewportWidth: 1280, viewportHeight: 800 });
      } else {
        resolve(response.viewport);
      }
    });
  });

  // 3. Capture failure screenshot
  let screenshotId: string | undefined;
  try {
    const sc = await captureScreenshot(tabId, 'step', failedStepIndex);
    if (sc) {
      screenshotId = sc.id;
    }
  } catch (err) {
    console.error('Failed to capture failure screenshot:', err);
  }

  // Get up to 5 steps executed immediately before the failure
  const recentActions = allSteps.slice(Math.max(0, failedStepIndex - 5), failedStepIndex);

  // Filter semantic nodes to avoid prompt explosion
  const limitedNodes = getNearestNodes(pageData.nodes, failedAction, viewport);

  return {
    failedStepIndex,
    failedAction,
    error,
    currentUrl: pageData.url,
    currentTitle: pageData.title,
    viewport,
    screenshotId,
    recentActions,
    nodes: limitedNodes
  };
}
