/** LM Studio and other OpenAI-compatible servers may return `message.content` as a string, null, or a content-parts array. */
export function extractAssistantTextFromChatResponse(data: Record<string, unknown>): string | undefined {
  const choices = data.choices as unknown[] | undefined
  const first = choices?.[0]
  if (!first || typeof first !== "object") return undefined
  const ch = first as Record<string, unknown>
  const message = ch.message
  if (!message || typeof message !== "object") return undefined
  const msg = message as Record<string, unknown>
  const raw = msg.content

  if (typeof raw === "string") {
    return raw.trim().length > 0 ? raw : undefined
  }

  if (Array.isArray(raw)) {
    const out: string[] = []
    for (const part of raw) {
      if (!part || typeof part !== "object") continue
      const p = part as Record<string, unknown>
      if (p.type === "text" && typeof p.text === "string") out.push(p.text)
      if (p.type === "output_text" && typeof p.text === "string") out.push(p.text)
    }
    const joined = out.join("").trim()
    return joined.length > 0 ? joined : undefined
  }

  if (typeof msg.reasoning_content === "string" && msg.reasoning_content.trim()) {
    return msg.reasoning_content.trim()
  }

  return undefined
}

export function chatFinishReason(data: Record<string, unknown>): string | undefined {
  const choices = data.choices as Array<{ finish_reason?: string }> | undefined
  const r = choices?.[0]?.finish_reason
  return typeof r === "string" ? r : undefined
}
