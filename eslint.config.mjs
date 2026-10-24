import config from '@iobroker/eslint-config';

// @iobroker/eslint-config only knows **/*.ts; the sources here are .mts (see tsconfig.json), so every
// block of the shared config that targets .ts is widened to .mts as well.
const TS_MTS = config.map(block =>
    Array.isArray(block.files) && block.files.includes('**/*.ts')
        ? { ...block, files: [...block.files, '**/*.mts'] }
        : block,
);

export default [
    {
        // build output, the plain-JS workflow scripts in lib/ and their tests in test/ (kept in
        // their original style on purpose) and the standalone local npm mirror are not part of
        // the TypeScript project
        ignores: ['build/**', 'lib/**', 'test/**', 'localNpmRepo/**', 'list/**', '.archive/**'],
    },
    ...TS_MTS,
    {
        languageOptions: {
            parserOptions: {
                // @iobroker/eslint-config enables `projectService`, which discovers tsconfig.json
                // on its own - setting `project` here as well is an error since v2.3.
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // disable temporary the rule 'jsdoc/require-param' and enable 'jsdoc/require-jsdoc'
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
        },
    },
    {
        // only the TypeScript sources - some of these rules need type information, which the
        // .mjs config files at the repository root do not have
        files: ['src/**/*.ts', 'src/**/*.mts'],
        // ---------------------------------------------------------------------------------
        // Tightening backlog of the JavaScript -> TypeScript migration.
        //
        // These are reported as warnings rather than errors on purpose: the findings stay
        // visible (and countable) but do not fail `npm run lint`, so the migration could land
        // without rewriting ~200 call sites of unattended production automation for style
        // reasons. Raise them back to 'error' one rule at a time as the code is cleaned up.
        // ---------------------------------------------------------------------------------
        rules: {
            // ~165 functions still rely on inferred return types
            '@typescript-eslint/explicit-function-return-type': 'warn',
            '@typescript-eslint/explicit-module-boundary-types': 'warn',

            // deliberate: several modules require() lazily inside a function so the dependency
            // is only loaded on the code path that needs it (e.g. @iobroker/repochecker)
            '@typescript-eslint/no-require-imports': 'warn',

            // callback-era leftovers - changing these alters timing or error propagation in
            // scripts that post to GitHub, so they need individual review
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/prefer-promise-reject-errors': 'warn',
            '@typescript-eslint/require-await': 'warn',
            '@typescript-eslint/restrict-template-expressions': 'warn',
            '@typescript-eslint/no-base-to-string': 'warn',
        },
    },
];
