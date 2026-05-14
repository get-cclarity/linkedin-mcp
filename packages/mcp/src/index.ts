/**
 * `@cclarity-packages/mcp` — library exports
 *
 * The binary entry point is `bin.ts` (started by IDEs as `cclarity-mcp`).
 * This file exports re-usable auth utilities so `@cclarity-packages/cli`
 * can import `loginViaBrowser`, `loadCredentials`, etc. without starting
 * the MCP stdio server.
 */

export { startLocalServer } from './mcp/localServer';

// Auth utilities — re-exported so @cclarity-packages/cli can use them
export { loginViaBrowser } from './auth/loginViaBrowser';
export type { BrowserCallbackResult } from './auth/loginViaBrowser';
export {
    loadCredentials,
    saveCredentials,
    clearCredentials,
    isAccessTokenFresh,
} from './auth/tokenStore';
export type { StoredCredentials } from './auth/tokenStore';
