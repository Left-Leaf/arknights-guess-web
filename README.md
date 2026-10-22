# arknights-guess-web

《明日方舟》干员推演网页版。纯前端、无需服务器，对局与战绩只保存在浏览器 `localStorage`。

在线游玩：https://left-leaf.github.io/arknights-guess-web/

## 功能

- 五维线索：稀有度、职业/分支、阵营、种族、实装年份。
- 颜色与符号区分完全正确、部分命中、数值方向、错误。
- 按稀有度筛选答案池，可设置最大猜测次数（`-1` 不限）。
- 对局中可重新开始，结束可再开一局。
- 本机记录：已开始局数、成功次数、最佳连胜。

## 本地开发

需要 Node.js 22 或更高版本。

```powershell
npm ci
npm run dev
```

测试与生产构建：

```powershell
npm test
npm run build
```

## 数据

题库位于 `data/operators.json`，由 PRTS 数据管线生成，包含 434 名干员。更新时替换该文件并提交，GitHub Actions 会自动重新构建发布。

## 部署

仓库推送 `main` 后，`.github/workflows/pages.yml` 会构建 `dist/` 并发布到 GitHub Pages。

首次启用时，在仓库 Settings → Pages → Build and deployment 中将 Source 设为 **GitHub Actions**；随后在 Actions 页运行或重跑 `Deploy web game to GitHub Pages`。
