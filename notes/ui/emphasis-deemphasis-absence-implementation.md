
**Handling Absence in the Shader Architecture**

The current shader is designed around two states — emphasis and de-emphasis — and that architecture is worth preserving. Absence requires a different treatment, but it doesn't need to live inside the shader.

The approach is a **pre-processing step at state entry**. When the app transitions into a mode that can introduce absence — the PCLAI chart being the primary case — a subset of absent nodes is computed once and cached at that moment. Absence is determined upstream, before any shader work begins.

From that point forward, emphasis and de-emphasis operate exactly as they do today, but against an **already-filtered working set** from which absent nodes have been removed. The shader never needs to reason about absence; it simply never sees those nodes.

This keeps the shader architecture clean and bounded, and isolates the absence logic to a single well-defined transition point rather than distributing it across the rendering pipeline.

---

The core idea — **compute once at state entry, then exclude** — is doing a lot of work here. It's a clean separation of concerns: absence is a data-space problem, handled in data-space; emphasis and de-emphasis are rendering problems, handled in the renderer.
