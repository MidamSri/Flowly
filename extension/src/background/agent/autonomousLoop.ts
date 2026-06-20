import { MAX_SESSION_ITERATIONS } from './policies/maxIterations';
import { MAX_RECOVERIES } from './policies/maxRecoveries';
import { MAX_STEPS } from './policies/maxSteps';
import {
  createSession,
  incrementIteration,
  addIterationSummary,
  terminateSession,
  getActiveSession
} from './sessionManager';
import { checkGoalCompletion } from './completionDetector';
import { executePlan } from '../runner/executePlan';
import { eventBus } from '../runner/eventBus';
import * as store from '../state/store';
import { requestActionPlan } from '../planner/plannerClient';
import { getRelevantMemories } from '../memory/memoryRetriever';
import { createHistoryItem } from '../timeline/historyManager';
import { pruneScreenshots } from '../screenshots/screenshotPruner';
import { extractAndStoreMemory } from '../memory/memoryExtractor';
import { ActionPlan, ContentRequest, ContentResponse, StepHistoryItem, IterationSummary } from '@flowly/shared';

export async function runAutonomousLoop(tabId: number, goal: string, signal: AbortSignal): Promise<void> {
  const session = createSession(goal);
  eventBus.emit('SESSION_STARTED', { message: `Autonomous agent session started (ID: ${session.id}) for goal: "${goal}"` });

  let sessionOriginalPlan = store.getState().originalPlan;

  try {
    while (true) {
      const activeSession = getActiveSession();
      if (!activeSession) {
        break;
      }

      if (signal.aborted) {
        throw new DOMException('Execution cancelled by user', 'AbortError');
      }

      // Check bounds
      if (activeSession.currentIteration > MAX_SESSION_ITERATIONS) {
        store.addLog('error', `[Session] Bounded execution limit reached: max iterations (${MAX_SESSION_ITERATIONS}) exceeded.`);
        terminateSession('failed');
        break;
      }

      if (activeSession.totalStepsExecuted >= MAX_STEPS) {
        store.addLog('error', `[Session] Bounded execution limit reached: max steps (${MAX_STEPS}) exceeded.`);
        terminateSession('failed');
        break;
      }

      const currentIter = activeSession.currentIteration;
      eventBus.emit('ITERATION_STARTED', { message: `Starting iteration ${currentIter} of ${MAX_SESSION_ITERATIONS}` });

      let currentPlan: ActionPlan | null = null;

      if (currentIter === 1) {
        currentPlan = store.getState().currentPlan;
        if (!currentPlan) {
          throw new Error('Initial action plan was not found in store.');
        }
      } else {
        // Parse current page before generating new subplan
        store.updateState({ status: 'parsing' });
        store.addLog('info', `[Iteration ${currentIter}] Scanning active tab...`);

        const response = await new Promise<ContentResponse | undefined>((resolve, reject) => {
          const req: ContentRequest = { type: 'PARSE_PAGE_REQUEST' };
          chrome.tabs.sendMessage(tabId, req, (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(`DOM Scraper communication error: ${chrome.runtime.lastError.message}`));
            } else {
              resolve(res);
            }
          });
        });

        if (!response || response.type !== 'PARSE_PAGE_RESPONSE' || !response.success) {
          throw new Error(`Failed to scan page elements: ${response?.error || 'Unknown scanner error'}`);
        }

        store.setLastParsedNodes(response.nodes);
        store.updateState({
          status: 'planning',
          pageUrl: response.url,
          pageTitle: response.title
        });

        store.addLog('info', `[Iteration ${currentIter}] Scanned ${response.nodes.length} elements. Requesting next subplan...`);

        // Build history of steps executed in previous iterations
        const historyItems: StepHistoryItem[] = [];
        for (const summary of activeSession.iterationHistory) {
          summary.plan.steps.forEach((step) => {
            historyItems.push({
              action: `${step.type} ${step.elementId || ''} ${step.value || ''}`.trim(),
              status: 'success'
            });
          });
        }

        const domain = new URL(response.url).hostname || 'unknown';
        const memories = getRelevantMemories(domain);

        currentPlan = await requestActionPlan(goal, response.url, response.nodes, historyItems, memories);
        
        store.updateState({
          currentPlan,
          originalPlan: currentPlan,
          stepStatuses: currentPlan.steps.map(() => 'pending'),
          currentStepIndex: null,
          stepResults: [],
          recoveryHistory: [],
          recoveryStatus: 'idle',
          recoveryReason: ''
        });

        store.addLog('info', `[Iteration ${currentIter}] Next subplan received with confidence ${(currentPlan.confidence * 100).toFixed(0)}%.`);
      }

      // Execute plan segment
      const screenshotIds = await executePlan(tabId, signal);

      // Perform goal completion check
      store.updateState({ status: 'parsing' });
      store.addLog('info', `[Iteration ${currentIter}] Segment complete. Checking goal completion status...`);

      const parseRes = await new Promise<ContentResponse | undefined>((resolve, reject) => {
        const req: ContentRequest = { type: 'PARSE_PAGE_REQUEST' };
        chrome.tabs.sendMessage(tabId, req, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`DOM Scraper communication error: ${chrome.runtime.lastError.message}`));
          } else {
            resolve(res);
          }
        });
      });

      if (!parseRes || parseRes.type !== 'PARSE_PAGE_RESPONSE' || !parseRes.success) {
        throw new Error(`Failed to parse page elements for goal check: ${parseRes?.error || 'Unknown scanner error'}`);
      }

      store.setLastParsedNodes(parseRes.nodes);
      store.updateState({
        pageUrl: parseRes.url,
        pageTitle: parseRes.title
      });

      const historyItems: StepHistoryItem[] = [];
      for (const summary of getActiveSession()?.iterationHistory || []) {
        summary.plan.steps.forEach((step) => {
          historyItems.push({
            action: `${step.type} ${step.elementId || ''} ${step.value || ''}`.trim(),
            status: 'success'
          });
        });
      }
      currentPlan.steps.forEach((step) => {
        historyItems.push({
          action: `${step.type} ${step.elementId || ''} ${step.value || ''}`.trim(),
          status: 'success'
        });
      });

      const domain = new URL(parseRes.url).hostname || 'unknown';
      const memories = getRelevantMemories(domain);

      const completionResult = await checkGoalCompletion(
        goal,
        parseRes.url,
        parseRes.title,
        parseRes.nodes,
        memories,
        historyItems
      );

      // Record iteration summary
      const iterationState = store.getState();
      const iterationSummary: IterationSummary = {
        iteration: currentIter,
        plan: currentPlan,
        stepResults: iterationState.stepResults || [],
        recoveryAttempts: iterationState.recoveryHistory || [],
        screenshots: screenshotIds,
        completed: completionResult.completed
      };
      addIterationSummary(iterationSummary);

      eventBus.emit('ITERATION_FINISHED', {
        message: `Iteration ${currentIter} finished: completed = ${completionResult.completed} (Confidence: ${(completionResult.confidence * 100).toFixed(0)}%). Reason: "${completionResult.reason}"`
      });

      if (completionResult.completed) {
        eventBus.emit('GOAL_COMPLETED', { message: `Goal successfully completed! Reason: ${completionResult.reason}` });
        terminateSession('completed');
        break;
      } else {
        eventBus.emit('GOAL_NOT_COMPLETED', { message: `Goal not completed yet. Reason: ${completionResult.reason}` });
        incrementIteration();
      }
    }
  } catch (err: any) {
    const isAbort = err.name === 'AbortError' || signal.aborted;
    store.addLog('error', `Session loop encountered error: ${err.message || String(err)}`);

    if (isAbort) {
      terminateSession('aborted');
    } else {
      terminateSession('failed');
    }
  } finally {
    const finalSession = store.getState().activeSession;
    if (finalSession) {
      const status: 'success' | 'failed' | 'aborted' = 
        finalSession.status === 'completed' ? 'success' :
        finalSession.status === 'aborted' ? 'aborted' : 'failed';

      const originalPlan = sessionOriginalPlan || {
        goal,
        steps: [],
        reasoning: 'No plan was generated.',
        confidence: 0,
        isGoalAchieved: false
      };
      const currentPlan = store.getState().currentPlan || originalPlan;

      store.updateState({
        status: status === 'success' ? 'success' : 'failed',
        finishedAt: new Date().toISOString()
      });

      const allScreenshots: string[] = [];
      finalSession.iterationHistory.forEach(s => allScreenshots.push(...s.screenshots));

      const historyItem = createHistoryItem(store.getState(), status, allScreenshots);
      historyItem.originalPlan = originalPlan;
      historyItem.currentPlan = currentPlan;
      historyItem.executionMode = 'session';
      historyItem.iterationHistory = finalSession.iterationHistory;

      store.addHistoryItem(historyItem);
      eventBus.emit('RUN_RECORDED');

      eventBus.emit('SESSION_FINISHED', {
        message: `Autonomous session finished with status: ${finalSession.status.toUpperCase()}`
      });

      pruneScreenshots(store.getHistory(), 3);
      if (status !== 'aborted') {
        await extractAndStoreMemory(store.getState(), status);
      }
    }
  }
}
