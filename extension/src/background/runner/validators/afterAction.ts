import { Action } from '@flowly/shared';

/**
 * Validates the page or element state after step execution completes.
 * Intentionally left as a hook for future phases.
 */
export async function afterAction(tabId: number, action: Action): Promise<void> {
  // Placeholder hook for post-action validation.
}
