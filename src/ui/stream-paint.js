/**
 * Streaming paint helpers. Keep history DOM stable; only the live
 * assistant bubble should be rewritten while tokens arrive.
 *
 * Batching follows common chat-UI practice (buffer + ~1 frame / 48ms)
 * rather than a React streamdown pipeline.
 */
import { renderMarkdown } from "../core/utils.js";

export const STREAM_PAINT_MIN_MS = 48;
export const STREAM_FOLLOW_PX = 120;

export function closeOpenMarkdownFences(text) {
  const raw = String(text || "");
  const ticks = raw.match(/```/g);
  if (!ticks || ticks.length % 2 === 0) return raw;
  return raw + "\n```";
}

export function streamingMarkdown(text) {
  return renderMarkdown(closeOpenMarkdownFences(text));
}

export function shouldPaintNow(lastAt, now = Date.now(), minMs = STREAM_PAINT_MIN_MS) {
  if (!lastAt) return true;
  return now - lastAt >= minMs;
}

export function nearBottom(box, px = STREAM_FOLLOW_PX) {
  if (!box) return true;
  return box.scrollHeight - box.scrollTop - box.clientHeight < px;
}

export function followStreamScroll(box) {
  if (nearBottom(box)) box.scrollTop = box.scrollHeight;
}

export function findStreamingBubble(root) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope?.querySelector) return null;
  return scope.querySelector("#chat-messages .msg-streaming .msg-bubble");
}

export function patchStreamingBubble(bubble, html, signature) {
  if (!bubble) return false;
  const mark = String(signature || "");
  if (mark && bubble.getAttribute("data-stream-sig") === mark) return true;
  bubble.innerHTML = html;
  if (mark) bubble.setAttribute("data-stream-sig", mark);
  return true;
}

export function streamSignature(text) {
  const raw = String(text || "");
  return `${raw.length}:${raw.slice(-32)}`;
}
