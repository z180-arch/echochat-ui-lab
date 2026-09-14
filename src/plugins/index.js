/**
 * Local builtin plugins. Marketplace / remote loading / DSH are out of scope.
 */

import { store } from "../core/store.js";

/**
 * User-authored extra notes. Reads settings.extraNotes only.
 * Does not touch Memory, Relationship, Worldbook, or API keys.
 */
export const extraNotesPlugin = {
  id: "extra-notes",
  name: "Extra notes",
  version: "1",
  extendContext(ctx) {
    const notes = String(store.getState().settings?.extraNotes || "").trim();
    if (!notes) return ctx;
    const prev = String(ctx?.session?.extraPrompt || "").trim();
    return {
      ...ctx,
      session: {
        ...(ctx.session || {}),
        extraPrompt: prev ? `${prev}\n${notes}` : notes,
      },
    };
  },
};

/** @type {import("../runtime/plugin.js").EchoPlugin[]} */
export const builtinPlugins = [extraNotesPlugin];
