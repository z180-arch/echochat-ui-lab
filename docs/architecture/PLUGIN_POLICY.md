# EchoChat Plugin Policy

**Current:** in-process `LocalPluginRuntime` + builtin `extra-notes`.

A plugin may append a string to the turn via `extraPrompt` after `assembleTurnContext` has already built Character / Memory / Relationship / Worldbook / lived-thread. That is the entire plugin surface.

This is **not** a marketplace, sandbox, Cordis, DeepSeek Harness, or OpenAI Agents host. `src/adapters/dsh/createDshPluginRuntime()` throws.

---

## What extra-notes can do

- Read the user-facing “额外备注” setting
- Return text that lands in the **Additional notes** prompt slot

## What plugins cannot do (current and intended)

- Read or write Memory, Moments, Relationship, or Dexie
- See the API key
- Send messages
- Load remote code
- Replace `assembleTurnContext`

---

## Planned (not scheduled)

A future permissioned plugin API is **not implemented**. Do not treat sandbox / manifest / `chat:write` tables as current architecture. If that work is ever authorized, it must stay an extension on Product Core — never a new host.
