/**
 * Browser-based callback login flow.
 *
 * ## Flow
 *
 *  1. Pick an available localhost port.
 *  2. Start a one-shot local HTTP server that listens for the OAuth callback.
 *  3. Open the user's browser to the CClarity connect page:
 *       https://get.cclarity.io/mcp-connect
 *         ?cliCallback=http://127.0.0.1:<port>/callback
 *         &clientId=<CLI_CLIENT_ID>
 *  4. User completes the full journey in the browser:
 *       login (email + OTP) → payment → connect Unipile → done
 *  5. CClarity app redirects to:
 *       http://127.0.0.1:<port>/callback?auth_token=<short-lived-jwt>
 *  6. Local server exchanges the token via POST /api/v2/connector/cli/token.
 *  7. On success → browser is redirected to CCLARITY_APP_URL/mcp-connect/done
 *     On failure → browser is redirected to CCLARITY_APP_URL/mcp-connect?error=<msg>
 *  8. Closes the server and resolves/rejects the promise.
 *
 * Timeout: 10 minutes — enough for the full onboarding journey.
 *
 * ## FE contract
 *
 *  The CClarity FE must implement two routes:
 *    GET /mcp-connect/done           — shown after successful login
 *    GET /mcp-connect?error=<msg>    — shown after cancelled/failed login
 *
 * @module auth/browserCallbackFlow
 */

import * as http from 'http';
import * as net from 'net';

export interface BrowserCallbackResult {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    email?: string;
}

interface CliTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    email?: string;
    message?: string;
    code?: string;
}

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Base URL of the CClarity web app — used for post-login redirect. */
const APP_BASE_URL = 'https://get.cclarity.io';

/** Page that initiates the MCP login journey. */
const CONNECT_PAGE = `${APP_BASE_URL}/mcp-connect`;

/** Page the browser lands on after a successful token exchange. */
const DONE_PAGE = `${APP_BASE_URL}/mcp-connect/done`;

// ── Port helper ───────────────────────────────────────────────────────────────

function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

// ── Minimal interim HTML ──────────────────────────────────────────────────────
// Shown for the brief moment while the token exchange is in-flight.
// The page auto-redirects; this is only visible if JS/redirect is blocked.

function loadingHtml(message: string, redirectUrl: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="3;url=${redirectUrl}">
  <title>CClarity</title>
  <style>
    body { font-family: -apple-system, sans-serif; display:flex; align-items:center;
           justify-content:center; height:100vh; margin:0; background:#f9fafb; }
    .card { text-align:center; padding:2rem; }
    p { color:#6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <p>${message}</p>
    <p style="font-size:.8rem;color:#9ca3af">Redirecting…</p>
  </div>
</body>
</html>`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

async function exchangeForMcpTokens(
    authToken: string,
    clientId: string,
    serverUrl: string,
): Promise<BrowserCallbackResult> {
    const base = serverUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/v2/connector/cli/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_token: authToken, client_id: clientId }),
    });

    const text = await res.text();
    let data: CliTokenResponse;
    try {
        data = JSON.parse(text) as CliTokenResponse;
    } catch {
        throw new Error(`Server returned non-JSON: ${text.slice(0, 200)}`);
    }

    if (!res.ok || !data.access_token) {
        throw new Error(data.message ?? `Token exchange failed (HTTP ${res.status})`);
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? '',
        expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
        email: data.email,
    };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runBrowserCallbackFlow(params: {
    serverUrl: string;
    clientId: string;
    /** Optional override for the connect page URL (for testing). */
    connectPageUrl?: string;
}): Promise<BrowserCallbackResult> {
    const { serverUrl, clientId, connectPageUrl } = params;
    const port = await findFreePort();
    const callbackUrl = `http://127.0.0.1:${port}/callback`;
    const pageBase = connectPageUrl ?? CONNECT_PAGE;
    const browserUrl = `${pageBase}?cliCallback=${encodeURIComponent(callbackUrl)}&clientId=${encodeURIComponent(clientId)}`;

    return new Promise((resolve, reject) => {
        let settled = false;

        function finish(err: Error | null, result?: BrowserCallbackResult) {
            if (settled) return;
            settled = true;
            server.close();
            clearTimeout(timer);
            if (err) reject(err);
            else resolve(result!);
        }

        // ── Local callback server ─────────────────────────────────────────
        const server = http.createServer((req, res) => {
            if (!req.url?.startsWith('/callback')) {
                res.writeHead(404).end();
                return;
            }

            const url = new URL(req.url, `http://127.0.0.1:${port}`);
            const authToken = url.searchParams.get('auth_token') ?? '';
            const errParam = url.searchParams.get('error') ?? '';

            // ── Error / cancellation ──────────────────────────────────────
            if (errParam) {
                const errorRedirect = `${CONNECT_PAGE}?error=${encodeURIComponent(errParam)}`;
                res.writeHead(302, { Location: errorRedirect }).end();
                finish(new Error(`Login cancelled: ${errParam}`));
                return;
            }

            if (!authToken) {
                const errorRedirect = `${CONNECT_PAGE}?error=${encodeURIComponent('No auth token received.')}`;
                res.writeHead(302, { Location: errorRedirect }).end();
                finish(new Error('Callback received no auth_token.'));
                return;
            }

            // ── Token received — exchange it, then redirect to CClarity FE ─
            // Show a minimal loading page while exchange is in-flight.
            // The meta-refresh will kick in if redirect takes > 3 s.
            res
                .writeHead(200, { 'Content-Type': 'text/html' })
                .end(loadingHtml('Connecting to CClarity…', DONE_PAGE));

            exchangeForMcpTokens(authToken, clientId, serverUrl)
                .then((creds) => {
                    process.stderr.write(`[cclarity] Token exchange succeeded. Redirecting browser to ${DONE_PAGE}\n`);
                    finish(null, creds);
                })
                .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    process.stderr.write(`[cclarity] Token exchange failed: ${msg}\n`);
                    finish(err instanceof Error ? err : new Error(msg));
                });
        });

        server.listen(port, '127.0.0.1', async () => {
            // ── Open browser ──────────────────────────────────────────────
            try {
                const { default: open } = await import('open');
                await open(browserUrl);
                process.stderr.write(`[cclarity] Browser opened: ${browserUrl}\n`);
            } catch {
                process.stderr.write(`[cclarity] Could not open browser. Visit:\n  ${browserUrl}\n`);
            }
        });

        server.on('error', (err) => finish(err));

        // ── Timeout ───────────────────────────────────────────────────────
        const timer = setTimeout(() => {
            finish(new Error('Login timed out after 10 minutes. Please try again.'));
        }, TIMEOUT_MS);
    });
}
