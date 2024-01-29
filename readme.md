# pica-dl

😉 哔咔漫画下载器

![演示](https://s2.loli.net/2024/01/29/rhcOo4GBD8kLEqv.gif)

- 交互式命令行
- 排行榜：下载当前排行榜的全部漫画
- 收藏夹：下载当前用户收藏夹的全部漫画
- 关键词搜索：支持多选
- 自动过滤已下载的章节和图片，不会重复下载
- 如果没有相关环境变量，则启动交互命令行；若有则直接执行

## 用法

### 方式一：直接安装

```bash
pnpm add pica-dl -g
```

参考 [.env.template](.env.template) 配置环境变量，如下所示：

```bash
# 必填，密钥，不要修改
PICA_SECRET_KEY=~d}$Q7$eIni=V)9\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn
# 必填，账号名
PICA_ACCOUNT=
# 必填，账号密码
PICA_PASSWORD=
# 代理地址，示例：http://127.0.0.1:7890
PICA_PROXY=
# 下载图片的并发数
PICA_DL_CONCURRENCY=5
# leaderboard | favorites | search
# 下载内容，分别表示：排行榜 | 收藏夹 | 搜索
PICA_DL_CONTENT=
# 搜索关键字，多个用 # 隔开
# 尽量输入完整漫画名，避免返回过多结果
PICA_DL_SEARCH_KEYWORDS=
```

```bash
# 运行
pica-dl
```

## 方式二：本地运行源码

```bash
git clone https://github.com/justorez/pica-dl.git
```

拷贝一份 [.env.template](.env.template)，命名为 `.env.local`，配置好后就不用配置环境变量了。

```bash
# 安装依赖
pnpm install

# 运行
pnpm dev
```

## TODO

- [] 使用 github action 下载
- [] 将漫画批量打成压缩包

## 其他

> 代码参考 [lx1169732264/pica_crawler](https://github.com/lx1169732264/pica_crawler)<br>
> 想添加新功能，奈何 Python 早就忘光了，只好重写一个。

- [哔咔 API 文档（非官方）](https://www.apifox.cn/apidoc/shared-44da213e-98f7-4587-a75e-db998ed067ad/doc-1034189)
