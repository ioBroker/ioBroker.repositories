/**
 * Ambient declarations for dependencies that ship no types.
 *
 * A bare `declare module 'x'` types the whole module as `any`, which also hides how it has to be
 * imported - `import * as x` and `import x from` then both compile, even though only one of them
 * works at runtime. Anything whose *shape of import* matters is therefore declared properly.
 */

/**
 * node.extend exports a single function (jQuery.extend for node), so it must be imported as a
 * default import. Declaring it with `export =` makes TypeScript reject `import * as extend`,
 * which emits a non-callable namespace object under esModuleInterop.
 */
declare module 'node.extend' {
    function extend(deep: boolean, target: any, ...sources: any[]): any;
    function extend(target: any, ...sources: any[]): any;
    export = extend;
}

/**
 * @iobroker/repochecker exposes a single AWS Lambda style handler. It is plain CommonJS exporting
 * an object, so a default import resolves to the module itself via esModuleInterop.
 */
declare module '@iobroker/repochecker' {
    export interface RepocheckerRequest {
        queryStringParameters: {
            /** GitHub URL of the adapter repository, e.g. https://github.com/ioBroker/ioBroker.admin */
            url: string;
            branch?: string;
        };
    }

    /** The handler always answers through the callback, never by throwing or rejecting. */
    export interface RepocheckerResponse {
        statusCode: number;
        headers: Record<string, string | boolean>;
        /** JSON encoded RepocheckerResult - the caller has to parse it. */
        body: string;
    }

    /** Shape of `JSON.parse(response.body)` for a request that reached the checks. */
    export interface RepocheckerResult {
        result: 'OK' | 'Errors found';
        checks: string[];
        /** `[E###] message` entries */
        errors: string[];
        /** `[W###]` warnings and `[S###]` suggestions share this list */
        warnings: string[];
        version: string;
        hasTravis?: boolean;
        lastCommitSha?: string;
        /** only present when the run ended in the global error handler */
        error?: string;
    }

    /**
     * The first callback argument is always null - failures are reported inside the response body,
     * so the result has to be inspected rather than the error.
     */
    export function handler(
        request: RepocheckerRequest,
        ctx: unknown,
        callback: (err: null, response: RepocheckerResponse) => void,
    ): void;
}

/** Structural validation of an ioBroker object dump, used by the objectStructure workflow. */
declare module '@iobroker/repochecker/lib/objectStructure' {
    export interface ObjectStructureIssue {
        code: string;
        message: string;
    }

    export interface ObjectStructureResult {
        adapter: string;
        objectCount: number;
        errors: ObjectStructureIssue[];
        warnings: ObjectStructureIssue[];
    }

    /**
     * @param objects Parsed JSON content of the object-dump file.
     * @param adapter Adapter name used for contextual validation.
     */
    export function checkObjectStructure(objects: object, adapter: string): ObjectStructureResult;
}
