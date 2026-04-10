# nodepad

**A design experiment in spatial, AI-augmented thinking.**

[![Watch the intro](https://img.youtube.com/vi/nCLY7rHAjWE/maxresdefault.jpg)](https://www.youtube.com/watch?v=nCLY7rHAjWE)

*[Watch the intro →](https://www.youtube.com/watch?v=nCLY7rHAjWE)*

---

Most AI tools are built around a chat interface: you ask, it answers, you ask again. The interaction is sequential, conversational, and optimised for producing output. nodepad is built around a different premise: that thinking is spatial and associative, and that AI is most useful when it works quietly in the background rather than at the centre of attention.

You add notes. The AI classifies them, finds connections between them, surfaces what you haven't said yet, and occasionally synthesises an emergent insight from the whole canvas. You stay in control of the space. The AI earns its place by being genuinely useful rather than prominent.

---

## How it works

Notes are typed into the input bar and placed onto a spatial canvas. Each note is automatically classified into one of 14 types — claim, question, idea, task, entity, quote, reference, definition, opinion, reflection, narrative, comparison, thesis, general — and enriched with a short annotation that adds something the note doesn't already say.

Connections between notes are inferred from content. When you hover a connection indicator, unrelated notes dim. When enough notes accumulate, a synthesis emerges — a single sentence that bridges the tensions across the canvas. You can solidify it into a thesis note or dismiss it.

Three views: **tiling** (spatial BSP grid), **kanban** (grouped by type), **graph** (force-directed, centrality-radial).

---

## Setup

**Requirements**: a desktop browser, plus either an API key from a cloud provider or a local OpenAI-compatible LLM (for example [LM Studio](https://lmstudio.ai/) serving Chat Completions on localhost).

```bash
git clone https://github.com/mskayyali/nodepad.git
cd nodepad
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).

**Cloud providers (OpenRouter, OpenAI, Z.ai)**: menu (top-left) → Settings → pick the provider → paste your key. Keys live in the browser (`localStorage`) and are sent straight from the browser to that provider — they are not stored on a nodepad server.

**Local (LM Studio)**: choose **Local (LM Studio)** in Settings. No API key is required unless your local server expects one (optional). The default base URL is `http://127.0.0.1:1234/v1`; override **Base URL** if your server uses another port or path (still must be reachable from the machine running Next.js). Because many local servers do not allow browser `fetch` from the app origin, chat requests are sent to your Next.js app at `/api/ai-proxy`, which forwards them to **localhost only** (loopback hostnames are enforced).

**Enable web grounding** (optional): toggle **Web grounding** in Settings so the model can use retrieved web text when enriching truth-heavy note types.

| Provider | How grounding works |
|---|---|
| **OpenRouter** | `:online` variant of supported models (provider-native search). |
| **OpenAI** | Search-preview models when you pick a grounding-capable model. |
| **Local** | Your Next.js server calls **[SearXNG](https://docs.searxng.org/)** for JSON search results, then **[fetcher-mcp](https://github.com/jae-jae/fetcher-mcp)** (or any compatible MCP server) over **Streamable HTTP** using the `fetch_url` tool to pull excerpts from the top hits. The browser invokes `/api/local-ground`; configure **SearXNG base URL** and **Fetcher MCP URL** in Settings. If either URL is invalid, local grounding stays off. Empty fields fall back to defaults in `lib/local-grounding.ts` — replace those with your own endpoints (for example a VPN or LAN address if SearXNG and MCP run elsewhere). |

Your SearXNG instance must accept `format=json` on `/search` (the app requests JSON results). The MCP endpoint is the Streamable HTTP URL (often ending in `/mcp`), not the SSE transport.

---

## Providers & Models

Select provider and model from the sidebar Settings panel. Each provider remembers its key independently — switching providers and back restores your key.

### OpenRouter *(default)*
Access to all major models through a single key. Create a free account at [openrouter.ai](https://openrouter.ai) — use the free-tier models below with no credits, or add credits for GPT-4o, Claude, and Gemini.

| Model | Notes |
|---|---|
| `openai/gpt-4o` | Default. Strong annotation quality, web grounding. |
| `anthropic/claude-sonnet-4-5` | Strong reasoning, complex research. |
| `google/gemini-2.5-pro` | Long context, web grounding. |
| `deepseek/deepseek-chat` | Fast, cost-effective. |
| `mistralai/mistral-small-3.2` | Lightweight, fast. |

**Free tier** — no credits required, ~200 req/day limit, Nvidia-hosted, no web grounding:

| Model | Notes |
|---|---|
| `nvidia/nemotron-3-nano-30b-a3b:free` | Nemotron 30B — fast, reliable. |
| `nvidia/nemotron-3-super-120b-a12b:free` | Nemotron 120B MoE — higher quality, same speed. |

### OpenAI *(direct)*
Use your OpenAI API key directly. Web grounding via search-preview models.

| Model | Notes |
|---|---|
| `gpt-4o` | Strong structured output, web grounding. |
| `gpt-4o-mini` | Fast, capable, web grounding. |
| `gpt-4.1` | Latest GPT-4, improved instruction following. |
| `o4-mini` | Fast reasoning model. |

### Z.ai
GLM models from Zhipu AI. Get a key at [z.ai](https://z.ai/manage-apikey/apikey-list).

| Model | Notes |
|---|---|
| `glm-4.7` | Strong reasoning, 200K context. |
| `glm-5` | Z.ai flagship model. |
| `glm-5-turbo` | Fast, community-tested. |

### Local (LM Studio)
Use any OpenAI-compatible **Chat Completions** server on localhost. The UI preset targets LM Studio’s default port.

| Model | Notes |
|---|---|
| `google/gemma-4-26b-a4b` | Listed for local use; supports **Web grounding** when SearXNG + fetcher-mcp are configured (see Setup). |

---

## Keyboard shortcuts

| | |
|---|---|
| `Enter` | Add note |
| `⌘K` | Command palette (views, navigation, export) |
| `⌘Z` | Undo |
| `Escape` | Deselect / close panels |

Double-click any note to edit. Click the type label to reclassify manually.

---

## Data

Note data and settings live in your browser. No account or hosted database.

- With the **Local** provider or **Web grounding** (local), your Next.js dev server calls the URLs you configure: `/api/ai-proxy` forwards chat to **localhost only**; `/api/local-ground` contacts SearXNG and the fetcher MCP. No separate nodepad backend is involved.
- Notes are persisted to `localStorage` under `nodepad-projects`
- A silent rolling backup is written on every change to `nodepad-backup`
- Export to `.md` or `.nodepad` (versioned JSON) via `⌘K`
- Import `.nodepad` files via the sidebar

---

## Tech

Next.js · React 19 · TypeScript · Tailwind CSS v4 · D3.js · Framer Motion · [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (local web grounding → fetcher-mcp)

---

## Contributing

Pull requests welcome. Two PRs have already shaped the project:

- **PR #1** by [@matwate](https://github.com/matwate) — OpenAI provider support, multi-provider architecture
- **PR #2** by [@desireco](https://github.com/desireco) — Z.ai provider, robust JSON parsing for truncated responses

---

A design experiment by [Saleh Kayyali](http://mskayyali.com).

---

## License

[MIT](LICENSE)
