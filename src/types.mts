/**
 * Shared shapes for the two repository files and the logging helpers.
 *
 * These describe what the repository JSON actually contains. Payloads coming from third parties
 * (GitHub API, npm registry, adapter io-package.json) are deliberately left as `any` for now -
 * see the note in tsconfig.json.
 */

/** The allowed values of an adapter's `type` - must match `allowedTypes` in lib/checkRepository_checkLatestAttributes.js */
export type AdapterType =
    | 'alarm'
    | 'climate-control'
    | 'communication'
    | 'date-and-time'
    | 'energy'
    | 'garden'
    | 'general'
    | 'geoposition'
    | 'hardware'
    | 'health'
    | 'household'
    | 'infrastructure'
    | 'iot-systems'
    | 'lighting'
    | 'logic'
    | 'messaging'
    | 'metering'
    | 'misc-data'
    | 'multimedia'
    | 'network'
    | 'protocols'
    | 'storage'
    | 'utility'
    | 'vehicle'
    | 'visualization'
    | 'visualization-icons'
    | 'visualization-widgets'
    | 'weather';

/** A single adapter entry in sources-dist.json / sources-dist-stable.json. */
export interface RepoEntry {
    /** raw.githubusercontent URL of the adapter's io-package.json */
    meta: string;
    /** raw.githubusercontent URL of the adapter icon */
    icon: string;
    /** one of the allowed adapter types, see checkRepository_checkLatestAttributes */
    type: AdapterType;
    /** stable repository only: the pinned version */
    version?: string;
    published?: string;
    versionDate?: string;
    versionTime?: string;
}

/** The `_repoInfo` metadata entry both repository files carry. */
export interface RepoInfo {
    stable?: boolean;
    name?: Record<string, string>;
    repoTime?: string;
}

/**
 * A whole repository file. Besides the adapter entries, it holds keys starting with `_`
 * (currently only `_repoInfo`), which every check skips.
 */
export type Repository = Record<string, RepoEntry | RepoInfo | undefined>;

/** Options accepted by the logging helpers in checkRepository_common. */
export interface LogOptions {
    enabled?: boolean;
    logger?: (message: string) => void;
    now?: () => string;
}
