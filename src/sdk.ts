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
    maxRetry = 3
    retryMap = new Map<string, number>() // <url, retryCount>

    constructor() {
        const jar = new CookieJar()
        const httpProxy = process.env.PICA_PROXY
            ? new URL(process.env.PICA_PROXY as string)
            : false
        this.api = wrapper(
            axios.create({
                baseURL: 'https://picaapi.picacomic.com/',
                // baseURL: 'https://api.manhuapica.com/',
                jar,
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
                // 响应成功，从重试表中删除 url
                const url = res.config.url
                url && this.retryMap.delete(url)

                const result = res.data
                // debug('%s %O', res.config.url, result)

                const responseType = res.config.responseType
                if (responseType === 'arraybuffer') {
                    return res
                }

                if (result.code != 200) {
                    throw new Error('请求失败')
                }
                return result.data
            },
            (error: AxiosError) => {
                const { config, message } = error
                const url = config?.url || ''

                const retryCount = this.retryMap.get(url) || 0
                if (config && retryCount > 0) {
                    this.retryMap.set(url, retryCount - 1)
                    return this.api.request(config)
                } else {
                    this.retryMap.delete(url)
                }

                debug('error %s %O', url, message)
                return Promise.reject(message)
            }
        )
    }

    async login() {
        const res = await this.request('post', 'auth/sign-in', {
            email: process.env.PICA_ACCOUNT,
            password: process.env.PICA_PASSWORD
        }).catch((err) => {
            debug('\n登录异常 %s', err)
            throw new Error('登录失败，请检查账号/密码/网络环境')
        })
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
    async pictures(bookId: string, orderId: string | number, page = 1) {
        const url = `comics/${bookId}/order/${orderId}/pages?page=${page}`
        const res = await this.request('get', url)
        res.pages.docs = res.pages.docs.map((doc: Picture) => {
            const fileServer =
                process.env.PICA_FILE_SERVER || doc.media.fileServer
            return {
                id: doc.id,
                ...doc.media,
                name: doc.media.originalName,
                url: `${fileServer}/static/${doc.media.path}`
            }
        })
        return res.pages as PicturePage
    }

    /**
     * 获取章节下全部图片
     */
    async picturesAll(bookId: string, ep: Episode) {
        const first = await this.pictures(bookId, ep.order)
        const pages = first.pages
        const pictures = first.docs
        for (let i = 2; i <= pages; i++) {
            const res = await this.pictures(bookId, ep.order, i)
            pictures.push(...res.docs)
        }
        const len = String(pictures.length).length
        pictures.forEach((pic, i) => {
            pic.epTitle = ep.title
            pic.name = String(i + 1).padStart(len, '0') + path.extname(pic.name)
        })
        return pictures
    }

    async download(url: string, info: DInfo): Promise<void> {

        // 使用单独的 axios 请求
        // 哔咔的某些文件服务器安全证书不可用，我真服了！
        // 把图片 https 全部换成 http
        const transformUrl = (url: string) => {
            const u = new URL(url)
            return `http://${u.host}${u.pathname}`
        }
        url = transformUrl(url)

        this.retryMap.set(url, this.maxRetry)
        const res = await this.api.get<Buffer>(url, {
            responseType: 'arraybuffer',
            maxRedirects: 0,
            validateStatus: (status) => (status >= 200 && status < 304)
        })

        // 由于 axio 的自动重定向过程无法修改，只好手动处理
        if (res.headers['location']) {
            const nextUrl = transformUrl(res.headers['location'])
            return this.download(nextUrl, info)
        }

        const dir = path.resolve(
            process.cwd(),
            'comics',
            normalizeName(info.title),
            normalizeName(info.epTitle)
        )
        await fs.mkdir(dir, { recursive: true })
        const file = path.resolve(dir, info.picName)
        return fs.writeFile(file, res.data)
    }

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
