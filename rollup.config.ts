import { defineConfig } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json'

export default defineConfig({
    input: 'src/index.ts',
    plugins: [
        typescript(),
        json(),
        terser()
    ],
    output: [
        { file: 'dist/index.js', format: 'es' }
    ]
})
