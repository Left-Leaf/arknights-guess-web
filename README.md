# arknights-guess-web

《明日方舟》干员 / 敌人推演网页版。纯前端、无需服务器，对局与战绩只保存在浏览器 `localStorage`。

在线游玩：https://left-leaf.github.io/arknights-guess-web/

## 功能

- 首页选择题库：猜干员或猜敌人，两者各自保存进度与战绩。
- 猜干员五维线索：稀有度、职业/分支、阵营、种族、实装年份。
- 「实装」列：登场活动一致显示绿色；仅年份一致（活动不同）显示黄色；年份不同给方向箭头。
- 猜敌人六维线索：危险等级（普通/精英/领袖）、耐久、攻击、防御、法术抗性、登场活动。
- 实装一列对干员显示实装年份，对敌人显示登场活动；颜色与符号区分完全正确、部分命中、数值方向、错误。
- 干员模式支持按稀有度筛选答案池，可设置最大猜测次数（`-1` 不限）。
- 对局中可重新开始：结束当前对局但不会立即开新局，第一次提交猜测时才创建新对局。
- 本机记录：按模式统计已开始局数、成功次数、最佳连胜。

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

- `data/operators.json`：434 名干员，由 PRTS 数据管线生成。
- `data/enemies.json`：1718 名敌人，来自 PRTS `敌人一览/数据` 与各敌人页面的 `登场活动`。

`enemies.json` 中 `debut` 为登场活动名，`debut_order` 用于给出“答案更早 / 更晚”的方向提示。更新时替换对应文件并提交，GitHub Actions 会自动重新构建发布。

## 部署

仓库推送 `main` 后，`.github/workflows/pages.yml` 会构建 `dist/` 并发布到 GitHub Pages。

首次启用时，在仓库 Settings → Pages → Build and deployment 中将 Source 设为 **GitHub Actions**；随后在 Actions 页运行或重跑 `Deploy web game to GitHub Pages`。
