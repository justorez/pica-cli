import axios, { AxiosError } from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import headers from './data/headers.json'
import { createHmac } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { normalizeName, debug } from './utils'
import {
    Comic,
    Episode,
    DInfo,
    Picture,
    PicturePage,
    MPicture,
    SearchPage
} from './types'

export class Pica {
    Order = {
        default: 'ua', // 默认
        latest: 'dd', // 新到旧
        oldest: 'da', // 旧到新
        loved: 'ld', // 最多爱心
        point: 'vd' // 最多指名
    }
    api // 分页默认为每页 40 条
    token: string | undefined

    constructor() {
        const jar = new CookieJar()
        const httpProxy = process.env.PICA_PROXY
            ? new URL(process.env.PICA_PROXY as string)
            : false
        this.api = wrapper(
            axios.create({
                jar,
                baseURL: 'https://picaapi.picacomic.com/',
                // baseURL: 'https://api.manhuapica.com/',
                proxy: httpProxy
                    ? {
                          protocol: httpProxy.protocol,
                          host: httpProxy.hostname,
                          port: Number(httpProxy.port)
                      }
                    : false
            })
        )
        this.api.interceptors.request.use((config) => {
            let { url, method } = config
            url = url?.replace(/^\/|\/$/g, '') // url 首尾不能有 "/"
            const timestamp = String(Date.now()).slice(0, -3)
            const raw =
                url + timestamp + headers.nonce + method + headers['api-key']
            const hmac = createHmac(
                'sha256',
                process.env.PICA_SECRET_KEY as string
            )
            hmac.update(raw.toLowerCase())
            headers.signature = hmac.digest('hex')
            headers.time = timestamp
            config.headers.set(headers)
            if (this.token) {
                config.headers.setAuthorization(this.token)
            }
            return config
        })
        this.api.interceptors.response.use(
            (res) => {
                const result = res.data
                // debug('%s %O', res.config.url, result)

                const responseType = res.config.responseType
                if (responseType === 'arraybuffer') return result

                if (result.code != 200) {
                    throw new Error('请求失败')
                }
                return result.data
            },
            (error: AxiosError) => {
                debug('error %s %O', error.config?.url, error.message)
                return Promise.reject(error.message)
            }
        )
    }

    async login() {
        const res = await this.request('post', 'auth/sign-in', {
            email: process.env.PICA_ACCOUNT,
            password: process.env.PICA_PASSWORD
        }).catch(() => Promise.reject(new Error('账号或密码错误')))
        if (!res.token) {
            throw new Error('PICA_SECRET_KEY 错误')
        }
        this.token = res.token
    }

    comics(block: string, tag: string, order: string, page = 1) {
        const params = new URLSearchParams()
        if (block) params.set('c', block)
        if (tag) params.set('t', tag)
        if (order) params.set('s', order)
        if (page > 0) params.set('page', String(page))
        const url = `comics?${params}`
        return this.request('get', url)
    }

    /**
     * 排行榜
     */
    async leaderboard() {
        const params = new URLSearchParams({
            tt: 'H24', // H24, D7, D30 (天/周/月)
            ct: 'VC'
        })
        const url = `comics/leaderboard?${params}`
        const res = await this.request('get', url)
        return res.comics as Comic[]
    }

    /**
     * 漫画详细信息
     */
    async comicInfo(bookId: string) {
        const url = `comics/${bookId}`
        const res = await this.request('get', url)
        return res.comic
    }

    /**
     * 获取漫画分页章节
     */
    async episodes(bookId: string, page = 1) {
        const url = `comics/${bookId}/eps?page=${page}`
        const res = await this.request('get', url)
        return res.eps
    }

    /**
     * 获取漫画全部章节
     */
    async episodesAll(bookId: string) {
        const firstPage = await this.episodes(bookId)
        let pages = firstPage.pages // 总页数
        let total = firstPage.total // 总章节数
        const episodes = firstPage.docs as Episode[]
        for (let i = 2; i <= pages; i++) {
            const res = await this.episodes(bookId, i)
            episodes.push(...res.docs)
        }

        if (episodes.length !== total) {
            throw new Error(`章节数错误，应为${total}，实际${episodes.length}`)
        }
        return episodes.sort((a, b) => a.order - b.order)
    }

    /**
     * 获取章节下图片
     */
    async pictures(bookId: string, epId: string, page = 1) {
        const url = `comics/${bookId}/order/${epId}/pages?page=${page}`
        const res = await this.request('get', url)
        res.pages.docs = res.pages.docs.map((doc: Picture) => {
            return {
                id: doc.id,
                ...doc.media,
                name: doc.media.originalName,
                url: `${doc.media.fileServer}/static/${doc.media.path}`
            }
        })
        return res.pages as PicturePage
    }

    /**
     * 获取章节下全部图片
     */
    async picturesAll(bookId: string, epId: string, epTitle: string) {
        const first = await this.pictures(bookId, epId)
        const pages = first.pages
        const pictures = first.docs
        for (let i = 2; i <= pages; i++) {
            const res = await this.pictures(bookId, epId, i)
            pictures.push(...res.docs)
        }
        const len = String(pictures.length).length
        pictures.forEach((pic, i) => {
            pic.epTitle = epTitle
            pic.name = String(i+1).padStart(len, '0') + path.extname(pic.name)
        })
        return pictures
    }

    async download(url: string, info: DInfo) {
        const data = await this.api.get(url, { responseType: 'arraybuffer' })
        const dir = path.resolve(
            process.cwd(),
            'comics',
            normalizeName(info.title),
            normalizeName(info.epTitle)
        )
        await fs.mkdir(dir, { recursive: true })
        const file = path.resolve(dir, info.picName)
        return fs.writeFile(file, data as unknown as Buffer)
    }

    /**
     * 获取漫画的全部图片，包含章节信息
     * 暂不可用，太耗时
     */
    // async comicPictures(bookId: string) {
    //     const pictures: MPicture[] = []
    //     const episodes = await this.episodesAll(bookId)
    //     for (const ep of episodes) {
    //         console.log(ep)
    //         const res = await this.picturesAll(bookId, ep.id)
    //         res.forEach(x => x.epTitle = normalizeName(ep.title))
    //         pictures.push(...res)
    //     }
    //     return pictures
    // }

    async search(keyword: string, page = 1, sort = this.Order.latest) {
        const url = `comics/advanced-search?page=${page}`
        const data = { keyword, sort }
        const res = await this.request('post', url, data)
        return res.comics as SearchPage
    }

    async searchAll(keyword: string) {
        const comics = []
        if (keyword) {
            const first = await this.search(keyword)
            const pages = first.pages
            comics.push(...first.docs)
            for (let page = 2; page <= pages; page++) {
                const res = await this.search(keyword, page)
                comics.push(...res.docs)
            }
        }
        return comics
    }

    categories() {
        const url = 'categories'
        return this.request('get', url)
    }

    /**
     * 收藏/取消收藏
     */
    fav(bookId: string) {
        const url = `comics/${bookId}/favourite`
        return this.request('post', url)
    }

    /**
     * 获取收藏夹的内容
     */
    async favorites() {
        const url = 'users/favourite'
        const res = await this.request('get', url)
        return res.comics.docs as Comic[]
    }

    /**
     * 打卡
     */
    punchIn() {
        const url = 'users/punch-in'
        return this.request('post', url)
    }

    request(
        method: string,
        url: string,
        data?: object
    ): Promise<Record<string, any>> {
        return this.api.request({
            url,
            method,
            headers,
            data
        })
    }
}
