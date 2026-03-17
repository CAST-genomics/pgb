### PangenomeService. Usage examples: getAssemblySubgraph(...)

```js
// Basic: nodes + directed edges (keys like "edge:a:b")
const { nodes, edges } = svc.getAssemblySubgraph("GRCh38#0#chr1");

// With undirected adjacency (for component/UI overlays)
const sub1 = svc.getAssemblySubgraph("GRCh38#0#chr1", { includeAdj: true });
// sub1.adj["2912+"] -> ["2913+", "294049+", ...]

// With directed adjacency (for flow diagnostics)
const sub2 = svc.getAssemblySubgraph("GRCh38#0#chr1", { includeDirectedAdj: true });
// sub2.out["2912+"] -> ["2913+", "294049+"]
// sub2.in["2913+"]  -> ["2912+", "..."]
```

* **Nodes** are returned as canonical IDs already used everywhere else in the service.
* **Edges** are **directed** and match the exact keys your app uses: `edge:<from>:<to>`.
* Output is **sorted** for stable diffs and reproducible UI.
