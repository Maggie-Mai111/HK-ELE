# HK-ELE 网上部署候选版：Package73

## 版本定位

本包把 Package72 教师界面与 Package67 的只读查询功能合并为一个同源网站服务，供 GitHub 与 Render 部署使用。它不会修改或替代 Package72、Package67、研究结果、数据库或教师工作簿。

本包目前是 **PUBLIC_DEPLOYMENT_CANDIDATE_NOT_DEPLOYED**。创建公共网址、上传数据库、开放搜索引擎收录及正式对外发布仍需分别确认。

## 已完成的部署改造

1. 网页与 API 使用同一个域名和端口。
2. 前端统一通过 `/api/v1` 查询，不再连接 `127.0.0.1:18776`。
3. `server.py` 默认读取 Render 的 `PORT`，并绑定 `0.0.0.0`。
4. 数据库位置由 `DATABASE_PATH` 设置，默认 `/var/data/hkele.sqlite`。
5. SQLite 以 URI `mode=ro` 打开，并执行 `PRAGMA query_only=ON`。
6. 静态文件采用明确白名单。数据库、数据目录和任意本地文件均不能通过网址下载。
7. `/api/v1/health` 提供进程健康状态和 `database_ready`；`/api/v1/ready` 进一步核对数据库是否可以只读查询。
8. API 加入每个访问来源的分钟请求限制、请求体上限、查询长度限制、Excel导出行数上限及统一错误响应。
9. 所有响应加入内容安全策略、防嵌入、防 MIME 猜测、隐私与浏览器权限限制等安全响应头。
10. 默认禁止搜索引擎收录。准备正式公开后才把 `ALLOW_INDEXING` 改为 `true`，并同步修改 `frontend/index.html` 中的 robots meta。

## 本包不包含数据库

当前数据库约 643 MB，不适合提交到普通 GitHub 仓库。本包不会复制数据库，只在运行时读取以下权威文件：

```text
D:\HKELE_Wordlist_Paper\06_Web_App_And_AI_Product\67_general_source_identity_correction_candidate_local_product_20260914_v1\data\hkele_general_source_corrected_candidate_local_product_20260914_v1.sqlite
```

登记 SHA-256：

```text
A603BB318F0B14CB8AD9195E0F4A2DF9605750F3CECE0F8E064F467B31818472
```

## 本机启动

在本目录运行：

```powershell
python .\server.py `
  --host 127.0.0.1 `
  --port 18093 `
  --database "D:\HKELE_Wordlist_Paper\06_Web_App_And_AI_Product\67_general_source_identity_correction_candidate_local_product_20260914_v1\data\hkele_general_source_corrected_candidate_local_product_20260914_v1.sqlite"
```

然后打开：

```text
http://127.0.0.1:18093/
```

该地址刻意使用新端口18093，不影响Package72的18092本地版本。

## Render 部署顺序

1. 在 GitHub 新建私人仓库，只上传本包内容。
2. 不要上传 SQLite、Excel、原始语料、论文、日志或密码。
3. 在 Render 选择 `New > Blueprint`，连接该仓库并读取根目录 `render.yaml`。
4. Blueprint 会建立一个 Python Web Service，并挂载2 GB磁盘到 `/var/data`。
5. 第一次启动时磁盘尚无数据库，`/api/v1/health` 会返回 `database_ready: false`，服务仍可进入后台完成文件上传。
6. 在 Render 服务的 Connect 或 SSH 页面复制其专属 SSH 地址。
7. 在本机 PowerShell 使用 Render 给出的地址执行安全文件传输。命令形式如下，尖括号部分必须替换为 Render 实际显示的值：

```powershell
scp -s "D:\HKELE_Wordlist_Paper\06_Web_App_And_AI_Product\67_general_source_identity_correction_candidate_local_product_20260914_v1\data\hkele_general_source_corrected_candidate_local_product_20260914_v1.sqlite" <RENDER_SSH_TARGET>:/var/data/hkele.sqlite
```

8. 打开 `https://你的服务地址.onrender.com/api/v1/ready`。看到 `database_ready: true` 后，再进行网页验收。
9. 保持 `ALLOW_INDEXING=false` 进行教师试用。正式允许搜索引擎收录时再单独修改。

## 主要设置

| 设置 | 默认值 | 用途 |
|---|---:|---|
| `DATABASE_PATH` | `/var/data/hkele.sqlite` | 外部只读数据库位置 |
| `HOST` | `0.0.0.0` | Render 公共服务绑定地址 |
| `PORT` | `10000` | Render 会在运行时提供实际端口 |
| `PUBLIC_API_GET_RATE_PER_MINUTE` | `300` | 单个来源每分钟 GET API 上限 |
| `PUBLIC_API_POST_RATE_PER_MINUTE` | `60` | 单个来源每分钟 POST API 上限 |
| `ALLOW_INDEXING` | `false` | 是否允许搜索引擎收录 |

## 教师资料保存方式

Teaching List、顺序、栏目设置和教师笔记继续保存在浏览器 `localStorage`。每位老师的数据彼此分开，也不会发送到服务器。由于公共网址与本机地址属于不同 origin，本机18092中的列表不会自动出现在公共网址中；上线前可先下载CSV、Markdown或Excel作为备份。

## 验证

运行：

```powershell
python .\validate_deployment.py
```

验证脚本会启动一个临时本地服务，检查静态网页、只读健康状态、Browse、搜索与词族详情、Check a Text、Teaching List Excel下载、404和写入方法拦截、安全响应头、数据库文件不可下载、限流行为及源文件未被修改。
