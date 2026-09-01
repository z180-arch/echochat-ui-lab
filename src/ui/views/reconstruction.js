/**
 * Character Reconstruction review modal — Morning Mint, no new visual system.
 */

import { esc } from "../../core/utils.js";
import { DIMENSION_LABELS } from "../../domain/reconstruction/extract.js";

export function reconstructionModalMarkup({ step = "paste", pasteText = "", draft = null, error = "" } = {}) {
  if (step === "review" && draft) return reviewMarkup(draft, error);
  return pasteMarkup(pasteText, error);
}

function pasteMarkup(pasteText, error) {
  return {
    title: "从聊天记录重建",
    width: "640px",
    content: `
      <p class="recon-lead">粘贴纯文本对话。每行格式：<code>名字: 内容</code>。不会读取微信/WhatsApp 导出文件，也不会把角色卡 JSON 当成聊天记录。</p>
      <textarea class="input recon-paste" id="recon-paste" rows="12" placeholder="林晚: 我是咖啡店的店员。&#10;我: 今天想吃火锅吗？&#10;林晚: 讨厌香菜。">${esc(pasteText)}</textarea>
      ${error ? `<div class="recon-notice recon-notice-warn">${esc(error)}</div>` : ""}
      <div class="recon-hint">样本太少时只会确定能追溯到原句的部分，其余留给你补。</div>
    `,
    footer: `
      <button type="button" class="btn btn-ghost" onclick="window.EchoApp.reconstructionLoadFile()">从文本文件读取</button>
      <button type="button" class="btn btn-primary" onclick="window.EchoApp.reconstructionParse()">解析</button>
    `,
  };
}

function reviewMarkup(draft, error) {
  const speakers = draft.speakers?.speakers || [];
  const characterName = draft.speakers?.characterName || "";
  const findings = draft.findings || [];
  const unknown = draft.unknown || [];
  const notice = draft.sufficiency?.sufficient
    ? null
    : draft.sufficiency?.notice || "当前数据不足，只能确定部分维度。";
  const grouped = new Map();
  for (const f of findings) {
    if (!grouped.has(f.dimension)) grouped.set(f.dimension, []);
    grouped.get(f.dimension).push(f);
  }

  return {
    title: "核对重建结果",
    width: "680px",
    content: `
      <label class="recon-label">角色名</label>
      <input class="input" id="recon-name" value="${esc(draft.name || "")}" oninput="window.EchoApp.reconstructionSetName(this.value)" />
      <label class="recon-label">谁是角色</label>
      <div class="recon-speakers">
        ${speakers
          .map((s) => {
            const encoded = encodeURIComponent(s.name);
            const active = s.name === characterName ? "chip-active" : "";
            return `<button type="button" class="chip ${active}" onclick="window.EchoApp.reconstructionSetSpeaker(decodeURIComponent('${encoded}'))">${esc(s.name)} · ${s.count}</button>`;
          })
          .join("")}
      </div>
      ${notice ? `<div class="recon-notice recon-notice-warn">${esc(notice)}</div>` : ""}
      ${unknown.length ? `<div class="recon-hint">尚未确定：${unknown.map((d) => DIMENSION_LABELS[d] || d).join("、")}</div>` : ""}
      ${error ? `<div class="recon-notice recon-notice-warn">${esc(error)}</div>` : ""}
      ${[...grouped.entries()]
        .map(
          ([dim, items]) => `
        <div class="recon-dim">
          <div class="recon-dim-title">${esc(DIMENSION_LABELS[dim] || dim)}</div>
          ${items
            .map(
              (f) => `
            <div class="recon-finding">
              <label class="recon-finding-head">
                <input type="checkbox" ${f.accepted ? "checked" : ""} onchange="window.EchoApp.reconstructionToggleFinding('${esc(f.id)}', this.checked)" />
                <span>采用这条</span>
              </label>
              <textarea class="input recon-finding-text" id="recon-text-${esc(f.id)}" rows="2" oninput="window.EchoApp.reconstructionEditFinding('${esc(f.id)}', this.value)">${esc(f.text)}</textarea>
              <div class="recon-evidence">依据：${(f.evidence || []).map((e) => `#${e.index}「${esc(e.excerpt)}」`).join(" · ") || "无"}</div>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
    `,
    footer: `
      <button type="button" class="btn btn-ghost" onclick="window.EchoApp.reconstructionBack()">返回</button>
      <button type="button" class="btn btn-primary" onclick="window.EchoApp.reconstructionConfirm()">${draft.sufficiency?.sufficient ? "创建角色" : "仍要创建"}</button>
    `,
  };
}
