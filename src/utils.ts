import path from 'node:path'
import dotenv from 'dotenv'
import fs from 'node:fs'
import { Episode, MPicture } from './types'
import Debug from 'debug'

export const debug = Debug('pica')

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
    const done = fs.readFileSync(donePath, 'utf8').split(/\n|\r\n/).filter(x => x)
    return episodes.filter(ep => !done.includes(`${bookId}/${ep.id}`))
}

/**
 * 过滤掉某章节下已下载的图片
 * @param title 漫画标题
 * @param epTitle 章节标题
 */
export function filterPictures(pictures: MPicture[], title: string, epTitle: string) {
    const dir = resolvePath('comics', normalizeName(title), normalizeName(epTitle))
    if (!fs.existsSync(dir)) {
        return pictures
    }
    const files = fs.readdirSync(dir)
    return pictures.filter(pic => !files.includes(pic.name))
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
