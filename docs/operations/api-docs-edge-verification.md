# API Documentation Edge Verification

Use this procedure after deploying or upgrading any supported production
topology. Run it against the final public HTTPS origin, not an internal
application or proxy address.

## Header Ownership

The application defines the response-header contract for every path below
`/api-docs/`. The bundled nginx configuration is the reference implementation;
nginx is not required at an external production edge.

The component that serves API documentation files to the public owns the final
headers. An external load balancer, reverse proxy or CDN must configure values
equivalent to
`containers/production/nginx/templates/api-docs-security-headers.conf`. An edge
that only forwards requests to the bundled nginx must preserve nginx's values.

Do not append another copy of a header supplied by the selected owner. Strip
or replace upstream values so each response contains exactly one required
value. This contract applies to successful files, redirects, errors and future
documentation below `/api-docs/`. A missing, duplicate or conflicting header
fails deployment or upgrade verification.

## Run the Verification

The procedure requires Bash, `awk`, `curl` and `mktemp`. Set
`API_DOCS_ORIGIN` to the final public HTTPS origin and run the block:

```bash
set -euo pipefail

API_DOCS_ORIGIN="${API_DOCS_ORIGIN:-https://kravhantering.example.internal}"
API_DOCS_TMP="$(mktemp -d)"
trap 'rm -rf "$API_DOCS_TMP"' EXIT

API_DOCS_CSP="default-src 'none'; script-src 'self'; "
API_DOCS_CSP+="script-src-attr 'none'; style-src 'self'; "
API_DOCS_CSP+="style-src-attr 'none'; img-src 'self' data:; "
API_DOCS_CSP+="font-src 'self'; connect-src 'self'; object-src 'none'; "
API_DOCS_CSP+="frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
API_DOCS_PERMISSIONS="accelerometer=(), autoplay=(), camera=(), "
API_DOCS_PERMISSIONS+="cross-origin-isolated=(), display-capture=(), "
API_DOCS_PERMISSIONS+="encrypted-media=(), fullscreen=(), geolocation=(), "
API_DOCS_PERMISSIONS+="gyroscope=(), idle-detection=(), magnetometer=(), "
API_DOCS_PERMISSIONS+="microphone=(), midi=(), payment=(), "
API_DOCS_PERMISSIONS+="picture-in-picture=(), "
API_DOCS_PERMISSIONS+="publickey-credentials-get=(), screen-wake-lock=(), "
API_DOCS_PERMISSIONS+="serial=(), usb=(), web-share=(), "
API_DOCS_PERMISSIONS+="xr-spatial-tracking=()"

declare -A EXPECTED_API_DOCS_HEADERS=(
  [content-security-policy]="$API_DOCS_CSP"
  [strict-transport-security]="max-age=63072000; includeSubDomains; preload"
  [x-content-type-options]="nosniff"
  [x-frame-options]="DENY"
  [referrer-policy]="strict-origin-when-cross-origin"
  [permissions-policy]="$API_DOCS_PERMISSIONS"
  [cross-origin-opener-policy]="same-origin"
  [cross-origin-embedder-policy]="credentialless"
  [cross-origin-resource-policy]="same-origin"
)

check_api_docs_response() {
  local path="$1"
  local expected_status="$2"
  local output_name="$3"
  local header_file="$API_DOCS_TMP/$output_name.headers"
  local actual_status
  actual_status="$(
    curl --silent --show-error --max-redirs 0 \
      --dump-header "$header_file" --output /dev/null \
      --write-out '%{http_code}' "$API_DOCS_ORIGIN$path"
  )"
  test "$actual_status" = "$expected_status"

  local name expected actual count
  for name in "${!EXPECTED_API_DOCS_HEADERS[@]}"; do
    expected="${EXPECTED_API_DOCS_HEADERS[$name]}"
    count="$(
      awk -v target="$name" \
        'tolower($1) == target ":" { count++ }
         END { print count + 0 }' "$header_file"
    )"
    actual="$(
      awk -v target="$name" \
        'tolower($1) == target ":" {
           sub(/^[^:]*:[[:space:]]*/, "")
           sub(/\r$/, "")
           print
         }' "$header_file"
    )"
    test "$count" -eq 1
    test "$actual" = "$expected"
  done
}

check_api_docs_response \
  /api-docs/hsa-person-lookup 308 redirect
check_api_docs_response \
  /api-docs/hsa-person-lookup/index.html 200 success
check_api_docs_response \
  /api-docs/hsa-person-lookup/swagger-initializer.js 200 initializer
check_api_docs_response \
  /api-docs/hsa-person-lookup/hsa-person-lookup.yaml 200 specification
check_api_docs_response \
  /api-docs/edge-verification-not-found 404 not-found

redirect_location="$(
  awk 'BEGIN { IGNORECASE=1 }
       $1 == "location:" {
         sub(/^[^:]*:[[:space:]]*/, "")
         sub(/\r$/, "")
         print
       }' "$API_DOCS_TMP/redirect.headers"
)"
case "$redirect_location" in
  /api-docs/hsa-person-lookup/ | \
    "$API_DOCS_ORIGIN/api-docs/hsa-person-lookup/") ;;
  *) exit 1 ;;
esac
```

A successful run exits without output. Any unexpected status, missing header,
duplicate header or conflicting value exits nonzero.
