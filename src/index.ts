import { Pica } from './sdk'
import {
    log,
    mark,
    loadEnv,
    filterEpisodes,
    filterPictures,
    isValidComicId,
    selectChapterByInput
} from './utils'
import ora from 'ora'
import Input from '@inquirer/input'
import Password from '@inquirer/password'
import Select from '@inquirer/select'
import Checkbox from '@inquirer/checkbox'
import ProgressBar from 'progress'
import { Comic } from './types'
import pLimit from 'p-limit'
import pico from 'picocolors'
import Table from 'cli-table3'

loadEnv()

const keysTip = [
    `${pico.cyan('<space>')} 选中`,
    `${pico.cyan('<a>')} 全选`,
    `${pico.cyan('<i>')} 反选`,
    `${pico.cyan('<enter>')} 确认`
]
const checkboxHelpTip = ` (${keysTip.join(', ')})`

async function main() {
    const {
        PICA_ACCOUNT,
        PICA_PASSWORD,
        PICA_DL_CONTENT,
        PICA_DL_CHAPTER,
        PICA_DL_FAV_PAGE,
        PICA_DL_CONCURRENCY,
        PICA_PRINT_FAVS,
        PICA_IN_GITHUB
    } = process.env
    const PICA_DL_SEARCH_KEYWORDS = process.env.PICA_DL_SEARCH_KEYWORDS?.trim()

    const account =
        PICA_ACCOUNT ||
        (await Input({
            message: '请输入账户名称',
            transformer: (val) => val.trim()
        }))
    const password =
        PICA_PASSWORD ||
        (await Password({
            message: '请输入账户密码',
            mask: true
        }))

    const spinner = ora('正在登录哔咔').start()
    const pica = new Pica()
    await pica.login(account, password)
    spinner.stop()

    const answer =
        PICA_DL_CONTENT ||
        (await Select({
            message: '想下载哪些漫画？',
            choices: [
                { name: '去搜索', value: 'search' },
                { name: '收藏夹', value: 'favorites' },
                { name: '排行榜', value: 'leaderboard' }
            ]
        }))

    const comics: Comic[] = []
    if (answer === 'leaderboard') {
        const res = await pica.leaderboard()
        comics.push(...res)
    }

    if (answer === 'favorites') {
        spinner.start('正在获取收藏夹信息')
        const res = await pica.favoritesAll(PICA_DL_FAV_PAGE)
        comics.push(...res.comics)
        spinner.stop()

        log.info(
            `收藏夹共有 ${pico.cyan(res.pages)} 页${
                PICA_DL_FAV_PAGE
                    ? `, 第 ${pico.cyan(PICA_DL_FAV_PAGE)} 页等待下载`
                    : ''
            }`
        )
    }
    if (PICA_PRINT_FAVS) {
        const res = await pica.favoritesAll()
        const table = new Table({
            head: ['cid', 'title']
        })
        res.comics.forEach((item) => table.push([item._id, item.title]))
        console.log('收藏夹全部漫画信息：')
        console.log(table.toString())
    }

    if (answer === 'search') {
        if (PICA_IN_GITHUB && !PICA_DL_SEARCH_KEYWORDS) {
            log.warn('没有输入搜索关键字')
            return
        }

        let searchRes: Comic[] = []

        const inputStr =
            PICA_DL_SEARCH_KEYWORDS ||
            (await Input({
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

            if (searchRes.length === 0) {
                continue
            }

            const selected = PICA_DL_SEARCH_KEYWORDS
                ? searchRes
                : await Checkbox({
                      message: '请选择要下载的漫画',
                      pageSize: 10,
                      loop: false,
                      instructions: checkboxHelpTip,
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

    if (comics.length === 0) {
        log.log('没有找到相应的漫画')
        return
    }

    log.info(`${pico.cyan(comics.length)} 部漫画等待下载`)

    for (const comic of comics) {
        const title = comic.title.trim()
        const cid = comic._id

        spinner.start('正在获取章节信息')
        let episodes = await pica.episodesAll(cid).catch((error) => {
            if (error === 400) {
                spinner.stop()
                log.error(`「${title}」无法访问，可能已被哔咔禁止`)
            }
            return []
        })
        episodes = filterEpisodes(episodes, cid)
        spinner.stop()

        if (episodes.length === 0) {
            continue
        }

        log.info(`${title} 查询到 ${pico.cyan(episodes.length)} 个未下载章节`)

        const selectedEpisodes = PICA_DL_CHAPTER
            ? selectChapterByInput(PICA_DL_CHAPTER, episodes)
            : PICA_IN_GITHUB
              ? episodes
              : await Checkbox({
                    message: '请选择要下载的章节',
                    pageSize: 10,
                    instructions: checkboxHelpTip,
                    choices: episodes.map((ep) => {
                        return {
                            name: ep.title.trim(),
                            value: ep
                        }
                    })
                })

        for (const ep of selectedEpisodes) {
            spinner.start(`正在获取章节 ${pico.cyan(ep.title)} 的图片列表`)
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
                return limit(async () => {
                    await pica.download(pic.url, {
                        title: title,
                        epTitle: pic.epTitle,
                        picName: pic.name
                    })
                    return bar.tick()
                })
            })

            await Promise.all(tasks)
            mark(cid, ep.id)
        }

        log.success(`${title} 下载完成`)
    }
}

process.on('uncaughtException', (err) => {
    console.log()
    log.error(`${err.message}`)
    process.exit(0)
})

process.on('SIGINT', () => {
    console.log()
    process.exit(0)
})

main()
