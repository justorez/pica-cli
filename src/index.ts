import { Pica } from './sdk'
import {
    log,
    mark,
    loadEnv,
    filterEpisodes,
    filterPictures,
    isValidComicId
} from './utils'
import ora from 'ora'
import input from '@inquirer/input'
import select from '@inquirer/select'
import checkbox from '@inquirer/checkbox'
import ProgressBar from 'progress'
import { Comic } from './types'
import pLimit from 'p-limit'
import pico from 'picocolors'

loadEnv()

async function main() {
    const { PICA_DL_CONTENT, PICA_DL_CONCURRENCY, PICA_IS_GITHUB } = process.env
    const PICA_DL_SEARCH_KEYWORDS = process.env.PICA_DL_SEARCH_KEYWORDS?.trim()

    const answer =
        PICA_DL_CONTENT ||
        (await select({
            message: '想下载哪些漫画？',
            choices: [
                { name: '排行榜', value: 'leaderboard' },
                { name: '收藏夹', value: 'favorites' },
                { name: '去搜索', value: 'search' }
            ]
        }))

    const spinner = ora('正在登录哔咔').start()
    const pica = new Pica()
    await pica.login()
    spinner.stop()

    const comics: Comic[] = []
    if (answer === 'leaderboard') {
        const res = await pica.leaderboard()
        comics.push(...res)
    }

    if (answer === 'favorites') {
        const res = await pica.favorites()
        comics.push(...res)
    }

    if (answer === 'search') {
        if (PICA_IS_GITHUB && !PICA_DL_SEARCH_KEYWORDS) {
            log.warn('没有输入搜索关键字')
            return
        }

        let searchRes: Comic[] = []

        const inputStr =
            PICA_DL_SEARCH_KEYWORDS ||
            (await input({
                message: '请输入关键字或者漫画ID (多个用 # 隔开)',
                transformer: (val) => val.trim()
            }))

        if (!inputStr) {
            log.warn('没有输入搜索关键字')
            return
        }

        const inputKeys = inputStr.split('#')

        // 根据漫画ID查询
        const bookIds = inputKeys.filter((k: string) => isValidComicId(k))
        for (const id of bookIds) {
            try {
                const info = await pica.comicInfo(id)
                info.title = info.title.trim()
                comics.push(info)
                log.info(`${info.title} 已加入下载队列`)
            } catch (error) {
                log.error(`无效漫画ID ${id}`)
            }
        }

        // 根据关键字查询
        const keywords = inputKeys.filter((k: string) => !isValidComicId(k))
        for (const keyword of keywords) {
            spinner.start(`正在搜索 ${keyword}`)
            searchRes = await pica.searchAll(keyword)
            spinner.stop()

            const selected = PICA_DL_SEARCH_KEYWORDS
                ? searchRes
                : await checkbox({
                      message: '请选择要下载的漫画',
                      pageSize: 10,
                      loop: false,
                      choices: searchRes.map((x) => {
                          return {
                              name: x.title.trim(),
                              value: x
                          }
                      })
                  })
            comics.push(...selected)
        }
    }

    for (const comic of comics) {
        const title = comic.title.trim()
        const cid = comic._id

        spinner.start('正在获取章节信息')
        let episodes = await pica.episodesAll(cid)
        episodes = filterEpisodes(episodes, cid)
        spinner.stop()

        log.info(`${title} 查询到 ${episodes.length} 个章节`)

        for (const ep of episodes) {
            spinner.start(`正在获取章节 ${ep.title} 的图片信息`)
            let pictures = await pica.picturesAll(cid, ep)
            pictures = filterPictures(pictures, title, ep.title)
            spinner.stop()

            const bar = new ProgressBar(
                `${pico.cyan('➡️')} ${title} ${ep.title} [:bar] :current/:total`,
                {
                    incomplete: ' ',
                    width: 20,
                    total: pictures.length
                }
            )

            const concurrency = Number(PICA_DL_CONCURRENCY || 5)
            const limit = pLimit(concurrency)
            const tasks = pictures.map((pic) => {
                return limit(() => {
                    return pica
                        .download(pic.url, {
                            title: title,
                            epTitle: pic.epTitle,
                            picName: pic.name
                        })
                        .then(() => bar.tick())
                })
            })

            await Promise.all(tasks)

            mark(cid, ep.id)
        }

        log.success(`${title} 下载完成`)
    }
}

process.on('uncaughtException', (err) => {
    console.log('\n')
    log.error(`${err.message}`)
    process.exit(0)
})

process.on('SIGINT', () => {
    console.log('\n')
    process.exit(0)
})

main()
