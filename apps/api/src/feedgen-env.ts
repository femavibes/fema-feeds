export function feedgenEnvFromProcess() {
  return {
    generatorDid: process.env.FEEDGEN_DID,
    publicBaseUrl: process.env.FEEDGEN_PUBLIC_URL,
    privacyPolicyUrl: process.env.FEEDGEN_PRIVACY_URL,
    termsOfServiceUrl: process.env.FEEDGEN_TOS_URL,
    apiPort: process.env.API_PORT,
    cloudflareTunnelToken: process.env.CLOUDFLARE_TUNNEL_TOKEN,
  }
}
