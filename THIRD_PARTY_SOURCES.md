# Third Party Sources

This file records **copied source** versus **architecture reference**.
It does not replace [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (runtime/vendored dependencies).

Date of this review: 2026-09-12

---

## Chatbox

Repository:
https://github.com/chatboxai/chatbox

License:
GPL-3.0 (Community Edition)

### Architecture Reference Only

This project was studied for architectural reference.
No source code was copied.

Reason:

- EchoChat is licensed under PolyForm Noncommercial 1.0.0. Vendoring GPL-3.0 UI would be a **LICENSE REVIEW REQUIRED** conflict.
- EchoChat already ships a companion-first shell (nav rail, inbox, chat pane, composer, Me/settings, mobile bottom nav). Chatbox is a generic LLM client; replacing EchoChat IA with it would not be an obvious product upgrade.

Used components:
- (none copied)

Files migrated:
- (none)

Modification:
- (none)

Date:
2026-09-12

---

## DeepSeek Harness

Repository:
https://github.com/deepseek-ai/DeepSeek-Harness (public references; confirm upstream URL before any future code copy)

License:
MIT (as stated for the official Harness)

### Architecture Reference Only

This project was studied for architectural reference.
No source code was copied.

Used components:
- (none copied)

Files migrated:
- (none)

Modification:
- (none)

Date:
2026-09-12

What EchoChat implemented instead (original, in-process, no Cordis):

- `src/runtime/` — EchoPlugin, PluginRegistry, EchoContext, LocalPluginRuntime
- `src/adapters/dsh/` — reserved `PluginRuntimeAdapter` seat; `createDshPluginRuntime()` throws

Not implemented: Cordis, DSH Agent Loop, DSH Shell, code runtime, sandbox, tool system, plugin marketplace.

---

## InternalBeyond

Repository:
https://github.com/Sui-IB/InternalBeyond

License:
PolyForm Noncommercial 1.0.0 (code) + CC BY-NC-SA 4.0 (visual assets / documentation)

### Architecture Reference Only

This project was studied for architectural / visual-language reference.
No source code was copied.
No background images, canvas rain, dust particles, or HTML/CSS from InternalBeyond were vendored.

Absorbed as EchoChat-owned CSS only: layered sanctuary light, paper grain, concentric “echo” rings, warmer memory wash.

Date:
2026-09-12

---

## SillyTavern

Repository:
https://github.com/SillyTavern/SillyTavern

License:
AGPL-3.0

### Architecture Reference Only

Studied as a companion-domain candidate (character cards, World Info, extensions).
No source code was copied.
EchoChat already imports SillyTavern-format lorebooks / character books as *data*, which is not a code vendor.

Date:
2026-09-12

---

## TavernAI 1.2.8

Repository:
https://github.com/TavernAI/TavernAI-v1

License:
MIT

### Architecture Reference Only

Ancestor of SillyTavern World Info. Evaluated for possible MIT worldinfo migration.
No source code was copied. EchoChat worldbook already implements keyword + constant + scan depth + ST-format import.

Date:
2026-09-12

---

## LobeChat / LibreChat / Letta

Repositories:

- https://github.com/lobehub/lobe-chat
- https://github.com/danny-avila/LibreChat
- https://github.com/letta-ai/letta / https://github.com/letta-ai/letta-code

Licenses:

- LobeChat: Apache-2.0 with LobeHub Community redistribution limits on modified derivatives
- LibreChat: MIT
- Letta: Apache-2.0

### Architecture Reference Only

Evaluated as generic chat-client / agent-memory bases.
No source code was copied.

Date:
2026-09-12

