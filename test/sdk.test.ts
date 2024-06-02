import { Pica } from '../src/sdk'
import path from 'node:path'
import fs from 'node:fs'
import { beforeAll, describe, it, expect } from 'vitest'
import { loadEnv } from '../src/utils'

loadEnv()

// 保存测试中的数据，可以在后续开发中参考响应的数据结构
const p = (...args: string[]) => path.resolve(process.cwd(), 'tmp', ...args)

describe('测试哔咔相关 API', () => {
    const pica = new Pica()

    beforeAll(async () => {
        const account = process.env.PICA_ACCOUNT || ''
        const password = process.env.PICA_PASSWORD || ''
        await pica.login(account, password)
    })

    it('获取排行榜', async () => {
        const res = await pica.leaderboard()
        fs.writeFileSync(p('leaderboard.json'), JSON.stringify(res), 'utf8')
    })

    it('获取收藏夹的某一页', async () => {
        const res = await pica.favorites()
        fs.writeFileSync(p('favorites.json'), JSON.stringify(res), 'utf8')
    })

    it('获取收藏夹全部内容', async () => {
        const res = await pica.favoritesAll()
        fs.writeFileSync(p('favoritesAll.json'), JSON.stringify(res), 'utf8')
    })

    it('搜索漫画', async () => {
        const res = await pica.searchAll('美丽新世界')
        expect(res[0].title).toBe('美丽新世界')
        fs.writeFileSync(p('searchAll.json'), JSON.stringify(res), 'utf8')
    })

    const bookId = '5ccb04083478850224b4da84'

    it.skip('获取漫画全部章节', async () => {
        const res = await pica.episodesAll(bookId)
        fs.writeFileSync(p('episodesAll.json'), JSON.stringify(res), 'utf8')
    })

    it.skip('获取章节下的图片', async () => {
        const ep = (await pica.episodes(bookId)).docs[0]
        const res = await pica.picturesAll(bookId, ep)
        fs.writeFileSync(
            p(`picturesAll.${ep.order}.json`),
            JSON.stringify(res),
            'utf8'
        )
    })

    it('被禁止访问的漫画响应400', async () => {
        try {
            const bookId = '5ca02791a550ec2474e788e2'
            await pica.episodes(bookId)
        } catch (error) {
            expect(error).toBe(400)
            if (error === 400) {
                console.error(`无法访问，可能已被哔咔禁止`)
            }
        }
    })
})
