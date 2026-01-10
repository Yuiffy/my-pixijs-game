# 代码规范和工具配置

## 代码规范

### 1. TypeScript规范
- **严格类型**: 禁止使用`any`类型
- **接口优先**: 使用接口定义对象类型
- **类型导入**: 使用`import type`导入类型
- **枚举使用**: 使用枚举代替魔法数字

```typescript
// ✅ 正确示例
import type { UserData } from './types';

interface UserProps {
  id: number;
  name: string;
  age?: number; // 可选属性
}

enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

// ❌ 错误示例
const user: any = {}; // 禁止使用any
```

### 2. React组件规范
- **函数组件**: 优先使用函数组件
- **Props类型**: 明确定义Props接口
- **状态管理**: 使用useState、useReducer等Hook
- **副作用**: 使用useEffect管理副作用

```typescript
// ✅ 正确示例
'use client';

import React, { useState, useEffect } from 'react';

interface CounterProps {
  initialValue?: number;
}

const Counter: React.FC<CounterProps> = ({ initialValue = 0 }) => {
  const [count, setCount] = useState(initialValue);

  useEffect(() => {
    // 组件挂载时的逻辑
    console.log('Counter mounted');

    return () => {
      // 清理函数
      console.log('Counter unmounted');
    };
  }, []);

  return (
    <div>
      <p>计数: {count}</p>
      <button onClick={() => setCount(count + 1)}>增加</button>
    </div>
  );
};
```

### 3. 命名规范
- **组件**: PascalCase，如`UserProfile`
- **变量/函数**: camelCase，如`userName`, `getUserData`
- **常量**: UPPER_SNAKE_CASE，如`MAX_COUNT`
- **接口**: PascalCase，以`Props`或`Config`结尾
- **文件**: kebab-case，如`user-profile.tsx`

### 4. 注释规范
- **文件头注释**: 说明文件用途
- **函数注释**: 说明函数功能、参数、返回值
- **复杂逻辑注释**: 解释复杂算法或业务逻辑
- **TODO注释**: 标记需要完善的功能

```typescript
/**
 * 用户信息组件
 * 显示用户基本信息和个人资料
 *
 * @param user - 用户数据对象
 * @param onEdit - 编辑回调函数
 * @returns 用户信息组件
 */
const UserProfile: React.FC<UserProfileProps> = ({ user, onEdit }) => {
  // TODO: 添加头像上传功能
  // FIXME: 修复移动端布局问题

  // 计算用户年龄
  // 使用出生日期计算当前年龄
  const calculateAge = (birthDate: Date): number => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    // 调整月份和日期
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  return (
    // 组件内容
  );
};
```

## 工具配置

### 1. ESLint配置优化
当前ESLint配置已放宽许多规则以适应快速开发。建议保持以下配置：

```json
{
  "extends": ["next/core-web-vitals", "airbnb", "airbnb-typescript"],
  "rules": {
    // 放宽的规则
    "max-len": "off",
    "no-console": "off",
    "react/require-default-props": "off",
    "import/prefer-default-export": "off",

    // 保持的规则
    "@typescript-eslint/no-unused-vars": "warn",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

### 2. Prettier配置
建议添加Prettier配置确保代码格式一致：

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

### 3. Git Hook配置
建议添加Husky和lint-staged确保代码质量：

```json
// package.json 中添加
{
  "scripts": {
    "prepare": "husky install",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "husky": "^8.0.0",
    "lint-staged": "^15.0.0"
  }
}
```

```json
// .lintstagedrc
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{css,scss,less}": ["prettier --write"],
  "*.{json,md}": ["prettier --write"]
}
```

### 4. TypeScript配置检查
确保tsconfig.json包含必要的配置：

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## 开发环境配置

### 1. VS Code设置
建议的VS Code配置：

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "files.associations": {
    "*.css": "tailwindcss"
  },
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

### 2. 扩展推荐
建议安装的VS Code扩展：
- **ESLint**: 代码检查
- **Prettier**: 代码格式化
- **Tailwind CSS IntelliSense**: Tailwind自动补全
- **TypeScript Importer**: TypeScript导入助手
- **Auto Rename Tag**: 自动重命名标签
- **GitLens**: Git增强功能

### 3. 调试配置
添加调试配置：

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    }
  ]
}
```

## 项目特定规范

### 1. 游戏开发规范
- **资源管理**: 游戏资源必须正确销毁
- **性能优化**: 注意游戏帧率和内存使用
- **物理引擎**: 合理使用Matter.js物理特性
- **事件处理**: 正确处理游戏事件

### 2. 应援站开发规范
- **数据展示**: 合理组织岁己相关资料
- **用户体验**: 确保页面加载速度和交互流畅
- **响应式设计**: 支持各种设备尺寸
- **可访问性**: 考虑无障碍访问需求

### 3. 样式开发规范
- **Tailwind优先**: 优先使用Tailwind类名
- **自定义样式**: 在globals.css中添加全局样式
- **组件样式**: 使用CSS模块或styled-components
- **主题一致**: 保持整体设计风格一致

## 代码审查要点

### 1. 必须检查的项目
- [ ] TypeScript类型定义正确
- [ ] 没有使用`any`类型
- [ ] 组件Props接口明确定义
- [ ] 中文注释清晰准确
- [ ] 代码格式符合规范
- [ ] 游戏资源正确管理
- [ ] 没有内存泄漏风险

### 2. 建议检查的项目
- [ ] 性能优化考虑
- [ ] 错误处理完善
- [ ] 测试覆盖充分
- [ ] 文档更新及时
- [ ] 用户体验良好

## 自动化工具

### 1. 构建脚本
建议添加以下构建脚本：

```json
// package.json scripts
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "prepare": "husky install"
  }
}
```

### 2. 持续集成
建议的GitHub Actions配置：

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run build
```

通过遵循这些规范和配置，可以确保项目代码质量，提高开发效率，并使AI助手能够更好地理解和维护代码。
