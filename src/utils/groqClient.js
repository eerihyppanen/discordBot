export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

export class GroqError extends Error {
  constructor(code) {
    super(`Groq request failed: ${code}`);
    this.code = code;
  }
}

export const getGroqReply = async (message, {
  apiKey = process.env.GROQ_API_KEY,
  model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
  fetchImpl = fetch,
  timeoutMs = 20000,
} = {}) => {
  let response;
  try {
    response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a helpful Discord bot assistant. Keep responses under 2000 characters.' },
          { role: 'user', content: message },
        ],
        model,
        max_tokens: 1000,
      }),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new GroqError('timeout');
    throw new GroqError('unavailable');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    if (response.ok) throw new GroqError('invalid_response');
    data = {};
  }
  if (!response.ok) {
    if (response.status === 401) throw new GroqError('unauthorized');
    if (response.status === 429) throw new GroqError('rate_limit');
    if (['model_decommissioned', 'model_not_found'].includes(data?.error?.code)) throw new GroqError('model');
    throw new GroqError('unavailable');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new GroqError('invalid_response');
  return content;
};

export const groqErrorMessage = (error) => ({
  unauthorized: '❌ Groq rejected the API key. Please contact the bot administrator.',
  rate_limit: '⏳ The AI service is busy. Please try again shortly.',
  model: '❌ The configured AI model is unavailable. Ask the bot administrator to update GROQ_MODEL.',
  timeout: '⏰ The AI service took too long to respond. Please try again.',
  invalid_response: '❌ The AI service returned an invalid response. Please try again.',
}[error.code] || '❌ The AI service is unavailable. Please try again later.');
