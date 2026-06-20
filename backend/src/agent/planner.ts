import { GoogleGenAI } from '@google/genai';
import { ActionPlan, PlanRequest } from '@flowly/shared';
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

  const userPrompt = `### Goal
Goal: ${request.goal}

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
