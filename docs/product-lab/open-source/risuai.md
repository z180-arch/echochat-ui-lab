# RisuAI

- **Repository:** https://github.com/kwaroran/RisuAI  
- **License:** GPL-3.0  
- **What it solves:** User-friendlier character roleplay client with serious long-context memory systems.  
- **Interesting mechanism:** **SupaMemory** (summarize older history) vs **HypaMemory** (embedding retrieve) vs HypaV2/V3 (hybrid); lorebooks; prompt ordering slots.  
- **Interesting UX:** Still technical (presets, memory modals); better than raw ST for some users, not Morning Mint quiet.  
- **Interesting architecture:** Svelte/Tauri-era stack; memory as first-class orchestrator stage before inference.  
- **What EchoChat could learn:** Dual mechanism class (compress vs retrieve); memory as a turn-pipeline stage; token budget awareness.  
- **What EchoChat should NOT copy:** Vector embedding requirement; Hypa management UI; GPL code; leaving quiet users to tune memory algorithms.  
- **Continuity question:** Strong *storage/retrieve* story; user-visible continuity still depends on power configuration — borrow pipeline ideas, not the control room.
