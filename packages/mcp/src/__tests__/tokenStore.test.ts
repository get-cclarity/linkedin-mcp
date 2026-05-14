/**
 * Unit tests — tokenStore (P6)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    saveCredentials,
    loadCredentials,
    clearCredentials,
    isAccessTokenFresh,
    type StoredCredentials,
} from '../auth/tokenStore';

// Redirect credentials to a temp dir via CCLARITY_CONFIG_DIR env
// so tests never touch ~/.config/cclarity.
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `cclarity-test-${process.pid}`);
const TEST_FILE = path.join(TEST_CONFIG_DIR, 'credentials.json');

beforeAll(() => {
    process.env.CCLARITY_CONFIG_DIR = TEST_CONFIG_DIR;
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
});

afterAll(() => {
    delete process.env.CCLARITY_CONFIG_DIR;
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
});

afterEach(() => {
    if (fs.existsSync(TEST_FILE)) {
        fs.unlinkSync(TEST_FILE);
    }
});

const sampleCreds = (): StoredCredentials => ({
    accessToken: 'acc-token',
    refreshToken: 'ref-token',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    serverUrl: 'http://localhost:8080',
    savedAt: new Date().toISOString(),
    email: 'test@example.com',
    userId: '507f1f77bcf86cd799439011',
});

describe('saveCredentials + loadCredentials', () => {
    it('round-trips credentials through disk', () => {
        const creds = sampleCreds();
        saveCredentials(creds);
        const loaded = loadCredentials();
        expect(loaded).not.toBeNull();
        expect(loaded!.accessToken).toBe('acc-token');
        expect(loaded!.refreshToken).toBe('ref-token');
        expect(loaded!.email).toBe('test@example.com');
        expect(loaded!.serverUrl).toBe('http://localhost:8080');
    });

    it('returns null when no credentials file exists', () => {
        expect(loadCredentials()).toBeNull();
    });

    it('returns null on corrupt JSON', () => {
        fs.mkdirSync(path.dirname(TEST_FILE), { recursive: true });
        fs.writeFileSync(TEST_FILE, '{invalid json}', 'utf-8');
        expect(loadCredentials()).toBeNull();
    });
});

describe('clearCredentials', () => {
    it('removes the credentials file', () => {
        saveCredentials(sampleCreds());
        expect(loadCredentials()).not.toBeNull();
        clearCredentials();
        expect(loadCredentials()).toBeNull();
    });

    it('is a no-op when no file exists', () => {
        expect(() => clearCredentials()).not.toThrow();
    });
});

describe('isAccessTokenFresh', () => {
    it('returns true when token expires far in the future', () => {
        const creds = { ...sampleCreds(), expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() };
        expect(isAccessTokenFresh(creds)).toBe(true);
    });

    it('returns false when token has already expired', () => {
        const creds = { ...sampleCreds(), expiresAt: new Date(Date.now() - 1000).toISOString() };
        expect(isAccessTokenFresh(creds)).toBe(false);
    });

    it('returns false when token expires within the 60-second buffer', () => {
        const creds = { ...sampleCreds(), expiresAt: new Date(Date.now() + 30 * 1000).toISOString() };
        expect(isAccessTokenFresh(creds)).toBe(false);
    });
});
