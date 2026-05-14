/**
 * Minimal upstream MCP client used by the local stdio server to proxy
 * tool listings and tool calls to the remote CClarity MCP endpoint.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface ToolInfo {
    name: string;
    description?: string;
    inputSchema?: unknown;
}

interface UpstreamConfig {
    mcpUrl: string;
    accessToken: string;
}

async function makeClient(config: UpstreamConfig): Promise<Client> {
    const client = new Client({ name: '@cclarity-packages/mcp', version: '1' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
        requestInit: { headers: { Authorization: `Bearer ${config.accessToken}` } },
    });
    await client.connect(transport);
    return client;
}

export async function listTools(config: UpstreamConfig): Promise<ToolInfo[]> {
    const client = await makeClient(config);
    try {
        const { tools } = await client.listTools();
        return tools as ToolInfo[];
    } finally {
        await client.close().catch(() => undefined);
    }
}

export async function callTool(
    config: UpstreamConfig,
    name: string,
    args: Record<string, unknown>,
): Promise<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }> {
    const client = await makeClient(config);
    try {
        return await client.callTool({ name, arguments: args }) as {
            content?: Array<{ type: string; text?: string }>;
            isError?: boolean;
        };
    } finally {
        await client.close().catch(() => undefined);
    }
}
