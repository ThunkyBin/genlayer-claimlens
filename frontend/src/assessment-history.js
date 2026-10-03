export function parseAssessmentId(value, storedCount) {
  if (storedCount === null || storedCount <= 0n) return null;

  const requestedId = String(value).trim();
  if (!/^\d{1,78}$/.test(requestedId)) return null;

  const assessmentId = BigInt(requestedId);
  return assessmentId < storedCount ? assessmentId : null;
}

export function getAssessmentHistoryState({ storedCount, activeId, requestedId }) {
  const visible = storedCount !== null && storedCount > 1n;
  const hasActiveId = visible && activeId !== null && activeId >= 0n && activeId < storedCount;

  return {
    visible,
    position: !visible
      ? ''
      : hasActiveId
        ? `Assessment ${(activeId + 1n).toString()} of ${storedCount.toString()} · ID ${activeId.toString()}`
        : `${storedCount.toString()} stored`,
    previousId: hasActiveId && activeId > 0n ? activeId - 1n : null,
    nextId: hasActiveId && activeId < storedCount - 1n ? activeId + 1n : null,
    requestedAssessmentId: parseAssessmentId(requestedId, storedCount),
  };
}
