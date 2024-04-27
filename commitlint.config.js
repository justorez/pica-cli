export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2, // error
            'always',
            [
                'feat',
                'fix',
                'docs',
                'style',
                'refactor',
                'perf',
                'test',
                'chore',
                'revert',
                'build',
                'wip',
                'ci'
            ]
        ]
    }
}
