# GitHub + Railway 发布清单

## 方案结构

- GitHub 私有仓库：保存实验程序和版本历史。
- Railway Service：运行网页与数据接收接口。
- Railway Volume：挂载到 `/app/data`，持久保存 SQLite 数据。
- 被试链接：使用 Railway 提供的 HTTPS 域名，不使用 GitHub Pages 地址。

GitHub Pages 只能发布静态文件，不能运行本实验的 Node.js 数据接口，因此不能单独用于正式收数。

## 1. 建立 GitHub 仓库

1. 在 GitHub 新建 Private repository，建议命名为 `numeric-audit-experiment`。
2. 不勾选自动生成 README、`.gitignore` 或 License，保持空仓库。
3. 将本文件夹中的全部内容作为仓库根目录上传。
4. 上传后打开仓库的 Actions 页面，确认 `Validate experiment` 为绿色通过。

不要上传：

- `.env`
- `data/` 中的数据库
- 被试登记表、姓名、邮箱或手机号
- `ADMIN_TOKEN`、`SUBJECT_CODE_SALT`

## 2. 从 GitHub 部署到 Railway

1. 在 Railway 新建 Project，选择 `Deploy from GitHub repo`。
2. 连接刚才建立的私有仓库。
3. Railway 会读取仓库根目录的 `Dockerfile` 和 `railway.json`。
4. 在 Variables 中设置：

   ```text
   HOST=0.0.0.0
   DATA_DIR=/app/data
   ADMIN_TOKEN=至少32位随机字符串
   SUBJECT_CODE_SALT=另一段至少32位随机字符串
   PUBLIC_ORIGIN=https://部署完成后获得的Railway域名
   ```

   不要自行设置 `PORT`，使用 Railway 自动提供的值。

5. 为该 Service 添加 Volume，Mount Path 必须填写 `/app/data`。
6. 生成 Public Domain，将完整的 HTTPS 地址填回 `PUBLIC_ORIGIN` 后重新部署。
7. 在 Volume 的 Backups 中开启每日备份。

## 3. 上线检查

依次访问：

```text
https://你的域名/api/health
https://你的域名/?mode=pilot&skip_practice=1&sid=TEST001
```

必须确认：

- 健康检查返回 `"ok": true`；
- 电脑检查、知情同意、信息填写、全屏和任务页面正常；
- 完成预测试后，CSV 中存在点击位置、RT、判断置信度、AI 信任度和顺序组字段；
- 刷新或重新部署后，之前的数据仍然存在。

CSV 管理员导出地址：

```text
https://你的域名/api/admin/export.csv?token=你的ADMIN_TOKEN
```

该地址只供研究者使用，不得发给被试或放进公开材料。

## 4. 正式收数

1. 先完成 5–10 人预测试。
2. 预测试通过后冻结代码，创建 GitHub Release 或 Tag，例如 `v1.5.1-formal`。
3. 清空预测试数据库或建立新的 Railway Environment 和 Volume。
4. 按顺序发放 `P001、P002……` 的专属链接。
5. 每天导出 CSV，并在本地加密备份；不要只依赖云端 Volume。

正式链接示例：

```text
https://你的域名/?sid=P001
https://你的域名/?sid=P002
```
