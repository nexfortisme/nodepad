import { NextRequest, NextResponse } from "next/server"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { parseHttpServiceBase, searxSearchUrl } from "@/lib/local-grounding"

export const runtime = "nodejs"
/** Playwright fetches can exceed the default serverless limit on slow pages. */
export const maxDuration = 120

const MAX_QUERY_LEN = 400
const DEFAULT_MAX_RESULTS = 8
const DEFAULT_FETCH_URLS = 5
const FETCH_TIMEOUT_MS = 45_000
const SEARCH_TIMEOUT_MS = 20_000

type SearxResult = { title?: string; url?: string; content?: string }

function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u
  } catch {
    return null
  }
}

function extractToolText(result: {
  content?: Array<{ type: string; text?: string }>
  isError?: boolean
}): string {
  if (result.isError) return ""
  const parts = (result.content ?? [])
    .filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
    .map(c => c.text)
  return parts.join("\n").trim()
}

async function fetchWithSearx(baseUrl: string, query: string): Promise<SearxResult[]> {
  const url = searxSearchUrl(baseUrl, query)
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), SEARCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: "application/json", "User-Agent": "nodepad-local-ground/1.0" },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: SearxResult[] }
    return Array.isArray(data.results) ? data.results : []
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

async function fetchUrlViaMcp(mcpEndpoint: string, pageUrl: string): Promise<string> {
  const endpoint = parseHttpUrl(mcpEndpoint)
  if (!endpoint) return ""

  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  })
  const client = new Client({ name: "nodepad", version: "0.1.0" })

  try {
    await client.connect(transport)
    const result = await client.callTool({
      name: "fetch_url",
      arguments: {
        url: pageUrl,
        timeout: 30_000,
        extractContent: true,
        maxLength: 24_000,
        returnHtml: false,
      },
    })
    return extractToolText(result as { content?: Array<{ type: string; text?: string }>; isError?: boolean })
  } catch {
    return ""
  } finally {
    try {
      await transport.terminateSession()
    } catch {
      /* ignore */
    }
    try {
      await transport.close()
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const query = String(body.query ?? "").trim().slice(0, MAX_QUERY_LEN)
    const searxRaw = String(body.searxUrl ?? "").trim()
    const mcpRaw = String(body.fetcherMcpUrl ?? "").trim()
    const maxResults = Math.min(12, Math.max(1, Number(body.maxSearchResults) || DEFAULT_MAX_RESULTS))
    const maxFetch = Math.min(5, Math.max(0, Number(body.maxFetchUrls) || DEFAULT_FETCH_URLS))

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 })
    }

    const searxEffective = parseHttpServiceBase(searxRaw)
    const mcpUrl = mcpRaw.trim()
    if (!searxEffective) {
      return NextResponse.json({ error: "Invalid SearXNG base URL" }, { status: 400 })
    }

    if (!parseHttpUrl(mcpUrl)) {
      return NextResponse.json({ error: "Invalid fetcher MCP URL" }, { status: 400 })
    }

    const results = await fetchWithSearx(searxEffective, query)
    const trimmed = results.slice(0, maxResults).filter(r => r.url && /^https?:\/\//i.test(r.url))

    const urlsToFetch = trimmed.slice(0, maxFetch).map(r => r.url as string)
    const fetched: { url: string; title: string; excerpt: string }[] = []

    for (const u of urlsToFetch) {
      const text = await fetchUrlViaMcp(mcpUrl, u)
      if (text) {
        fetched.push({
          url: u,
          title: trimmed.find(t => t.url === u)?.title?.slice(0, 200) || u,
          excerpt: text.slice(0, 24_000),
        })
      }
    }

    return NextResponse.json({
      query,
      searchResults: trimmed.map(r => ({
        title: r.title || "",
        url: r.url || "",
        snippet: (r.content || "").slice(0, 1_000),
      })),
      fetchedPages: fetched,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "local-ground failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
