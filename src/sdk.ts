import axios, { AxiosError } from 'axios'
import path from 'node:path'
import fs from 'node:fs/promises'
import { normalizeName, debug } from './utils'
import {
    Comic,
    Episode,
    DInfo,
    PagePicture,
    PageSearch,
    PageEpisode,
    PageFavorites,
    ExpectedPage
} from './types'

// ─── 花咋漫画 BFF API ────────────────────────────────────────
// 原哔咔: https://picaapi.picacomic.com/
// 花咋BFF: https://app.huakacomic.com/api/bff/
// 签名算法已移除（BFF 层在服务端处理，客户端只需传 token）
// ────────────────────────────────────────────────────────────

export class Pica {
    Order = {
        default: 'ua',
        latest: 'dd',
        oldest: 'da',
        loved: 'ld',
        point: 'vd'
    }
    api
    token: string | undefined
    maxRetry = 3
    retryMap = new Map<string, number>()

    constructor() {
        const httpProxy = process.env.PICA_PROXY
            ? new URL(process.env.PICA_PROXY as string)
            : false

        this.api = axios.create({
            baseURL: 'https://app.huakacomic.com/api/bff/',
            proxy: httpProxy
                ? {
                      protocol: httpProxy.protocol,
                      host: httpProxy.hostname,
                      port: Number(httpProxy.port)
                  }
                : false
        })

        // 请求拦截器：只加 token，不做 HMAC 签名
        this.api.interceptors.request.use((config) => {
            config.headers.set('Content-Type', 'application/json')
            config.headers.set('Accept', 'application/json')
            if (this.token) {
                config.headers.set('Authorization', `Bearer ${this.token}`)
            }
            return config
        })

        // 响应拦截器
        this.api.interceptors.response.use(
            (res) => {
                const url = res.config.url
                url && this.retryMap.delete(url)

                const responseType = res.config.responseType
                if (responseType === 'arraybuffer') {
                    return res
                }

                debug('\n%s %O', url, res.data)

                // 花咋 BFF 响应格式: { statusCode, message, data, error }
                const result = res.data
                if (result.statusCode && result.statusCode !== 200) {
                    throw new Error(result.message || '请求失败')
                }
                // 返回 data 字段，与原哔咔结构保持一致
                return result.data ?? result
            },
            (error: AxiosError) => {
                const { config, message, response } = error

                if (response?.status === 400 || response?.status === 403) {
                    return Promise.reject(response?.status)
                }

                const url = config?.url || ''
                const retryCount = this.retryMap.get(url) || 0
                if (config && retryCount > 0) {
                    this.retryMap.set(url, retryCount - 1)
                    return this.api.request(config)
                } else {
                    this.retryMap.delete(url)
                }

                debug('\nerror %s %s %O', url, message, response?.data)
                return Promise.reject(message)
            }
        )
    }

    async login(account: string, password: string) {
        debug('\n%s %s', account, password)

        // 花咋登录接口：POST /api/bff/auth/sign-in
        // 请求体: { email, password }
        // 响应: { statusCode: 200, data: { token, user, ... } }
        const res = await this.api.post('auth/sign-in', {
            email: account,
            password: password
        }).catch((err) => {
            debug('\n登录异常 %s', err)
            throw new Error('登录失败，请检查账号/密码/网络环境')
        })

        // res 经过拦截器处理后已经是 data 字段
        const token = res?.token || res?.accessToken
        if (!token) {
            debug('\n登录响应 %O', res)
            throw new Error('登录失败，未获取到 token')
        }
        this.token = token
    }

    /**
     * 漫画详细信息
     * GET /api/bff/comics/:id
     */
    async comicInfo(bookId: string) {
        const res = await this.api.get(`comics/${bookId}`)
        // 兼容两种响应结构
        const comic = res?.comic || res
        // 对齐原哔咔 Comic 类型字段
        return {
            _id: comic.id || comic._id || bookId,
            title: comic.title || comic.name || bookId,
            author: comic.author || '',
            ...comic
        } as Comic
    }

    /**
     * 获取漫画全部章节
     * GET /api/bff/comics/:id/episodes?page=1&pageSize=100
     */
    async episodesAll(bookId: string) {
        const allEpisodes: Episode[] = []
        let page = 1

        while (true) {
            const res = await this.api.get(
                `comics/${bookId}/episodes?page=${page}&pageSize=100`
            )
            // 兼容多种响应结构
            const eps: any[] = res?.episodes || res?.list || res?.docs || res || []
            if (eps.length === 0) break

            // 对齐原哔咔 Episode 类型字段
            const normalized = eps.map((ep: any, i: number) => ({
                id: ep.id || ep._id,
                _id: ep.id || ep._id,
                title: ep.title || ep.name || `第${ep.order || i + 1}话`,
                order: ep.order || ep.sortOrder || i + 1,
                ...ep
            })) as Episode[]

            allEpisodes.push(...normalized)

            const hasMore = res?.nextPageToken || eps.length === 100
            if (!hasMore) break
            page++
            if (page > 100) break // 安全上限
        }

        return allEpisodes.sort((a, b) => (a.order || 0) - (b.order || 0))
    }

    /**
     * 获取章节下全部图片
     * GET /api/bff/comic-pages?episodeId=:episodeId
     */
    async picturesAll(bookId: string, ep: Episode) {
        const allPages: any[] = []
        let pageToken: string | null = null

        do {
            const url = `comic-pages?episodeId=${ep.id || ep._id}` +
                (pageToken ? `&pageToken=${pageToken}` : '')
            const res = await this.api.get(url)
            const pages: any[] = res?.pages || res?.docs || res || []
            allPages.push(...pages)
            pageToken = res?.nextPageToken || null
        } while (pageToken)

        const len = String(allPages.length).length
        return allPages.map((page: any, i: number) => {
            // 花咋图片直接有完整 mediaUrl，不需要拼接 fileServer
            const ext = path.extname(new URL(page.mediaUrl).pathname) || '.webp'
            return {
                ...page,
                url: page.mediaUrl,
                epTitle: ep.title,
                name: String(i + 1).padStart(len, '0') + ext
            }
        })
    }

    /**
     * 下载图片
     * 花咋图片在 cdn.huakacomic.com，直接 https 下载即可
     */
    async download(url: string, info: DInfo): Promise<void> {
        this.retryMap.set(url, this.maxRetry)
        const res = await this.api.get(url, {
            baseURL: '', // 覆盖 baseURL，使用完整 url
            responseType: 'arraybuffer',
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 304
        })

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

    /**
     * 搜索漫画
     * GET /api/bff/comics/search?keyword=:keyword&page=1
     */
    async search(keyword: string, page = 1, sort = this.Order.loved) {
        const res = await this.api.get(
            `comics/search?keyword=${encodeURIComponent(keyword)}&page=${page}&sort=${sort}`
        )
        // 对齐原哔咔 PageSearch 结构
        const docs: Comic[] = (res?.comics || res?.list || res?.docs || res || [])
            .map((c: any) => ({
                _id: c.id || c._id,
                title: c.title || c.name || '',
                author: c.author || '',
                ...c
            }))
        return {
            docs,
            pages: res?.totalPages || res?.pages || 1,
            total: res?.total || docs.length
        } as any
    }

    async searchAll(keyword: string) {
        const comics: Comic[] = []
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

    /**
     * 获取收藏夹
     * GET /api/bff/users/favorites?page=1
     */
    async favorites(page = 1, sort = this.Order.latest) {
        const res = await this.api.get(`users/favorites?page=${page}&sort=${sort}`)
        const docs: Comic[] = (res?.comics || res?.list || res?.docs || res || [])
            .map((c: any) => ({
                _id: c.id || c._id,
                title: c.title || c.name || '',
                author: c.author || '',
                ...c
            }))
        return {
            docs,
            pages: res?.totalPages || res?.pages || 1,
            total: res?.total || docs.length
        } as any
    }

    async favoritesAll(page: ExpectedPage = 'all') {
        const pageNum = Number(page)
        if (page && Number.isInteger(pageNum)) {
            const res = await this.favorites(pageNum)
            return { comics: res.docs, pages: res.pages }
        }

        const comics: Comic[] = []
        const first = await this.favorites()
        const pages = first.pages
        comics.push(...first.docs)
        for (let p = 2; p <= pages; p++) {
            const res = await this.favorites(p)
            comics.push(...res.docs)
        }
        return { comics, pages }
    }

    // ── 以下功能在花咋可能不支持，保留接口避免报错 ──

    async leaderboard() {
        try {
            const res = await this.api.get('comics/leaderboard')
            return (res?.comics || res || []).map((c: any) => ({
                _id: c.id || c._id,
                title: c.title || c.name || '',
                ...c
            })) as Comic[]
        } catch {
            return [] as Comic[]
        }
    }

    fav(bookId: string) {
        return this.api.post(`comics/${bookId}/favourite`)
    }

    punchIn() {
        return this.api.post('users/punch-in').catch(() => null)
    }

    // 兼容 index.ts 调用的 request 方法
    request<T>(method: string, url: string, data?: object) {
        return this.api.request({ url, method, data }) as Promise<Record<string, T>>
    }
}
