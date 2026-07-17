---
name: verify
summary: 在浏览器中验证自走棋运行时改动
---

# 自走棋运行时验证

1. 启动开发服务器：`npm run dev -- --hostname 127.0.0.1 --port 3100`。如果 3100 已占用，先确认现有服务可访问，不要重复启动。
2. 运行浏览器驱动：`node verify-autochess.cjs`。脚本使用固定 seed，通过真实 Canvas 点击验证升本、购买、开战、刺客延迟跳跃、单位间距、战斗反馈、全屏和 390×844 小屏缩放。
3. 主要证据输出在终端 JSON；截图写入已忽略的 `.tmp/autochess/`，不会污染 Git 状态。
4. 关注 `errors` 为空、`clearances` 非负、`feedbackSeen.attack/hit` 为 true，并确认刺客先 `jumpPending`，接敌后 `jumping`，且落点在敌方右侧且彼此不同。
