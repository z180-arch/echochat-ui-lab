/**
 * Character Reconstruction wizard — 导入方式选择 → 解析 → 核对。
 * Morning Mint 视觉，不引入新的设计系统。
 */

import { esc } from "../../core/utils.js";
import { Icons } from "../components/index.js";
import { DIMENSION_LABELS } from "../../domain/reconstruction/extract.js";

export function reconstructionModalMarkup({
  step = "paste",
  pasteText = "",
  draft = null,
  error = "",
  importMode = "file",
} = {}) {
  if (step === "parsing") return parsingMarkup();
  if (step === "review" && draft) return reviewMarkup(draft, error);
  return pasteMarkup(pasteText, error, importMode);
}

function parsingMarkup() {
  return {
    title: "正在解析",
    width: "640px",
    content: `
      <div class="wizard-loading">
        <div class="spinner" aria-hidden="true"></div>
        <h4>正在从对话里认人…</h4>
        <p>分析语气与人设，马上就好</p>
      </div>
    `,
    footer: "",
  };
}

function pasteMarkup(pasteText, error, importMode) {
  const fileMode = importMode !== "text";
  const loaded = (pasteText || "").trim();
  return {
    title: "导入聊天记录",
    width: "640px",
    content: `
      <p class="create-sub">从对话记录里认出 TA 是谁。每行写成 <code>名字: 内容</code>（中英冒号均可）；角色卡 JSON 请走「导入角色卡」。</p>
      <div class="mode-tabs">
        <button type="button" class="mode-tab ${fileMode ? "on" : ""}" onclick="window.EchoApp.reconstructionSetMode('file')">从文件导入</button>
        <button type="button" class="mode-tab ${fileMode ? "" : "on"}" onclick="window.EchoApp.reconstructionSetMode('text')">粘贴纯文本</button>
      </div>
      ${error ? `<div class="recon-notice recon-notice-warn">${esc(error)}</div>` : ""}
      ${fileMode
        ? `<label class="import-file-zone" for="recon-file">
            <div class="if-icon">${Icons.upload}</div>
            <div class="if-title">选择聊天记录文件</div>
            <div class="if-desc">支持 .txt，微信 / QQ 导出后选择文件</div>
            <input type="file" id="recon-file" accept=".txt,text/plain" hidden onchange="window.EchoApp.reconstructionPickFile(event)" />
          </label>
          ${loaded ? `<div class="recon-hint">已加载 ${loaded.length} 字，可切到「粘贴纯文本」查看或编辑。</div>` : ""}`
        : `<textarea class="input recon-paste" id="recon-paste" rows="12" placeholder="林晚: 我是咖啡店的店员。&#10;我: 今天想吃火锅吗？&#10;林晚: 讨厌香菜。">${esc(pasteText)}</textarea>`}
      <div class="recon-hint">样本太少时只保留能对上原句的部分，其余你再补。确认后会生成人设并进入对话。</div>
    `,
    footer: `
      <button type="button" class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
      <button type="button" class="btn btn-primary" onclick="window.EchoApp.reconstructionParse()">下一步：解析</button>
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
    title: "核对人设",
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
      <button type="button" class="btn btn-ghost" onclick="window.EchoApp.reconstructionBack()">返回修改</button>
      <button type="button" class="btn btn-primary" onclick="window.EchoApp.reconstructionConfirm()">${draft.sufficiency?.sufficient ? "创建角色" : "仍要创建"}</button>
    `,
  };
}
