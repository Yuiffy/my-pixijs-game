# 春日第一单：挑跃衔接改动与验证

日期：2026-10-25。用户要求本轮收尾后，源码已冻结；未提交、推送或替换正式服务。全仓 check → build 由主线程统一执行。

## 本轮解决的问题

原版已经有四区十二单、歇脚点、机关、头目、支线和真实送达结局，缺少的不是再叠一个菜单。首段有意思的高路线却要求先 J 挑起面团、跳到上方、下落踩中；新手在体验收益前要先完成三个独立动作。

本轮增加可选的“挑跃”：在面团前按住跳跃，再用挑击命中面团，就获得一次实际向上的冲量，能直接到旧招牌高台。键盘仍用空格与 J/X；手机仍用跳与挑两个原有按钮。原先站着挑起再踩的解法保留。

场内只增加一条接近提示，原教学牌和帮助同步说明，命中时显示双向上箭头和短促上扬声音。教学牌深度改为 5，低于角色深度 6，避免上升动作被牌子挡住。

## 最终规则

- 必须在空中、持续按住跳跃，并由托盘实际命中普通面团。空挥、站着挑击和命中已蓬松面团都不获得挑跃。
- 挑跃向上速度为 -900 px/s，原先蓬松面团踩踏的 -850 不变。新冲量经原重力、转向和碰撞运行，不传送位置。
- 空中挑面团的范围向脚下延伸，允许先跳后挑的自然顺序；其他机关/热弹的挑击范围不变。
- 起跳后 180ms 内，对前方普通面团的接近碰撞给予宽容，条件是持续按跳并且仍在上升。站立、身后碰撞、窗口过期和其他机关伤害不在此规则内。该规则用于避免跳动面团在 J 出手前先伤到新手，不改常规受伤保护值。
- 面团命中后暂时消耗，按原规则重新鼓起；一次目标不能反复提供冲量。挑跃不恢复蒸汽冲刺次数，不增加报酬。
- 攻击后摇最后 120ms 接受一次新的按键预输入，恢复后只出招一次；一直按住不会连续出招。
- 新增状态都是单次运行状态，存档仍为 v2；没有改存档字段或旧归档游戏。

初版 -790 的冲量只在加速跑时稳定到屋顶，交付前已改为 -900，并加入无 Shift 的走速落地验证。原脚本路线获取旧招牌约 6.84 秒，新走速挑跃分支约 4.63 秒；这是作者脚本的游戏内时间，不代表真实新手的游玩时长或乐趣证明。

## 文件

源码仅为 `src/components/suiDelivery/` 中的 engine.ts、types.ts、content.ts、DeliveryGame.tsx、DeliveryScene.ts、feedback.ts、FeedbackView.ts、audio.ts。

专用验证新增：

- `scripts/lib/sui-delivery-vault-pilot.cjs`
- `scripts/tests/sui-delivery-vault.test.mjs`
- `scripts/verify-sui-delivery-vault.cjs`

没有修改小鸟一百层、RESET、旧 suiPlatformer 归档、共享游戏目录、package.json、tsconfig 或 progress.md。

## 可重跑验证

```powershell
node --test scripts/tests/sui-delivery-vault.test.mjs scripts/tests/sui-delivery.test.mjs scripts/tests/sui-delivery-feedback.test.mjs scripts/tests/sui-delivery-animation.test.mjs
pnpm exec eslint src/components/suiDelivery/engine.ts src/components/suiDelivery/types.ts src/components/suiDelivery/content.ts src/components/suiDelivery/DeliveryGame.tsx src/components/suiDelivery/DeliveryScene.ts src/components/suiDelivery/feedback.ts src/components/suiDelivery/FeedbackView.ts src/components/suiDelivery/audio.ts
$env:DELIVERY_BASE_URL = 'http://127.0.0.1:4160'
node scripts/verify-sui-delivery-vault.cjs
```

最终规则共 72 项通过，含原十二单完整普通输入路线、原首单两次挑起/两次踩踏路线、首单新分支完整送达、宽托盘/存档/支线/机关回归。新增分支不依靠直接修改玩家位置或进度。

挑跃覆盖三个接近距离 × 五个跳到挑的延迟（0/25/50/75/100ms），加速与普通走速均能落地旧招牌高台；又覆盖三个距离 × 二十个等待相位（每 100ms 一次、总 1.9 秒跨度），全部满血、零死、无 Shift 落上高台。另验证站立、身后和过期窗口照常受伤。

Chrome 验证报告位于 `.tmp/sui-delivery-vault/report.json`。使用已安装 Chrome、页面全页截图、静音、禁语音与 Pointer Lock 替身；交叉核对游戏文字状态、DOM/画布和错误列表。桌面从新存档走完首单，包括旧招牌、面包支线、雨棚、车和送达；触屏通过 CDP 真实多点触控按右/跳/挑，在没有按跑的情况下完成挑跃并落地屋顶。暂停冻结、取消触点释放输入、390px 竖屏整备面板也覆盖。

截图包括标题、面团接近、起跳、挑跃命中、屋顶落地、完整送达、手机接近、手机命中、手机屋顶和手机暂停。最终截图均须以最终报告为准逐张打开；旧中间报告不能代替最终截图。

## 保留的边界

自动验证证明路线可达、伤害规则与原有内容兼容，不能证明用户觉得好玩。下一次优先让用户直接试玩前一分钟，记录是否看懂提示、是否自然按住跳/挑、失败后是否愿意重试。未新增关卡、敌人、道具或养成；更广泛的关卡节奏和人类试玩仍留待下次。
