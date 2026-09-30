import "server-only";

// Reads the top-level "message" string out of a structured recommendation
// response WHILE it is still being generated, so the shopping assistant can
// show the reply as it arrives. The input is always a prefix of the JSON
// Gemini is producing (lib/ai/recommend.ts's response schema:
// {"message": "...", "recommendations": [...]}) and is never JSON.parse()d
// here — incomplete JSON can't be. This only decodes the one string field,
// as far as it has arrived.
//
// Display-only by design: the result is text to show, never data to trust.
// The complete response still goes through recommend.ts's unchanged Zod
// validation and candidate-id allowlist, and only that validated result is
// ever treated as the assistant's answer or turned into recommendations.

const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

// Decodes a JSON string body starting at `start` (just after its opening
// quote), stopping at the closing quote or at the end of what has arrived.
// An escape sequence cut off by the end of the buffer is left out until the
// rest of it arrives.
function decodePartialString(buffer: string, start: number): string {
  let out = "";
  let i = start;
  while (i < buffer.length) {
    const char = buffer[i];
    if (char === '"') break;
    if (char !== "\\") {
      out += char;
      i++;
      continue;
    }
    const next = buffer[i + 1];
    if (next === undefined) break;
    if (next === "u") {
      const hex = buffer.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 6;
      continue;
    }
    const decoded = ESCAPES[next];
    if (decoded === undefined) break;
    out += decoded;
    i += 2;
  }
  return out;
}

// Returns the decoded value of the top-level string field `field` as far as
// it has been generated, or null while its key hasn't appeared yet. Keys
// nested inside arrays/objects (e.g. a recommendation's "reason") are
// skipped by tracking depth and string boundaries.
export function readPartialStringField(buffer: string, field: string): string | null {
  let depth = 0;
  let i = 0;
  while (i < buffer.length) {
    const char = buffer[i];

    if (char === '"') {
      // Scan to the end of this string token.
      let end = i + 1;
      while (end < buffer.length && buffer[end] !== '"') {
        end += buffer[end] === "\\" ? 2 : 1;
      }
      if (end >= buffer.length) return null;

      // A top-level key is a depth-1 string followed by a colon.
      let after = end + 1;
      while (after < buffer.length && /\s/.test(buffer[after])) after++;
      if (depth === 1 && buffer[after] === ":" && buffer.slice(i + 1, end) === field) {
        let valueStart = after + 1;
        while (valueStart < buffer.length && /\s/.test(buffer[valueStart])) valueStart++;
        if (valueStart >= buffer.length) return "";
        if (buffer[valueStart] !== '"') return null;
        return decodePartialString(buffer, valueStart + 1);
      }

      i = end + 1;
      continue;
    }

    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
    i++;
  }
  return null;
}

// Turns a stream of raw JSON text chunks into a stream of "message" text
// deltas: feed it every chunk, and it calls `onDelta` with only the newly
// decoded part of the message. Emits nothing past `maxLength` characters —
// anything longer fails recommend.ts's validation anyway.
export function createMessageDeltaReader(
  onDelta: (delta: string) => void,
  maxLength: number,
): (chunk: string) => void {
  let buffer = "";
  let emitted = 0;
  return (chunk) => {
    buffer += chunk;
    const message = readPartialStringField(buffer, "message");
    if (message === null) return;
    const visible = message.slice(0, maxLength);
    if (visible.length > emitted) {
      onDelta(visible.slice(emitted));
      emitted = visible.length;
    }
  };
}
