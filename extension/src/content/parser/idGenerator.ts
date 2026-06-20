let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

export function getNextFlowlyId(): string {
  return `flowly-node-${idCounter++}`;
}
