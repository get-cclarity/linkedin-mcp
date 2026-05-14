/**
 * Dedot-style entry: `loginViaBrowser(baseUrl)` — opens the OS browser, listens on
 * localhost for the redirect, returns MCP credentials. Mirrors
 * `packages/mcp/src/auth.ts` in @dedot-ai/mcp.
 *
 * **Run only from `@cclarity-packages/mcp` (user’s machine).** Do not call from
 * `pidmain/mcp/server.ts` — that process is remote and cannot open a local browser.
 *
 * @module auth/loginViaBrowser
 */

import { runBrowserCallbackFlow, type BrowserCallbackResult } from './browserCallbackFlow';
import { CLI_CLIENT_ID } from './tokenResolver';

export type { BrowserCallbackResult };

/**
 * Same call shape as Dedot’s `loginViaBrowser(DEDOT_API_BASE_URL)`.
 * Wires the browser + callback and token exchange to CClarity’s connect flow.
 */
export async function loginViaBrowser(apiBaseUrl: string): Promise<BrowserCallbackResult> {
    return runBrowserCallbackFlow({ serverUrl: apiBaseUrl, clientId: CLI_CLIENT_ID });
}
