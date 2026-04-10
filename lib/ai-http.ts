"use client"

import { getBaseUrl, getProviderHeaders, type AIConfig } from "@/lib/ai-settings"

function isLocalhostApiBase(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl)
    const host = u.hostname.toLowerCase()
    return host === "127.0.0.1" || host === "localhost" || host === "::1"
  } catch {
    return false
  }
}

function payloadForProvider(config: AIConfig, payload: Record<string, unknown>): Record<string, unknown> {
  // LM Studio / llama.cpp often return 400 on OpenAI-only fields like response_format.
  if (config.provider === "local") {
    const rest = { ...payload }
    delete rest.response_format
    return rest
  }
  return payload
}

export async function postChatCompletions(
  config: AIConfig,
  payload: Record<string, unknown>,
): Promise<Response> {
  const baseUrl = getBaseUrl(config)
  const headers = getProviderHeaders(config)
  const body = payloadForProvider(config, payload)

  // Local providers often fail browser fetch due to CORS/mixed-content.
  // Route through same-origin API and let the server call localhost directly.
  if (config.provider === "local" || isLocalhostApiBase(baseUrl)) {
    return fetch("/api/ai-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, headers, payload: body }),
    })
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}
