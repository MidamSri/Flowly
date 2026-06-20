import * as store from '../state/store';
import { SidebarRequest, SidebarResponse } from '@flowly/shared';

const activeSidebarPorts = new Set<chrome.runtime.Port>();

/**
 * Sends a message to all connected sidebar UI ports.
 */
export function broadcast(msg: SidebarResponse): void {
  activeSidebarPorts.forEach((port) => {
    try {
      port.postMessage(msg);
    } catch (e) {
      // Ignore dead ports (onDisconnect will clean up)
    }
  });
}

// Automatically subscribe to store changes and broadcast them
store.subscribeToState((state) => {
  broadcast({ type: 'STATE_SYNC', state });
});

store.subscribeToLog((log) => {
  broadcast({ type: 'LOG_MESSAGE', log });
});

store.subscribeToEvent((event) => {
  broadcast({ type: 'EXECUTION_EVENT', event });
});

interface ActionHandlers {
  onGeneratePlan: (goal: string) => void;
  onApproveRun: () => void;
  onCancelRun: () => void;
}

let handlers: ActionHandlers | null = null;

/**
 * Registers orchestration callbacks triggered by Sidebar messages.
 */
export function registerActionHandlers(h: ActionHandlers): void {
  handlers = h;
}

/**
 * Handles incoming persistent connections from the Sidebar UI.
 */
export function handleSidebarConnection(port: chrome.runtime.Port): void {
  if (port.name !== 'flowly-sidebar') return;

  activeSidebarPorts.add(port);
  console.log('[Flowly Background] Sidebar UI connected.');

  // Immediately sync state to the newly opened panel
  try {
    port.postMessage({ type: 'STATE_SYNC', state: store.getState() } as SidebarResponse);
  } catch (e) {
    console.error('Failed to send initial state sync:', e);
  }

  port.onDisconnect.addListener(() => {
    activeSidebarPorts.delete(port);
    console.log('[Flowly Background] Sidebar UI disconnected.');
  });

  port.onMessage.addListener((message: SidebarRequest) => {
    console.log('[Flowly Background] Received command from sidebar:', message);
    if (!handlers) {
      console.warn('[Flowly Background] No action handlers registered.');
      return;
    }

    switch (message.type) {
      case 'GET_STATE':
        try {
          port.postMessage({ type: 'STATE_SYNC', state: store.getState() } as SidebarResponse);
        } catch (e) {
          // Port could be closing
        }
        break;
      case 'GENERATE_PLAN':
        handlers.onGeneratePlan(message.goal);
        break;
      case 'APPROVE_RUN':
        handlers.onApproveRun();
        break;
      case 'CANCEL_RUN':
        handlers.onCancelRun();
        break;
    }
  });
}
