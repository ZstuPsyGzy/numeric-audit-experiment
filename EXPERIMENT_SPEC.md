# 实验操作定义

## 1. 任务

被试核查数字矩阵内部的每个有效位置：

```text
上方数字 + 下方数字 = 左侧数字 + 右侧数字
```

- 满足等式：该位置正常。
- 不满足等式：该位置为目标。
- 全部位置正常：trial 合规。
- 至少一个目标：trial 不合规。

每个 trial 可能有 0、1 或 2 个目标。被试先点击全部目标，再点击“合规 / 不合规”。

| 有效核查位置 | 有效位置数 | 完整数字矩阵 |
|---|---:|---:|
| 3×3 | 9 | 5×5 |
| 5×5 | 25 | 7×7 |
| 7×7 | 49 | 9×9 |

## 2. 实验结构

### 无 AI 基线

3 set size × 20 trials = 60 trials。该阶段完全不显示 cue，用于测量独立审核表现。

### AI 阶段

AI 不直接给答案，只给出两级候选：

- 深红：第一优先核查候选。
- 浅红：另一优先核查候选。

cue 有效性组合为：

1. 深红 90% × 浅红 90%
2. 深红 90% × 浅红 70%
3. 深红 70% × 浅红 90%
4. 深红 70% × 浅红 70%

每个组合包含 3 set size × 20 trials，共 240 AI trials。总正式试次为 300。

## 3. Cue 有效性

深红和浅红分别按 suggestion-level accuracy 计算：

```text
cue validity = 该颜色落在真实目标上的次数 / 该颜色实际出现次数
```

每个 AI cell 中，每种颜色各出现 10 次：

- 90%：9 次有效、1 次无效。
- 70%：7 次有效、3 次无效。

CR trial 中矩阵上不出现深红或浅红框，只显示中性的“AI 分析完成”。CR 不计入任何颜色 cue validity 的分母。

深红与浅红可以在同一 trial 同时出现，但不得指向同一矩阵位置。只要存在真实目标，两个 cue 的联合集合必须覆盖全部真实目标，因此系统层不设置漏报。

## 4. 系统事件

每个 AI × set size cell 固定20 trials，其中0目标10次、有目标10次。为了同时满足“不重合、无漏报、每种cue各出现10次以及90%/70%精确有效率”，单目标和双目标数量随AI条件变化：

| 条件 | 0目标 | 1目标 | 2目标 | 有效cue总数 |
|---|---:|---:|---:|---:|
| baseline | 10 | 4 | 6 | 不适用 |
| 90×90 | 10 | 2 | 8 | 9 + 9 = 18 |
| 90×70 | 10 | 4 | 6 | 9 + 7 = 16 |
| 70×90 | 10 | 4 | 6 | 7 + 9 = 16 |
| 70×70 | 10 | 6 | 4 | 7 + 7 = 14 |

每个AI cell的10个无目标trial中固定包含8次Correct rejection和2次False alarm；10个有目标trial均为Hit。双目标trial中两个目标必须分别由不同cue覆盖。

因此每个 AI cell 固定：Hit 10、CR 8、FA 2、Miss 0，系统层总体正确率为 18/20 = 90%。系统无漏报和cue不重合约束意味着目标数量分布必须随cue有效性组合变化；分析时必须记录并控制 `target_count`。

## 5. 练习与流程

1. 被试信息与设备检查。
2. 图示指导语。
3. 进入全屏。
4. 进入当前阶段并完成 5 个练习 trial。
5. 定位与判断完全正确率达到 80%；未达到则重复练习。
6. 按区组完成正式 trial；正式阶段不反馈答案。
7. 每个正式 trial 后填写判断置信度；AI trial 另填 AI 结果信任度，出现具体颜色 cue 时再填该 cue 信任度。
8. 全部正式 trial 完成后，依次填写 Chinese BFI-10（10题、5点）和 Artificial Intelligence Literacy Scale（12题、7点）。

练习分为两次且功能不同：实验开头的 5 个无 AI trial 用于掌握任务规则；无 AI 正式基线完成后，首次进入 AI 阶段时再用 5 个 trial 熟悉深红/浅红提示。正式 block 内不重复练习。

无 AI 基线固定在 AI 阶段之前，以测量被试尚未接触 AI 提示时的独立审核表现。AI condition 使用 4 条 Williams 平衡拉丁方序列：

1. `90_90 → 90_70 → 70_70 → 70_90`
2. `90_70 → 70_90 → 90_90 → 70_70`
3. `70_90 → 70_70 → 90_70 → 90_90`
4. `70_70 → 90_90 → 70_90 → 90_70`

set size 使用 6 条完整平衡序列。AI condition 与 set size 顺序完整交叉，形成 `4 × 6 = 24` 个顺序组。正式编号必须使用 `P001、P002……`；`P001–P024` 恰好覆盖一轮，`P025` 开始下一轮。相同编号始终得到相同顺序。

## 6. 主要数据

- 判断：`participant_judgment`、`judgment_correct`、`judgment_rt_ms`。
- 定位：`selected_positions`、`localization_correct`、`target_recall`、`click_precision`。
- 搜索过程：`click_trace`、`first_click_rt_ms`、`first_click_cue_membership`、`first_click_was_target`。
- AI：`deep_outcome`、`light_outcome`、`cue_profile`、`cue_positions_overlap`、`system_event`、`system_correct`。
- 主观评价：`judgment_confidence`、`ai_output_trust`、`deep_cue_trust`、`light_cue_trust`。
- 质量控制：全屏退出次数、页面隐藏次数、设备与浏览器信息。
- 实验后问卷：`bfi_01`–`bfi_10`、BFI-10 五维度平均分；`ail_01`–`ail_12`、AI 素养四维度及总量表平均分。

## 7. 固定材料

`MATERIAL_SEED` 对所有被试固定；被试编号不参与矩阵、目标或 cue 位置生成。`validateTrialPlan()` 与 `scripts/check-experiment.mjs` 必须在发布前通过。
