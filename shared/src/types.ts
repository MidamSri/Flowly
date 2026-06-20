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

export interface HistoryItem {
  action: string;           // Description of action run
  status: 'success' | 'failed';
  error?: string;
}

export interface PlanRequest {
  goal: string;
  url: string;
  elements: SemanticNode[];
  history: HistoryItem[];
}
