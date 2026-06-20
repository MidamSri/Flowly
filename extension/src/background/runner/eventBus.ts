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
    }

    if (logMsg) {
      store.addLog(logLevel, logMsg);
    }
  }
};
