import path from 'node:path'
import dotenv from 'dotenv'
import fs from 'node:fs'
import { Episode, Picture } from './types'
import Debug from 'debug'
import pico from 'picocolors'
import figures from 'figures'

export const debug = Debug('pica')

/**
 * @param input `all` or `1,3,5-20`
 */
export function selectChapterByInput(input: string, episodes: Episode[]) {
    input = input.trim()

    if (['all', '全部', '所有'].includes(input)) {
        return episodes
    }

    const idx = input
        .split(/[,，]/)
        .reduce((pre: number[], cur: string) => {
            if (!cur) return pre
            if (cur.includes('-')) {
                const index = cur.split('-').map((s) => Number(s))
                for (let i = index[0]; i <= index[1]; i++) {
                    pre.push(i)
                }
            } else {
                pre.push(Number(cur))
            }
            return pre
        }, [])
        .filter((n) => Number.isInteger(n))

    return idx.length !== 0
        ? episodes.filter((_, index) => idx.includes(index + 1))
        : episodes
}

export function isValidComicId(cid: string) {
    return /^[0-9a-zA-Z]{24}$/.test(cid)
}

/**
 * 标记某章节已下载完成，并记录到本地临时文件
 */
export function mark(bookId: string, epId: string) {
    const dir = resolvePath('comics')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'done.txt'), `${bookId}/${epId}\n`, 'utf8')
}

/**
 * 过滤掉已下载的章节
 */
export function filterEpisodes(episodes: Episode[], bookId: string) {
    const donePath = resolvePath('comics/done.txt')
    if (!fs.existsSync(donePath)) {
        return episodes
    }
    const done = fs
        .readFileSync(donePath, 'utf8')
        .split(/\n|\r\n/)
        .filter((x) => x)
    return episodes.filter((ep) => !done.includes(`${bookId}/${ep.id}`))
}

/**
 * 过滤掉某章节下已下载的图片
 * @param title 漫画标题
 * @param epTitle 章节标题
 */
export function filterPictures(
    pictures: Picture[],
    title: string,
    epTitle: string
) {
    const dir = resolvePath(
        'comics',
        normalizeName(title),
        normalizeName(epTitle)
    )
    if (!fs.existsSync(dir)) {
        return pictures
    }
    const files = fs.readdirSync(dir)
    return pictures.filter((pic) => !files.includes(pic.name))
}

export function loadEnv() {
    const env = resolvePath('.env.local')
    if (fs.existsSync(env)) {
        dotenv.config({
            path: env
        })
    }
}

export function resolvePath(...args: string[]) {
    return path.resolve(process.cwd(), ...args)
}

/**
 * 将 Windows 文件和文件夹名称不允许的特殊字符替换为合法字符
 */
export function normalizeName(s: string) {
    return s
        .trim()
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

// √ ✕
export const log = {
    log: (...msg: unknown[]) => console.log(...msg),
    info: (...msg: unknown[]) => console.log(pico.cyan('➡️'), ...msg),
    warn: (...msg: unknown[]) =>
        console.log(pico.yellow(`${figures.warning} ${msg.join(' ')}`)),
    error: (...msg: unknown[]) =>
        console.log(pico.red(`${figures.cross} ${msg.join(' ')}`)),
    success: (...msg: unknown[]) =>
        console.log(pico.green(`${figures.tick} ${msg.join(' ')}`))
}

export function sleep(s: number) {
    return new Promise((r) => setTimeout(r, s * 1000))
}
