import { RunnerState, LogMessage, ExecutionEvent, RunnerStatus, StepStatus, SemanticNode, ActionResult, HistoryItem } from '@flowly/shared';

let state: RunnerState = {
  goal: '',
  status: 'idle',
  plan: null,
  currentStepIndex: null,
  stepStatuses: [],
  stepResults: [],
  logs: [],
  pageTitle: '',
  pageUrl: '',
  startedAt: null,
  finishedAt: null,
  history: []
};

type StateListener = (state: RunnerState) => void;
type LogListener = (log: LogMessage) => void;
type EventListener = (event: ExecutionEvent) => void;

const stateListeners = new Set<StateListener>();
const logListeners = new Set<LogListener>();
const eventListeners = new Set<EventListener>();

export function getState(): RunnerState {
  return state;
}

export function updateState(partial: Partial<RunnerState>): void {
  state = { ...state, ...partial };
  stateListeners.forEach(listener => listener(state));
}

export function addLog(level: 'info' | 'warn' | 'error', message: string): LogMessage {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const log: LogMessage = { timestamp, level, message };
  state.logs = [...state.logs, log];
  logListeners.forEach(listener => listener(log));
  return log;
}

export function emitExecutionEvent(event: ExecutionEvent): void {
  eventListeners.forEach(listener => listener(event));
}

export function resetState(): void {
  state = {
    ...state,
    goal: '',
    status: 'idle',
    plan: null,
    currentStepIndex: null,
    stepStatuses: [],
    stepResults: [],
    logs: [],
    pageTitle: '',
    pageUrl: '',
    startedAt: null,
    finishedAt: null
  };
  stateListeners.forEach(listener => listener(state));
}

export function subscribeToState(listener: StateListener) {
  stateListeners.add(listener);
  // Send current state immediately on subscribe
  listener(state);
  return () => {
    stateListeners.delete(listener);
  };
}

export function subscribeToLog(listener: LogListener) {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

export function subscribeToEvent(listener: EventListener) {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

let lastParsedNodes: SemanticNode[] = [];

export function setLastParsedNodes(nodes: SemanticNode[]): void {
  lastParsedNodes = nodes;
}

export function getLastParsedNodes(): SemanticNode[] {
  return lastParsedNodes;
}

export function addStepResult(result: ActionResult): void {
  state.stepResults = [...(state.stepResults || []), result];
  stateListeners.forEach(listener => listener(state));
}

export function addHistoryItem(item: HistoryItem): void {
  const updatedHistory = [item, ...(state.history || [])].slice(0, 50);
  state.history = updatedHistory;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ flowly_history: updatedHistory }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving history to chrome.storage.local:', chrome.runtime.lastError);
      }
    });
  }

  stateListeners.forEach(listener => listener(state));
}

export function getHistory(): HistoryItem[] {
  return state.history || [];
}

export function clearHistory(): void {
  state.history = [];

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ flowly_history: [] }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error clearing history in chrome.storage.local:', chrome.runtime.lastError);
      }
    });
  }

  stateListeners.forEach(listener => listener(state));
}

// Load initial history from chrome.storage.local
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['flowly_history'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading history from chrome.storage.local:', chrome.runtime.lastError);
      return;
    }
    if (result && result.flowly_history) {
      state.history = result.flowly_history;
      stateListeners.forEach(listener => listener(state));
    }
  });
}

