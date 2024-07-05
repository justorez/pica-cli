import { defineConfig } from 'rollup'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import esbuild from 'rollup-plugin-esbuild'
import { builtinModules } from 'node:module'
import { readFileSync } from 'node:fs'
import { visualizer } from 'rollup-plugin-visualizer'

const pkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
)

export default defineConfig({
    input: {
        index: 'src/index.ts',
        zip: 'src/zip.ts'
    },
    output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        format: 'es'
    },
    external: [...Object.keys(pkg.dependencies), ...builtinModules, /node:/],
    plugins: [
        json(),
        esbuild({
            platform: 'node',
            minify: true
        }),
        nodeResolve(),
        commonjs(),
        visualizer()
    ]
})
