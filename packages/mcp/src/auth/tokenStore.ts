/**
 * Token storage — ~/.config/cclarity/credentials.json
 *
 * Stores access token, refresh token, and metadata on disk with 0600 permissions
 * so only the current OS user can read it.  No keychain dependency keeps this
 * cross-platform and zero-friction.
 *
 * @module auth/tokenStore
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface StoredCredentials {
    accessToken: string;
    refreshToken: string;
    /** ISO-8601 expiry of the access token */
    expiresAt: string;
    /** Email of the authenticated user (informational) */
    email?: string;
    /** userId (informational) */
    userId?: string;
    /** MCP server base URL this token is scoped to */
    serverUrl: string;
    /** When the credential was saved */
    savedAt: string;
}

/**
 * Resolve the credentials directory.
 * Override `CCLARITY_CONFIG_DIR` to redirect storage in tests or CI.
 */
export function credentialsDir(): string {
    if (process.env.CCLARITY_CONFIG_DIR) return process.env.CCLARITY_CONFIG_DIR;
    return path.join(os.homedir(), '.config', 'cclarity');
}

export function credentialsPath(): string {
    return path.join(credentialsDir(), 'credentials.json');
}

export function saveCredentials(creds: StoredCredentials): void {
    const dir = credentialsDir();
    fs.mkdirSync(dir, { recursive: true });

    const file = credentialsPath();
    fs.writeFileSync(file, JSON.stringify(creds, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function loadCredentials(): StoredCredentials | null {
    const file = credentialsPath();
    if (!fs.existsSync(file)) return null;

    try {
        const raw = fs.readFileSync(file, 'utf-8');
        return JSON.parse(raw) as StoredCredentials;
    } catch {
        return null;
    }
}

export function clearCredentials(): void {
    const file = credentialsPath();
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
}

/** Returns true if the stored access token is still valid (not within 60 s of expiry). */
export function isAccessTokenFresh(creds: StoredCredentials): boolean {
    const expiresAt = new Date(creds.expiresAt).getTime();
    const bufferMs = 60 * 1000;
    return Date.now() + bufferMs < expiresAt;
}
