import { filterPictures } from "../src/utils"
import { it, describe } from 'vitest'

describe('测试工具方法', () => {
    it('过滤已下载的漫画内容', () => {
        filterPictures('美丽新世界', [])
    })
})
