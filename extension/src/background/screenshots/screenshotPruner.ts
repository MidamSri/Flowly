import { clearCachedScreenshot } from './screenshotCache';

/**
 * Removes metadata from chrome.storage.local and cleans the transient in-memory cache
 * for all screenshots that do not belong to the keepRecentRunsCount most recent runs.
 */
export async function pruneScreenshots(history: any[], keepRecentRunsCount = 3): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return;
  }

  try {
    const recentRuns = history.slice(0, keepRecentRunsCount);
    
    // Collect active screenshot IDs to preserve
    const activeScreenshotIds = new Set<string>();
    for (const run of recentRuns) {
      if (run.screenshotIds) {
        for (const id of run.screenshotIds) {
          activeScreenshotIds.add(id);
        }
      }
    }

    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) {
        console.error('[Pruner] Error fetching storage items:', chrome.runtime.lastError);
        return;
      }

      const keysToRemove: string[] = [];
      for (const key of Object.keys(items)) {
        if (key.startsWith('flowly_screenshot_')) {
          const id = key.replace('flowly_screenshot_', '');
          if (!activeScreenshotIds.has(id)) {
            keysToRemove.push(key);
            // Also clean from in-memory cache
            clearCachedScreenshot(id);
          }
        }
      }

      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => {
          if (chrome.runtime.lastError) {
            console.error('[Pruner] Error removing keys:', chrome.runtime.lastError);
          } else {
            console.log(`[Pruner] Pruned ${keysToRemove.length} stale screenshot metadata files.`);
          }
        });
      }
    });
  } catch (err) {
    console.error('[Pruner] Pruning failed:', err);
  }
}
