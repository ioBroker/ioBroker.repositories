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

// The repochecker payloads are third party shapes this repository only forwards. Both of these are
// plain CommonJS without an __esModule marker, so a default import resolves to the module itself.
declare module '@iobroker/repochecker';
declare module '@iobroker/repochecker/lib/objectStructure';
