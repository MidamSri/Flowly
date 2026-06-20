import { GoogleGenAI } from '@google/genai';
import { ActionPlan, PlanRequest, RecoverRequest, RecoveryPlan, CheckGoalRequest, GoalCompletionResult } from '@flowly/shared';
import { config } from '../config.js';
import { compressSemanticTree } from './parser.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const SYSTEM_INSTRUCTION = `You are Flowly, an intelligent AI browser agent navigating social media platforms.
Your goal is to execute the user's instructions on the current page.

### Strict Constraints:
1. Avoid assumptions. Rely ONLY on the semantic tree provided.
2. Select actions strictly from the supported list of action types: click, type, scroll, wait, navigate.
3. Every step MUST include clear reasoning.
4. Output your plan inside the designated JSON schema containing steps, reasoning, confidence, and isGoalAchieved.
5. If the goal is fully achieved on the current page, return empty steps and set isGoalAchieved = true.
6. The elements on the current page are formatted in an indented tree where each element is prefixed by its ID, like [el-15] Type name. You MUST reference this ID exactly as elementId in your click or type actions.
7. Avoid infinite loops. If you have run the same action multiple times and the page state is not changing, either try a different approach or lower your confidence to indicate you need assistance.
8. If previous successful patterns or failures (memories) are provided:
   - Treat them as hints/examples from previous runs, NOT as hard constraints.
   - You may reuse successful sequences if they are appropriate for the current page state and goal.
   - Avoid repeating known failures or repeating actions that resulted in errors.

### Available Actions:
- click: Click an element. Requires elementId. Use for buttons, interactive links, checkboxes, or text fields to focus them.
- type: Types a value into a text field. Requires elementId and value.
- scroll: Scrolls the page. Requires value (must be either "up" or "down").
- wait: Waits for page or network responses. Requires waitMs (as integer).
- navigate: Navigates to a specific URL. Requires value (the destination URL). Only use if no interactive elements on the page can take you there.`;

const responseSchema = {
  type: 'object',
  properties: {
    goal: { type: 'string', description: 'The original user goal' },
    reasoning: { type: 'string', description: 'Overall strategic reasoning explaining how the actions advance towards the goal' },
    confidence: { type: 'number', description: 'Confidence score from 0.0 (uncertain) to 1.0 (highly certain)' },
    isGoalAchieved: { type: 'boolean', description: 'Set to true only if the page contents show the goal is fully accomplished' },
    steps: {
      type: 'array',
      description: 'The sequence of action steps to perform next',
      items: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['click', 'type', 'scroll', 'wait', 'navigate'] 
          },
          elementId: { type: 'string', description: 'Target element ID (e.g. el-24), required for click/type' },
          value: { type: 'string', description: 'Text to type, URL to navigate, or scroll direction ("up"/"down")' },
          waitMs: { type: 'integer', description: 'Duration to wait in milliseconds' },
          reasoning: { type: 'string', description: 'The reasoning behind executing this specific step' }
        },
        required: ['type', 'reasoning']
      }
    }
  },
  required: ['goal', 'reasoning', 'confidence', 'isGoalAchieved', 'steps']
};

/**
 * Returns a simulated plan to allow E2E loop testing without a valid API key
 */
function getMockPlan(request: PlanRequest): ActionPlan {
  const hasHistory = request.history.length > 0;
  
  if (hasHistory) {
    return {
      goal: request.goal,
      reasoning: '[Mock Mode] History is present. Simulating that the goal has been successfully completed.',
      confidence: 1.0,
      isGoalAchieved: true,
      steps: [],
    };
  }

  // Look for any text inputs (search inputs, textareas)
  const textbox = request.elements.find(el => el.type === 'textbox' && !el.disabled);
  if (textbox) {
    return {
      goal: request.goal,
      reasoning: `[Mock Mode] Found text input [${textbox.id}]. Focusing and entering search query.`,
      confidence: 0.9,
      isGoalAchieved: false,
      steps: [
        {
          type: 'click',
          elementId: textbox.id,
          reasoning: '[Mock Mode] Focusing input element before typing.',
        },
        {
          type: 'type',
          elementId: textbox.id,
          value: 'python',
          reasoning: '[Mock Mode] Entering search query into the text input.',
        },
      ],
    };
  }

  // Fallback: Click the first link or button
  const clickTarget = request.elements.find(el => (el.type === 'button' || el.type === 'link') && !el.disabled);
  return {
    goal: request.goal,
    reasoning: clickTarget
      ? `[Mock Mode] No text inputs found. Clicking interactive target [${clickTarget.id}].`
      : '[Mock Mode] No interactive elements detected. Waiting.',
    confidence: 0.6,
    isGoalAchieved: false,
    steps: clickTarget
      ? [
          {
            type: 'click',
            elementId: clickTarget.id,
            reasoning: '[Mock Mode] Simulating click on first interactive node.',
          },
        ]
      : [
          {
            type: 'wait',
            waitMs: 2000,
            reasoning: '[Mock Mode] Pausing execution context.',
          },
        ],
  };
}

export async function generateActionPlan(
  request: PlanRequest,
  model = 'gemini-2.5-flash'
): Promise<ActionPlan> {
  const isMockKey = !config.geminiApiKey ||
                    config.geminiApiKey.trim() === '' ||
                    config.geminiApiKey.trim().startsWith('mock');

  if (isMockKey) {
    console.log('🤖 [Planner] Mock/Placeholder Key detected. Running in Mock Planning Mode.');
    return getMockPlan(request);
  }

  const compressedTree = compressSemanticTree(request.elements);
  const historyText = request.history.length > 0
    ? request.history.map((h, i) => `${i + 1}. Action: ${h.action} | Status: ${h.status}${h.error ? ` | Error: ${h.error}` : ''}`).join('\n')
    : 'No actions have been executed yet.';

  let memoriesText = '';
  if (request.relevantMemories) {
    const { successfulPatterns = [], failures = [] } = request.relevantMemories;
    const limitedSuccessful = successfulPatterns.slice(0, 5);
    const limitedFailures = failures.slice(0, 3);

    if (limitedSuccessful.length > 0 || limitedFailures.length > 0) {
      memoriesText = `### Relevant Memories for Domain: ${request.relevantMemories.domain}\n`;
      memoriesText += `These memories are examples from previous runs on this domain. Treat them as hints, not hard constraints. You may reuse successful sequences if appropriate. Avoid repeating known failures.\n`;

      if (limitedSuccessful.length > 0) {
        memoriesText += `\nSuccessful workflows on this website in the past (up to 5):\n`;
        limitedSuccessful.forEach((p, idx) => {
          memoriesText += `${idx + 1}. Goal: "${p.goal}"\n   Action sequence:\n`;
          p.actions.forEach((s) => {
            memoriesText += `     - Type: ${s.type}${s.elementId ? `, elementId: ${s.elementId}` : ''}${s.value ? `, value: "${s.value}"` : ''}\n`;
          });
        });
      }

      if (limitedFailures.length > 0) {
        memoriesText += `\nUnsuccessful workflows / errors on this website in the past (up to 3):\n`;
        limitedFailures.forEach((f, idx) => {
          memoriesText += `${idx + 1}. Goal: "${f.goal}" | Failed at step: ${f.failedStep}\n`;
          if (f.failedAction) {
            memoriesText += `   Failed Action: Type: ${f.failedAction.type}${f.failedAction.elementId ? `, elementId: ${f.failedAction.elementId}` : ''}${f.failedAction.value ? `, value: "${f.failedAction.value}"` : ''}\n`;
          }
          memoriesText += `   Error: "${f.error}"\n`;
        });
      }
    }
  }

  const userPrompt = `### Goal
Goal: ${request.goal}
${memoriesText ? `\n${memoriesText}` : ''}
### Execution History
${historyText}

### Current Page State
URL: ${request.url}

### Page Semantic Tree
${compressedTree}

---
Analyze the current page state and history relative to the goal. Provide your strategic plan and steps.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    return JSON.parse(text) as ActionPlan;
  } catch (error: any) {
    const isInvalidKeyError = error.message?.includes('API_KEY_INVALID') || 
                              error.message?.includes('API key not valid') ||
                              error.status === 'INVALID_ARGUMENT';
    if (isInvalidKeyError) {
      console.warn('⚠️ [Planner] The Gemini API key is invalid. Falling back to Mock Planning Mode.');
      return getMockPlan(request);
    }
    console.error('Error generating plan with Gemini:', error);
    throw error;
  }
}

function getMockRecoveryPlan(request: RecoverRequest): RecoveryPlan {
  const randomId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `recovery-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return {
    id: randomId,
    steps: [
      {
        type: 'scroll',
        value: 'down',
        reasoning: `[Mock Recovery] Failed to execute action on element. Scrolling down to bring elements into viewport.`
      },
      {
        type: 'wait',
        waitMs: 1000,
        reasoning: `[Mock Recovery] Waiting for layout to stabilize after scroll.`
      }
    ]
  };
}

export async function generateRecoveryPlan(
  request: RecoverRequest,
  model = 'gemini-2.5-flash'
): Promise<RecoveryPlan> {
  const isMockKey = !config.geminiApiKey ||
                    config.geminiApiKey.trim() === '' ||
                    config.geminiApiKey.trim().startsWith('mock');

  if (isMockKey) {
    console.log('🤖 [Planner] Mock/Placeholder Key detected. Running in Mock Recovery Mode.');
    return getMockRecoveryPlan(request);
  }

  const compressedTree = compressSemanticTree(request.pageState.elements);
  
  const fc = request.failureContext;
  const failedActionStr = `Type: ${fc.failedAction.type}${fc.failedAction.elementId ? `, elementId: ${fc.failedAction.elementId}` : ''}${fc.failedAction.value ? `, value: "${fc.failedAction.value}"` : ''}`;
  const recentActionsStr = fc.recentActions.length > 0
    ? fc.recentActions.map((a, idx) => `  ${idx + 1}. Type: ${a.type}${a.elementId ? `, elementId: ${a.elementId}` : ''}${a.value ? `, value: "${a.value}"` : ''}`).join('\n')
    : '  None';

  const originalPlanStepsStr = request.originalPlan.steps.map((a, idx) => {
    const activeMarker = idx === fc.failedStepIndex ? ' [FAILED]' : '';
    return `${idx + 1}. Type: ${a.type}${a.elementId ? `, elementId: ${a.elementId}` : ''}${a.value ? `, value: "${a.value}"` : ''}${activeMarker}`;
  }).join('\n');

  let memoriesText = '';
  if (request.relevantMemories) {
    const { successfulPatterns = [], failures = [] } = request.relevantMemories;
    const limitedSuccessful = successfulPatterns.slice(0, 5);
    const limitedFailures = failures.slice(0, 3);

    if (limitedSuccessful.length > 0 || limitedFailures.length > 0) {
      memoriesText = `### Relevant Memories for Domain: ${request.relevantMemories.domain}\n`;
      memoriesText += `These memories are examples from previous runs on this domain. Treat them as hints, not hard constraints. You may reuse successful sequences if appropriate. Avoid repeating known failures.\n`;

      if (limitedSuccessful.length > 0) {
        memoriesText += `\nSuccessful workflows on this website in the past (up to 5):\n`;
        limitedSuccessful.forEach((p, idx) => {
          memoriesText += `${idx + 1}. Goal: "${p.goal}"\n   Action sequence:\n`;
          p.actions.forEach((s) => {
            memoriesText += `     - Type: ${s.type}${s.elementId ? `, elementId: ${s.elementId}` : ''}${s.value ? `, value: "${s.value}"` : ''}\n`;
          });
        });
      }

      if (limitedFailures.length > 0) {
        memoriesText += `\nUnsuccessful workflows / errors on this website in the past (up to 3):\n`;
        limitedFailures.forEach((f, idx) => {
          memoriesText += `${idx + 1}. Goal: "${f.goal}" | Failed at step: ${f.failedStep}\n`;
          if (f.failedAction) {
            memoriesText += `   Failed Action: Type: ${f.failedAction.type}${f.failedAction.elementId ? `, elementId: ${f.failedAction.elementId}` : ''}${f.failedAction.value ? `, value: "${f.failedAction.value}"` : ''}\n`;
          }
          memoriesText += `   Error: "${f.error}"\n`;
        });
      }
    }
  }

  const userPrompt = `### Original Goal
Goal: ${request.goal}
${memoriesText ? `\n${memoriesText}` : ''}

### Original Plan Steps
${originalPlanStepsStr}

### Failure Context
Failed Step Index: ${fc.failedStepIndex}
Failed Action: ${failedActionStr}
Error Message: ${fc.error}
Failed URL: ${fc.currentUrl}
Failed Page Title: ${fc.currentTitle}

### Recent Actions Leading to Failure
${recentActionsStr}

### Current Page State
URL: ${request.pageState.url}
Title: ${request.pageState.title}
Viewport: Width: ${request.pageState.viewport?.width}, Height: ${request.pageState.viewport?.height}, ScrollY: ${request.pageState.viewport?.scrollY}

### Current Page Semantic Tree
${compressedTree}

---
Analyze the failure context and current page state relative to the goal.
Generate a minimal corrective action sequence to recover from this failure.
Do not regenerate the entire workflow.
Preserve already completed progress.
Generate only the smallest corrective sequence necessary.
Avoid repeating previously failed actions.
Return the corrective steps in the required JSON schema.`;

  const RECOVERY_SYSTEM_INSTRUCTION = `You are Flowly, an intelligent AI browser agent.
Your task is to generate a minimal recovery plan fragment (a corrective sequence of steps) with a unique plan ID to help the agent recover from a failed execution step and get back on track to achieve the user's goal.

### Strict Constraints:
1. Produce a minimal correction (usually 1-3 actions, e.g., scrolling, waiting, clicking a different element, or typing again).
2. Do not regenerate the entire workflow.
3. Preserve already completed progress.
4. Generate only the smallest corrective sequence necessary.
5. Avoid repeating previously failed actions.
6. Select actions strictly from the supported list of action types: click, type, scroll, wait, navigate.
7. Every step MUST include clear reasoning.
8. Output your recovery plan inside the designated JSON schema containing a unique "id" (UUID) and a "steps" array.`;

  const recoveryResponseSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'A unique UUID generated for this recovery plan' },
      steps: {
        type: 'array',
        description: 'The sequence of corrective action steps to perform next to recover from the failure',
        items: {
          type: 'object',
          properties: {
            type: { 
              type: 'string', 
              enum: ['click', 'type', 'scroll', 'wait', 'navigate'] 
            },
            elementId: { type: 'string', description: 'Target element ID, required for click/type' },
            value: { type: 'string', description: 'Text to type, URL to navigate, or scroll direction ("up"/"down")' },
            waitMs: { type: 'integer', description: 'Duration to wait in milliseconds' },
            reasoning: { type: 'string', description: 'The reasoning explaining how this step helps recover' }
          },
          required: ['type', 'reasoning']
        }
      }
    },
    required: ['id', 'steps']
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: userPrompt,
      config: {
        systemInstruction: RECOVERY_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: recoveryResponseSchema,
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    return JSON.parse(text) as RecoveryPlan;
  } catch (error: any) {
    const isInvalidKeyError = error.message?.includes('API_KEY_INVALID') || 
                              error.message?.includes('API key not valid') ||
                              error.status === 'INVALID_ARGUMENT';
    if (isInvalidKeyError) {
      console.warn('⚠️ [Planner] The Gemini API key is invalid. Falling back to Mock Recovery Mode.');
      return getMockRecoveryPlan(request);
    }
    console.error('Error generating recovery plan with Gemini:', error);
    throw error;
  }
}

function getMockGoalCompletionCheck(request: CheckGoalRequest): GoalCompletionResult {
  const hasSteps = request.history && request.history.length > 0;
  if (hasSteps && request.history!.length >= 2) {
    return {
      completed: true,
      confidence: 1.0,
      reason: '[Mock Mode] At least 2 steps executed in history. Simulating that the goal has been successfully completed.'
    };
  }
  return {
    completed: false,
    confidence: 0.8,
    reason: `[Mock Mode] Only ${request.history?.length || 0} steps executed in history. Simulating that the goal is not yet achieved.`
  };
}

export async function generateGoalCompletionCheck(
  request: CheckGoalRequest,
  model = 'gemini-2.5-flash'
): Promise<GoalCompletionResult> {
  const isMockKey = !config.geminiApiKey ||
                    config.geminiApiKey.trim() === '' ||
                    config.geminiApiKey.trim().startsWith('mock');

  if (isMockKey) {
    console.log('🤖 [Planner] Mock/Placeholder Key detected. Running in Mock Goal Completion Mode.');
    return getMockGoalCompletionCheck(request);
  }

  const GOAL_CHECK_SYSTEM_INSTRUCTION = `You are Flowly, an intelligent AI browser agent.
Your task is to determine whether the user's original goal has been fully satisfied based on the current page state, title, URL, and visual grounding.

### Strict Constraints:
1. Examine the current page state and elements to determine if the goal has been achieved.
2. Be conservative. Set completed = true only if you are confident that the goal has been reached (e.g. final confirmation screen, search results visible, data successfully entered/submitted, correct page loaded).
3. Do not optimize for additional actions.
4. If the goal appears complete with high confidence, terminate (set completed = true).
5. Avoid unnecessary exploration.
6. Provide your assessment in the designated JSON schema containing "completed", "confidence", and "reason".`;

  const goalCheckResponseSchema = {
    type: 'object',
    properties: {
      completed: { type: 'boolean', description: 'Set to true if the page contents show the goal is fully accomplished' },
      confidence: { type: 'number', description: 'Confidence score from 0.0 to 1.0' },
      reason: { type: 'string', description: 'The reason explaining how the page state shows the goal is or is not met' }
    },
    required: ['completed', 'confidence', 'reason']
  };

  const compressedTree = compressSemanticTree(request.elements);
  const historyText = request.history && request.history.length > 0
    ? request.history.map((h, i) => `${i + 1}. Action: ${h.action} | Status: ${h.status}${h.error ? ` | Error: ${h.error}` : ''}`).join('\n')
    : 'No actions have been executed yet.';

  let memoriesText = '';
  if (request.relevantMemories) {
    const { successfulPatterns = [], failures = [] } = request.relevantMemories;
    const limitedSuccessful = successfulPatterns.slice(0, 5);
    const limitedFailures = failures.slice(0, 3);

    if (limitedSuccessful.length > 0 || limitedFailures.length > 0) {
      memoriesText = `### Relevant Memories for Domain: ${request.relevantMemories.domain}\n`;
      memoriesText += `These memories are examples from previous runs on this domain.\n`;
    }
  }

  const userPrompt = `### Original Goal
Goal: ${request.goal}
${memoriesText ? `\n${memoriesText}` : ''}
### Execution History
${historyText}

### Current Page State
URL: ${request.url}
Title: ${request.title}

### Current Page Semantic Tree (Filtered)
${compressedTree}

---
Analyze the current page state and history relative to the goal. Determine if the goal is fully completed.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: userPrompt,
      config: {
        systemInstruction: GOAL_CHECK_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: goalCheckResponseSchema,
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    return JSON.parse(text) as GoalCompletionResult;
  } catch (error: any) {
    const isInvalidKeyError = error.message?.includes('API_KEY_INVALID') || 
                              error.message?.includes('API key not valid') ||
                              error.status === 'INVALID_ARGUMENT';
    if (isInvalidKeyError) {
      console.warn('⚠️ [Planner] The Gemini API key is invalid. Falling back to Mock Goal Completion Mode.');
      return getMockGoalCompletionCheck(request);
    }
    console.error('Error checking goal completion with Gemini:', error);
    throw error;
  }
}

