/**
 * Compact SSE parser for OpenAI-compatible streams.
 *
 * Line buffering / CRLF / comment / multi-data handling adapted from
 * eventsource-parser (MIT, Espen Hovlandsdal) and the WHATWG EventSource spec.
 * https://github.com/rexxars/eventsource-parser
 *
 * Callers must decode bytes with TextDecoder({ stream: true }) and flush.
 */

export function createSseParser(onEvent) {
  let buffer = "";
  let dataLines = [];

  function dispatch() {
    if (!dataLines.length) return;
    const data = dataLines.join("\n");
    dataLines = [];
    if (onEvent) onEvent(data);
  }

  function processLine(raw) {
    let line = raw;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
  }

  return {
    feed(chunk) {
      if (!chunk) return;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    },
    flush() {
      if (buffer) processLine(buffer);
      buffer = "";
      dispatch();
    },
  };
}

export function decodeUtf8Stream() {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return {
    push(bytes) {
      if (!bytes) return "";
      return decoder.decode(bytes, { stream: true });
    },
    end() {
      return decoder.decode();
    },
  };
}
