# 轴轴的宝：围巾格裙 Q 版精灵生成规范

## 角色定位

- 单位 ID：`cog_scribe`
- 公开名：轴轴的宝
- 类型：后排治疗单位
- 技能：扔橘子
- 目标：自走棋内 22–74 px 依然清晰的右朝向全身战斗精灵。

## 提交给图片模型的提示词

```text
Original chibi hand-drawn game character sprite for a tactical auto-battler: a small friendly backline healer in a compact right-facing side-view throwing pose, holding a bright orange with a tiny warm golden healing sparkle. She has dark brown-to-black long hair, a white braided ribbon headband, and warm golden eyes. Her signature outfit is a soft white knitted scarf and matching white knit sweater with a long blue-gray plaid skirt and simple dark ankle boots. Make the scarf, pale knit top, blue-gray plaid skirt, and orange clearly readable as a bold silhouette at very small size. Clean polished cel-shaded illustration, gentle olive-gold and warm orange healing accents, calm focused expression, isolated centered full-body character with a fully transparent background. The entire sprite must fit within the canvas with 8–12% transparent padding on every side. No text, logo, watermark, decorative frame, circle, UI, web page, character sheet, book, bag, scenery, ground shadow, or baked-in glow. Create a self-contained chibi game sprite rather than a portrait or fashion reference sheet.
```

## 审核清单

在把候选图交给处理脚本前，人工逐项确认：

1. 是完整、右朝向的侧面施法/投掷姿势；翻转后仍能读出抛橘子动作。
2. 清晰保留白色针织围巾和上衣、蓝灰格纹长裙、深色长发、白色编织发饰与金色眼睛的造型要点。
3. 橘子及暖金治疗点缀在 22 px 缩略图中仍可辨认，但没有大面积光效遮挡角色。
4. 没有文字、水印、签名、边框、圆框、UI、网页排版、设定图、书本、包、场景背景或地面阴影。
5. 输出具有真实透明背景，主体四周保留透明安全边距，并且主体不会在规范化后被裁切。
