const OPENAI_URL = 'https://api.openai.com/v1/responses';

export class OpenAIConfigurationError extends Error {}

export function openAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new OpenAIConfigurationError(
      'OPENAI_API_KEY is missing. Add it to the project .env file.',
    );
  }
  return key;
}

export async function responsesCreate(body: Record<string, unknown>) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new Error(error?.message ?? `OpenAI request failed (${response.status}).`);
  }
  return payload;
}

export function responseText(response: Record<string, unknown>) {
  const text = response.output_text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Astra returned no text output.');
  }
  return text;
}
