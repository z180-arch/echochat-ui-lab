/**
 * Run CI Node suites. This is the only local verification entry (`npm test`).
 * Browser verifies stay in CI; they are not required to develop.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SUITES = [
  "tests/migration_atomicity_test.mjs",
  "tests/foundation_test.mjs",
  "tests/architecture_boundary_test.mjs",
  "tests/storage_cutover_test.mjs",
  "tests/core_product_test.mjs",
  "tests/reconstruction_test.mjs",
  "tests/core_loop_test.mjs",
  "tests/reply_clean_test.mjs",
  "tests/chat_send_test.mjs",
  "tests/chat_actions_test.mjs",
  "tests/stream_paint_test.mjs",
  "tests/virtual_list_test.mjs",
  "tests/message_window_test.mjs",
  "tests/message_import_test.mjs",
  "tests/lived_moment_test.mjs",
  "tests/character_voice_slots_test.mjs",
  "tests/provider_test.mjs",
  "tests/voice_test.mjs",
  "tests/stt_test.mjs",
  "tests/theme_tokens_test.mjs",
  "tests/ambient_policy_test.mjs",
  "tests/v1_1_context_test.mjs",
  "tests/memory_representation_test.mjs",
  "tests/memory_persist_test.mjs",
  "tests/context_integration_test.mjs",
  "tests/plugin_runtime_test.mjs",
  "tests/product_loop_test.mjs",
  "tests/moments_product_test.mjs",
  "tests/character_worldbook_test.mjs",
  "tests/storage_satellite_test.mjs",
  "tests/lived_continuity_test.mjs",
  "tests/lived_thread_test.mjs",
  "tests/quiet_remember_test.mjs",
  "tests/continuity_write_path_test.mjs",
  "tests/continuity_perception_test.mjs",
  "tests/retrieval_regression_test.mjs",
  "tests/ui_refinement_wave1_test.mjs",
  "tests/ui_refinement_wave2_test.mjs",
  "tests/ui_refinement_wave3a_test.mjs",
  "tests/ui_refinement_wave3b_test.mjs",
  "tests/ui_refinement_wave4_test.mjs",
  "tests/ui_modal_surface_test.mjs",
  "tests/ui_icon_system_test.mjs",
  "tests/ui_settings_surface_test.mjs",
  "tests/ui_profile_scrim_test.mjs",
  "tests/ui_profile_hierarchy_test.mjs",
  "tests/companion_ux_test.mjs",
];

function walkJs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkJs(p, acc);
    else if (name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

for (const rel of SUITES) {
  const r = spawnSync(process.execPath, [rel], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\nFAIL ${rel} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

for (const file of walkJs(join(ROOT, "src"))) {
  const c = spawnSync(process.execPath, ["--check", file], { cwd: ROOT, stdio: "inherit" });
  if (c.status !== 0) process.exit(c.status || 1);
}

console.log(`\nnpm test: ${SUITES.length} suites + src syntax check passed`);
