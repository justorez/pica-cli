type Page<T> = {
    total: number
    limit: number
    page: number
    pages: number
    docs: T[]
}

/**
 * 搜索分页
 */
export type SearchPage = Page<Comic>

export interface Comic {
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

/**
 * 章节图片分页
 */
export type PicturePage = Page<MPicture>

export interface Picture {
    id: string
    media: {
        originalName: string
        path: string
        fileServer: string
    }
}

// my picture
export interface MPicture {
    id: string
    name: string // originalName
    path: string
    fileServer: string
    url: string
    epTitle: string // 章节标题
}

export interface Episode {
    id: string
    title: string
    order: number
    updated_at: string
}

export interface DInfo {
    title: string // 漫画标题
    epTitle: string // 章节标题
    picName: string // 图片文件名
}
