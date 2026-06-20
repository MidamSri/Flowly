import { handleSidebarConnection, registerActionHandlers } from './messaging/ports';
import * as store from './state/store';
import { requestActionPlan } from './planner/plannerClient';
import { executePlan } from './runner/runner';
import { ContentRequest, ContentResponse } from '@flowly/shared';
import { initMemoryStore } from './memory/memoryStore';
import { getRelevantMemories } from './memory/memoryRetriever';
import { getCachedScreenshot } from './screenshots/screenshotCache';
import { runAutonomousLoop } from './agent/autonomousLoop';

console.log('Flowly Background Service Worker Active.');

// Initialize memory store on startup
initMemoryStore();

// Listen for connections from Sidebar UI
chrome.runtime.onConnect.addListener(handleSidebarConnection);

let activeAbortController: AbortController | null = null;

// Register action handlers for sidebar messaging
registerActionHandlers({
  onGeneratePlan: async (goal: string) => {
    // Reset state and set initial goals
    store.resetState();
    store.updateState({
      status: 'parsing',
      goal,
      startedAt: new Date().toISOString()
    });
    store.addLog('info', `Received new goal: "${goal}"`);

    try {
      // Find active tab to parse
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('No active tab found. Please select a web page tab first.');
      }
      
      const tabId = tab.id;
      store.updateState({
        pageUrl: tab.url || '',
        pageTitle: tab.title || ''
      });

      store.addLog('info', 'Injecting and running perception parser on active tab...');

      // Send parsing request
      const requestPayload: ContentRequest = { type: 'PARSE_PAGE_REQUEST' };
      
      chrome.tabs.sendMessage(tabId, requestPayload, async (response: ContentResponse | undefined) => {
        if (chrome.runtime.lastError) {
          store.updateState({ status: 'failed' });
          store.addLog('error', `Content script messaging error: ${chrome.runtime.lastError.message}`);
          return;
        }

        if (!response || response.type !== 'PARSE_PAGE_RESPONSE') {
          store.updateState({ status: 'failed' });
          store.addLog('error', `Failed to parse page elements: ${response?.error || 'Invalid response type'}`);
          return;
        }

        if (!response.success) {
          store.updateState({ status: 'failed' });
          store.addLog('error', `Failed to parse page elements: ${response.error || 'Unknown error'}`);
          return;
        }

        store.setLastParsedNodes(response.nodes);
        store.updateState({
          status: 'planning',
          pageUrl: response.url,
          pageTitle: response.title
        });

        store.addLog('info', `Perception scraper found ${response.nodes.length} interactive and text elements.`);
        store.addLog('info', 'Querying local planner server (Fastify)...');

        try {
          const domain = new URL(response.url).hostname || 'unknown';
          const relevantMemories = getRelevantMemories(domain);
          if (relevantMemories && (relevantMemories.successfulPatterns.length > 0 || relevantMemories.failures.length > 0)) {
            store.addLog('info', `Retrieved relevant memories for domain ${domain} (${relevantMemories.successfulPatterns.length} success patterns, ${relevantMemories.failures.length} failures).`);
          }

          const plan = await requestActionPlan(goal, response.url, response.nodes, [], relevantMemories);
          
          store.updateState({
            status: 'waiting_approval',
            originalPlan: plan,
            currentPlan: plan,
            stepStatuses: plan.steps.map(() => 'pending'),
            currentStepIndex: null
          });

          store.addLog('info', `Action plan generated successfully. Planner confidence: ${(plan.confidence * 100).toFixed(0)}%`);
          store.addLog('info', `Strategic Reasoning: "${plan.reasoning}"`);
          
          if (plan.steps.length === 0) {
            store.addLog('warn', 'Planner returned empty step list. The goal might already be achieved.');
          } else {
            store.addLog('info', `Awaiting user approval to run ${plan.steps.length} sequential actions.`);
          }
        } catch (planErr: any) {
          store.updateState({ status: 'failed' });
          store.addLog('error', `Planner server request failed: ${planErr.message || String(planErr)}`);
        }
      });
      
    } catch (err: any) {
      store.updateState({ status: 'failed' });
      store.addLog('error', `Failed during perception parse phase: ${err.message || String(err)}`);
    }
  },

  onApproveRun: async () => {
    const state = store.getState();
    if (state.status !== 'waiting_approval' || !state.currentPlan) {
      store.addLog('warn', 'Execution approved, but runner state is not waiting_approval.');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('Active tab not found. Cannot proceed.');
      }

      const tabId = tab.id;
      
      // Clean up any stale active controller
      if (activeAbortController) {
        activeAbortController.abort();
      }

      activeAbortController = new AbortController();
      
      const mode = state.executionMode;
      if (mode === 'session') {
        runAutonomousLoop(tabId, state.goal, activeAbortController.signal).finally(() => {
          activeAbortController = null;
        });
      } else {
        executePlan(tabId, activeAbortController.signal).finally(() => {
          activeAbortController = null;
        });
      }

    } catch (err: any) {
      store.updateState({ status: 'failed' });
      store.addLog('error', `Failed to start execution: ${err.message || String(err)}`);
    }
  },

  onCancelRun: () => {
    const state = store.getState();
    store.addLog('info', 'Received cancel request from sidebar.');

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    } else {
      // If we're planning or waiting approval, just transition back to idle
      store.updateState({ status: 'failed' });
      store.addLog('warn', 'Execution cancelled during planning or approval stage.');
    }
  }
});

// Handle screenshot requests from Sidebar UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'GET_SCREENSHOT') {
    const dataUrl = getCachedScreenshot(message.id);
    sendResponse({ dataUrl });
  }
  return false;
});

