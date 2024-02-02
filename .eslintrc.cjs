module.exports = {
    root: true,
    env: {
        node: true,
        es2020: true
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest'
    },
    plugins: ['@typescript-eslint', 'prettier'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    rules: {
        'prettier/prettier': 'warn',
        'no-unref': 'off',
        'no-undef': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off'
    },
    ignorePatterns: [
        'dist',
        'node_modules',
        'tmp',
        '*.d.ts',
        '*.{md,json,yaml,yml,html}'
    ],
    overrides: []
}
