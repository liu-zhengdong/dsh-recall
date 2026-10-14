# dsh-recall

把 DSH 的**每个 turn 归档为一条 Run**，让 Agent 检索历史，并自动复盘积累的执行记录。

从 [pi-experiencev2](https://github.com/liu-zhengdong/pi-experiencev2) 移植。行为契约
（run 边界、检索语法、摘要与文案）保持不变，存储与注入机制按 DSH 的插件面重写。

## 它解决什么

Agent 的上下文只装得下当前会话的最近几轮。**你与它更早做过什么、决定过什么、
试错过什么**，在上下文里什么都不剩。本插件把这些落成可检索的归档：

- 每完成一个 turn 就归档一条 **Run**（起止时间、工作目录、状态、目标、摘要）。
- `recall`、`recall_message` 和 `forget` 让 Agent **自己**回查归档。
- `/runs` 命令让人浏览同一份归档。
- 全局积累 30 条未整理 Run 后，自动启动独立复盘会话：回顾这批经历、把值得长期记下的写进记忆，并留下一份可审阅的审计报告。左侧「复盘」查看过程与结果。

复盘的操作与配置见 [自动复盘](docs/auto-dream.md)。

## 与 pi-experiencev2 的差异

| | pi-experiencev2 | dsh-recall |
| --- | --- | --- |
| run 边界 | `agent_start` → `agent_end` | `turn/start` → `turn/end`（一个 turn = 一条 Run） |
| 消息正文 | 自建 SQLite 存正文 | **不存正文**，检索时回读 `ctx.sessionQuery.readSession()` |
| 检索 | 自己的 FTS/扫描 | 自己的 Run 索引 + 宿主提供的会话正文 |
| 界面 | TUI 面板（滚动、按键） | `/runs`、回忆设置页与左侧复盘会话 |
| 配置 | agent 目录下的 `pi-experiencev2.json` | profile 的 `cordis.patch.yml`（schemastery Config） |
| 摘要路由 | Pi 的 model registry | 配置项指定；留空则回落到当前会话的模型 |

## 它做什么

- **归档**：`turn/end` 提交时，从会话日志折叠出该 turn 的边界（起止时间、状态、
  首个用户目标、全部消息），写入 `run_archive` 存储域。复盘会话本身不归档、
  不生成摘要：它的过程与报告存在独立的 dream 存储域，不该变成待复盘的材料。
- **摘要**：归档后异步排队，调用模型生成一段中文概述。摘要是**附加**的：失败只记
  `summaryError`，归档本身照常。落盘前会等启动器退出前的那次 `sessions.flush()`，
  避免模型适配器已被卸载。
- **检索**：`recall` 按字面关键词在摘要与正文里查，分页返回；命中的消息可用
  `recall_message` 按 `r12/m3` 展开全文。
- **删除**：`forget` 永久删除指定 Run，留下一条极简墓碑（序号不复用）。
- **启动索引**：主 Agent 的新会话开始时，把当前目录最近 10 条 Run 收成一段索引注入上下文，只此一次。索引是历史证据，不是当前指令，也不代表当时任务成功；要看细节仍用 `recall` / `recall_message`。子代理、fork 出来的会话、本插件自己的复盘会话、恢复已有会话、清空和压缩都不注入。当前目录不够 10 条时不拿其他目录补，一条都没有就不注入。

## 模型工具

| 工具 | 作用 |
| --- | --- |
| `recall` | 按关键词 / Run ID / 时间 / 工作目录检索归档；命中摘要与正文，分页 |
| `recall_message` | 按 `r3/m2` 读一条消息的全文；默认文本，`format=raw` 给原始 JSON |
| `forget` | 在用户明确要求下批量删除 Run；先全批校验，未知 ID 整批拒绝 |
| `dream` | 查询保存的审计报告、固定材料范围和来源 |
| `dream_complete` | 复盘会话提交有来源的审计报告；正常结束后完成 |

工具结果与卡片都按「历史证据」措辞——**记录已保存不等于任务成功**。

## `/runs` 命令

```
/runs                 当前目录最近的 Run
/runs search <关键词>  检索当前目录
/runs all             全库最近的 Run
/runs r12             展开某条 Run 的消息列表
/runs r12/m3          读某条消息
/runs summary r12     只看某条 Run 的摘要
/runs debug           诊断信息（条数、墓碑数、摘要失败数）
```

输入不是以上任一形式时，整行按关键词检索当前目录。

## 安装

```bash
# 从 GitHub
dsh plugin --profile <profile> add github:liu-zhengdong/dsh-recall

# 本地 checkout（开发用）
dsh plugin --profile <profile> add /abs/path/to/dsh-recall
```

包声明了 `dsh.bundle.patch`，添加后包名会被追加进该 profile 的 `dsh.profile.bundles`。
验证层已挂上：

```bash
dsh --profile <profile> --dump-config | grep -B2 -A6 dsh-recall
```

> 本包未发布到 npm，`add dsh-recall` 会失败。
> 仓库直接带 `lib/` 构建产物，安装时不跑构建脚本（pnpm 会拦下 git 包的
> `prepare`，放行键还绑 commit hash，因此不采用那条路）。改源码后跑
> `npm run build` 并把 `lib/` 一起提交。

## 发版本

改完代码要一起升 `package.json` 的 `version`。不发新版本号，插件市场不会报
更新——它先比版本号，版本相同就直接判为无更新，后面的 commit 比较不执行。
完整机制见记忆库 `DSH插件开发.md`。

流程：

```bash
npm run check && npm run build && npm test   # 三关都过
# 升 package.json 的 version
git add -A && git commit -m "..." && git push
git tag v<version> && git push origin v<version>
pnpm update dsh-recall                       # 在 profile 目录，让本机装上
```

## 配置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `overviewLimit` | `200` | 每条 Run 摘要的目标 Unicode 字符数（1–2000） |
| `noSummary` | `false` | 关闭 Run 摘要；自动复盘由 `autoDream` 单独控制 |
| `summaryProvider` | `""` | 摘要模型的 provider；与 `summaryModel` 必须同时填写 |
| `summaryModel` | `""` | 摘要模型的 model 名 |
| `autoDream` | `true` | 达到全局门槛时自动复盘，可在侧栏暂停 |
| `dreamThreshold` | `30` | 自动复盘门槛（1–1000），每批最多 30 条 |
| `dreamProvider` / `dreamModel` | `""` | 同时留空使用宿主默认路由；同时填写可指定复盘模型 |
| `startupRecall` | `true` | 新会话开始时向主 Agent 注入最近 Run 的索引。fork（会话头 `isSeeded`）和复盘会话不注入 |
| `startupRecallCount` | `10` | 注入条数（1–100）。不够这个数时不从其他目录补 |
| `startupRecallScope` | `cwd` | `cwd` 只含当前工作目录；`all` 含全部目录，并在每行标出目录 |

`summaryProvider` 与 `summaryModel` 都留空时，沿用当前会话的模型路由。**只填一半会
被当作配置错误**——此时不生成摘要，只记 `summaryError`：宁可不摘要，也不猜另一半。

## 数据落在哪

```
<dsh home>/storages/run_archive/
  runs/<sessionId>__<turn>.json     一条 Run 的归档记录
  tombstones/<sessionId>__<turn>.json  删除墓碑
```

存储域名为 `run_archive`，后端由 profile 的 `storage-domain` 决定（默认 `json`）。
**本插件不复制原始消息正文**：正文始终是宿主自己的会话日志，插件只在检索时回读。

复盘进度与审计报告存于独立 `dream` 存储域。复盘会话正文由宿主管理；它按上下文里的记忆约定改动的记忆文件不在本插件存储域内，审计报告会写清动了什么。设计与边界见 [实现设计](docs/specs/auto-dream.md)。
