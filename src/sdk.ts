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
cookie: string | undefined
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

this.api.interceptors.request.use((config) => {
    config.headers['Content-Type'] = 'application/json'
    config.headers['Accept'] = 'application/json'
    if (this.token) {
        config.headers['Authorization'] = `Bearer ${this.token}`
    }
    if (this.cookie) {
        config.headers['Cookie'] = this.cookie
    }
    return config
})

        this.api.interceptors.response.use(
            (res) => {
                const url = res.config.url
                url && this.retryMap.delete(url)

                if (res.config.responseType === 'arraybuffer') {
                    return res
                }

                debug('\n%s %O', url, res.data)

                const result = res.data
                if (result.statusCode && result.statusCode !== 200) {
                    throw new Error(result.message || '请求失败')
                }
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

    const res = await axios.post(
        'https://app.huakacomic.com/api/bff/auth/login',
        { username: account, password: password },
        { headers: { 'Content-Type': 'application/json' } }
    )

    const cookies = res.headers['set-cookie']
    if (cookies) {
        this.cookie = cookies.map((c: string) => c.split(';')[0]).join('; ')
    }

    const token = res.data?.data?.accessToken || res.data?.accessToken
    if (!token) {
        throw new Error('登录失败，未获取到 token')
    }
    this.token = token
    console.log('token set, length:', token.length)
    console.log('cookie set:', !!this.cookie)
}

async comicInfo(bookId: string) {
    console.log('comicInfo token:', this.token ? this.token.slice(0, 20) + '...' : 'EMPTY')
    const res = await this.api.get(`comics/${bookId}`)
    const comic = res?.comic || res
    return {
        ...comic,
        _id: comic.id || comic._id || bookId,
        title: (comic.title || comic.name || bookId).trim(),
        author: (comic.authors || []).join(', ') || comic.author || '',
    } as Comic
}

    async episodesAll(bookId: string) {
        const allEpisodes: any[] = []
        let page = 1

        while (true) {
const res = await this.api.get(
    `episodes?comicId=${bookId}&page=${page}&pageSize=100`
)
            const eps: any[] = res?.episodes || res?.list || res?.docs || []
            if (eps.length === 0) break

            const normalized = eps.map((ep: any, i: number) => ({
                id: ep.id || ep._id,
                _id: ep.id || ep._id,
                title: (ep.title || ep.name || `第${ep.order || i + 1}话`).trim(),
                order: ep.order ?? ep.sortOrder ?? (allEpisodes.length + i + 1),
                ...ep
            }))
            allEpisodes.push(...normalized)

            const hasMore = res?.nextPageToken || eps.length === 100
            if (!hasMore) break
            page++
            if (page > 100) break
        }

        return allEpisodes.sort((a, b) => (a.order || 0) - (b.order || 0)) as Episode[]
    }

    async picturesAll(bookId: string, ep: Episode) {
        const allPages: any[] = []
        let pageToken: string | null = null

        do {
            const url = `comic-pages?episodeId=${ep.id || ep._id}` +
                (pageToken ? `&pageToken=${pageToken}` : '')
            const res = await this.api.get(url)
            const pages: any[] = res?.pages || res?.docs || []
            allPages.push(...pages)
            pageToken = res?.nextPageToken || null
        } while (pageToken)

        const len = String(allPages.length).length
        return allPages.map((page: any, i: number) => {
            const ext = (() => {
                try { return path.extname(new URL(page.mediaUrl).pathname) || '.webp' }
                catch { return '.webp' }
            })()
const jpgUrl = page.mediaUrl.replace('_read.webp', '_read.jpg')
return {
    ...page,
    url: jpgUrl,
    epTitle: ep.title,
    name: String(i + 1).padStart(len, '0') + '.jpg'
}
        })
    }

    async download(url: string, info: DInfo): Promise<void> {
        this.retryMap.set(url, this.maxRetry)

        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 304
        }).catch(async (err) => {
            const retryCount = this.retryMap.get(url) || 0
            if (retryCount > 0) {
                this.retryMap.set(url, retryCount - 1)
                await new Promise(r => setTimeout(r, 1000))
                return axios.get(url, { responseType: 'arraybuffer', maxRedirects: 5 })
            }
            throw err
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

    async search(keyword: string, page = 1, sort = this.Order.loved) {
        const res = await this.api.get(
            `comics/search?keyword=${encodeURIComponent(keyword)}&page=${page}&sort=${sort}`
        )
        const docs: Comic[] = (res?.comics || res?.list || res?.docs || [])
            .map((c: any) => ({
                _id: c.id || c._id,
                title: (c.title || c.name || '').trim(),
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
            comics.push(...first.docs)
            for (let page = 2; page <= first.pages; page++) {
                const res = await this.search(keyword, page)
                comics.push(...res.docs)
            }
        }
        return comics
    }

    async favorites(page = 1, sort = this.Order.latest) {
        const res = await this.api.get(`users/favorites?page=${page}&sort=${sort}`)
        const docs: Comic[] = (res?.comics || res?.list || res?.docs || [])
            .map((c: any) => ({
                _id: c.id || c._id,
                title: (c.title || c.name || '').trim(),
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
        comics.push(...first.docs)
        for (let p = 2; p <= first.pages; p++) {
            const res = await this.favorites(p)
            comics.push(...res.docs)
        }
        return { comics, pages: first.pages }
    }

    async leaderboard() {
        try {
            const res = await this.api.get('comics/leaderboard')
            return (res?.comics || res || []).map((c: any) => ({
                _id: c.id || c._id,
                title: (c.title || c.name || '').trim(),
                author: c.author || '',
                ...c
            })) as Comic[]
        } catch {
            return [] as Comic[]
        }
    }

    fav(bookId: string) {
        return this.api.post(`comics/${bookId}/favourite`).catch(() => null)
    }

    punchIn() {
        return this.api.post('users/punch-in').catch(() => null)
    }

    request<T>(method: string, url: string, data?: object) {
        return this.api.request({ url, method, data }) as Promise<Record<string, T>>
    }
}
