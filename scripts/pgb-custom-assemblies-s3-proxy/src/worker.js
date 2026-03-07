// Cloudflare Worker: CORS proxy for public S3 buckets.
//
// Routes:
//   GET/HEAD /<bucket>/<path> → https://<bucket>.s3.us-west-2.amazonaws.com/<path>
//
// Adds CORS headers and passes Range requests through for streaming
// large genomic files (FASTA, GFF3, etc.).
//
// Deploy:
//   cd scripts/pgb-custom-assemblies-s3-proxy
//   npx wrangler deploy
//
// Usage in genome JSON:
//   "fastaURL": "https://pgb-custom-assemblies-s3-proxy.<your-subdomain>.workers.dev/human-pangenomics/working/HPRC/.../file.fa.gz"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-None-Match',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.slice(1); // remove leading /

    if (!path) {
      return new Response('Usage: /<bucket>/<path>\n', { status: 400, headers: CORS_HEADERS });
    }

    const slashIndex = path.indexOf('/');
    if (slashIndex === -1) {
      return new Response('Expected /<bucket>/<path>\n', { status: 400, headers: CORS_HEADERS });
    }

    const bucket = path.slice(0, slashIndex);
    const key = path.slice(slashIndex + 1);
    const s3Url = `https://${bucket}.s3.us-west-2.amazonaws.com/${key}`;

    // Build upstream request, forwarding Range header
    const headers = new Headers();
    const range = request.headers.get('Range');
    if (range) {
      headers.set('Range', range);
    }

    const s3Response = await fetch(s3Url, {
      method: request.method,
      headers,
    });

    // Build response with CORS headers
    const responseHeaders = new Headers(CORS_HEADERS);
    for (const header of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      const value = s3Response.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    }

    return new Response(s3Response.body, {
      status: s3Response.status,
      headers: responseHeaders,
    });
  },
};
