# dsh-run-archive

把 DSH 的**每个 turn 归档为一条 Run**，并让 Agent 检索自己的执行历史。

从 [pi-experiencev2](https://github.com/liu-zhengdong/pi-experiencev2) 移植。行为契约
（run 边界、检索语法、摘要与文案）保持不变，存储与注入机制按 DSH 的插件面重写。

## 它解决什么

Agent 的上下文只装得下当前会话的最近几轮。**你与它更早做过什么、决定过什么、
试错过什么**，在上下文里什么都不剩。本插件把这些落成可检索的归档：

- 每完成一个 turn 就归档一条 **Run**（起止时间、工作目录、状态、目标、摘要）。
- 三个模型工具让 Agent **自己**回查：`find_run`、`get_message_detail`、`delete_run`。
- `/runs` 命令让人浏览同一份归档。

## 与 pi-experiencev2 的差异

| | pi-experiencev2 | dsh-run-archive |
| --- | --- | --- |
| run 边界 | `agent_start` → `agent_end` | `turn/start` → `turn/end`（一个 turn = 一条 Run） |
| 消息正文 | 自建 SQLite 存正文 | **不存正文**，检索时回读 `ctx.sessionQuery.readSession()` |
| 检索 | 自己的 FTS/扫描 | 自己的 Run 索引 + 宿主提供的会话正文 |
| 界面 | TUI 面板（滚动、按键） | `/runs` 返回文本（DSH 无对应面板 API） |
| 配置 | agent 目录下的 `pi-experiencev2.json` | profile 的 `cordis.patch.yml`（schemastery Config） |
| 摘要路由 | Pi 的 model registry | 配置项指定；留空则回落到当前会话的模型 |

## 它做什么

- **归档**：`turn/end` 提交时，从会话日志折叠出该 turn 的边界（起止时间、状态、
  首个用户目标、全部消息），写入 `run_archive` 存储域。
- **摘要**：归档后异步排队，调用模型生成一段中文概述。摘要是**附加**的：失败只记
  `summaryError`，归档本身照常。落盘前会等启动器退出前的那次 `sessions.flush()`，
  避免模型适配器已被卸载。
- **检索**：`find_run` 按字面关键词在摘要与正文里查，分页返回；命中的消息可用
  `get_message_detail` 按 `r12/m3` 展开全文。
- **删除**：`delete_run` 永久删除指定 Run，留下一条极简墓碑（序号不复用）。

## 三个模型工具

| 工具 | 作用 |
| --- | --- |
| `find_run` | 按关键词 / Run ID / 时间 / 工作目录检索归档；命中摘要与正文，分页 |
| `get_message_detail` | 按 `r3/m2` 读一条消息的全文；默认文本，`format=raw` 给原始 JSON |
| `delete_run` | 在用户明确要求下批量删除 Run；先全批校验，未知 ID 整批拒绝 |

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
# 本地 checkout（开发用）
dsh plugin --profile <profile> add /abs/path/to/dsh-run-archive

# 或从 npm
dsh plugin --profile <profile> add dsh-run-archive
```

包声明了 `dsh.bundle.patch`，添加后包名会被追加进该 profile 的 `dsh.profile.bundles`。
验证层已挂上：

```bash
dsh --profile <profile> --dump-config | grep -B2 -A6 dsh-run-archive
```

> link 安装不会给插件装依赖。从 git 安装时请先在 checkout 里 `npm install`。

## 配置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `overviewLimit` | `200` | 每条 Run 摘要的目标 Unicode 字符数（1–2000） |
| `noSummary` | `false` | 置 `true` 则只归档，完全不调用模型 |
| `summaryProvider` | `""` | 摘要模型的 provider；与 `summaryModel` 必须同时填写 |
| `summaryModel` | `""` | 摘要模型的 model 名 |

`summaryProvider` 与 `summaryModel` 都留空时，沿用当前会话的模型路由。**只填一半会
被当作配置错误**——此时不生成摘要，只记 `summaryError`：宁可不摘要，也不猜另一半。

## 数据落在哪

```
<dsh home>/storages/run_archive/
  runs/<sessionId>__<turn>.json     一条 Run 的归档记录
  tombstones/<sessionId>__<turn>.json  删除墓碑
```

存储域名为 `run_archive`，后端由 profile 的 `storage-domain` 决定（默认 `json`）。
**本插件不存消息正文**：正文始终是宿主自己的会话日志，插件只在检索时回读。
