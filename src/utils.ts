import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'
import fs from 'node:fs'
import { MPicture } from './types'
import Debug from 'debug'

export const debug = Debug('pica')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 过滤掉已下载的漫画内容
 * @param title 漫画标题
 */
export function filterPictures(title: string, pictures: MPicture[]) {
    const dir = resolvePath('../comics', normalizeName(title))
    if (!fs.existsSync(dir)) return pictures

    const downloaded: string[] = []
    for (const epDir of fs.readdirSync(dir)) {
        const files = fs.readdirSync(path.join(dir, epDir))
        downloaded.push(...files.map(file => `${epDir}/${file}`))
    }
    
    debug('%O', downloaded)
    return pictures.filter(pic => !downloaded.includes(`${pic.epTitle}/${pic.name}`))
}

export function loadEnv() {
    const env = resolvePath('../.env.local')
    if (fs.existsSync(env)) {
        dotenv.config({
            path: env
        })
    }
}

export function resolvePath(...args: string[]) {
    return path.resolve(__dirname, ...args)
}

/**
 * 将 Windows 文件和文件夹名称不允许的特殊字符替换为合法字符
 */
export function normalizeName(s: string) {
    return s
        .replace(/\//g, '／')
        .replace(/\\/g, '＼')
        .replace(/\?/g, '？')
        .replace(/\|/g, '︱')
        .replace(/"/g, '＂')
        .replace(/\*/g, '＊')
        .replace(/</g, '＜')
        .replace(/>/g, '＞')
        .replace(/:/g, '-')
}
