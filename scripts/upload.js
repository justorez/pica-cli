import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import mime from 'mime'
import AdmZip from 'adm-zip'
import pico from 'picocolors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

// https://file.io/
async function main() {
    let root = path.resolve(__dirname, '../comics-zip')

    if (!existsSync(root)) {
        root = path.resolve(__dirname, '../comics')
        if (!existsSync(root)) {
            console.log(pico.yellow('没有发现已下载的漫画'))
            return
        }
    }

    const comics = await fs.readdir(root)
    const task = comics.map(async (comic) => {
        try {
            const zip = new AdmZip()
            await zip.addLocalFolderPromise(path.join(root, comic))
            const zipBuffer = await zip.toBufferPromise()

            if (zipBuffer.byteLength < MAX_SIZE) {
                const filename = `${comic}.zip`
                const file = new File([zipBuffer], filename, {
                    type: mime.getType('zip')
                })
                const form = new FormData()
                form.append('file', file)
                const { data } = await axios.post(
                    `https://file.io?title=${filename}`,
                    form
                )
                console.log(
                    `${pico.cyan(comic)} 已上传到 file.io. 下载地址：${pico.green(data.link)}`
                )
            }
        } catch (error) {
            console.error(error)
        }
    })
    return Promise.allSettled(task)
}

main()
