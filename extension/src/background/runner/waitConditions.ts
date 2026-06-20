import { ContentRequest, ContentResponse } from '@flowly/shared';

/**
 * Basic promise-based wait utility.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls the content script to check if the target element exists, is visible, and is enabled.
 */
export async function waitForElement(
  tabId: number,
  elementId: string,
  timeoutMs = 10000,
  pollIntervalMs = 500
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await new Promise<ContentResponse | null>((resolve) => {
        const req: ContentRequest = { type: 'VALIDATE_ELEMENT_REQUEST', elementId };
        chrome.tabs.sendMessage(tabId, req, (res) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(res || null);
          }
        });
      });

      if (response && response.type === 'VALIDATE_ELEMENT_RESPONSE') {
        if (response.exists && response.visible && response.enabled) {
          return; // Element exists and is ready
        }
      }
    } catch (err) {
      // Catch frame/tab communication errors during load and retry
    }

    await wait(pollIntervalMs);
  }

  throw new Error(`Timeout after ${timeoutMs}ms waiting for element "${elementId}" to exist, be visible, and be enabled.`);
}

/**
 * Waits for a navigation event (i.e. tab loading status to become 'complete').
 */
export function waitForNavigation(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let completed = false;

    const cleanup = () => {
      completed = true;
      chrome.tabs.onUpdated.removeListener(listener);
    };

    const timeout = setTimeout(() => {
      if (completed) return;
      cleanup();
      reject(new Error(`Timeout after ${timeoutMs}ms waiting for navigation load to complete.`));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Initial check in case navigation is already complete
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      if (tab.status === 'complete' && !completed) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    });
  });
}

/**
 * Waits for the page title to contain/match a pattern.
 */
export async function waitForTitle(
  tabId: number,
  titlePattern: string | RegExp,
  timeoutMs = 10000,
  pollIntervalMs = 500
): Promise<void> {
  const startTime = Date.now();
  const matches = (title: string): boolean => {
    if (titlePattern instanceof RegExp) {
      return titlePattern.test(title);
    }
    return title.includes(titlePattern);
  };

  while (Date.now() - startTime < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.title && matches(tab.title)) {
        return;
      }
    } catch (err) {
      // Ignore tab retrieval errors and retry
    }
    await wait(pollIntervalMs);
  }

  throw new Error(`Timeout after ${timeoutMs}ms waiting for title to match pattern.`);
}

/**
 * Waits for the page URL to contain/match a pattern.
 */
export async function waitForUrl(
  tabId: number,
  urlPattern: string | RegExp,
  timeoutMs = 10000,
  pollIntervalMs = 500
): Promise<void> {
  const startTime = Date.now();
  const matches = (url: string): boolean => {
    if (urlPattern instanceof RegExp) {
      return urlPattern.test(url);
    }
    return url.includes(urlPattern);
  };

  while (Date.now() - startTime < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && matches(tab.url)) {
        return;
      }
    } catch (err) {
      // Ignore errors
    }
    await wait(pollIntervalMs);
  }

  throw new Error(`Timeout after ${timeoutMs}ms waiting for URL to match pattern.`);
}

/**
 * Waits for the active tab to stabilize.
 * This waits for the tab status to be 'complete', the URL to not change for 500ms,
 * and a final quiet layout settle window of 500ms.
 */
export async function waitForStability(tabId: number, timeoutMs = 10000): Promise<void> {
  const startTime = Date.now();

  // 1. Wait for loading status to be 'complete'
  await waitForNavigation(tabId, timeoutMs);

  // 2. Poll URL to ensure it has settled (no changes for 500ms)
  let lastUrl = '';
  let lastUrlChangeTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const currentUrl = tab?.url || '';

      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        lastUrlChangeTime = Date.now();
      } else if (Date.now() - lastUrlChangeTime >= 500) {
        // Stable URL for 500ms
        break;
      }
    } catch (err) {
      // Ignore transient tab retrieval errors
    }
    await wait(100);
  }

  // 3. Final safety quiet settle window
  await wait(500);
}
