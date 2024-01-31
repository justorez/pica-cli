export default {
    printWidth: 80,
    semi: false,
    singleQuote: true,
    tabWidth: 4,
    useTabs: false,
    trailingComma: 'none',
    overrides: [
        {
            files: ['*.json', '*.yaml', '*.yml'],
            options: {
                tabWidth: 2
            }
        }
    ]
}
