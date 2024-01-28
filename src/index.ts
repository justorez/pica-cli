import { Pica } from './sdk'
import { filterPictures, loadEnv } from './utils'
import ora from 'ora'
import { select, checkbox, input } from '@inquirer/prompts'
import ProgressBar from 'progress'
import { Comic } from './types'
import pLimit from 'p-limit'
import pico from 'picocolors'

loadEnv()

async function main() {
    const answer = await select({
        message: '想下载哪些漫画？',
        choices: [
            { name: '排行榜', value: 'leaderboard' },
            { name: '收藏夹', value: 'favorites' },
            { name: '自己搜索', value: 'search' }
        ]
    })

    const spinner = ora('正在登录哔咔').start()
    const pica = new Pica()
    await pica.login()
    spinner.stop()

    const comicIds = []
    if (answer === 'leaderboard') {
        const res = await pica.leaderboard()
        comicIds.push(...res.map((x) => x._id))
    }

    if (answer === 'favorites') {
        const res = await pica.favorites()
        comicIds.push(...res.map((x) => x._id))
    }

    let searchRes: Comic[] = []
    if (answer === 'search') {
        const keyword = await input({
            message: '请输入关键字'
        })

        spinner.start('正在搜索结果')
        searchRes = await pica.searchAll(keyword)
        spinner.stop()

        const selected = await checkbox({
            message: '请选择要下载的漫画',
            pageSize: 8,
            choices: searchRes.map((x) => {
                return {
                    name: x.title,
                    value: x._id
                }
            })
        })
        comicIds.push(...selected)
    }

    for (const cid of comicIds) {
        const title = searchRes.find((x) => x._id === cid)?.title || '' // 漫画标题

        spinner.start('正在获取章节信息')
        const episodes = await pica.episodesAll(cid)
        spinner.stop()

        for (const ep of episodes) {
            spinner.start(`正在获取章节${ep.title}的图片信息`)
            const list = await pica.picturesAll(cid, ep.id, ep.title)
            const pictures = filterPictures(title, list)
            spinner.stop()

            const bar = new ProgressBar(`正在下载 ${title}-${ep.title} [:bar] :current/:total`, {
                incomplete: ' ',
                width: 20,
                total: pictures.length
            })

            const concurrency = Number(process.env.PICA_DL_CONCURRENCY || 5)
            const limit = pLimit(concurrency)
            const tasks = pictures.map((pic) => {
                return limit(() => {
                    return pica.download(pic.url, {
                        title: title,
                        epTitle: pic.epTitle,
                        picName: pic.name
                    }).then(() => bar.tick(1))
                })
            })
            await Promise.all(tasks)
        }

        console.log(pico.green(`✔ ${pico.bold(title)} 下载完成`))
    }
}

main()
