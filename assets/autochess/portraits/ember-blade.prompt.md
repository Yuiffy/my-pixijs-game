# 炽焰萝卜：原创头像生成规范

## 角色定位

- 单位 ID：`ember_blade`
- 公开名：炽焰萝卜
- 类型：风格化近战灼烧前锋
- 目标：自走棋内 22–74 px 依然清晰的右朝向侧面战斗精灵。

## 提交给图片模型的提示词

```text
Original chibi hand-drawn game character sprite for a tactical auto-battler: a small anthropomorphic woodland creature melee vanguard in a compact right-facing side-view charging pose, wearing a short ember-red cloak with warm orange accents and carrying a clear carrot-shaped fire baton. The body, weapon, ears, and tail must create a bold readable silhouette at very small size. Clean cel-shaded brushwork, warm ember and carrot palette, energetic but friendly expression, isolated centered full-body character with a fully transparent background. The entire sprite must fit within the canvas with 8–12% transparent padding on every side. No text, logo, watermark, decorative frame, circle, UI, scenery, ground shadow, or baked-in glow. Create an entirely original design; do not depict, reference, imitate, or resemble any real person, streamer, VTuber, existing anime/game character, recognizable costume, hair, hat, weapon, insignia, or copyrighted character.
```

## 审核清单

在把候选图交给处理脚本前，人工逐项确认：

1. 不包含真人、主播、VTuber、已有角色或其可识别的脸部、帽子、发型、兔耳、服装、徽记、胡萝卜棒冰或特工元素。
2. 是完整右朝向侧面冲刺/战斗姿势；翻转后武器方向仍便于阅读。
3. 没有文字、水印、签名、边框、圆框、场景背景或地面阴影。
4. 主体和胡萝卜短棍在 22 px 缩略图中仍可辨认，且四周保留透明安全边距。
5. 使用暖炽红/橙色调，与单位 `#7b2f2b` 和 `#ff8a5c` 相容，但不复制既有角色的服装或配色方案。
