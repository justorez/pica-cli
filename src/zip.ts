import AdmZip from 'adm-zip'
import path from 'node:path'
import fs from 'node:fs'
import pico from 'picocolors'
import ProgressBar from 'progress'

function main() {
    const root = path.resolve(process.cwd(), 'comics')
    const dest = path.resolve(process.cwd(), 'comics-zip')

    if (!fs.existsSync(root)) {
        console.log(pico.yellow('没有发现已下载的漫画'))
        return
    }

    const comics = fs.readdirSync(root).filter((d) => {
        return fs.statSync(path.join(root, d)).isDirectory()
    })

    if (comics.length === 0) {
        console.log(pico.yellow('没有发现已下载的漫画'))
        return
    }

    console.log(
        `${pico.cyan(comics.length)} 本漫画等待打包：${pico.cyan(comics.join(', '))}`
    )

    for (const comic of comics) {
        const comicRoot = path.join(root, comic)
        const episodes = fs.readdirSync(comicRoot)

        const bar = new ProgressBar(
            `${pico.cyan('➡️')} 打包 ${pico.cyan(comic)} [:bar] :percent`,
            {
                incomplete: ' ',
                width: 20,
                total: episodes.length
            }
        )

        for (const ep of episodes) {
            const dir = path.join(dest, comic)
            fs.mkdirSync(dir, { recursive: true })

            const zip = new AdmZip()
            zip.addLocalFolder(path.join(comicRoot, ep))
            zip.writeZip(path.join(dir, `${ep}.zip`))

            bar.tick()
        }

        console.log(pico.green(`✓ ${comic} 打包完成`))
    }
}

main()
