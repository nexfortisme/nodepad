/** Defaults match a typical Tailscale + self-hosted SearXNG + fetcher-mcp setup. */
export const DEFAULT_LOCAL_SEARX_URL = "http://100.117.31.96:9999"
export const DEFAULT_LOCAL_FETCHER_MCP_URL = "http://100.117.31.96:3000/mcp"

export function normalizeServiceBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "")
}

/** Returns origin + optional path, or null if invalid. Adds http:// when no scheme. */
export function parseHttpServiceBase(raw: string): string | null {
  const t = normalizeServiceBaseUrl(raw)
  if (!t) return null
  const withProto = /^https?:\/\//i.test(t) ? t : `http://${t}`
  try {
    const u = new URL(withProto)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    const path = u.pathname.replace(/\/+$/, "")
    return `${u.protocol}//${u.host}${path}`
  } catch {
    return null
  }
}

export function searxSearchUrl(baseUrl: string, query: string): string {
  const base = normalizeServiceBaseUrl(baseUrl)
  const u = new URL("/search", `${base}/`)
  u.searchParams.set("q", query)
  u.searchParams.set("format", "json")
  return u.toString()
}
