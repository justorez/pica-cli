export type LoginResult = {
    token: string
}

/**
 * 分页
 */
export type Page<T> = {
    total: number
    limit: number
    page: number
    pages: number
    docs: T[]
}

export type Comic = {
    updated_at: string
    author: string
    description: string
    chineseTeam: string
    created_at: string
    finished: boolean
    totalViews: number
    categories: string[]
    totalLikes: number
    title: string
    tags: string[]
    _id: string
}

export type PageFavorites = Page<Comic>
export type PageSearch = Page<Comic>

/**
 * 章节图片分页
 */
export type PagePicture = Page<Picture>

// my picture
export interface Picture {
    id: string
    name: string // originalName
    path: string
    fileServer: string
    url: string
    epTitle: string // 章节标题
    media: {
        originalName: string
        path: string
        fileServer: string
    }
}

export interface Episode {
    id: string
    title: string
    order: number
    updated_at: string
}

export type PageEpisode = Page<Episode>

export interface DInfo {
    title: string // 漫画标题
    epTitle: string // 章节标题
    picName: string // 图片文件名
}

export type ExpectedPage = number | string | undefined
