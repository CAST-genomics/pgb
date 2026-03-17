# Supported Custom Assemblies

HPRC Release 2 assemblies currently available in PGB. Each sample has two haplotypes with genome sequence (FASTA) and gene annotations (GFF3).

| Sample | Haplotype 1 | Haplotype 2 |
|--------|-------------|-------------|
| HG00097 | HG00097#1 — HG00097_hap1_hprc_r2_v1.0.1 | HG00097#2 — HG00097_hap2_hprc_r2_v1.0.1 |
| HG00099 | HG00099#1 — HG00099_hap1_hprc_r2_v1.0.1 | HG00099#2 — HG00099_hap2_hprc_r2_v1.0.1 |
| HG00126 | HG00126#1 — HG00126_hap1_hprc_r2_v1.0.1 | HG00126#2 — HG00126_hap2_hprc_r2_v1.0.1 |
| HG00128 | HG00128#1 — HG00128_hap1_hprc_r2_v1.0.1 | HG00128#2 — HG00128_hap2_hprc_r2_v1.0.1 |
| HG00133 | HG00133#1 — HG00133_hap1_hprc_r2_v1.0.1 | HG00133#2 — HG00133_hap2_hprc_r2_v1.0.1 |
| HG00140 | HG00140#1 — HG00140_hap1_hprc_r2_v1.0.1 | HG00140#2 — HG00140_hap2_hprc_r2_v1.0.1 |

**6 samples, 12 assemblies total** (subset of 462 available in HPRC Release 2)

## Data Sources

- **Genome sequence**: HPRC S3 bucket, proxied through Cloudflare Workers
- **Gene annotations**: Sorted, tabix-indexed GFF3 hosted on GitHub ([turner/hprc-annotations](https://github.com/turner/hprc-annotations))
- **Annotation source**: CAT gene annotations v1.1 ([hprc_intermediate_assembly](https://github.com/human-pangenomics/hprc_intermediate_assembly))
