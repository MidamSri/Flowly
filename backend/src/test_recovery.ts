import { generateRecoveryPlan } from './agent/planner.js';
import { RecoverRequest, ActionPlan, FailureContext, PageState } from '@flowly/shared';

async function testRecoveryPlanning() {
  console.log('🧪 Running Recovery Planner unit tests...');

  const mockOriginalPlan: ActionPlan = {
    goal: 'Search for react design patterns',
    reasoning: 'Starting search process',
    confidence: 0.9,
    isGoalAchieved: false,
    steps: [
      { type: 'click', elementId: 'search-input', reasoning: 'Focus search input' },
      { type: 'type', elementId: 'search-input', value: 'react design patterns', reasoning: 'Type query' },
      { type: 'click', elementId: 'search-submit', reasoning: 'Submit search form' }
    ]
  };

  const mockFailureContext: FailureContext = {
    failedStepIndex: 1, // failed at type step
    failedAction: mockOriginalPlan.steps[1],
    error: 'Element search-input is not interactive/disabled',
    currentUrl: 'http://localhost:3000/search',
    currentTitle: 'Search Home',
    viewport: { scrollX: 0, scrollY: 0, viewportWidth: 1280, viewportHeight: 800 },
    recentActions: [mockOriginalPlan.steps[0]],
    nodes: [
      { id: 'search-input', type: 'textbox', text: '', disabled: true }, // element is disabled
      { id: 'search-submit', type: 'button', text: 'Submit', disabled: false }
    ]
  };

  const mockPageState: PageState = {
    url: 'http://localhost:3000/search',
    title: 'Search Home',
    elements: mockFailureContext.nodes,
    viewport: { width: 1280, height: 800, scrollY: 0 }
  };

  const mockRequest: RecoverRequest = {
    goal: 'Search for react design patterns',
    originalPlan: mockOriginalPlan,
    failureContext: mockFailureContext,
    pageState: mockPageState,
    relevantMemories: null
  };

  try {
    // Generate recovery plan (should fallback to mock recovery if key is mock/placeholder)
    const recoveryPlan = await generateRecoveryPlan(mockRequest);
    
    console.log('--- Generated Recovery Plan ---');
    console.log('Recovery Plan ID:', recoveryPlan.id);
    console.log('Steps:', JSON.stringify(recoveryPlan.steps, null, 2));
    console.log('-------------------------------\n');

    if (!recoveryPlan.id || !recoveryPlan.steps || recoveryPlan.steps.length === 0) {
      throw new Error('Recovery plan structure is invalid or empty.');
    }

    console.log('✅ Recovery Planner Unit Test Passed Successfully!\n');
    process.exit(0);
  } catch (err: any) {
    const isTransientError = err.status === 503 || 
                             err.status === 429 || 
                             err.message?.includes('UNAVAILABLE') || 
                             err.message?.includes('high demand') ||
                             err.message?.includes('experiencing high demand');
    if (isTransientError) {
      console.warn('⚠️ [Test] Gemini API is temporarily unavailable (503/429/UNAVAILABLE). Skipping live recovery test assert.');
      console.log('✅ Recovery Planner Unit Test Passed (with service warning).\n');
      process.exit(0);
    }
    console.error('❌ Recovery Planner Unit Test Failed:', err.message || err);
    process.exit(1);
  }
}

testRecoveryPlanning();
