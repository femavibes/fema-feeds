#!/usr/bin/env bash
# Provision a stable public feed URL by pointing a subdomain A record at this machine's IP.
#
# Modes:
#   1) Control plane (recommended for end users) — fema.monster updates DNS for them:
#        CFB_CONTROL_PLANE_URL=https://feeds.fema.monster
#        CFB_DEPLOYMENT_TOKEN=<from signup>
#
#   2) Direct Cloudflare (operator / self-host with zone API token):
#        CLOUDFLARE_API_TOKEN=...
#        CLOUDFLARE_ZONE_ID=...
#        CFB_DNS_BASE=feeds.fema.monster   # record will be ${SLUG}.feeds → abc.feeds.fema.monster
#
# Usage:
#   ./scripts/provision-feed-url.sh
#   CFB_DEPLOYMENT_SLUG=myfeed ./scripts/provision-feed-url.sh
#
# Writes/overrides FEEDGEN_PUBLIC_URL in .env when CFB_WRITE_ENV=1 (default).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${CFB_ENV_FILE:-$ROOT/.env}"
SLUG="${CFB_DEPLOYMENT_SLUG:-}"
DNS_BASE="${CFB_DNS_BASE:-feeds.fema.monster}"
WRITE_ENV="${CFB_WRITE_ENV:-1}"
PROXIED="${CFB_DNS_PROXIED:-false}" # true = Cloudflare orange-cloud (edge HTTPS, traffic via CF not your fema box)

detect_public_ip() {
  local ip=""
  for url in \
    "https://api.ipify.org" \
    "https://ifconfig.me/ip" \
    "https://icanhazip.com"; do
    ip="$(curl -fsS --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]')" || continue
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "$ip"
      return 0
    fi
  done
  echo "Could not detect public IPv4 (tried ipify, ifconfig.me, icanhazip)" >&2
  return 1
}

random_slug() {
  # 8 hex chars — enough for hobby deployments
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 4
  else
    date +%s | sha256sum | head -c 8
  fi
}

hostname_from_slug() {
  local slug="$1"
  local base="$2"
  # abc + feeds.fema.monster → abc.feeds.fema.monster
  local first="${base%%.*}"
  local rest="${base#*.}"
  if [[ "$base" == *.* && "$first" != "$base" ]]; then
    echo "${slug}.${first}.${rest}"
  else
    echo "${slug}.${base}"
  fi
}

dns_record_name() {
  local slug="$1"
  local base="$2"
  local first="${base%%.*}"
  local rest="${base#*.}"
  if [[ "$base" == *.* && "$first" != "$base" ]]; then
    echo "${slug}.${first}"
  else
    echo "${slug}"
  fi
}

register_control_plane() {
  local ip="$1"
  local slug="$2"
  local url="${CFB_CONTROL_PLANE_URL%/}/api/cfb/deployments/register"
  local payload
  payload="$(printf '{"token":"%s","slug":"%s","publicIp":"%s","proxied":%s}' \
    "$CFB_DEPLOYMENT_TOKEN" "$slug" "$ip" "$PROXIED")"
  curl -fsS --max-time 30 -X POST "$url" \
    -H 'content-type: application/json' \
    -d "$payload"
}

cloudflare_upsert_a() {
  local name="$1"
  local ip="$2"
  local zone="$CLOUDFLARE_ZONE_ID"
  local token="$CLOUDFLARE_API_TOKEN"
  local proxied="$PROXIED"

  local list
  list="$(curl -fsS -G "https://api.cloudflare.com/client/v4/zones/${zone}/dns_records" \
    -H "Authorization: Bearer ${token}" \
    --data-urlencode "type=A" \
    --data-urlencode "name=${name}")"

  local record_id
  record_id="$(echo "$list" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)"

  local body
  body="$(printf '{"type":"A","name":"%s","content":"%s","ttl":120,"proxied":%s}' "$name" "$ip" "$proxied")"

  if [[ -n "$record_id" ]]; then
    curl -fsS -X PUT "https://api.cloudflare.com/client/v4/zones/${zone}/dns_records/${record_id}" \
      -H "Authorization: Bearer ${token}" \
      -H 'content-type: application/json' \
      -d "$body" >/dev/null
    echo "Updated A record ${name} → ${ip}"
  else
    curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/${zone}/dns_records" \
      -H "Authorization: Bearer ${token}" \
      -H 'content-type: application/json' \
      -d "$body" >/dev/null
    echo "Created A record ${name} → ${ip}"
  fi
}

patch_env() {
  local public_url="$1"
  if [[ "$WRITE_ENV" != "1" ]]; then
    return 0
  fi
  touch "$ENV_FILE"
  for key in FEEDGEN_PUBLIC_URL OAUTH_PUBLIC_URL; do
    if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      if [[ "$(uname)" == Darwin* ]]; then
        sed -i '' "s|^${key}=.*|${key}=${public_url}|" "$ENV_FILE"
      else
        sed -i "s|^${key}=.*|${key}=${public_url}|" "$ENV_FILE"
      fi
    else
      printf '%s=%s\n' "$key" "$public_url" >>"$ENV_FILE"
    fi
  done
  if grep -q '^CFB_DEPLOYMENT_SLUG=' "$ENV_FILE" 2>/dev/null; then
    if [[ "$(uname)" == Darwin* ]]; then
      sed -i '' "s|^CFB_DEPLOYMENT_SLUG=.*|CFB_DEPLOYMENT_SLUG=${SLUG}|" "$ENV_FILE"
    else
      sed -i "s|^CFB_DEPLOYMENT_SLUG=.*|CFB_DEPLOYMENT_SLUG=${SLUG}|" "$ENV_FILE"
    fi
  else
    printf 'CFB_DEPLOYMENT_SLUG=%s\n' "$SLUG" >>"$ENV_FILE"
  fi
  echo "Wrote OAUTH_PUBLIC_URL, FEEDGEN_PUBLIC_URL, CFB_DEPLOYMENT_SLUG to ${ENV_FILE}"
}

main() {
  if [[ -z "$SLUG" ]]; then
    SLUG="$(random_slug)"
    echo "Generated deployment slug: ${SLUG}"
  fi

  local ip
  ip="$(detect_public_ip)"
  echo "Detected public IP: ${ip}"

  local host
  host="$(hostname_from_slug "$SLUG" "$DNS_BASE")"
  local record_name
  record_name="$(dns_record_name "$SLUG" "$DNS_BASE")"

  if [[ -n "${CFB_CONTROL_PLANE_URL:-}" && -n "${CFB_DEPLOYMENT_TOKEN:-}" ]]; then
    echo "Registering with control plane…"
    local res
    res="$(register_control_plane "$ip" "$SLUG")"
    echo "$res"
    host="$(echo "$res" | sed -n 's/.*"publicHost":"\([^"]*\)".*/\1/p')"
    if [[ -z "$host" ]]; then
      host="$(hostname_from_slug "$SLUG" "$DNS_BASE")"
    fi
  elif [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    echo "Updating Cloudflare DNS (${record_name} in zone ${CLOUDFLARE_ZONE_ID})…"
    cloudflare_upsert_a "$record_name" "$ip"
  else
    echo "No DNS credentials configured." >&2
    echo "Set either:" >&2
    echo "  CFB_CONTROL_PLANE_URL + CFB_DEPLOYMENT_TOKEN" >&2
    echo "  or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID" >&2
    exit 1
  fi

  local public_url="https://${host}"
  patch_env "$public_url"

  echo ""
  echo "Public feed URL: ${public_url}"
  echo "Deployment slug:   ${SLUG}"
  echo ""
  echo "Next steps:"
  echo "  1) Open port 443 on this VPS (and 80 for ACME if using local Caddy)."
  echo "  2) Or set CFB_DNS_PROXIED=true for Cloudflare edge HTTPS (orange cloud)."
  echo "  3) Paste your Bluesky Generator DID in Settings → Feed publishing."
  echo "  4) Restart API if it was already running."
}

main "$@"
