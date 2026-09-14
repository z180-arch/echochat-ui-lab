/**
 * Normalized provider errors. UI reads `kind` + `userMessage`, never raw vendor JSON.
 */

export const PROVIDER_ERROR_KIND = {
  authentication: "authentication",
  rate_limit: "rate_limit",
  timeout: "timeout",
  network: "network",
  invalid_request: "invalid_request",
  model_unavailable: "model_unavailable",
  provider: "provider",
  aborted: "aborted",
  unknown: "unknown",
};

const SECRET_RE = /sk-[a-zA-Z0-9_\-]{8,}|Bearer\s+\S+/gi;

export function redactSecrets(text) {
  return String(text || "").replace(SECRET_RE, "[redacted]");
}

const KIND_COPY = {
  authentication: "API Key 无效或已过期，请重新填写。",
  rate_limit: "请求太频繁，请稍后再试。",
  timeout: "模型响应超时，请再发一次。",
  network: "网络连接失败，请检查网络后重试。",
  invalid_request: "请求无效，请检查接口地址和模型名。",
  model_unavailable: "当前模型不可用，请换一个模型。",
  provider: "模型服务暂时出错，请稍后重试。",
  aborted: "已停止生成",
  unknown: "请求失败，请稍后重试。",
};

export class ProviderError extends Error {
  constructor(kind, message, extra = {}) {
    const safe = redactSecrets(message || KIND_COPY[kind] || KIND_COPY.unknown);
    super(safe);
    this.name = kind === PROVIDER_ERROR_KIND.aborted ? "AbortError" : "ProviderError";
    this.kind = kind || PROVIDER_ERROR_KIND.unknown;
    this.status = extra.status ?? null;
    this.retryable = !!extra.retryable;
    this.userMessage = extra.userMessage || KIND_COPY[this.kind] || KIND_COPY.unknown;
    this.retryAfterMs = extra.retryAfterMs ?? null;
  }
}

function kindFromStatus(status, bodyText) {
  const blob = String(bodyText || "").toLowerCase();
  if (status === 401 || status === 403) return PROVIDER_ERROR_KIND.authentication;
  if (status === 429) return PROVIDER_ERROR_KIND.rate_limit;
  if (status === 408) return PROVIDER_ERROR_KIND.timeout;
  if (status === 404 || /model.?not.?found|does not exist|unknown model/.test(blob)) {
    return PROVIDER_ERROR_KIND.model_unavailable;
  }
  if (status === 400 || status === 422) return PROVIDER_ERROR_KIND.invalid_request;
  if (status >= 500) return PROVIDER_ERROR_KIND.provider;
  return PROVIDER_ERROR_KIND.unknown;
}

export function parseRetryAfterMs(header) {
  if (header == null || header === "") return null;
  const raw = String(header).trim();
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.min(8000, Math.max(200, Math.round(Number(raw) * 1000)));
  }
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) {
    return Math.min(8000, Math.max(200, when - Date.now()));
  }
  return null;
}

export function errorFromHttpStatus(status, bodyText, retryAfterHeader) {
  const kind = kindFromStatus(status, bodyText);
  let detail = "";
  try {
    const json = JSON.parse(bodyText);
    detail = json?.error?.message || json?.message || json?.error?.code || "";
  } catch {
    detail = "";
  }
  const retryable = kind === PROVIDER_ERROR_KIND.rate_limit;
  return new ProviderError(kind, detail || `请求失败 (${status})`, {
    status,
    retryable,
    retryAfterMs: retryable ? parseRetryAfterMs(retryAfterHeader) : null,
  });
}

export function errorFromCaught(err) {
  if (err instanceof ProviderError) return err;
  if (err?.name === "AbortError" || err?.name === "TimeoutError") {
    if (err.kind === PROVIDER_ERROR_KIND.timeout) return err;
    return new ProviderError(PROVIDER_ERROR_KIND.aborted, "aborted");
  }
  const msg = String(err && err.message ? err.message : err || "");
  if (/timeout|timed out/i.test(msg)) {
    return new ProviderError(PROVIDER_ERROR_KIND.timeout, msg);
  }
  if (/failed to fetch|networkerror|load failed|econnreset|enotfound|econnrefused/i.test(msg)) {
    return new ProviderError(PROVIDER_ERROR_KIND.network, msg, { retryable: true });
  }
  return new ProviderError(PROVIDER_ERROR_KIND.unknown, msg);
}

export function userFacingProviderMessage(errOrKind) {
  if (errOrKind && typeof errOrKind === "object") {
    const kind = errOrKind.kind || PROVIDER_ERROR_KIND.unknown;
    return redactSecrets(errOrKind.userMessage || KIND_COPY[kind] || KIND_COPY.unknown);
  }
  return KIND_COPY[errOrKind] || KIND_COPY.unknown;
}

export function errorFromSsePayload(json) {
  const err = json && json.error;
  if (!err) return null;
  const msg = typeof err === "string" ? err : err.message || err.code || "provider error";
  const type = String(err.type || err.code || "").toLowerCase();
  let kind = PROVIDER_ERROR_KIND.provider;
  if (/auth|invalid_api_key|unauthor/.test(type) || /invalid api key|incorrect api key/.test(String(msg).toLowerCase())) {
    kind = PROVIDER_ERROR_KIND.authentication;
  } else if (/rate/.test(type)) kind = PROVIDER_ERROR_KIND.rate_limit;
  else if (/model/.test(type)) kind = PROVIDER_ERROR_KIND.model_unavailable;
  else if (/invalid/.test(type)) kind = PROVIDER_ERROR_KIND.invalid_request;
  return new ProviderError(kind, msg, { retryable: kind === PROVIDER_ERROR_KIND.rate_limit });
}
