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
  boundingBox?: {         // Viewport-relative coordinates (Phase 7 Visual Grounding)
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
  isRecovery?: boolean;   // Flagged if this step is part of a recovery correction
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
  isRecovery?: boolean;
}

export interface RecoveryAttempt {
  attemptNumber: number;
  failedAction: Action;
  reason: string;
  recoverySteps: Action[];
  success: boolean;
  timestamp: string;
}

export interface FailureContext {
  failedStepIndex: number;
  failedAction: Action;
  error: string;
  currentUrl: string;
  currentTitle: string;
  viewport: ViewportData;
  screenshotId?: string;
  recentActions: Action[];
  nodes: SemanticNode[];
}

export interface RecoveryPlan {
  id: string;
  steps: Action[];
}

export interface RecoverRequest {
  goal: string;
  originalPlan: ActionPlan;
  failureContext: FailureContext;
  pageState: PageState;
  relevantMemories?: DomainMemory | null;
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
  originalPlan: ActionPlan;
  currentPlan: ActionPlan;
  stepResults: ActionResult[];
  timeline: ReplayTimelineItem[];
  screenshotIds?: string[];
  recoveryHistory?: RecoveryAttempt[];
  executionMode?: ExecutionMode;
  iterationHistory?: IterationSummary[];
}

export interface ScreenshotMetadata {
  id: string;
  version: 1;
  timestamp: string;
  type: 'run_start' | 'step' | 'run_end';
  stepIndex?: number;
  actionIndex?: number;
  url: string;
  pageTitle: string;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  filepath: string;
}

export interface VisualContext {
  screenshot: ScreenshotMetadata;
  viewport: ViewportData;
  nodes: SemanticNode[];
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
  | 'MEMORY_CREATED'
  | 'SCREENSHOT_CAPTURED'
  | 'RECOVERY_STARTED'
  | 'RECOVERY_SUCCEEDED'
  | 'RECOVERY_FAILED'
  | 'GOAL_COMPLETED'
  | 'GOAL_NOT_COMPLETED'
  | 'SESSION_STARTED'
  | 'SESSION_FINISHED'
  | 'ITERATION_STARTED'
  | 'ITERATION_FINISHED';


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
  screenshot?: ScreenshotMetadata;
}


export interface RunnerState {
  goal: string;
  status: RunnerStatus;
  originalPlan: ActionPlan | null;
  currentPlan: ActionPlan | null;
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
  recoveryHistory: RecoveryAttempt[];
  recoveryStatus?: 'idle' | 'started' | 'succeeded' | 'failed';
  recoveryReason?: string;
  executionMode: ExecutionMode;
  activeSession?: AgentSession | null;
}

// Sidebar <-> Background
export type SidebarRequest =
  | { type: 'GET_STATE' }
  | { type: 'GENERATE_PLAN'; goal: string }
  | { type: 'APPROVE_RUN' }
  | { type: 'CANCEL_RUN' }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_EXECUTION_MODE'; mode: ExecutionMode };

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

export type ExecutionMode = 'single_plan' | 'session';

export interface IterationSummary {
  iteration: number;
  plan: ActionPlan;
  stepResults: ActionResult[];
  recoveryAttempts: RecoveryAttempt[];
  screenshots: string[];
  completed: boolean;
}

export interface AgentSession {
  id: string;
  goal: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  startedAt: string;
  completedAt?: string;
  currentIteration: number;
  totalStepsExecuted: number;
  totalRecoveries: number;
  iterationHistory: IterationSummary[];
}

export interface CheckGoalRequest {
  goal: string;
  url: string;
  title: string;
  elements: SemanticNode[];
  relevantMemories?: DomainMemory | null;
  history?: StepHistoryItem[];
}

export interface GoalCompletionResult {
  completed: boolean;
  confidence: number;
  reason: string;
}

