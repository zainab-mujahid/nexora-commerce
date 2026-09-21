import "server-only";

// Same fail-fast pattern as lib/s3/env.ts and lib/supabase/env.ts: read once
// at import time and throw immediately if missing, rather than surfacing a
// confusing failure deep inside an embedding call. Server-only — this key
// must never reach the browser, and must never be exposed via a
// NEXT_PUBLIC_* variable.
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "Missing Gemini environment variable. Copy .env.example to .env.local and fill in GEMINI_API_KEY.",
  );
}

export const GEMINI_API_KEY = apiKey;
