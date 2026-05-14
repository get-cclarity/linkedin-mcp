#!/usr/bin/env node
/**
 * @cclarity-packages/cli — `cclarity` binary
 *
 * Commands:
 *   cclarity init     Set up @cclarity-packages/mcp in your IDE (writes config files)
 *   cclarity login    Authenticate with CClarity — opens browser, saves token
 *   cclarity logout   Clear saved credentials
 *   cclarity status   Show auth state + token expiry
 *
 * Auth commands use @cclarity-packages/mcp auth utilities so credentials are stored
 * in the same location used by the MCP stdio server (~/.config/cclarity/credentials.json).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// Auth re-exported from the mcp package — same credential store as the stdio server
import {
    loginViaBrowser,
    loadCredentials,
    saveCredentials,
    clearCredentials,
    isAccessTokenFresh,
} from '@cclarity-packages/mcp';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const VERSION: string = (require('../package.json') as { version: string }).version;

const PROD_MCP_URL = process.env.CCLARITY_MCP_URL ?? 'https://api.cclarity.io';

/**
 * Npm ref for the MCP stdio process (same role as Dedot `MCP_PLUGIN_REF` → `@dedot-ai/mcp`).
 * `init` writes: `npx -y @cclarity-packages/mcp cclarity-mcp`
 */
const MCP_PLUGIN_REF = '@cclarity-packages/mcp';
/** Bin name from `@cclarity-packages/mcp` (see that package's `package.json` `bin`). */
const MCP_BIN = 'cclarity-mcp';

const c = {
    bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
    green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
    red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
    cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function prompt(question: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((res) => {
        rl.question(question, (answer) => {
            rl.close();
            res(answer.trim());
        });
    });
}

// ---------------------------------------------------------------------------
// Auth commands — thin wrappers around @cclarity-packages/mcp auth utilities
// ---------------------------------------------------------------------------

async function runLogin(): Promise<void> {
    const serverUrl = PROD_MCP_URL;
    console.log();
    console.log(c.bold('  CClarity — Login'));
    console.log(c.dim(`  Server: ${serverUrl}`));
    console.log();
    console.log('  Opening your browser for sign-in…');
    console.log(c.dim('  (You can complete payment and LinkedIn setup there too.)'));
    console.log();

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
        const emailHint = result.email ? ` as ${c.cyan(result.email)}` : '';
        console.log(c.green(`  ✅ Logged in${emailHint}!`));
        console.log();
        console.log('  Your token is saved. The CClarity MCP server will now');
        console.log('  connect automatically whenever your IDE starts.');
        console.log();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(c.red(`  ❌ Login failed: ${msg}`));
        console.error('  Run `cclarity login` to try again.');
        process.exit(1);
    }
}

function runLogout(): void {
    const creds = loadCredentials();
    if (!creds) {
        console.log(c.yellow('  Not currently logged in — nothing to clear.'));
        return;
    }
    clearCredentials();
    console.log(c.green('  ✅ Logged out from CClarity.'));
    console.log(c.dim('  Run `cclarity login` to sign back in.'));
}

function runStatus(): void {
    const creds = loadCredentials();
    if (!creds) {
        console.log();
        console.log(c.yellow('  ❌ Not logged in.'));
        console.log(c.dim('  Run `cclarity login` to authenticate.'));
        console.log();
        return;
    }

    const fresh = isAccessTokenFresh(creds);
    const expiresInSec = Math.round((new Date(creds.expiresAt).getTime() - Date.now()) / 1000);
    const expiryText = expiresInSec > 0
        ? `expires in ${expiresInSec}s`
        : c.red(`EXPIRED ${Math.abs(expiresInSec)}s ago`);

    console.log();
    console.log(c.green('  ✅ Logged in to CClarity'));
    console.log(`     Server  : ${c.cyan(creds.serverUrl)}`);
    console.log(`     Token   : ${fresh ? c.green('fresh') : c.yellow('stale')} (${expiryText})`);
    if (creds.email)  console.log(`     Account : ${creds.email}`);
    if (creds.userId) console.log(`     User ID : ${creds.userId}`);
    console.log();
}

// ---------------------------------------------------------------------------
// Init wizard — writes IDE config to run @cclarity-packages/mcp
// ---------------------------------------------------------------------------

interface McpConfig {
    mcpServers?: Record<string, {
        command: string;
        args: string[];
        env?: Record<string, string>;
    }>;
}

function readMcpConfig(path: string): McpConfig {
    if (!existsSync(path)) return {};
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as McpConfig;
    } catch {
        console.warn(c.yellow(`  ⚠ Could not parse ${path} — will write fresh config.`));
        return {};
    }
}

function writeMcpConfig(path: string, config: McpConfig): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function cclarityEntry(mcpUrl: string) {
    return {
        command: 'npx',
        args: ['-y', MCP_PLUGIN_REF, MCP_BIN],
        env: { CCLARITY_MCP_URL: mcpUrl },
    };
}

function applyEntry(config: McpConfig, mcpUrl: string): McpConfig {
    return {
        ...config,
        mcpServers: {
            ...(config.mcpServers ?? {}),
            cclarity: cclarityEntry(mcpUrl),
        },
    };
}

function claudeCodeProjectConfigPath(): string {
    return resolve(process.cwd(), '.mcp.json');
}

function claudeDesktopConfigPath(): string {
    if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    if (process.platform === 'win32') {
        return join(process.env['APPDATA'] ?? homedir(), 'Claude', 'claude_desktop_config.json');
    }
    return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function cursorGlobalConfigPath(): string {
    if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json');
    }
    if (process.platform === 'win32') {
        return join(process.env['APPDATA'] ?? homedir(), 'Cursor', 'User', 'mcp.json');
    }
    return join(homedir(), '.config', 'Cursor', 'User', 'mcp.json');
}

function codexConfigPath(): string {
    return join(homedir(), '.codex', 'config.toml');
}

async function writeCodexEntry(path: string, mcpUrl: string): Promise<void> {
    const { parse: parseToml, stringify: stringifyToml } = await import('@iarna/toml');

    mkdirSync(dirname(path), { recursive: true });
    const previous = existsSync(path) ? readFileSync(path, 'utf8') : '';

    let root: Record<string, unknown> = {};
    if (previous.trim()) {
        try {
            root = parseToml(previous.trim()) as Record<string, unknown>;
        } catch {
            console.error(c.yellow(`  ⚠ Could not parse ${path} — fix the TOML or move it aside, then run init again.`));
            process.exit(1);
        }
    }

    const prev = (root['mcp_servers'] as Record<string, unknown> | undefined) ?? {};
    root['mcp_servers'] = {
        ...prev,
        cclarity: {
            command: 'npx',
            args: ['-y', MCP_PLUGIN_REF, MCP_BIN],
            env: { CCLARITY_MCP_URL: mcpUrl },
        },
    };

    writeFileSync(path, stringifyToml(root as never) + '\n', 'utf8');
}

async function runInit(): Promise<void> {
    console.log();
    console.log(c.bold('  CClarity — setup'));
    console.log(c.dim('  Your AI assistant now has your LinkedIn intelligence.'));
    console.log();
    console.log(
        c.dim(`  MCP plugin: npx -y ${MCP_PLUGIN_REF} ${MCP_BIN} (separate package, like Dedot's @dedot-ai/mcp).`),
    );
    console.log();

    const mcpUrl = PROD_MCP_URL;

    console.log(c.bold('Step 1/2 — Where are you using CClarity?'));
    console.log(`  ${c.cyan('1')} Claude Code      ${c.dim('(writes .mcp.json in current directory)')}`);
    console.log(`  ${c.cyan('2')} Cursor           ${c.dim('(writes global Cursor MCP config)')}`);
    console.log(`  ${c.cyan('3')} Claude Desktop   ${c.dim('(writes global Claude Desktop config)')}`);
    console.log(`  ${c.cyan('4')} OpenAI Codex     ${c.dim('(writes ~/.codex/config.toml)')}`);
    console.log(`  ${c.cyan('5')} All four`);
    console.log();

    const choice = await prompt('  Pick [1-5] (default: 1): ');
    type Target = 'claude-code' | 'cursor' | 'claude-desktop' | 'codex';
    const targets: Target[] = [];

    if (choice === '2') targets.push('cursor');
    else if (choice === '3') targets.push('claude-desktop');
    else if (choice === '4') targets.push('codex');
    else if (choice === '5') targets.push('claude-code', 'cursor', 'claude-desktop', 'codex');
    else targets.push('claude-code');

    console.log();

    for (const target of targets) {
        if (target === 'codex') {
            const p = codexConfigPath();
            await writeCodexEntry(p, mcpUrl);
            console.log(c.green(`  ✓ written: ${p}`));
            continue;
        }

        const p =
            target === 'claude-code' ? claudeCodeProjectConfigPath() :
            target === 'cursor'      ? cursorGlobalConfigPath() :
                                       claudeDesktopConfigPath();

        const existing = readMcpConfig(p);
        const had = 'cclarity' in (existing.mcpServers ?? {});
        writeMcpConfig(p, applyEntry(existing, mcpUrl));
        console.log(c.green(`  ✓ ${had ? 'updated' : 'written'}: ${p}`));
    }

    console.log();
    console.log(c.bold('Step 2/2 — Almost done!'));
    console.log();

    if (targets.includes('claude-code')) {
        console.log(c.cyan('  Claude Code:'));
        console.log('    Restart Claude Code (or run: claude restart)');
        console.log('    Then say: ' + c.bold('"Login me into CClarity."'));
        console.log(c.dim('    Or run: cclarity login'));
        console.log();
    }
    if (targets.includes('cursor')) {
        console.log(c.cyan('  Cursor:'));
        console.log('    Restart Cursor');
        console.log('    Open a new chat and say: ' + c.bold('"Login me into CClarity."'));
        console.log(c.dim('    Or run: cclarity login'));
        console.log();
    }
    if (targets.includes('claude-desktop')) {
        console.log(c.cyan('  Claude Desktop:'));
        console.log('    Quit and reopen Claude Desktop');
        console.log('    Start a chat and say: ' + c.bold('"Login me into CClarity."'));
        console.log(c.dim('    Or run: cclarity login'));
        console.log();
    }
    if (targets.includes('codex')) {
        console.log(c.cyan('  OpenAI Codex:'));
        console.log('    Restart Codex and say: ' + c.bold('"Login me into CClarity."'));
        console.log(c.dim('    Or run: cclarity login'));
        console.log();
    }

    console.log(c.bold('  What happens next:'));
    console.log('    • A browser opens to the CClarity sign-in page');
    console.log('    • Enter your email → receive a one-time code → sign in');
    console.log('    • Token saved — future sessions reconnect silently');
    console.log('    • All CClarity lead intelligence tools become available');
    console.log();
    console.log(c.green('  Setup complete! Your AI assistant is ready.'));
    console.log(c.dim('  Tip: run `cclarity login` to authenticate right now from the terminal.'));
    console.log();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const command = process.argv[2] ?? '';

if (command === '--version' || command === '-v') {
    console.log(VERSION);
} else if (command === '--help' || command === '-h') {
    console.log([
        '',
        '  CClarity CLI',
        '',
        '  Usage:',
        '    cclarity init      Set up @cclarity-packages/mcp in your IDE',
        '    cclarity login     Authenticate — opens browser, saves token',
        '    cclarity logout    Clear saved credentials',
        '    cclarity status    Show auth state',
        '',
        '  Options:',
        '    --version, -v      Print version',
        '    --help, -h         Show this help',
        '',
    ].join('\n'));
} else if (command === 'login') {
    runLogin().catch((err: unknown) => {
        console.error('Error:', String(err));
        process.exit(1);
    });
} else if (command === 'logout') {
    runLogout();
} else if (command === 'status') {
    runStatus();
} else if (command === 'init' || command === '') {
    runInit().catch((err: unknown) => {
        console.error('Error:', String(err));
        process.exit(1);
    });
} else {
    console.error(`Unknown command: ${command}. Run with --help for usage.`);
    process.exit(1);
}
