# S3 BigBed Hosting Test (2026-04-02)

Tested the full pipeline for hosting bigbed annotation files on a personal S3 bucket (`pgb-bigbed`) using a 12-assembly subset.

## Steps performed
1. Downloaded 12 bigbed files (~15 MB each, ~180 MB total) from GitHub (`turner/hprc-annotations`)
2. Created S3 bucket `pgb-bigbed` in us-east-1
3. Configured bucket: public read access, CORS (GET/HEAD, expose Content-Length/Content-Range)
4. Uploaded all 12 files
5. Verified public access and HTTP Range requests (206 Partial Content)

## Config file
`custom-assemblies-12-s3-cors-enabled-bigbed-s3.json` — identical to `custom-assemblies-12-s3-cors-enabled-bigbed.json` except track URLs point to `https://pgb-bigbed.s3.amazonaws.com/<file>.bb` instead of GitHub raw content.

## Purpose
Debug the end-to-end workflow before scaling to ~400 bigbed files. The UCSC team controlling the HPRC S3 bucket is slow to respond, so self-hosting on a personal AWS account is the interim solution.

## Cost estimate
400 files at ~15 MB each = ~6 GB. S3 storage: ~$0.14/month. Bandwidth negligible for research use.
