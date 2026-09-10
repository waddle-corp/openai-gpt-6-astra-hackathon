export function agentErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Unexpected agent error.';
  const status = message.includes('OPENAI_API_KEY') ? 503 : 502;
  return Response.json({ error: message }, { status });
}

/** Resolves body.feedbackIds against the fixtures; returns a 400 Response when any id is unknown. */
export function pickFeedback<T extends { id?: string }>(
  fixtures: T[],
  ids: unknown,
  { required = false } = {},
) {
  if (ids === undefined) {
    return required
      ? Response.json({ error: 'feedbackIds is required.' }, { status: 400 })
      : fixtures;
  }
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    return Response.json(
      { error: 'feedbackIds must be an array of strings.' },
      { status: 400 },
    );
  }
  const byId = new Map(fixtures.map((record) => [record.id, record]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length || ids.length === 0) {
    return Response.json(
      {
        error: `feedbackIds must name records in data/shopper-feedback.json (unknown: ${missing.join(', ') || 'none, but empty'}).`,
      },
      { status: 400 },
    );
  }
  return [...new Set(ids as string[])].map((id) => byId.get(id)!);
}
