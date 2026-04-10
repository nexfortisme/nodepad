import { NextRequest, NextResponse } from "next/server"

function isAllowedLocalBase(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const h = u.hostname.toLowerCase()
    return h === "127.0.0.1" || h === "localhost" || h === "::1"
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, headers, payload } = await req.json()
    const targetBase = String(baseUrl ?? "")
    if (!isAllowedLocalBase(targetBase)) {
      return NextResponse.json({ error: { message: "Blocked base URL" } }, { status: 400 })
    }

    const upstream = await fetch(`${targetBase}/chat/completions`, {
      method: "POST",
      headers: (headers ?? {}) as HeadersInit,
      body: JSON.stringify(payload ?? {}),
    })

    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    })
  } catch {
    return NextResponse.json(
      { error: { message: "Local AI proxy request failed" } },
      { status: 500 },
    )
  }
}
