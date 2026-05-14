/**
 * CClarity local stdio MCP server — `@cclarity-packages/mcp` / binary `cclarity-mcp`
 *
 * ## Architecture (mirrors @dedot-ai/mcp)
 *
 *  Built-in tools (run in this process, on the user's machine):
 *    cclarity_login   — `loginViaBrowser(serverUrl)` → opens browser, localhost callback
 *    cclarity_logout  — clears local credentials
 *    cclarity_status  — shows auth state + available tools
 *
 *  Upstream tool proxy (after auth):
 *    Every tool registered in `pidmain/mcp/server.ts` (get_user_context,
 *    leadprofiles_list, get_who_engaged, get_post_performance …) is fetched
 *    from the remote API and forwarded automatically — same tool name and schema.
 *    Remote `login` is filtered out so `cclarity_login` is always preferred.
 *
 * ## Startup behaviour (mirrors @dedot-ai/mcp index.ts)
 *
 *  - Not logged in  → stderr hint "call cclarity_login"
 *  - Logged in      → stderr confirms; upstream tool count shown
 *
 * ## Stdio protocol
 *
 *  NOTHING must be written to stdout except MCP JSON-RPC frames.
 *  All debug output goes to stderr.
 *
 * @module mcp/localServer
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Dedot-style: `loginViaBrowser(baseUrl)` lives in auth — opens browser + localhost callback
import { loginViaBrowser } from '../auth/loginViaBrowser';
import {
    saveCredentials,
    loadCredentials,
    clearCredentials,
    isAccessTokenFresh,
} from '../auth/tokenStore';
import { resolveAccessToken } from '../auth/tokenResolver';
import { listTools, callTool, ToolInfo } from './client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../../package.json') as { name: string; version: string };

const DEFAULT_SERVER_URL = process.env.CCLARITY_MCP_URL ?? 'https://api.cclarity.io';

// ---------------------------------------------------------------------------
// Built-in tool definitions
// ---------------------------------------------------------------------------

const BUILTIN_TOOLS = [
    {
        name: 'cclarity_login',
        description:
            'Authenticate with CClarity. Opens a browser window to complete sign-in, payment, ' +
            'and LinkedIn (Unipile) connection. Token is saved locally for all subsequent calls. ' +
            'Call this first — no arguments needed.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'cclarity_logout',
        description: 'Logout from CClarity and clear all locally stored credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'cclarity_status',
        description:
            'Check CClarity authentication status and server connectivity. ' +
            'Shows login state, token expiry, and number of available upstream tools.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] },
    },
];

// ---------------------------------------------------------------------------
// Upstream tool cache
// ---------------------------------------------------------------------------

let cachedUpstreamTools: ToolInfo[] | null = null;

async function fetchUpstreamTools(): Promise<ToolInfo[]> {
    try {
        const { accessToken } = await resolveAccessToken();
        const creds = loadCredentials();
        if (!creds) return [];
        const tools = await listTools({
            mcpUrl: `${creds.serverUrl.replace(/\/$/, '')}/mcp`,
            accessToken,
        });
        cachedUpstreamTools = tools;
        return tools;
    } catch {
        return cachedUpstreamTools ?? [];
    }
}

function invalidateUpstreamCache(): void {
    cachedUpstreamTools = null;
}

// ---------------------------------------------------------------------------
// Built-in tool handlers
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/**
 * `cclarity_login` — mirrors Dedot's `dedot_login` → `await loginViaBrowser(DEDOT_API_BASE_URL)`.
 * Runs ONLY in this local stdio process (never callable from pidmain / remote API).
 *
 * Always uses DEFAULT_SERVER_URL (from CCLARITY_MCP_URL env) — never reads the
 * serverUrl stored in previous credentials, which could be stale (e.g. localhost:8080
 * from a local dev session) and cause the token exchange to fail.
 */
async function handleLogin(): Promise<ToolResult> {
    const serverUrl = DEFAULT_SERVER_URL;

    try {
        const result = await loginViaBrowser(serverUrl);

        saveCredentials({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
            serverUrl,
            email: result.email,
            savedAt: new Date().toISOString(),
        });
        invalidateUpstreamCache();

        const emailHint = result.email ? ` as ${result.email}` : '';
        return {
            content: [{
                type: 'text',
                text: `✅ Logged in to CClarity${emailHint}!\n\n` +
                    'All CClarity tools are now available. You can:\n' +
                    '  • "Get my user context"\n' +
                    '  • "List my lead profiles"\n' +
                    '  • "Show who engaged with my posts"\n' +
                    '  • "Get my post performance"',
            }],
        };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            content: [{
                type: 'text',
                text: `❌ Login failed: ${msg}\n\nCall cclarity_login again to retry.`,
            }],
            isError: true,
        };
    }
}

async function handleLogout(): Promise<ToolResult> {
    clearCredentials();
    invalidateUpstreamCache();
    return {
        content: [{ type: 'text', text: '✅ Logged out from CClarity. Call cclarity_login to sign back in.' }],
    };
}

async function handleStatus(): Promise<ToolResult> {
    const creds = loadCredentials();
    if (!creds) {
        return {
            content: [{
                type: 'text',
                text: '❌ Not logged in.\n\nCall cclarity_login to authenticate.',
            }],
        };
    }

    const fresh = isAccessTokenFresh(creds);
    const expiresInSec = Math.round((new Date(creds.expiresAt).getTime() - Date.now()) / 1000);
    const expiryText = expiresInSec > 0
        ? `expires in ${expiresInSec}s`
        : `EXPIRED ${Math.abs(expiresInSec)}s ago (will auto-refresh on next call)`;

    const lines: string[] = [
        '✅ Logged in to CClarity',
        `   Server  : ${creds.serverUrl}`,
        `   Token   : ${fresh ? 'fresh' : 'stale'} (${expiryText})`,
    ];
    if (creds.email)  lines.push(`   Account : ${creds.email}`);
    if (creds.userId) lines.push(`   User ID : ${creds.userId}`);

    const upstream = await fetchUpstreamTools();
    lines.push(`   Tools   : ${upstream.length} upstream tool(s) available`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ---------------------------------------------------------------------------
// Upstream tool proxy — forwards any non-builtin tool call to pidmain MCP API
// ---------------------------------------------------------------------------

async function handleUpstreamCall(
    name: string,
    args: Record<string, unknown>,
): Promise<ToolResult> {
    try {
        const { accessToken } = await resolveAccessToken();
        const creds = loadCredentials();
        if (!creds) throw new Error('Not logged in. Call cclarity_login first.');

        const result = await callTool(
            { mcpUrl: `${creds.serverUrl.replace(/\/$/, '')}/mcp`, accessToken },
            name,
            args,
        );

        return {
            content: (result.content ?? []).map((c) => ({
                type: 'text' as const,
                text: c.text ?? JSON.stringify(c),
            })),
            isError: result.isError,
        };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Not logged in') || msg.includes('cclarity login')) {
            return {
                content: [{
                    type: 'text',
                    text: '❌ Not authenticated. Call cclarity_login first, then retry.',
                }],
                isError: true,
            };
        }
        return {
            content: [{ type: 'text', text: `❌ ${name}: ${msg}` }],
            isError: true,
        };
    }
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

export async function startLocalServer(): Promise<void> {
    const server = new Server(
        { name: '@cclarity-packages/mcp', version },
        { capabilities: { tools: {} } },
    );

    // ── Tool listing ────────────────────────────────────────────────────────
    // Built-ins first, then every upstream tool from pidmain/mcp/server.ts.
    // Remote `login` (URL-only) is filtered — `cclarity_login` is used instead.
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const upstream = await fetchUpstreamTools();
        const filtered = upstream.filter((t) => t.name !== 'login' && t.name !== 'logout');
        return {
            tools: [
                ...BUILTIN_TOOLS,
                ...filtered.map((t) => ({
                    name: t.name,
                    description: t.description ?? '',
                    inputSchema: (t.inputSchema as Record<string, unknown>) ?? {
                        type: 'object',
                        properties: {},
                    },
                })),
            ],
        };
    });

    // ── Tool dispatch ───────────────────────────────────────────────────────
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: rawArgs } = request.params;
        const args = (rawArgs ?? {}) as Record<string, unknown>;

        switch (name) {
            case 'cclarity_login':
            case 'login':             // also catch if model uses the remote name
                return handleLogin();
            case 'cclarity_logout':
            case 'logout':
                return handleLogout();
            case 'cclarity_status':
                return handleStatus();
            default:
                return handleUpstreamCall(name, args);
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // ── Startup auth check (mirrors Dedot's packages/mcp/src/index.ts) ─────
    const creds = loadCredentials();
    if (!creds) {
        process.stderr.write(
            '[cclarity-mcp] Not logged in. ' +
            'Call the `cclarity_login` tool to authenticate — a browser will open.\n',
        );
    } else {
        const upstream = await fetchUpstreamTools().catch(() => [] as ToolInfo[]);
        process.stderr.write(
            `[cclarity-mcp] Authenticated${creds.email ? ` as ${creds.email}` : ''}. ` +
            `${upstream.length} upstream tool(s) available.\n`,
        );
    }
}
