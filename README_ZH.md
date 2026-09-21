# HK-ELE 教师数据库：GitHub Pages 静态发布版

本目录是免费的 GitHub Pages 发布候选版。它保留当前教师网页的 Browse、Check a Text、Teaching List、CSV、Markdown 和 Excel 下载功能，不需要 Python 服务、Render 或服务器数据库。

## 结构

- `index.html`、`styles.css`、`app.js`：教师网页。
- `static_api.js`：在浏览器中提供与原查询接口相同的数据响应。
- `xlsx_export.js`：本地生成 Excel 文件，不依赖第三方网站。
- `tokenizer.js`、`contractions.js`：文本切分和表达式说明。
- `data/`：由 Package67 只读数据库生成的压缩公开数据。
- `build_static_data.py`：重新生成静态数据包。
- `validate_static_release.py`：检查静态数据与 Package67 查询结果是否一致。
- `VALIDATION.json`：最近一次验证结果。

原始 SQLite 文件没有放入本目录。静态数据按浏览页、搜索首字母和词族分区加载。网站首次打开只加载配置和当前表格页。进入完整数据库、搜索或检查文本时，浏览器才加载相应分区。

## 本机查看

在本目录运行：

```powershell
python -m http.server 18093 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:18093/
```

不能直接双击 `index.html`，因为浏览器通常不允许本地文件页面读取旁边的压缩数据文件。

## GitHub Pages 发布

将本目录中的全部文件放在 `Maggie-Mai111/HK-ELE` 仓库根目录。然后在 GitHub 仓库中选择：

1. `Settings`
2. `Pages`
3. `Build and deployment`
4. `Source: Deploy from a branch`
5. `Branch: main`
6. 文件夹选择 `/(root)`
7. 点击 `Save`

GitHub 完成发布后，网站地址通常是：

```text
https://maggie-mai111.github.io/HK-ELE/
```

## 重新生成与验证

数据库路径保持当前登记值时：

```powershell
python build_static_data.py
python validate_static_release.py
```

也可以明确指定另一个已经登记的只读 SQLite 文件：

```powershell
python build_static_data.py --database "D:\path\to\registered.sqlite"
```

静态数据约 60 MB，分为约 1,200 个压缩文件。当前最大单文件约 2.65 MB，低于 GitHub 浏览器和普通仓库的单文件限制。

## 数据公开范围

静态网站不能从技术上隐藏已经发送到访客浏览器的数据。本版本不提供原始 SQLite 文件，也没有数据库下载按钮，但网页使用的公开字段和词形映射可以被有技术能力的访客读取。这与旧版在 GitHub Pages 上公开 Excel 数据的模式相同。
