/**
 * Viewport window for long transcripts.
 * Algorithm matches common virtual-list practice (estimate + overscan +
 * optional measured heights). No React/TanStack runtime.
 */

export const VIRT_ESTIMATE_PX = 72;
export const VIRT_OVERSCAN = 12;
export const VIRT_THRESHOLD = 48;

export function visibleRange({
  count,
  scrollTop = 0,
  viewportHeight = 600,
  estimateHeight = VIRT_ESTIMATE_PX,
  overscan = VIRT_OVERSCAN,
  heights = null,
  stickyTail = 0,
} = {}) {
  const n = Math.max(0, Number(count) || 0);
  if (n === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  if (n <= VIRT_THRESHOLD) return { start: 0, end: n, padTop: 0, padBottom: 0 };

  const est = Math.max(24, Number(estimateHeight) || VIRT_ESTIMATE_PX);
  const prefix = buildPrefix(n, est, heights);
  const total = prefix[n];
  const view = Math.max(1, Number(viewportHeight) || 600);
  const top = Math.max(0, Number(scrollTop) || 0);
  const bottom = top + view;

  let start = findIndex(prefix, top) - overscan;
  let end = findIndex(prefix, bottom) + 1 + overscan;
  start = Math.max(0, start);
  end = Math.min(n, Math.max(start, end));
  if (stickyTail > 0) end = Math.max(end, n - stickyTail);

  return {
    start,
    end,
    padTop: prefix[start],
    padBottom: total - prefix[end],
  };
}

function buildPrefix(n, est, heights) {
  const prefix = new Array(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) {
    const h = heights && heights[i] > 0 ? heights[i] : est;
    prefix[i + 1] = prefix[i] + h;
  }
  return prefix;
}

function findIndex(prefix, y) {
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid] <= y) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

export function mergeOlder(current, older) {
  const cur = Array.isArray(current) ? current : [];
  const extra = Array.isArray(older) ? older : [];
  const seen = new Set(cur.map((m) => m && m.id).filter(Boolean));
  const prepend = extra.filter((m) => m && m.id && !seen.has(m.id));
  return prepend.concat(cur);
}

export function sliceTail(messages, limit) {
  const all = Array.isArray(messages) ? messages : [];
  const cap = Math.max(1, Number(limit) || 80);
  if (all.length <= cap) {
    return { items: all.slice(), hasOlder: false, total: all.length };
  }
  return { items: all.slice(-cap), hasOlder: true, total: all.length };
}
