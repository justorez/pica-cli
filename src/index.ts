import { Pica } from './sdk'
import { filterEpisodes, filterPictures, loadEnv, mark } from './utils'
import ora from 'ora'
import { select, checkbox, input } from '@inquirer/prompts'
import ProgressBar from 'progress'
import { Comic } from './types'
import pLimit from 'p-limit'
import picos from 'picocolors'

loadEnv()

async function main() {
    const answer =
        process.env.PICA_DL_CONTENT ||
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

    let searchRes: Comic[] = []
    if (answer === 'search') {
        const keywords =
            process.env.PICA_DL_SEARCH_KEYWORDS ||
            (await input({
                message: '请输入关键字'
            }))

        for (const keyword of keywords.split('#')) {
            spinner.start(`正在搜索 ${keyword}`)
            searchRes = await pica.searchAll(keyword)
            spinner.stop()

            const selected = process.env.PICA_DL_SEARCH_KEYWORDS
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

        console.log(`${picos.cyan('➡️')} ${title} 查询到 ${episodes.length} 个章节`)

        for (const ep of episodes) {
            spinner.start(`正在获取章节 ${ep.title} 的图片信息`)
            let pictures = await pica.picturesAll(cid, ep)
            pictures = filterPictures(pictures, title, ep.title)
            spinner.stop()

            const bar = new ProgressBar(
                `${picos.cyan('➡️')} ${title} ${ep.title} [:bar] :current/:total`,
                {
                    incomplete: ' ',
                    width: 20,
                    total: pictures.length
                }
            )

            const concurrency = Number(process.env.PICA_DL_CONCURRENCY || 5)
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

        console.log(picos.green(`${picos.green('✓')} ${picos.bold(title)} 下载完成`))
    }
}

process.on('uncaughtException', (err) => {
    console.error(err.message)
    process.exit(0)
})

process.on('SIGINT', () => {
    console.log('\n')
    process.exit(0)
})

main()
