export function serializeDomainMemory(mem) {
    return JSON.stringify(mem);
}
export function deserializeDomainMemory(data) {
    const domain = typeof data?.domain === 'string' ? data.domain : 'unknown';
    const successfulPatterns = Array.isArray(data?.successfulPatterns) ? data.successfulPatterns : [];
    const failures = Array.isArray(data?.failures) ? data.failures : [];
    return {
        version: 1, // coerce to current version
        domain,
        successfulPatterns,
        failures
    };
}
export function serializeMemories(memories) {
    return JSON.stringify(memories);
}
export function deserializeMemories(data) {
    if (!Array.isArray(data))
        return [];
    return data.map(deserializeDomainMemory);
}
