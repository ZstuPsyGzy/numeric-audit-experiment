# 数字关系核查在线实验

这是可直接部署的 jsPsych 在线实验。浏览器端负责设备检查、全屏呈现、trial 执行与断线暂存；Node.js 服务端负责顺序分配、数据接收、SQLite 存储和 CSV 导出。

被试首先阅读独立知情同意书；只有确认成年并自愿同意后，才显示被试信息收集页。不同意不会创建会话或上传数据，同意版本和时间会写入会话元数据。

## 当前正式方案

- 无 AI 基线：3 个 set size × 20 = 60 trials。
- AI 阶段：被试根据编号进入 1 个 cue 有效性组合；1 个 AI 组合 × 3 个 set size × 20 = 60 trials。
- 总正式试次：120 trials；练习不计入正式试次。
- set size 为有效核查位置：3×3、5×5、7×7；完整矩阵分别为 5×5、7×7、9×9。
- 每个 20-trial cell 均为0目标10次、有目标10次；为同时满足cue不重合、无漏报和精确有效率，单目标/双目标分布按条件设置：baseline与90×70、70×90为4/6，90×90为2/8，70×70为6/4。
- 每个 AI cell：Hit 10、Correct rejection 8、False alarm 2、Miss 0，系统层总体正确率 90%。
- 深红/浅红 cue 各出现 10 次；按条件精确实现 90% 或 70% cue validity。
- 深红和浅红在同一 trial 中可以同时出现，但必须指向不同矩阵位置；所有真实目标均由两类 cue 的联合集合完整覆盖。
- AI 候选使用单元格内部的淡红底纹呈现，不使用红色边框；数字保持黑色，深浅底纹分别表示两个候选优先层级。
- 被试需点击全部目标位置，再点击“合规 / 不合规”；正式 trial 随后填写判断置信度，AI trial 还填写 AI 结果信任度。
- “合规 / 不合规”作答区位于矩阵下方；提交判断后矩阵消失并切换到独立评分页，评分提交后呈现 500 ms 注视点。
- 初始指导语按“文字任务说明 → 矩阵与核查区域图示 → 理解检查 → AI 模型说明”的顺序逐页呈现。
- 矩阵示意会动态突出上下、左右关系，理解检查必须答对才能继续。
- 练习 trial 右上角可返回阅读指导语；返回后保留当前点击状态，并单独记录阅读次数和时长。
- 实验开头先完成一次无 AI 任务规则练习；无 AI 正式基线完成后，首次进入 AI 阶段时完成一次 AI 提示熟悉练习。各正式 condition 和 set size block 内不重复练习。
- 无 AI 基线固定在 AI 阶段之前；每名被试只进入 1 个 AI condition；3 个 set size 采用 6 条平衡序列。
- 正式编号使用前缀区分 AI 组：`A` = 90×90，`B` = 90×70，`C` = 70×90，`D` = 70×70。每个前缀内部的数字部分按 6 种 set size 顺序循环，例如 `A001–A006` 覆盖 90×90 组的 6 种顺序。
- 材料种子对所有被试固定；被试编号只影响阶段和区组顺序。
- 当前不设置 trial 最长反应时间。
- 三个 set size（共 60 个正式 trial）完成后才结束一个 AI 条件；只在相邻 AI 条件之间显示自定进度休息页，不再每 20 个 trial 单独显示休息页。
- 120 个正式 trial 全部完成后，依次填写 Chinese BFI-10（10题、5点）和 Wang 等人的 AI Literacy Scale（12题、7点）；两份问卷均为必答，不插入数字任务过程。

## 运行与检查

需要 Node.js 24 或以上版本。

```bash
cd online_experiment
npm run check-experiment
ADMIN_TOKEN=change-me SUBJECT_CODE_SALT=change-me node server.mjs
```

访问地址：

- 正式实验：`http://127.0.0.1:8780/`
- 预测试：`http://127.0.0.1:8780/?mode=pilot`
- 快速界面检查：`http://127.0.0.1:8780/?mode=pilot&skip_practice=1`
- 健康检查：`http://127.0.0.1:8780/api/health`
- CSV 导出：`http://127.0.0.1:8780/api/admin/export.csv?token=change-me`

`npm run check-experiment` 会逐一验证 300 个底层候选材料的条件计数、目标数、cue validity、系统事件和数字矩阵关系；`npm run check-counterbalancing` 会检查 `A/B/C/D` 前缀分组和 6 种 set size 顺序。每名被试实际进入 120 个正式 trial。

## 被试与设备

- 正式实验必须预先发放匿名编号，格式为 `A001、B001、C001、D001……`，并通过邮件或招募平台发送形如 `https://example.org/?sid=A001` 的专属链接。
- 为保持每组内部 set size 顺序平衡，每个 AI 组的样本量最好取 6 的整数倍；若不能，至少应按每个前缀内部连续发放，不能跳号或任意自拟编号。
- 若某一编号中途退出，可使用同一前缀且数字加 6 的同余编号补充同一顺序组，例如 `A002` 的替补使用 `A008`。
- URL 和表单中不填写姓名、邮箱或手机号；服务端只保存加盐后的编号哈希。
- 实验仅允许带鼠标或触控板的电脑，最低屏幕尺寸为 1280×800；校准后若无法按固定 135 mm 呈现最大矩阵，程序不会缩小刺激，而会阻止继续实验。
- 正式任务要求全屏；退出全屏会暂停当前 trial 并记录退出次数。
- 在线部署必须使用 HTTPS，否则浏览器的全屏和安全功能可能受限。

## 数据

SQLite 默认位于 `data/experiment.sqlite3`。浏览器断线时，未上传 trial 暂存在 `localStorage`，恢复联网后自动重试。

trial 级数据包含：稳定且跨被试一致的 `matrix_id`、条件与顺序、完整矩阵、材料种子、目标数与目标坐标、深红/浅红位置与有效性、系统事件、完整点击轨迹、首次点击来源、定位正确率、判断正确率、各阶段 RT、判断置信度、AI 信任度、500 ms 注视点实际时长、全屏退出和页面隐藏次数。

问卷数据以两个独立的 `post_questionnaire` 行保存，包括每道题的原始分数。程序同时计算 BFI-10 五个维度的 1–5 平均分，以及 AI 素养的 awareness、usage、evaluation、ethics 四个维度与总量表的 1–7 平均分；反向题在派生分数中自动反向，原始作答保持不变。

练习数据还包含 `instruction_review_count` 与 `instruction_review_time_ms`。返回阅读指导语的时间从练习作答 RT 中扣除。

## Docker 部署

```bash
docker build -t numeric-audit-experiment .
docker run --rm -p 8780:8780 \
  -e ADMIN_TOKEN='replace-with-a-long-random-token' \
  -e SUBJECT_CODE_SALT='replace-with-another-random-string' \
  -e PUBLIC_ORIGIN='https://experiment.example.org' \
  -v "$PWD/data:/app/data" \
  numeric-audit-experiment
```

线上必须把持久化磁盘挂载到 `/app/data`。正式发布后若修改 trial 逻辑或材料，需要同时更新 `EXPERIMENT_VERSION` 和 `MATERIAL_SEED`，不要把不同版本写入同一实验版本。

## GitHub 发布

仓库支持两种发布方式：

1. **GitHub Pages + 被试手动发送数据文件**：`docs/` 中的静态版本在实验结束后生成完整 JSON 和 CSV，不自动上传数据。
2. **GitHub + Railway 自动收数**：Railway 运行 Node.js 服务并把实验数据保存到持久化磁盘。

仓库已包含 GitHub Actions 校验：每次推送都会检查 300 个底层候选材料、24 组顺序平衡，并构建一次 Docker 镜像。完整发布步骤见 [`GITHUB_RAILWAY_DEPLOY.md`](./GITHUB_RAILWAY_DEPLOY.md)。

当前选择的是第一种方案。操作与回收要求见 [`GITHUB_PAGES_MANUAL_EXPORT.md`](./GITHUB_PAGES_MANUAL_EXPORT.md)。

## 主要文件

```text
online_experiment/
├── EXPERIMENT_SPEC.md
├── README.md
├── Dockerfile
├── server.mjs
├── scripts/check-experiment.mjs
└── public/
    ├── index.html
    ├── styles.css
    ├── vendor/                 本地固定的 jsPsych 8.2.3 与官方插件
    └── js/
        ├── app.js
        ├── display-calibration-plugin.js
        ├── numeric-audit-plugin.js
        ├── screen-plugin.js
        ├── trial-plan.js
        ├── matrix.js
        ├── api.js
        ├── config.js
        └── rng.js
```

## 显示校准

进入全屏后、练习开始前，程序先进行一次简易显示校准。其目的是估算屏幕物理显示尺寸，使不同电脑上呈现的数字矩阵大小尽量一致。被试使用居民身份证或标准银行卡实体卡，将参考矩形外轮廓匹配到标准尺寸 85.60 × 53.98 mm；随后辨认等面积的深红/浅红色块和 8 级灰阶。程序只比较卡片外轮廓，不读取、拍摄、保存或上传卡片信息。校准数据作为独立的 `display_calibration` 行保存。

校准目前用于记录设备差异和数据质量，不会自动缩放正式刺激。每个数字 trial 另外记录矩阵、单元格和字号的实际像素尺寸，并根据校准结果估算毫米尺寸，便于后续筛查异常设备或作为控制变量。

相邻数字单元格的边缘空白统一设为 1.5 mm。程序根据卡片校准得到的 `px_per_mm` 换算实际 CSS 间隙；三个 set size 使用同一物理间隙。每个 trial 同时记录目标间隙及浏览器实际渲染的横向、纵向间隙（px 与估算 mm）。
