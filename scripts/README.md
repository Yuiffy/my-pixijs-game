# Windows 直播数据每日同步部署说明

本文说明如何在负责收集录播文件的 Windows 机器上部署直播数据同步程序。同步程序会扫描
`src/data/livers/liverConfigs.json` 中配置的 D/E 盘源目录，把资源写入四个资源仓库，校验后
先推送资源仓库，最后推送 index 仓库。

不要把 `scripts/sync_streams.mjs` 作为日常发布入口直接运行。正式入口是
`npm run streams:publish`，它包含锁、校验、提交、资源优先发布和事务恢复。

## 1. 运行要求

- Windows 10/11 或 Windows Server。
- Node.js 20 LTS 或更新版本。
- Git for Windows，并启用 Git Credential Manager。
- GitHub CLI `gh`。
- PM2：`npm install -g pm2`。
- Git 提交身份：

```powershell
git config --global user.name '你的 GitHub 用户名'
git config --global user.email '你的 GitHub 邮箱'
```

用于日常同步的 Fine-grained PAT 只需要授权下面五个仓库的 `Contents: Read and write`，
不应拥有删除仓库或修改组织规则的权限。登录并让 Git 使用 GitHub CLI 凭据：

```powershell
gh auth login
gh auth setup-git
gh auth status
```

## 2. 推荐目录结构

主仓库和 `VirtualBeing-Hub` 数据仓库父目录互为兄弟目录：

```text
H:\Hworkspace\github\
├─ my-pixijs-game\
└─ VirtualBeing-Hub\
   ├─ liver-streams-index\
   ├─ liver-streams-2025\
   ├─ liver-streams-2026-a\
   ├─ liver-streams-2026-b\
   └─ liver-streams-2026-c\
```

按此结构放置时，程序会自动使用
`H:\Hworkspace\github\VirtualBeing-Hub`，不需要设置 `STREAM_REPOS_ROOT`。

创建并克隆五个数据仓库：

```powershell
$root = 'H:\Hworkspace\github\VirtualBeing-Hub'
New-Item -ItemType Directory -Path $root -Force
Set-Location $root

git clone --branch main --single-branch https://github.com/VirtualBeing-Hub/liver-streams-index.git
git clone --branch main --single-branch https://github.com/VirtualBeing-Hub/liver-streams-2025.git
git clone --branch main --single-branch https://github.com/VirtualBeing-Hub/liver-streams-2026-a.git
git clone --branch main --single-branch https://github.com/VirtualBeing-Hub/liver-streams-2026-b.git
git clone --branch main --single-branch https://github.com/VirtualBeing-Hub/liver-streams-2026-c.git
```

这些仓库总数据量约 12.8 GiB，首次克隆需要较长时间。不要使用 ZIP 下载，必须保留 Git
工作区，脚本才能提交和推送。

如果数据仓库必须放在其他位置，启动 PM2 前设置绝对路径：

```powershell
$env:STREAM_REPOS_ROOT = 'D:\StreamGit\VirtualBeing-Hub'
```

## 3. 更新主仓库代码

先停止旧的同步 cron，避免切换代码期间仍有进程写文件：

```powershell
pm2 stop sync-livers-cron
```

进入机器上已有的主仓库，确认本地修改已妥善保存，然后拉取代码：

```powershell
Set-Location 'H:\Hworkspace\github\my-pixijs-game'
git status --short --branch
git fetch origin
git switch codex/stream-data-sharding
git pull --ff-only origin codex/stream-data-sharding
npm ci
```

PR 合并后，改为切换并拉取默认分支，不再需要长期使用功能分支。

## 4. 检查录播源目录

源目录配置位于 `src/data/livers/liverConfigs.json` 的 `sourceDirs`。每个主播至少要有一个
目录在这台机器上可访问。D 盘或 E 盘中的一个备用目录不存在只会产生警告；同一主播的所有
目录都不可用会让同步失败，防止磁盘掉线被误认为“今天没有新数据”。

`targetDir` 只是旧前端路径兼容字段，不决定本地写入位置。实际写入仓库由
`config/stream-shards.json` 的固定 assignments 决定。

运行只读部署预检：

```powershell
npm run streams:check
```

预检会检查：

- 五个仓库是否存在、分支是否为 `main`、origin 是否正确。
- 工作区是否干净、本地 HEAD 是否等于 GitHub 远端 HEAD。
- Git 提交身份和远端读取是否可用。
- 每个主播是否至少有一个可访问的源目录。
- 源目录中出现的年份是否已有固定分片映射。
- 每个主播的累计 `streams.json` 是否存在。
- 状态目录是否可写、是否有待恢复事务。

允许有“某个备用 D/E 目录不存在”的 warning；任何 failure 都应先处理。

## 5. 首次手动运行

先用一个主播验证完整的“采集、资源提交、资源推送、index 推送”流程：

```powershell
npm run streams:publish -- --liver sui
```

确认 GitHub 中资源提交先于 index 提交，再运行全部主播的日常增量同步：

```powershell
npm run streams:publish
```

默认是增量模式。只有明确需要重新生成全部历史数据时才使用：

```powershell
npm run streams:publish -- --full
```

不要在不了解影响时使用 `--full --force`。

## 6. 启动每日 PM2 cron

默认状态目录为主仓库内的 `logs\state`。如需放到其他磁盘，应在第一次启动 PM2 前设置：

```powershell
$env:STREAM_SYNC_STATE_DIR = 'H:\StreamSyncState'
```

启动并保存 PM2 进程：

```powershell
Set-Location 'H:\Hworkspace\github\my-pixijs-game'
npm run pm2:start
npm run pm2:status
npm run pm2:save
```

`sync-livers-cron` 启动时会立即执行一次增量同步，之后保持长驻。PM2 使用机器本地时区，
每天 04:00 通过 `cron_restart: "0 4 * * *"` 重启 runner，并执行新一轮同步。请确认 Windows
时区和系统时间正确。

日志和状态：

```powershell
npm run pm2:logs
Get-Content -LiteralPath '.\logs\state\stream-sync-runner.json' -Raw
Get-Content -LiteralPath '.\logs\state\stream-sync-last-run.json' -Raw
```

## 7. 自动重试和事务顺序

一次发布严格按以下顺序执行：

1. 获取跨进程锁并检查五个仓库。
2. 扫描源目录，将资源写入对应年度分片。
3. 校验全部本地 index 引用。
4. 提交并推送所有发生变化的资源仓库。
5. 用 `git ls-remote` 确认资源提交已经在 GitHub 可见。
6. 最后提交并推送 index 仓库。

Git 网络命令默认在单次事务内重试 4 次。整个事务失败后，runner 默认在 5、15、30、60
分钟后重试；此后仍失败则每 60 分钟重试，直到成功或第二天 04:00 被新的 cron 周期重启。

可选环境变量：

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `STREAM_REPOS_ROOT` | 主仓库旁的 `VirtualBeing-Hub` | 五个数据仓库父目录 |
| `STREAM_SYNC_STATE_DIR` | `logs\state` | 锁、事务和运行状态目录 |
| `STREAM_SYNC_RETRY_MINUTES` | `5,15,30,60` | 整体事务失败后的分钟级退避 |
| `STREAM_GIT_RETRY_ATTEMPTS` | `4` | 单个 Git 网络操作尝试次数 |
| `STREAM_GIT_RETRY_DELAY_MS` | `5000` | Git 重试初始延迟，后续指数退避 |

修改环境变量后运行：

```powershell
npm run pm2:restart
npm run pm2:save
```

## 8. Windows 重启后恢复 PM2

PM2 官方的内置 `pm2 startup` 不直接支持 Windows init system；官方文档建议使用外部 Windows
启动工具。当前仓库保留 `pm2-windows-startup` 方式：

```powershell
npm install -g pm2-windows-startup
npm run pm2:install-startup
npm run pm2:save
```

安装和日常管理必须使用同一个 Windows 用户，否则会读取不同的 PM2 HOME。也可以在 Windows
任务计划程序中使用同一用户登录时执行 `pm2 resurrect`。相关说明见
[PM2 Startup Hook](https://pm2.io/docs/runtime/guide/startup-hook/) 和
[pm2-windows-startup](https://github.com/marklagendijk/node-pm2-windows-startup)。

机器重启后检查：

```powershell
npm run pm2:status
npm run pm2:logs
```

## 9. 失败恢复

- 不要手动删除 `stream-sync-transaction.json`。资源已推送但 index 未推送时，下次运行会从
  事务日志继续，并优先完成 index 发布。
- 若提示数据仓库 dirty，先用 `git status` 检查文件来源；不要直接 `reset --hard`。
- 若提示本地和远端 HEAD 不一致，在对应数据仓库确认没有本地修改后执行
  `git pull --ff-only`，再重新运行预检。
- 任一资源仓库推送失败时 index 不会更新；提前上传但未被 index 引用的资源可以保留。
- 手动运行和 PM2 cron 使用同一把锁，重叠运行会安全失败，不会并发写仓库。

更新同步代码时推荐：

```powershell
pm2 stop sync-livers-cron
git pull --ff-only
npm ci
npm run streams:check
npm run pm2:start
npm run pm2:save
```
