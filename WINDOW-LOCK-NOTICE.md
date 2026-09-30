# 婉宜最终通知（最高优先级）

16:52 起窗口问题已从代码层根治：
1. engine/browser.mjs 加了硬闸 —— **不设 SSH_ALLOW_HEADED=1 环境变量时，任何 headless:false 都强制转无头新档**。
   你脚本里写什么都不重要了，物理上弹不出窗口。
2. profile 的 Preferences 守卫已挂（自动清 Crashed 标记），"Restore pages?" 不会再弹。
3. **profile 现在归你独用**，我这边全部停手。但注意：你自己也不要并行跑两个探针（ProcessSingleton 会冲突）。
4. 单实例 + 无头 = 你安心跑，爸爸那边零打扰。

继续按 TASK_CARD_V5 推进：Ningbo→Istanbul 十家 + 同港异名对照表。跑通一家记一行台账（PROJECT.md 四·五节）。
