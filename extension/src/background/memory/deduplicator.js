/**
 * Computes a unique string signature for a successful pattern based on goal + actions.
 */
export function computeSuccessfulPatternHash(goal, actions) {
    const normalizedGoal = goal.trim().toLowerCase();
    const actionSeq = actions
        .map(a => `${a.type}:${a.elementId || ''}:${a.value || ''}`)
        .join('->');
    return `${normalizedGoal}||${actionSeq}`;
}
/**
 * Computes a unique string signature for a failure pattern based on goal + failedStep + error.
 */
export function computeFailurePatternHash(goal, failedStep, error) {
    const normalizedGoal = goal.trim().toLowerCase();
    const normalizedError = error.trim().toLowerCase();
    return `${normalizedGoal}||${failedStep}||${normalizedError}`;
}
/**
 * Deduplicates successful patterns by checking if a pattern with the same signature exists.
 * If yes, updates its timestamp and moves it to the top (recency strengthening).
 * Otherwise, prepends the new pattern.
 */
export function deduplicateAndAddSuccess(existing, newPattern) {
    const newHash = computeSuccessfulPatternHash(newPattern.goal, newPattern.actions);
    const filtered = existing.filter(p => {
        const hash = computeSuccessfulPatternHash(p.goal, p.actions);
        return hash !== newHash;
    });
    // We place the matching/new pattern at the front of the list
    const updatedPattern = {
        ...newPattern,
        // Keep the original ID if it already existed, or generate new
        id: existing.find(p => computeSuccessfulPatternHash(p.goal, p.actions) === newHash)?.id || newPattern.id
    };
    return [updatedPattern, ...filtered];
}
/**
 * Deduplicates failure patterns by checking if a failure with the same signature exists.
 * If yes, updates its timestamp and moves it to the top.
 * Otherwise, prepends the new failure.
 */
export function deduplicateAndAddFailure(existing, newPattern) {
    const newHash = computeFailurePatternHash(newPattern.goal, newPattern.failedStep, newPattern.error);
    const filtered = existing.filter(p => {
        const hash = computeFailurePatternHash(p.goal, p.failedStep, p.error);
        return hash !== newHash;
    });
    const updatedPattern = {
        ...newPattern,
        id: existing.find(p => computeFailurePatternHash(p.goal, p.failedStep, p.error) === newHash)?.id || newPattern.id
    };
    return [updatedPattern, ...filtered];
}
