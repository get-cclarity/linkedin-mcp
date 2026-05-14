/**
 * Resolve a fresh access token from stored credentials.
 * Auto-refreshes when the stored token is within 60 s of expiry.
 *
 * @module auth/tokenResolver
 */

import {
    loadCredentials,
    saveCredentials,
    isAccessTokenFresh,
    type StoredCredentials,
} from './tokenStore';

export const CLI_CLIENT_ID = process.env.CCLARITY_CLIENT_ID ?? '8832c1b3-5758-460e-bc1b-b7f4906317f7';

// ── Token refresh ─────────────────────────────────────────────────────────────

interface RefreshResult {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

async function doRefresh(serverUrl: string, refreshToken: string, clientId: string): Promise<RefreshResult> {
    const base = serverUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/v2/connector/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
    });

    const text = await res.text();
    let data: RefreshResult;
    try {
        data = JSON.parse(text) as RefreshResult;
    } catch {
        throw new Error(`Token refresh returned non-JSON: ${text.slice(0, 200)}`);
    }

    if (!res.ok || !data.access_token) {
        throw new Error(`Token refresh failed (HTTP ${res.status})`);
    }

    return data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns a valid access token or throws a descriptive error. */
export async function resolveAccessToken(): Promise<{ accessToken: string; creds: StoredCredentials }> {
    const creds = loadCredentials();
    if (!creds) {
        throw new Error('Not logged in. Call the cclarity_login tool to authenticate.');
    }

    if (isAccessTokenFresh(creds)) {
        return { accessToken: creds.accessToken, creds };
    }

    console.error('[cclarity] Access token expired — refreshing...');
    try {
        const tokens = await doRefresh(creds.serverUrl, creds.refreshToken, CLI_CLIENT_ID);
        const updated: StoredCredentials = {
            ...creds,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            savedAt: new Date().toISOString(),
        };
        saveCredentials(updated);
        return { accessToken: updated.accessToken, creds: updated };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Session expired and refresh failed: ${msg}\nCall cclarity_login to re-authenticate.`);
    }
}
