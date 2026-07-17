# 多主播系统使用指南（旧说明）

> 本文保留用于理解旧的数据处理逻辑，不再作为部署或同步操作手册。直播资源已经迁移到
> `VirtualBeing-Hub` 的五个分片仓库，主仓库不再保存 `public/data/streams` 实体文件。
> 当前目录结构、分片分配和 Windows PM2 操作请分别参阅
> [STREAM_DATA_SHARDING.md](./STREAM_DATA_SHARDING.md) 与
> [scripts/README.md](../scripts/README.md)。

## 概述

多主播系统允许为不同的虚拟主播创建独立的个人主页，每个主播有自己的直播记录和主题风格。

## 功能特性

- ✅ 动态路由：`/liver/[liverId]` - 每个主播有独立的页面
- ✅ 主播配置中心化：统一管理所有主播的配置信息
- ✅ 主题系统：每个主播有独立的颜色主题
- ✅ 数据隔离：每个主播的直播记录独立存储
- ✅ 自动化支持：支持多主播数据同步

## 可用主播

当前支持以下主播：

| 主播ID | 名称 | 路由 |
|---------|------|------|
| `sui` | 岁己SUI | `/liver/sui` 或 `/` (主页) |
| `shiori` | 栞栞 | `/liver/shiori` |
| `vr-new-1` | VirtuaReal新成员1 | `/liver/vr-new-1` |
| `vr-new-2` | VirtuaReal新成员2 | `/liver/vr-new-2` |
| `vr-new-3` | VirtuaReal新成员3 | `/liver/vr-new-3` |
| `vr-new-4` | VirtuaReal新成员4 | `/liver/vr-new-4` |

## 添加新主播

### 1. 创建主播配置文件

在 `src/data/livers/` 目录下创建新的配置文件：

```typescript
import { LiverInfo } from './types';

export const newLiver: LiverInfo = {
  id: 'new-liver',
  name: '新主播名称',
  shortName: '简称',
  group: '所属团体',
  description: '主播描述',
  colorMain: '#HEXCOLOR',  // 主色调
  colorSub: '#HEXCOLOR',   // 副色调
  dataPath: '/data/streams/new-liver/',
  tags: ['标签1', '标签2'],
  bilibiliReplayUrl: 'https://space.bilibili.com/[UID]/lists/[series-id]?type=series',
};
```

### 2. 更新配置导出

在 `src/data/livers/index.ts` 中添加新主播：

```typescript
import { newLiver } from './new-liver';

export const livers: LiverConfig = {
  // ... 现有主播
  'new-liver': newLiver,
};
```

### 3. 配置数据源

在 `scripts/liver-config.mjs` 中添加主播配置：

```javascript
export const liverConfigs = {
  'new-liver': {
    id: 'new-liver',
    name: '新主播名称',
    sourceDirs: [
      'D:/files/videos/DDTV录播/[UID]_[名称]',
      // 其他数据源路径
    ],
    targetDir: 'public/data/streams/new-liver',
    bilibiliUid: '[B站UID]'
  },
  // ... 现有配置
};
```

### 4. 创建数据目录

创建主播的数据目录：

```bash
mkdir -p public/data/streams/new-liver
```

### 5. 同步数据

使用新的多主播同步脚本：

```bash
# 同步指定主播
node scripts/sync_livers.mjs --liver new-liver

# 同步所有主播
node scripts/sync_livers.mjs --all

# 全量重新处理
node scripts/sync_livers.mjs --liver new-liver --full
```

## 数据目录结构

```
public/data/streams/
├── sui/                    # 岁己SUI
│   ├── streams.json
│   └── [stream folders]
├── shiori/                 # 栞栞
│   ├── streams.json
│   └── [stream folders]
└── [other-livers]/         # 其他主播
    ├── streams.json
    └── [stream folders]
```

## 访问主播页面

### 主播列表
访问 `/liver` 查看所有可用主播。

### 单个主播页面
- 岁己SUI: `/liver/sui` 或 `/` (主页)
- 其他主播: `/liver/[liverId]`

## 主题配置

每个主播可以配置自己的主题颜色：

```typescript
{
  colorMain: '#87EAFF',  // 主色调，用于按钮、链接等
  colorSub: '#DA5D77',   // 副色调，用于强调、渐变等
}
```

## 向后兼容性

- 现有主页 `/` 继续作为岁己SUI的默认页面
- 现有 `sync_streams.mjs` 脚本保持不变，继续支持岁己SUI
- 新的 `sync_livers.mjs` 脚本用于多主播同步

## 维护和更新

### 日常更新

```bash
# 增量更新所有主播
node scripts/sync_livers.mjs --all

# 或更新单个主播
node scripts/sync_livers.mjs --liver sui
```

### 定时任务

可以使用 cron 或其他定时任务工具定期同步数据：

```bash
# 每天凌晨2点同步所有主播
0 2 * * * cd /path/to/project && node scripts/sync_livers.mjs --all
```

## 故障排除

### 主播页面404

如果访问 `/liver/[liverId]` 返回404，请检查：

1. 主播ID是否正确
2. 配置文件是否正确导出
3. `src/data/livers/index.ts` 中是否包含该主播

### 数据加载失败

如果直播数据加载失败，请检查：

1. `public/data/streams/[liverId]/streams.json` 文件是否存在
2. 文件格式是否正确
3. 数据路径配置是否正确

### 样式异常

如果主题颜色没有正确应用，请检查：

1. 主播配置中的 `colorMain` 和 `colorSub` 是否正确
2. 组件是否正确使用了主题配置

## 扩展性

系统设计支持轻松添加新主播：

1. 创建配置文件
2. 更新配置导出
3. 配置数据源
4. 创建数据目录
5. 运行同步脚本

无需修改核心代码，只需添加配置即可。

---

*文档创建时间：2026-01-14*
