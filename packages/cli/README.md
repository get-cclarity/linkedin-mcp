# @cclarity-packages/cli

**Init-only** — adds the CClarity MCP plugin to your IDE.

The stdio server lives in a **separate** package: **`@cclarity-packages/mcp`**.

```bash
npx -y @cclarity-packages/cli@latest init
```

Then say **"Login me into CClarity"**. The IDE runs `npx -y @cclarity-packages/mcp cclarity-mcp`, which opens the browser and proxies tools.

---

## How it works

```
npx -y @cclarity-packages/cli@latest init
  └─▶ Writes .mcp.json (etc.) with: npx -y @cclarity-packages/mcp cclarity-mcp
  └─▶ Restart IDE → "Login me into CClarity"
        └─▶ @cclarity-packages/mcp: browser + callback + tools
```

| Package | Role |
|--------|------|
| `@cclarity-packages/cli` | `init` only (this package) |
| `@cclarity-packages/mcp` | Stdio MCP, `cclarity_login`, upstream proxy — [README](../mcp/README.md) |

---

## What your AI can do after login

```
"Login me into CClarity"
"List my lead profiles"
"Who engaged with my latest LinkedIn posts?"
```

---

## Manual config (same as `init` output)

Claude Code — project `.mcp.json`:

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

## Environment (inherited by the MCP process)

| Variable | Purpose |
|----------|---------|
| `CCLARITY_MCP_URL` | API base (written by `init`) |
| `CCLARITY_CONFIG_DIR` | Credentials dir (used by **mcp** package) |

## Development

```bash
cd packages/cli
npm install
npm run build
```
