export type SemanticNodeType = 'button' | 'link' | 'textbox' | 'checkbox' | 'dropdown' | 'container' | 'text';

export interface SemanticNode {
  id: string;             // Ephemeral ID generated per page load (e.g., "flowly-node-24")
  type: SemanticNodeType;
  text: string;           // Visible text content
  placeholder?: string;   // Input placeholder
  ariaLabel?: string;     // Accessibility labels
  disabled: boolean;      // Interactive status
  checked?: boolean;      // Checkboxes/radios
  expanded?: boolean;     // Expanded status (e.g. aria-expanded)
  selected?: boolean;     // Selected status (e.g. aria-selected, tab selected)
  parentId?: string;      // ID of logical container (e.g., card)
  selector?: string;      // Optional/debug selector
  rect?: {                // Viewport position/dimension
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PageState {
  url: string;
  title: string;
  elements: SemanticNode[];
  viewport?: {
    width: number;
    height: number;
    scrollY: number;
  };
}

export type ActionType = 'click' | 'type' | 'scroll' | 'wait' | 'navigate';

export interface Action {
  type: ActionType;
  elementId?: string;     // Target element ID
  value?: string;         // Input text, URL, scroll direction (up/down)
  waitMs?: number;        // Wait duration (for type='wait')
  reasoning: string;      // LLM's reason for this step
}

export interface ActionPlan {
  goal: string;
  steps: Action[];
  reasoning: string;
  confidence: number;       // Score from 0.0 to 1.0
  isGoalAchieved: boolean;  // True if goal is met
}

export interface StepHistoryItem {
  action: string;           // Description of action run
  status: 'success' | 'failed';
  error?: string;
}

export interface ReplayTimelineItem {
  stepIndex: number;
  type: string;             // Action step type ('click' | 'type' | 'scroll' | 'wait' | 'navigate')
  elementId?: string;
  value?: string;
  reasoning: string;
  executed: boolean;
  success?: boolean;
  durationMs?: number;
  error?: string;
  nodeRole?: string;
  nodeText?: string;
  beforeUrl?: string;
  afterUrl?: string;
  beforeTitle?: string;
  afterTitle?: string;
}

export interface HistoryItem {
  id: string;
  goal: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: 'success' | 'failed' | 'aborted';
  pageTitle?: string;
  pageUrl?: string;
  plan: ActionPlan;
  stepResults: ActionResult[];
  timeline: ReplayTimelineItem[];
}

export interface ViewportData {
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ActionResult {
  success: boolean;
  durationMs: number;
  beforeUrl?: string;
  afterUrl?: string;
  beforeTitle?: string;
  afterTitle?: string;
  beforeViewport?: ViewportData;
  afterViewport?: ViewportData;
  nodeId?: string;
  nodeRole?: string;
  nodeText?: string;
  error?: string;
}

export interface SuccessfulPattern {
  id: string;
  domain: string;
  goal: string;
  timestamp: string;
  actions: Action[];
}

export interface FailurePattern {
  id: string;
  domain: string;
  goal: string;
  failedStep: number;
  failedAction?: Action;
  error: string;
  timestamp: string;
}

export interface DomainMemory {
  version: 1;
  domain: string;
  successfulPatterns: SuccessfulPattern[];
  failures: FailurePattern[];
}

export interface PlanRequest {
  goal: string;
  url: string;
  elements: SemanticNode[];
  history: StepHistoryItem[];
  relevantMemories?: DomainMemory | null;
}

export type RunnerStatus = 
  | 'idle'
  | 'parsing'
  | 'planning'
  | 'waiting_approval'
  | 'executing'
  | 'success'
  | 'failed';

export type StepStatus = 'pending' | 'running' | 'success' | 'failed';

export interface LogMessage {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type ExecutionEventType = 
  | 'RUN_STARTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'NAVIGATION_DETECTED'
  | 'RUN_FINISHED'
  | 'RUN_ABORTED'
  | 'RUN_RECORDED'
  | 'MEMORY_CREATED';

export interface ExecutionEvent {
  type: ExecutionEventType;
  timestamp: string;
  stepIndex?: number | null;
  message?: string;
  error?: string;
  beforeUrl?: string;
  afterUrl?: string;
  beforeTitle?: string;
  afterTitle?: string;
}

export interface RunnerState {
  goal: string;
  status: RunnerStatus;
  plan: ActionPlan | null;
  currentStepIndex: number | null;
  stepStatuses: StepStatus[];
  stepResults?: ActionResult[];
  logs: LogMessage[];
  pageTitle?: string;
  pageUrl?: string;
  startedAt?: string | null;  // ISO timestamp
  finishedAt?: string | null; // ISO timestamp
  history: HistoryItem[];
  memories: DomainMemory[];
}

// Sidebar <-> Background
export type SidebarRequest =
  | { type: 'GET_STATE' }
  | { type: 'GENERATE_PLAN'; goal: string }
  | { type: 'APPROVE_RUN' }
  | { type: 'CANCEL_RUN' }
  | { type: 'CLEAR_HISTORY' };

export type SidebarResponse =
  | { type: 'STATE_SYNC'; state: RunnerState }
  | { type: 'EXECUTION_EVENT'; event: ExecutionEvent }
  | { type: 'LOG_MESSAGE'; log: LogMessage };

// Background <-> Content Script (Message Passing)
export type ContentRequest =
  | { type: 'PARSE_PAGE_REQUEST' }
  | { type: 'EXECUTE_ACTION_REQUEST'; action: Action }
  | { type: 'VALIDATE_ELEMENT_REQUEST'; elementId: string }
  | { type: 'GET_VIEWPORT_REQUEST' };

export type ContentResponse =
  | { type: 'PARSE_PAGE_RESPONSE'; success: boolean; nodes: SemanticNode[]; url: string; title: string; error?: string }
  | { type: 'EXECUTE_ACTION_RESPONSE'; success: boolean; error?: string }
  | { type: 'VALIDATE_ELEMENT_RESPONSE'; success: boolean; exists: boolean; visible: boolean; enabled: boolean; error?: string }
  | { type: 'GET_VIEWPORT_RESPONSE'; success: boolean; viewport?: ViewportData; error?: string };

