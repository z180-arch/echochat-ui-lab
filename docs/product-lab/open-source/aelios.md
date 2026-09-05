# Aelios / layered companion memory proxies

- **Repositories (related):** https://github.com/wusaki0723/Aelios (and forks such as Aelios_mem)  
- **License:** AGPL-3.0 (project README)  
- **What it solves:** Cross-client long-term memory proxy (often Cloudflare Workers + D1 + Vectorize).  
- **Interesting mechanism:** Multi-layer memory; scheduled extract/consolidate writes; recall before chat completions.  
- **Interesting UX:** Curation panels / ops-facing; not Quiet Companion primary.  
- **Interesting architecture:** Separate memory service in front of chat clients.  
- **What EchoChat could learn:** Write scheduling (capture vs later consolidate); recall as a gate before generation.  
- **What EchoChat should NOT copy:** Required cloud Workers/Vectorize; AGPL vendoring; turning EchoChat into a memory proxy product.  
- **Continuity question:** Improves *recall infrastructure*; does not by itself define relationship tone or quiet UX.
