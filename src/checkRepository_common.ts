import fs from 'node:fs';
import path from 'node:path';
import type { LogOptions, RepoEntry, Repository } from './types';

export function isDebugEnabled(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
    if (argv.includes('--debug') || argv.includes('--log')) {
        return true;
    }

    return ['1', 'true', 'yes', 'on'].includes(
        String(env.CHECK_REPOSITORY_DEBUG || env.CHECK_REPOSITORY_LOG || '').toLowerCase(),
    );
}

export function isLogEnabled(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
    return isDebugEnabled(argv, env);
}

export function logWithTimestamp(message: string, options: LogOptions = {}): void {
    const { enabled = isDebugEnabled(), logger = console.log, now = () => new Date().toISOString() } = options;

    if (enabled) {
        logger(`[${now()}] ${message}`);
    }
}

export function logAdapterStart(name: string, options?: LogOptions): void {
    logWithTimestamp(`Checking adapter "${name}"`, options);
}

function formatLogParameters(parameters: unknown): string {
    if (parameters === undefined) {
        return '{}';
    }

    try {
        return JSON.stringify(parameters);
    } catch {
        return String(parameters);
    }
}

export function logCheck(
    adapterName: string,
    check: string,
    parameters: unknown,
    result: unknown,
    options?: LogOptions,
): void {
    logWithTimestamp(
        `adapter="${adapterName}" check="${check}" parameters=${formatLogParameters(parameters)} result=${result ? 'ok' : 'fail'}`,
        options,
    );
}

export function logDownload(url: string, result: unknown, options?: LogOptions, parameters: unknown = {}): void {
    logWithTimestamp(
        `download url="${url}" parameters=${formatLogParameters(parameters)} result=${result ? 'ok' : 'fail'}`,
        options,
    );
}

export function loadRepository(fileName: string): Repository {
    const jsonPath = path.normalize(path.join(__dirname, `../${fileName}`));
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

/** All real adapter entries, i.e. everything except the `_`-prefixed metadata keys. */
export function getRepositoryEntries(repository: Repository): [string, RepoEntry][] {
    return Object.entries(repository).filter(([name]) => !name.startsWith('_')) as [string, RepoEntry][];
}
