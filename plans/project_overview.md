# 岁己应援站 + 小游戏项目概述

## 项目简介
这是一个结合了"岁己应援站"和多个小游戏的综合性Next.js项目。项目包含粉丝应援功能、游戏娱乐功能，采用现代化的技术栈构建。

## 技术栈
- **前端框架**: Next.js 15+ (App Router), React 18+
- **游戏引擎**: Phaser 3.90.0, PixiJS 7.4.0
- **样式**: Tailwind CSS 3.3.0, Ant Design 5.14.0
- **语言**: TypeScript 5
- **构建工具**: ESLint, Prettier, PostCSS
- **包管理**: npm/pnpm

## 项目结构
```
my-pixijs-game/
├── public/                    # 静态资源
│   ├── images/               # 图片资源
│   ├── data/streams/         # 直播数据
│   └── html/                 # HTML模板
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # 主页
│   │   ├── wiki/sui/         # 岁己Wiki页面
│   │   ├── game/             # 游戏页面
│   │   │   ├── autochess/    # 自走棋游戏
│   │   │   ├── wuxia/        # 武侠游戏
│   │   │   └── jumpone/      # 跳跃游戏
│   │   └── anime/            # 动画演示
│   ├── components/           # 组件库
│   │   ├── autoChessGame/    # 自走棋游戏组件
│   │   ├── wuxia/            # 武侠游戏组件
│   │   └── Home/             # 主页组件
│   └── lib/                  # 工具库
├── scripts/                  # 脚本文件
└── plans/                   # 项目规划文档
```

## 主要功能模块

### 1. 岁己应援站
- **主页**: 展示岁己相关信息，包含三个标签页
  - 主页介绍
  - 素材图库
  - 直播记录
- **Wiki页面**: 详细的岁己角色资料，包含：
  - 基本信息档案
  - 呼吸招式展示
  - 传奇历程时间线
- **素材管理**: 图片、直播数据等资源管理

### 2. 游戏模块
- **自走棋游戏 (Auto Chess)**: 基于Phaser的物理战斗游戏
  - 单位购买系统
  - 兵营放置机制
  - 波次战斗系统
  - 经济管理系统
- **武侠游戏**: 文字冒险类游戏
  - 战斗系统
  - 技能系统
  - 同伴交互
- **跳跃游戏**: 基于物理的跳跃游戏

### 3. 动画演示
- **小鸟动画**: 基于Matter.js的物理动画
- **其他动画效果**

## 开发状态
- ✅ 基础项目结构已搭建
- ✅ 主页和Wiki页面基本完成
- ✅ 自走棋游戏核心框架已实现
- 🔄 游戏功能需要进一步完善
- 🔄 应援站功能需要扩展

## 数据管理
- 直播数据存储在 `public/data/streams/` 目录
- 图片资源存储在 `public/images/` 目录
- 游戏配置数据在对应的组件目录中

## 部署配置
- 支持静态导出 (`next export`)
- 包含Google Adsense和百度统计
- 支持GitHub Pages部署

## 开发规范
- 使用TypeScript严格类型
- 组件注释使用中文
- 遵循ESLint配置（已放宽部分规则）
- 使用Ant Design组件库
- 响应式设计支持
