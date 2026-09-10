const OPENAI_URL = 'https://api.openai.com/v1/responses';
const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

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

export async function embeddingsCreate(input: string[]) {
  const payload = await post(EMBEDDINGS_URL, {
    model: 'text-embedding-3-small',
    input,
  });
  const data = payload.data as { index: number; embedding: number[] }[];
  return data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

export function responsesCreate(body: Record<string, unknown>) {
  return post(OPENAI_URL, body);
}

async function post(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    // Upstream 401 text echoes key fragments; never forward it to the browser.
    if (response.status === 401)
      throw new Error('OpenAI rejected the OPENAI_API_KEY in .env.');
    const error = payload.error as { message?: string } | undefined;
    throw new Error(
      error?.message ?? `OpenAI request failed (${response.status}).`,
    );
  }
  return payload;
}

type OutputItem = {
  type?: string;
  content?: { type?: string; text?: string }[];
};

// The REST payload has no output_text convenience field (that is SDK-only): read message content.
export function responseText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output)
    ? (response.output as OutputItem[])
    : [];
  const text = output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('');
  if (!text.trim()) {
    const detail =
      (response.incomplete_details as { reason?: string } | null)?.reason ??
      response.status;
    throw new Error(`Astra returned no text output (${String(detail)}).`);
  }
  return text;
}
