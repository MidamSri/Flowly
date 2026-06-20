const cache = new Map<string, string>();

/**
 * Stores a base64 image data URL in the transient memory cache.
 */
export function setCachedScreenshot(id: string, dataUrl: string): void {
  cache.set(id, dataUrl);
}

/**
 * Retrieves a base64 image data URL from the transient memory cache.
 */
export function getCachedScreenshot(id: string): string | null {
  return cache.get(id) || null;
}

/**
 * Removes a single screenshot from the memory cache.
 */
export function clearCachedScreenshot(id: string): void {
  cache.delete(id);
}

/**
 * Clears all cached screenshots from memory.
 */
export function clearAllCachedScreenshots(): void {
  cache.clear();
}
