import { GoalCompletionResult, SemanticNode, DomainMemory, StepHistoryItem } from '@flowly/shared';

function filterVisibleNodes(nodes: SemanticNode[]): SemanticNode[] {
  return nodes.filter(node => {
    if (node.type === 'container' && !node.text?.trim()) {
      return false;
    }
    if (node.disabled) {
      return false;
    }
    const hasContent = 
      (node.text && node.text.trim().length > 0) ||
      (node.ariaLabel && node.ariaLabel.trim().length > 0) ||
      (node.placeholder && node.placeholder.trim().length > 0);
      
    return !!hasContent;
  });
}

export async function checkGoalCompletion(
  goal: string,
  url: string,
  title: string,
  elements: SemanticNode[],
  relevantMemories?: DomainMemory | null,
  history?: StepHistoryItem[]
): Promise<GoalCompletionResult> {
  const visibleNodes = filterVisibleNodes(elements);
  
  const payload = {
    goal,
    url,
    title,
    elements: visibleNodes,
    relevantMemories,
    history
  };

  const response = await fetch('http://localhost:3000/api/check-goal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Goal Completion Checker Server error (HTTP ${response.status}): ${text}`);
  }

  const data = await response.json();
  return data as GoalCompletionResult;
}
