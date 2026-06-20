import { ScreenshotMetadata, ViewportData } from '@flowly/shared';
import { setCachedScreenshot } from './screenshotCache';

// Helper to fetch viewport data from content script
async function fetchViewportData(tabId: number): Promise<ViewportData | undefined> {
  return new Promise((resolve) => {
    const request = { type: 'GET_VIEWPORT_REQUEST' };
    chrome.tabs.sendMessage(tabId, request, (response) => {
      if (chrome.runtime.lastError || !response || response.type !== 'GET_VIEWPORT_RESPONSE') {
        resolve(undefined);
      } else {
        resolve(response.viewport);
      }
    });
  });
}

/**
 * Captures a screenshot of the active tab, stores the image data in the transient cache,
 * persists the metadata in chrome.storage.local, and returns the metadata.
 */
export async function captureScreenshot(
  tabId: number,
  type: 'run_start' | 'step' | 'run_end',
  stepIndex?: number
): Promise<ScreenshotMetadata | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;
    const url = tab.url || '';
    const pageTitle = tab.title || '';

    // Capture visible tab as Data URL (base64 PNG)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!res) {
          reject(new Error('Failed to capture visible tab'));
        } else {
          resolve(res);
        }
      });
    });

    // Fetch viewport positions
    const viewport = await fetchViewportData(tabId);
    const scrollX = viewport?.scrollX ?? 0;
    const scrollY = viewport?.scrollY ?? 0;
    const viewportWidth = viewport?.viewportWidth ?? 0;
    const viewportHeight = viewport?.viewportHeight ?? 0;

    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `screenshot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const filepath = `flowly_screenshot_${id}`;

    // Store the metadata in chrome.storage.local (lightweight metadata only)
    const metadata: ScreenshotMetadata = {
      id,
      version: 1,
      timestamp: new Date().toISOString(),
      type,
      stepIndex,
      actionIndex: stepIndex,
      url,
      pageTitle,
      scrollX,
      scrollY,
      viewportWidth,
      viewportHeight,
      filepath
    };

    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [filepath]: metadata }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Store the image data URL in the transient cache
    setCachedScreenshot(id, dataUrl);

    return metadata;
  } catch (err) {
    console.error('Failed to capture or store screenshot:', err);
    return null;
  }
}
