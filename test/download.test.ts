import { Pica } from '../src/sdk'
import { loadEnv } from '../src/utils'
import { it } from 'vitest'

loadEnv()

it('下载图片', async () => {
    const pica = new Pica()
    const picUrl = 'https://storage-b.picacomic.com/static/tobs/fb49c6a7-12d3-47e2-b813-c0bf22a01b13.jpg'
    await pica.download(picUrl, {
        title: '测试',
        epTitle: 'Ch.100',
        picName: '40.jpg'
    })
})
