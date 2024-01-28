import { Pica } from '../src/sdk'
import path from 'node:path'
import fs from 'node:fs'
import { beforeAll, describe, it } from 'vitest'
import { loadEnv } from '../src/utils'

loadEnv()

// 保存测试中的数据，可以在后续开发中参考响应的数据结构
const p = (...args: string[]) => path.resolve(process.cwd(), 'tmp', ...args)
const pica = new Pica()

beforeAll(async () => {
    await pica.login()
})

describe('测试哔咔相关 API', () => {
    it('获取排行榜', async () => {
        const res = await pica.leaderboard()
        fs.writeFileSync(p('leaderboard.json'), JSON.stringify(res), 'utf8')
    })

    it('获取收藏夹', async () => {
        const res = await pica.favorites()
        fs.writeFileSync(p('favorites.json'), JSON.stringify(res), 'utf8')
    })

    it('搜索漫画',async () => {
        const res = await pica.searchAll('美丽新世界')
        fs.writeFileSync(p('searchAll.json'), JSON.stringify(res), 'utf8')
    })

    const bookId = '5ccb04083478850224b4da84'
    const epId = '5ccb04083478850224b4da85'

    it('获取漫画全部章节', async () => {
        const res = await pica.episodesAll(bookId)
        fs.writeFileSync(p('episodesAll.json'), JSON.stringify(res), 'utf8')
    })

    it('获取章节下的图片', async () => {
        const res = await pica.picturesAll(bookId, epId, 'Ch.1')
        fs.writeFileSync(p('picturesAll.json'), JSON.stringify(res), 'utf8')
    })
})
