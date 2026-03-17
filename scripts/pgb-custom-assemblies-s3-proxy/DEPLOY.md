# Deploy: pgb-custom-assemblies-s3-proxy

## Prerequisites
- Node.js installed
- Cloudflare account (free tier works)

## First time setup
```bash
cd scripts/pgb-custom-assemblies-s3-proxy
npm install -g wrangler    # or use npx wrangler
wrangler login             # opens browser to authenticate
```

## Deploy
```bash
cd scripts/pgb-custom-assemblies-s3-proxy
wrangler deploy
```

Wrangler prints the live URL on success:
```
https://pgb-custom-assemblies-s3-proxy.<your-subdomain>.workers.dev
```

## Test it
```bash
# Should return the FASTA index file
curl -I "https://pgb-custom-assemblies-s3-proxy.<your-subdomain>.workers.dev/human-pangenomics/working/HPRC/HG00408/assemblies/release2/HG00408_pat_hprc_r2_v1.0.1.fa.gz.fai"

# Verify Range requests work (critical for streaming genomic files)
curl -H "Range: bytes=0-99" "https://pgb-custom-assemblies-s3-proxy.<your-subdomain>.workers.dev/human-pangenomics/working/HPRC/HG00408/assemblies/release2/HG00408_pat_hprc_r2_v1.0.1.fa.gz.fai"
```

## Useful commands
```bash
wrangler tail     # live-stream request logs
wrangler delete   # remove the worker
```
