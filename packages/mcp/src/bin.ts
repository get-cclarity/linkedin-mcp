#!/usr/bin/env node
/**
 * Binary entry point for `@cclarity-packages/mcp` — `cclarity-mcp`
 *
 * Invoked by IDEs as: `npx -y @cclarity-packages/mcp cclarity-mcp`
 *
 * Redirects console.log → stderr to keep stdout clean for MCP JSON-RPC frames,
 * then starts the local stdio MCP server.
 */

// Keep stdout pure for MCP JSON-RPC; all debug output goes to stderr
console.log = console.error;

import { startLocalServer } from './mcp/localServer';

void startLocalServer().catch((err: unknown) => {
    process.stderr.write(`[cclarity-mcp] Fatal: ${String(err)}\n`);
    process.exit(1);
});
