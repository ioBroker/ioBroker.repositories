/**
 * Ambient declarations for dependencies that ship no types.
 *
 * These are deliberately untyped (`any`): the repochecker payloads and node.extend are third party
 * shapes this repository only forwards. Tightening them is follow-up work.
 */

declare module '@iobroker/repochecker';
declare module '@iobroker/repochecker/lib/objectStructure';
declare module 'node.extend';
