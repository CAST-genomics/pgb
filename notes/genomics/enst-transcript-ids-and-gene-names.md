# ENST Transcript IDs and Gene Names

**Status:** Pending. Tracked in [issue #177](https://github.com/CAST-genomics/pgb/issues/177) (part of [#171](https://github.com/CAST-genomics/pgb/issues/171)). Blocked: the collaborator is still choosing the tool or source for the ENST → gene-name translation. Update this note when the work lands.

A plain-language explainer for issue #177, written for a developer who isn't a biologist.

## What the issue asks for

The gene annotation track for HPRC **assemblies** labels each feature with an ENST transcript ID, such as `ENST00000380152`. The **hg38** track shows gene names, such as *BRCA2*. Issue #177 asks for the assembly track to show gene names too, so it reads like the hg38 track.

In the collaborator's words (#171): *"The assembly gene annotation currently only has the ENST codes. Ideally we'd like to translate them into gene names to make them easier to interpret."*

## Gene vs. transcript

- **A gene** is a stretch of DNA that holds instructions for making something, usually a protein. Genes have short names biologists know: *BRCA2*, *TP53*, *HLA-A*. Think of a gene as a recipe in a cookbook.
- **A transcript** is one particular reading of that recipe. Cells can include or skip different sections (exons) of the same gene, so one gene can produce several versions, the way one recipe can have a "with nuts" and a "without nuts" version. Each version is a transcript.
- **An ENST ID** is the catalog number the Ensembl database gives a transcript. It's precise and machine-friendly, but you can't tell which gene it belongs to just by reading it. It's like a book's ISBN versus its title.

The relationship is one-to-many: one gene name can have many ENST IDs. Ensembl also numbers genes, with IDs that start `ENSG`. The usual chain is **ENST (transcript) → ENSG (gene) → gene symbol**.

For background on the annotation databases behind these IDs (Ensembl/GENCODE vs. RefSeq), see [refseq-and-gencode.md](./refseq-and-gencode.md).

## Provisional acceptance criteria (from #177)

1. **Assembly annotation features show a gene name, and the ENST ID is still reachable**, for example in a tooltip. The ID is still the unambiguous identifier. Several transcripts share one gene name, so the name alone doesn't say which version a feature is.
2. **The translation source is documented.** There's no built-in conversion, only lookup tables published by reference databases (Ensembl, GENCODE, HGNC). These tables change between releases, and the browser paper will need to say which source and version was used. That choice is what the collaborator is still deciding.

## Things to consider when it unblocks

- **Check the GFF3 files first.** The assembly tracks come from the HPRC CAT annotation GFF3 files listed in the assembly registry (see [custom-assemblies/](./custom-assemblies/)). GFF3 features often carry a `gene_name`, `Name` or `Parent` attribute next to the transcript ID. If the name is already there, the fix may be choosing which attribute to display, with no outside lookup at all. *Not yet verified: no CAT GFF3 file is checked into the repo.*
- **Possible translation sources**, if the files don't carry names:
  - a GENCODE/Ensembl annotation file for the matching release, whose transcript records include the gene name, used as a static lookup table;
  - the Ensembl REST API (`rest.ensembl.org`), looking up a transcript ID to find its parent gene;
  - the services listed in [gene-name-lookup-services.md](./gene-name-lookup-services.md). That note covers the opposite direction (gene symbol → locus), but several of the same services (Ensembl, MyGene.info, HGNC) also handle ID → symbol.

  A static table built once and shipped with the data is easier to cite in a paper and works offline. A live API is easier to keep current but adds a network dependency to the track.
- **Version suffixes.** ENST IDs often carry a version, as in `ENST00000380152.8`. A lookup table may key on the bare ID or on the versioned one, so matching needs to handle both.
- **Repeated labels.** Once features show gene names, several overlapping transcripts of one gene will all read *BRCA2*. This interacts with the other #171 annotation request: render overlapping hg38 genes on two lines, the way IGV does. It may make sense to design the two together.
- **The bidirectional mapping.** Renaming labels doesn't change coordinates, so the 1D track ↔ 3D graph mapping (CLAUDE.md) shouldn't be affected. Check that hover feedback on the track still shows the ID somewhere.
