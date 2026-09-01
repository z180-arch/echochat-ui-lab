/**
 * Memory candidate review modal — Morning Mint.
 */

import { esc } from "../../core/utils.js";

export function memoryReviewMarkup({ candidates = [], notice = "", error = "" } = {}) {
  return {
    title: "从对话提取记忆",
    width: "640px",
    content: `
      <p class="recon-lead">这些是对话里可以记下的事。勾选后写入这个角色的记忆，不会记到别人身上。</p>
      ${notice ? `<div class="recon-notice recon-notice-warn">${esc(notice)}</div>` : ""}
      ${error ? `<div class="recon-notice recon-notice-warn">${esc(error)}</div>` : ""}
      ${
        candidates.length === 0
          ? `<div class="recon-hint">没有可提取的条目。</div>`
          : candidates
              .map(
                (c) => `
        <div class="recon-finding">
          <label class="recon-finding-head">
            <input type="checkbox" ${c.accepted ? "checked" : ""} ${c.duplicate ? "disabled" : ""} onchange="window.EchoApp.memoryCandidateToggle('${esc(c.id)}', this.checked)" />
            <span>${c.duplicate ? "已经记过" : "记下这条"}</span>
          </label>
          <textarea class="input recon-finding-text" id="mem-text-${esc(c.id)}" rows="2" oninput="window.EchoApp.memoryCandidateEdit('${esc(c.id)}', this.value)" ${c.duplicate ? "readonly" : ""}>${esc(c.text)}</textarea>
          <div class="recon-evidence">依据：${(c.evidence || []).map((e) => `#${e.index}「${esc(e.excerpt)}」`).join(" · ") || "无"}</div>
        </div>`
              )
              .join("")
      }
      <label class="recon-finding-head" style="margin-top:12px;">
        <input type="checkbox" id="mem-post-moment" checked />
        <span>同时发一条动态</span>
      </label>
    `,
    footer: `
      <button type="button" class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
      <button type="button" class="btn btn-primary" ${candidates.some((c) => c.accepted && !c.duplicate) ? "" : "disabled"} onclick="window.EchoApp.memoryCandidateConfirm()">写入记忆</button>
    `,
  };
}
