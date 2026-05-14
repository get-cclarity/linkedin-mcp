# CClarity LinkedIn MCP

[![smithery badge](https://smithery.ai/badge/cclarity/linkedin-mcp)](https://smithery.ai/servers/cclarity/linkedin-mcp)
[![npm @cclarity-packages/cli](https://img.shields.io/npm/v/%40cclarity-packages%2Fcli?label=%40cclarity-packages%2Fcli&color=blue)](https://www.npmjs.com/package/@cclarity-packages/cli)
[![npm @cclarity-packages/mcp](https://img.shields.io/npm/v/%40cclarity-packages%2Fmcp?label=%40cclarity-packages%2Fmcp&color=blue)](https://www.npmjs.com/package/@cclarity-packages/mcp)

Connect your AI (Claude, ChatGPT, Cursor, or any MCP client) to your LinkedIn data via **CClarity**.

- **Remote MCP API:** `https://api.cclarity.io/mcp` (Streamable HTTP, OAuth-gated)
- **Docs:** [docs.cclarity.io/mcp](https://docs.cclarity.io/mcp)
- **Dashboard:** [app.cclarity.io](https://app.cclarity.io)

---

## Quick start (30 seconds)

```bash
npx -y @cclarity-packages/cli@latest init
```

This writes `.mcp.json` to your project and sets up `@cclarity-packages/mcp` as the stdio proxy. Restart your IDE and say **"Login me into CClarity"**.

### What you can ask after login

```
"Login me into CClarity"
"Who engaged with my last 5 LinkedIn posts?"
"List my lead profiles"
"Show ICP-matched engagers from this week"
```

---

## How it works

```
Your IDE (Claude / Cursor)
  └─▶ @cclarity-packages/mcp  (stdio proxy, this repo)
        └─▶ browser OAuth login → https://api.cclarity.io/mcp
              └─▶ LinkedIn data, who-engaged, ICP scoring
```

| Package | Role |
|--------|------|
| [`@cclarity-packages/cli`](packages/cli) | `init` — writes IDE config once |
| [`@cclarity-packages/mcp`](packages/mcp) | Stdio MCP process + browser login |

---

## Requirements

- **Node.js 18+**
- A free [CClarity account](https://app.cclarity.io) — the MCP gates on active paid subscription + Unipile (LinkedIn) connected
- Paid plan for full tool access (gates return `PAYMENT_REQUIRED` / `UNIPILE_REQUIRED` otherwise)

---

## Server config (manual)

If you prefer manual configuration instead of `init`:

**Claude Code (`.mcp.json`):**

```json
{
  "mcpServers": {
    "cclarity": {
      "command": "npx",
      "args": ["-y", "@cclarity-packages/mcp", "cclarity-mcp"],
      "env": { "CCLARITY_MCP_URL": "https://api.cclarity.io" }
    }
  }
}
```

**Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "cclarity": {
      "command": "npx",
      "args": ["-y", "@cclarity-packages/mcp", "cclarity-mcp"],
      "env": { "CCLARITY_MCP_URL": "https://api.cclarity.io" }
    }
  }
}
```

---

## Available tools (after login + paid plan)

| Tool | Description |
|------|-------------|
| `cclarity_login` | Browser OAuth login |
| `leadprofiles_list` | List lead profiles with engagement data |
| `leadprofiles_engagements` | Detailed engagements per lead |
| `who_engaged_activities` | Who engaged with your LinkedIn posts |
| `who_engaged_profiles` | Enriched profiles of engagers |
| `icp_matched_engagers` | ICP-scored engager matches |
| `profile_viewers` | LinkedIn profile viewers |
| `posts_list` | Your LinkedIn posts |
| `posts_engagements` | Post-level engagement breakdown |

---

## Remote MCP endpoint

The hosted API at `https://api.cclarity.io/mcp` uses **Streamable HTTP** transport and **OAuth** authentication. Direct `GET /mcp` without a bearer token returns **401** by design — use `@cclarity-packages/mcp` as the stdio proxy to handle login.

**Well-known discovery:** `https://api.cclarity.io/.well-known/mcp/server-card.json`

---

## Packages in this repo

```
packages/
├── cli/    → @cclarity-packages/cli   (binary: cclarity)
└── mcp/    → @cclarity-packages/mcp  (binary: cclarity-mcp)
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the sync policy between this repo and the private `cclarity-be` monolith.

## Security

See [SECURITY.md](SECURITY.md) to report vulnerabilities.

## License

[MIT](LICENSE)
