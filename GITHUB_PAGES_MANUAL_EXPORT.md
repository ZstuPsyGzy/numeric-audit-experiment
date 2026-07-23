# GitHub Pages 手动回收数据方案

## 被试使用流程

1. 研究者向被试发送带匿名编号的专属链接，例如：

   ```text
   https://ZstuPsyGzy.github.io/numeric-audit-experiment/?sid=A001
   ```

2. 被试使用电脑打开链接并完成实验。
3. 实验结束后，浏览器自动尝试下载两份文件：
   - `numeric-audit_A001_日期时间.json`：完整原始数据，必须回收。
   - `numeric-audit_A001_日期时间.csv`：便于快速检查和导入统计软件。
4. 如果浏览器阻止自动下载，被试点击结束页上的两个下载按钮。
5. 被试通过招募平台附件或邮件，将两份文件发送给研究团队。

## 研究者回收检查

每位被试至少检查：

- JSON 和 CSV 文件名中的被试编号一致；
- JSON 能正常打开，包含 `session`、`row_count` 和 `rows`；
- CSV 中存在 `subject_code`、`phase`、`condition_key`、`set_size`、点击与 RT 字段；
- 正式实验每名被试应有 120 个正式 trial，练习和指导语记录不计入该数字；
- 文件没有出现 `unknown` 被试编号。

建议建立单独的加密数据文件夹，并按以下结构归档：

```text
raw-data/
├── A001/
│   ├── numeric-audit_A001_*.json
│   └── numeric-audit_A001_*.csv
├── B001/
└── ...
```

## 注意事项

- GitHub Pages 不保存被试数据；被试未发送文件，就无法从 GitHub 恢复数据。
- 浏览器本地存储只用于意外情况下的临时备份，不应作为正式回收方式。
- 不要让被试修改文件名或打开后另存为其他格式。
- 正式实验前至少进行 5–10 人完整预测试，专门检查下载和回传环节。
- 招募信息中应明确写明：完成实验后必须上传两份数据文件，确认收到后再发放报酬。

预测试链接：

```text
https://ZstuPsyGzy.github.io/numeric-audit-experiment/?mode=pilot&sid=TEST001
```
