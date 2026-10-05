import "server-only";

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing Gemini environment variable. Set GEMINI_API_KEY in the server runtime environment.",
    );
  }

  return apiKey;
}