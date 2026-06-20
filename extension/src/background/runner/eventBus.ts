import { ExecutionEvent, ExecutionEventType } from '@flowly/shared';
import * as store from '../state/store';

export const eventBus = {
  emit(type: ExecutionEventType, payload: Omit<ExecutionEvent, 'type' | 'timestamp'> = {}): void {
    const timestamp = new Date().toISOString();
    const event: ExecutionEvent = {
      type,
      timestamp,
      ...payload
    };
    
    // Broadcast event to active sidebar listeners
    store.emitExecutionEvent(event);

    // Format readable logs for the sidebar console
    let logMsg = '';
    let logLevel: 'info' | 'warn' | 'error' = 'info';

    switch (type) {
      case 'RUN_STARTED':
        logMsg = `Runner started: ${payload.message || 'Executing plan'}`;
        break;
      case 'STEP_STARTED':
        logMsg = `Step ${payload.stepIndex !== undefined && payload.stepIndex !== null ? payload.stepIndex + 1 : ''} started.`;
        break;
      case 'STEP_COMPLETED':
        logMsg = `Step ${payload.stepIndex !== undefined && payload.stepIndex !== null ? payload.stepIndex + 1 : ''} completed.`;
        break;
      case 'STEP_FAILED':
        logMsg = `Step ${payload.stepIndex !== undefined && payload.stepIndex !== null ? payload.stepIndex + 1 : ''} failed: ${payload.error}`;
        logLevel = 'error';
        break;
      case 'NAVIGATION_DETECTED':
        logMsg = `Navigation detected:\n${payload.beforeUrl}\n→\n${payload.afterUrl}`;
        break;
      case 'RUN_FINISHED':
        if (payload.error) {
          logMsg = `Execution finished with error: ${payload.error}`;
          logLevel = 'error';
        } else {
          logMsg = `Execution finished: ${payload.message || 'Success'}`;
        }
        break;
      case 'RUN_ABORTED':
        logMsg = `Execution aborted by user.`;
        logLevel = 'warn';
        break;
      case 'RUN_RECORDED':
        logMsg = `Run recorded in execution history.`;
        break;
      case 'MEMORY_CREATED':
        logMsg = `Memory created: ${payload.message || 'Stored experience'}`;
        break;
      case 'SCREENSHOT_CAPTURED':
        logMsg = `Screenshot captured for ${payload.stepIndex !== undefined && payload.stepIndex !== null ? `step ${payload.stepIndex + 1}` : 'run start/end'}.`;
        break;
      case 'RECOVERY_STARTED':
        logMsg = `⚠ Recovery started: ${payload.message || 'Requesting corrective actions'}`;
        logLevel = 'warn';
        break;
      case 'RECOVERY_SUCCEEDED':
        logMsg = `✓ Recovery succeeded: ${payload.message || 'Plan fragment complete'}`;
        break;
      case 'RECOVERY_FAILED':
        logMsg = `✗ Recovery failed: ${payload.error || payload.message || 'Unknown error'}`;
        logLevel = 'error';
        break;
      case 'GOAL_COMPLETED':
        logMsg = `✓ Goal Completed: ${payload.message}`;
        logLevel = 'info';
        break;
      case 'GOAL_NOT_COMPLETED':
        logMsg = `⚠ Goal Not Completed: ${payload.message}`;
        logLevel = 'warn';
        break;
      case 'SESSION_STARTED':
        logMsg = `🚀 Session Started: ${payload.message}`;
        logLevel = 'info';
        break;
      case 'SESSION_FINISHED':
        logMsg = `🏁 Session Finished: ${payload.message}`;
        logLevel = 'info';
        break;
      case 'ITERATION_STARTED':
        logMsg = `🔄 Iteration Started: ${payload.message}`;
        logLevel = 'info';
        break;
      case 'ITERATION_FINISHED':
        logMsg = `🔄 Iteration Finished: ${payload.message}`;
        logLevel = 'info';
        break;
    }

    if (logMsg) {
      store.addLog(logLevel, logMsg);
    }
  }
};
