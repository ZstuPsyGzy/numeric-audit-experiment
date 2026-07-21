# 数字关系核查在线实验

这是可直接部署的 jsPsych 在线实验。浏览器端负责设备检查、全屏呈现、trial 执行与断线暂存；Node.js 服务端负责顺序分配、数据接收、SQLite 存储和 CSV 导出。

被试首先阅读独立知情同意书；只有确认成年并自愿同意后，才显示被试信息收集页。不同意不会创建会话或上传数据，同意版本和时间会写入会话元数据。

## 当前正式方案

- 无 AI 基线：3 个 set size × 20 = 60 trials。
- AI 阶段：4 个 cue 有效性组合 × 3 个 set size × 20 = 240 trials。
- 总正式试次：300 trials；练习不计入正式试次。
- set size 为有效核查位置：3×3、5×5、7×7；完整矩阵分别为 5×5、7×7、9×9。
- 每个 20-trial cell：0 目标 10 次、1 目标 6 次、2 目标 4 次。
- 每个 AI cell：Hit 10、Correct rejection 8、False alarm 2、Miss 0，系统层总体正确率 90%。
- 深红/浅红 cue 各出现 10 次；按条件精确实现 90% 或 70% cue validity。
- 被试需点击全部目标位置，再点击“合规 / 不合规”；正式 trial 随后填写判断置信度，AI trial 还填写 AI 结果信任度。
- “合规 / 不合规”作答区位于矩阵下方；提交判断后矩阵消失并切换到独立评分页，评分提交后呈现 500 ms 注视点。
- 初始指导语按“文字任务说明 → 矩阵与核查区域图示 → 理解检查 → AI 模型说明”的顺序逐页呈现。
- 矩阵示意会动态突出上下、左右关系，理解检查必须答对才能继续。
- 练习 trial 右上角可返回阅读指导语；返回后保留当前点击状态，并单独记录阅读次数和时长。
- 无 AI / AI 阶段采用 AB/BA；4 个 AI condition 采用一阶顺序平衡拉丁方；3 个 set size 采用 6 条平衡序列。
- 三类顺序完整交叉为 `2 × 4 × 6 = 48` 个组；连续编号 `P001–P048` 构成一个完整周期，`P049` 开始下一周期。
- 材料种子对所有被试固定；被试编号只影响阶段和区组顺序。
- 当前不设置 trial 最长反应时间。

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

`npm run check-experiment` 会逐一验证 300 个正式 trial 的条件计数、目标数、cue validity、系统事件和数字矩阵关系，并检查 `P001–P048` 的 48 组严格顺序平衡。

## 被试与设备

- 正式实验必须预先发放连续匿名编号，格式为 `P001、P002……`，并通过邮件或招募平台发送形如 `https://example.org/?sid=P001` 的专属链接。
- 为保持完整交叉平衡，计划样本量最好取 48 的整数倍；若不能，至少应按编号连续发放，不能跳号或任意自拟编号。
- 若某一编号中途退出，可使用该编号加 48 的同余编号补充同一顺序组，例如 `P017` 的替补使用 `P065`。
- URL 和表单中不填写姓名、邮箱或手机号；服务端只保存加盐后的编号哈希。
- 实验仅允许带鼠标或触控板的电脑，最低屏幕尺寸为 1024×700。
- 正式任务要求全屏；退出全屏会暂停当前 trial 并记录退出次数。
- 在线部署必须使用 HTTPS，否则浏览器的全屏和安全功能可能受限。

## 数据

SQLite 默认位于 `data/experiment.sqlite3`。浏览器断线时，未上传 trial 暂存在 `localStorage`，恢复联网后自动重试。

trial 级数据包含：条件与顺序、矩阵、目标数与目标坐标、深红/浅红位置与有效性、系统事件、完整点击轨迹、首次点击来源、定位正确率、判断正确率、各阶段 RT、判断置信度、AI 信任度、500 ms 注视点实际时长、全屏退出和页面隐藏次数。

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

仓库已包含 GitHub Actions 校验：每次推送都会检查 300 个正式 trial、48 组顺序平衡，并构建一次 Docker 镜像。完整发布步骤见 [`GITHUB_RAILWAY_DEPLOY.md`](./GITHUB_RAILWAY_DEPLOY.md)。

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
        ├── numeric-audit-plugin.js
        ├── screen-plugin.js
        ├── trial-plan.js
        ├── matrix.js
        ├── api.js
        ├── config.js
        └── rng.js
```
