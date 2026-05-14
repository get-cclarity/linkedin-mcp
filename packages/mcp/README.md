# @cclarity-packages/mcp

Stdio **Model Context Protocol** server for CClarity: local browser login (`cclarity_login`), token storage, and proxy to the remote CClarity MCP API.

**You usually do not install this directly.** Run **`npx -y @cclarity-packages/cli init`** to write IDE config. That config spawns this package the same way Dedot uses `npx -y @dedot-ai/mcp`.

- **Init / setup only:** [`@cclarity-packages/cli`](../cli)
- **This package:** MCP process only

## Manual `npx` (advanced)

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

## Development

```bash
cd packages/mcp
npm install
npm test
npm run build
```
