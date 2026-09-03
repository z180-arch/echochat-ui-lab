/**
 * Memory candidate review modal — Morning Mint.
 */

import { esc } from "../../core/utils.js";
import { EmptyState, Icons } from "../components/index.js";

export function memoryReviewMarkup({ candidates = [], notice = "", error = "" } = {}) {
  const empty = candidates.length === 0;
  return {
    title: "从对话提取记忆",
    width: "640px",
    content: empty
      ? `
      ${error ? `<div class="recon-notice recon-notice-warn">${esc(error)}</div>` : ""}
      ${EmptyState({
        icon: Icons.brain,
        title: "没有可提取的条目",
        desc: notice || "这段对话里还没有足够明确、可以记下的事。",
      })}
    `
      : `
      <p class="recon-lead">这些是对话里可以记下的事。勾选后写入这个角色的记忆，不会记到别人身上。</p>
      ${notice ? `<div class="recon-notice recon-notice-warn">${esc(notice)}</div>` : ""}
      ${error ? `<div class="recon-notice recon-notice-warn">${esc(error)}</div>` : ""}
      ${candidates
        .map(
          (c) => `
        <div class="recon-finding">
          <label class="recon-finding-head">
            <input type="checkbox" ${c.accepted ? "checked" : ""} ${c.duplicate ? "disabled" : ""} onchange="window.EchoApp.memoryCandidateToggle('${esc(c.id)}', this.checked)" />
            <span>${c.duplicate ? "已经记过" : "记下这条"}</span>
          </label>
          <textarea class="input recon-finding-text" id="mem-text-${esc(c.id)}" rows="2" oninput="window.EchoApp.memoryCandidateEdit('${esc(c.id)}', this.value)" ${c.duplicate ? "readonly" : ""}>${esc(c.text)}</textarea>
          <div class="recon-evidence">依据：${(c.evidence || []).map((e) => (e.source === "summary" ? `摘要「${esc(e.excerpt)}」` : `#${e.index}「${esc(e.excerpt)}」`)).join(" · ") || "无"}</div>
        </div>`
        )
        .join("")}
      <label class="recon-finding-head" style="margin-top:12px;">
        <input type="checkbox" id="mem-post-moment" />
        <span>同时在痕迹里记一笔</span>
      </label>
    `,
    footer: empty
      ? `<button type="button" class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">关闭</button>`
      : `
      <button type="button" class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
      <button type="button" class="btn btn-primary" ${candidates.some((c) => c.accepted && !c.duplicate) ? "" : "disabled"} onclick="window.EchoApp.memoryCandidateConfirm()">写入记忆</button>
    `,
  };
}
