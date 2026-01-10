# AI友好的开发环境配置

## 概述
本文档提供为AI助手（如Cline/Roo Code）优化的开发环境配置，使AI能够更高效地理解和开发本项目。

## 核心配置

### 1. 项目根目录配置

#### 1.1 `.cursorrules` 扩展
```bash
# .cursorrules
# Cursor Rules for AI Development

# 语言要求
You must communicate in Chinese.
All code comments must be in Chinese.
Explain complex logic in Chinese.

# 项目特定规则
- 优先使用TypeScript严格类型，禁止使用'any'
- React组件默认使用服务端组件，需要交互时添加'use client'
- 游戏资源必须正确销毁(.destroy())避免内存泄漏
- 使用中文变量名和函数名时保持一致性
- 遵循现有的代码结构和组织方式

# AI开发指导
- 先理解项目结构再开始编码
- 修改代码时保持现有风格
- 复杂功能先设计架构再实现
- 重要变更需要更新相关文档
- 性能敏感代码需要特别优化

# 文件组织规范
- 页面文件放在app目录对应路由下
- 组件放在components目录按功能分类
- 游戏相关代码放在对应游戏目录
- 工具函数放在lib或utils目录
- 配置文件放在config目录
```

#### 1.2 `.ai-config.json` (AI专用配置)
```json
{
  "project_name": "岁己应援站+小游戏",
  "project_type": "nextjs-game-hybrid",
  "primary_language": "zh-CN",
  "tech_stack": [
    "nextjs-15",
    "react-18",
    "typescript",
    "phaser-3",
    "pixijs",
    "tailwindcss",
    "ant-design"
  ],
  "project_structure": {
    "description": "混合型项目：应援站 + 多个小游戏",
    "key_directories": {
      "app": "Next.js App Router页面",
      "components": "React组件库",
      "public": "静态资源",
      "plans": "项目规划和文档"
    }
  },
  "coding_conventions": {
    "language": "chinese",
    "typescript_strict": true,
    "no_any": true,
    "comment_style": "chinese_with_javadoc",
    "naming_convention": {
      "components": "PascalCase",
      "variables": "camelCase",
      "constants": "UPPER_SNAKE_CASE",
      "files": "kebab-case"
    }
  },
  "ai_assistance_hints": {
    "context_awareness": [
      "注意当前开发的是应援站功能还是游戏功能",
      "区分服务端组件和客户端组件",
      "游戏开发注意性能优化",
      "应援站开发注意用户体验"
    ],
    "common_patterns": {
      "page_creation": "使用Next.js App Router创建页面",
      "component_creation": "创建可复用的React组件",
      "game_development": "使用Phaser进行游戏开发",
      "state_management": "根据复杂度选择状态管理方案"
    }
  }
}
```

### 2. VS Code工作区配置

#### 2.1 `.vscode/settings.json`
```json
{
  // 编辑器设置
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.tabSize": 2,
  "editor.insertSpaces": true,

  // TypeScript设置
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "typescript.preferences.quoteStyle": "single",
  "typescript.updateImportsOnFileMove.enabled": "always",

  // 文件关联
  "files.associations": {
    "*.css": "tailwindcss",
    "*.md": "markdown"
  },

  // Tailwind CSS设置
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ],
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },

  // 工作区特定设置
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true
  },

  // AI助手友好设置
  "editor.quickSuggestions": {
    "strings": true
  },
  "editor.suggest.showWords": false,
  "editor.acceptSuggestionOnEnter": "on"
}
```

#### 2.2 `.vscode/extensions.json`
```json
{
  "recommendations": [
    // 核心开发扩展
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",

    // TypeScript支持
    "ms-vscode.vscode-typescript-next",

    // React支持
    "dsznajder.es7-react-js-snippets",

    // Git支持
    "eamodio.gitlens",

    // 游戏开发支持
    "phrazzld.phaser-snippets",

    // 中文支持
    "ms-ceintl.vscode-language-pack-zh-hans",

    // 其他实用扩展
    "usernamehw.errorlens",
    "formulahendry.auto-rename-tag",
    "streetsidesoftware.code-spell-checker",
    "aaron-bond.better-comments"
  ]
}
```

### 3. 开发脚本优化

#### 3.1 `package.json` 脚本增强
```json
{
  "scripts": {
    // 基础脚本
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "export": "next build && next export",

    // 代码质量
    "lint": "eslint . --ext .ts,.tsx --max-warnings 0",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "type-check": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",

    // 开发辅助
    "dev:analyze": "ANALYZE=true next build",
    "dev:profile": "next dev --profile",

    // 游戏开发专用
    "game:build": "node scripts/build-game.js",
    "game:test": "node scripts/test-game.js",

    // 数据管理
    "data:sync": "node scripts/sync_streams.mjs",
    "data:clean": "node scripts/clean_data.js",

    // 部署
    "deploy:gh-pages": "npm run export && npx gh-pages -d out --dotfiles true",
    "deploy:vercel": "vercel --prod",

    // 开发环境检查
    "env:check": "node scripts/check-environment.js",
    "deps:check": "npm outdated",
    "deps:update": "npm update",

    // AI开发辅助
    "ai:context": "node scripts/generate-ai-context.js",
    "ai:docs": "npm run generate-docs"
  }
}
```

#### 3.2 AI辅助脚本
```javascript
// scripts/generate-ai-context.js
// 为AI生成项目上下文信息
const fs = require('fs');
const path = require('path');

function generateAIContext() {
  const context = {
    timestamp: new Date().toISOString(),
    project: {
      name: '岁己应援站+小游戏',
      version: '0.1.0',
      description: 'Next.js项目，包含岁己应援站和多个小游戏'
    },
    structure: {
      directories: [],
      fileCounts: {},
      recentChanges: []
    },
    dependencies: {
      major: ['next', 'react', 'typescript', 'phaser', 'pixi.js'],
      ui: ['antd', 'tailwindcss'],
      utilities: ['dayjs', 'matter-js']
    },
    development: {
      lastBuild: fs.existsSync('.next') ? '存在' : '不存在',
      hasEnvFiles: fs.existsSync('.env') || fs.existsSync('.env.local'),
      gitStatus: 'active' // 简化表示
    }
  };

  // 保存上下文文件
  const outputPath = path.join(__dirname, '../.ai-context.json');
  fs.writeFileSync(outputPath, JSON.stringify(context, null, 2));
  console.log('AI上下文已生成:', outputPath);
}

generateAIContext();
```

### 4. 开发工作流优化

#### 4.1 Git工作流配置
```bash
# .git/hooks/pre-commit (示例)
#!/bin/bash
# AI友好预提交钩子

echo "🔍 运行代码检查..."

# 运行TypeScript类型检查
npm run type-check --silent
if [ $? -ne 0 ]; then
  echo "❌ TypeScript类型检查失败"
  exit 1
fi

# 运行ESLint检查
npm run lint --silent
if [ $? -ne 0 ]; then
  echo "⚠️  ESLint检查有警告，但允许提交"
  # 这里可以选择是否阻止提交
fi

echo "✅ 预检查通过"
exit 0
```

#### 4.2 开发环境检查脚本
```javascript
// scripts/check-environment.js
const { execSync } = require('child_process');

console.log('🔧 检查开发环境...\n');

// 检查Node版本
try {
  const nodeVersion = execSync('node --version').toString().trim();
  console.log(`✅ Node.js版本: ${nodeVersion}`);
} catch (error) {
  console.log('❌ Node.js未安装或不可用');
  process.exit(1);
}

// 检查npm版本
try {
  const npmVersion = execSync('npm --version').toString().trim();
  console.log(`✅ npm版本: ${npmVersion}`);
} catch (error) {
  console.log('❌ npm未安装或不可用');
}

// 检查依赖安装
try {
  const fs = require('fs');
  if (fs.existsSync('node_modules')) {
    console.log('✅ 依赖已安装');
  } else {
    console.log('⚠️  依赖未安装，运行: npm install');
  }
} catch (error) {
  console.log('❌ 检查依赖时出错');
}

// 检查TypeScript配置
try {
  const tsconfig = require('../tsconfig.json');
  console.log('✅ TypeScript配置有效');
} catch (error) {
  console.log('❌ TypeScript配置无效');
}

console.log('\n🎉 环境检查完成');
```

### 5. AI开发提示系统

#### 5.1 代码片段配置
```json
// .vscode/snippets.code-snippets
{
  "Next.js Page Component": {
    "prefix": "nextpage",
    "body": [
      "export default function ${1:PageName}() {",
      "  return (",
      "    <div className=\"container mx-auto p-4\">",
      "      <h1 className=\"text-3xl font-bold mb-4\">${2:页面标题}</h1>",
      "      ${3:// 页面内容}",
      "    </div>",
      "  );",
      "}"
    ],
    "description": "创建Next.js页面组件"
  },

  "React Component with Types": {
    "prefix": "rct",
    "body": [
      "'use client';",
      "",
      "import React from 'react';",
      "",
      "interface ${1:ComponentName}Props {",
      "  ${2:prop}: string;",
      "}",
      "",
      "export default function ${1:ComponentName}({ ${2:prop} }: ${1:ComponentName}Props) {",
      "  return (",
      "    <div>",
      "      <h2>${1:ComponentName}</h2>",
      "      <p>{${2:prop}}</p>",
      "    </div>",
      "  );",
      "}"
    ],
    "description": "创建带TypeScript类型的React组件"
  },

  "Phaser Game Object": {
    "prefix": "phaserobj",
    "body": [
      "export default class ${1:ClassName} extends Phaser.GameObjects.${2:Sprite} {",
      "  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {",
      "    super(scene, x, y, texture);",
      "    ",
      "    // 添加到场景",
      "    scene.add.existing(this);",
      "    ",
      "    // 初始化逻辑",
      "    this.init();",
      "  }",
      "  ",
      "  private init(): void {",
      "    // 初始化方法",
      "    ${3:// 初始化代码}",
      "  }",
      "  ",
      "  update(time: number, delta: number): void {",
      "    // 更新逻辑",
      "    ${4:// 更新代码}",
      "  }",
      "  ",
      "  destroy(fromScene?: boolean): void {",
      "    // 清理资源",
      "    ${5:// 清理代码}",
      "    super.destroy(fromScene);",
      "  }",
      "}"
    ],
    "description": "创建Phaser游戏对象类"
  }
}
```

#### 5.2 AI上下文提示文件
```markdown
<!-- .ai-context-hints.md -->
# 项目上下文提示

## 当前开发重点
- 主要功能：岁己应援站 + 自走棋游戏
- 技术栈：Next.js 15 + React 18 + TypeScript + Phaser
- 开发模式：混合开发（Web应用 + 游戏）

## 常见任务模式

### 1. 创建新页面
- 位置：`src/app/[route]/page.tsx`
- 规范：默认服务端组件，需要交互时添加'use client'
- 样式：使用Tailwind CSS + Ant Design

### 2. 创建游戏功能
- 引擎：Phaser 3.90.0
- 物理：Matter.js
- 注意：资源管理、性能优化、内存泄漏

### 3. 修改现有功能
- 先理解现有代码结构
- 保持代码风格一致
- 更新相关文档

## 技术决策记录

### 已做出的决策
1. 使用App Router而不是Pages Router
2. 混合使用服务端和客户端组件
3. 游戏使用Phaser而不是纯Canvas
4. UI使用Ant Design + Tailwind CSS

### 待决策事项
1. 状态管理方案（当前使用React状态）
2. 数据持久化方案
3. 部署策略优化

## 已知问题
1. 游戏性能在移动端需要优化
2. 图片资源加载速度可以改进
3. 代码分割可以更细化

## 近期计划
1. 完善自走棋游戏功能
2. 优化应援站用户体验
3. 添加更多小游戏
```

### 6. 开发环境快速启动

#### 6.1 一键启动脚本
```bash
#!/bin/bash
# dev-start.sh - AI友好开发环境启动脚本

echo "🚀 启动岁己应援站开发环境..."

# 检查环境
echo "🔧 检查环境..."
node scripts/check-environment.js

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 生成AI上下文
echo "🤖 生成AI上下文..."
npm run ai:context

# 启动开发服务器
echo "🌐 启动开发服务器..."
echo "访问 http://localhost:3000"
echo "按 Ctrl+C 停止服务器"

npm run dev
```

#### 6.2 Docker开发环境
```dockerfile
# Dockerfile.dev
FROM node:18-alpine

WORKDIR /app

# 复制包管理文件
COPY package*.json ./
COPY pnpm-lock.yaml ./

# 安装依赖
RUN npm install -g pnpm
RUN pnpm install

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3000

# 开发模式启动
CMD ["pnpm", "dev"]
```

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - WATCHPACK_POLLING=true
    command: pnpm dev
```

## 最佳实践总结

### 对于AI助手：
1. **理解上下文**：先阅读项目文档和现有代码
2. **保持一致性**：遵循现有代码风格和模式
3. **渐进式开发**：复杂功能分步骤实现
4. **文档更新**：重要变更更新相关文档
5. **性能意识**：特别注意游戏和资源性能

### 对于开发者：
1. **使用配置工具**：利用提供的脚本和配置
2. **定期生成上下文**：保持AI上下文最新
3. **反馈循环**：根据AI表现调整配置
4. **持续优化**：根据项目进展调整环境

通过以上配置，AI助手将能够
