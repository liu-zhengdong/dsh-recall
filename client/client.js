/**
 * dsh-recall 客户端半：在「设置」里加一节「回忆」，让人也能搜索 Run 归档。
 *
 * 运行在 Web 客户端沙箱里：无 JSX，React 与一切能力都从 loader 的 require 来。
 * apply 一旦抛错，整个 Web 启动会失败，所以这里的一切失败都收在组件状态里，
 * 只在面板里显示，不向外抛。
 *
 * 视觉与交互沿用宿主：控件用 @deepseek-ai/dsh-client-ui-primitives，
 * 颜色 / 圆角 / 字体全部走 --dsw-alias-* 令牌；组件库加载失败时面板显示横幅，
 * 不自绘替代控件。
 */
window.__ModuleLoader__.load({
  id: "dsh-recall",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var createElement = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;

    var name = "dsh-recall";
    var inject = ["slots", "remote"];

    // 宿主共享控件；加载失败记下文原因，面板里显示横幅（不 throw）。
    var uiFailure = null;
    var UI = null;
    try {
      UI = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch (error) {
      uiFailure = error && error.message ? String(error.message) : String(error);
    }
    var HostButton = UI === null ? null : UI.Button;
    var HostInput = UI === null ? null : UI.Input;
    var HostSegmented = UI === null ? null : UI.SegmentedControl;
    var HostTag = UI === null ? null : UI.Tag;
    var IconSearch = UI === null ? null : UI.IconSearchOutlineRegular || UI.IconSearchOutline16 || null;
    var IconBack = UI === null ? null : UI.IconChevronLeftOutlineRegular || UI.IconChevronLeftOutline14 || null;

    // ---- 面板样式：hover 等伪类只能走样式表，按宿主惯例注入一次 ----
    var STYLE_ID = "dsh-recall-style";
    var CSS = [
      ".dsh-recall-root{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,inherit)}",
      ".dsh-recall-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:10px}",
      ".dsh-recall-search{flex:1;min-width:0}",
      ".dsh-recall-list{display:flex;flex-direction:column;gap:2px}",
      ".dsh-recall-list--busy{opacity:.55}",
      ".dsh-recall-row{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}",
      ".dsh-recall-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}",
      ".dsh-recall-row:active{background:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,.14))}",
      ".dsh-recall-row:focus-visible{box-shadow:inset 0 0 0 1.5px var(--dsw-alias-brand-primary,#4d6bfe)}",
      ".dsh-recall-row__badge{flex:none;min-width:34px;font-family:var(--ds-font-family-code,ui-monospace,\"SF Mono\",Menlo,monospace);font-size:11px;line-height:20px;color:var(--dsw-alias-label-tertiary,#999)}",
      ".dsh-recall-row__main{flex:1;min-width:0}",
      ".dsh-recall-row__heading{display:flex;align-items:baseline;gap:8px}",
      ".dsh-recall-row__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px}",
      ".dsh-recall-row__time{flex:none;font-family:var(--ds-font-family-code,ui-monospace,\"SF Mono\",Menlo,monospace);font-size:11px;line-height:20px;color:var(--dsw-alias-label-tertiary,#999)}",
      ".dsh-recall-row__detail{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#888)}",
      ".dsh-recall-row__detail-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-recall-status{padding:12px 2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#888)}",
      ".dsh-recall-error{margin:8px 0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5534b)}",
      ".dsh-recall-more{margin-top:8px}",
      ".dsh-recall-detail-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}",
      ".dsh-recall-detail-meta{font-family:var(--ds-font-family-code,ui-monospace,\"SF Mono\",Menlo,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#999)}",
      ".dsh-recall-detail-card{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border-radius:var(--dsw-radius-md,8px);padding:12px 14px;font-family:var(--ds-font-family-code,ui-monospace,\"SF Mono\",Menlo,monospace);font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word}",
      ".dsh-recall-detail-page + .dsh-recall-detail-page{margin-top:10px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2,#e0e0e0)}",
      ".dsh-recall-filter{margin-bottom:10px}",
      ".dsh-recall-msg{display:block;width:100%;padding:8px 10px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}",
      ".dsh-recall-msg:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}",
      ".dsh-recall-msg:active{background:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,.14))}",
      ".dsh-recall-msg:focus-visible{box-shadow:inset 0 0 0 1.5px var(--dsw-alias-brand-primary,#4d6bfe)}",
      ".dsh-recall-msg__head{display:flex;align-items:center;gap:8px}",
      ".dsh-recall-msg__pos{flex:none;min-width:34px;font-family:var(--ds-font-family-code,ui-monospace,\"SF Mono\",Menlo,monospace);font-size:11px;line-height:20px;color:var(--dsw-alias-label-tertiary,#999)}",
      ".dsh-recall-msg__tool{font-family:var(--ds-font-family-code,ui-monospace,\"SF Mono\",Menlo,monospace);font-size:11px;line-height:20px;color:var(--dsw-alias-label-secondary,#888)}",
      ".dsh-recall-msg__preview{margin-top:3px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#888);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;word-break:break-word}",
    ].join("\n");

    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.getElementById(STYLE_ID) !== null) return;
      var tag = document.createElement("style");
      tag.id = STYLE_ID;
      tag.setAttribute("data-plugin-css", "dsh-recall/recall-section");
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ---- Remote 命名空间 ----
    // 与宿主半 src/remote.ts 保持一致：SERVICE_KEY / NAMESPACE / 四个方法。
    var NAMESPACE = "recall";
    var SERVICE_KEY = "dsh-recall/remote";

    /** 宿主方法签名是 SRC 反推的，参数编解码双方都按「原样透传」处理。 */
    function passthrough(typeSymbol) {
      return {
        mode: "strict",
        typeSymbol: typeSymbol,
        create: function () {
          return { parse: function (value) { return value; } };
        },
      };
    }

    function param(field) {
      return { name: field, wire: field, source: "json", codec: passthrough(field) };
    }

    var DIRECT = { kind: "direct" };
    var SRC_JSON = { mode: "src-json" };

    function descriptor(method, parameters) {
      return {
        id: "dsh-recall#" + NAMESPACE + "/" + method,
        service: SERVICE_KEY,
        namespace: NAMESPACE,
        method: method,
        invocation: DIRECT,
        parameters: parameters,
        result: SRC_JSON,
      };
    }

    var CONTRIBUTION = {
      package: "dsh-recall",
      descriptors: [
        descriptor("runs", []),
        descriptor("search", [param("args")]),
        descriptor("detail", [param("args")]),
        descriptor("forget", [param("ids"), param("reason")]),
      ],
    };

    /** 一元调用的信封不抛错，必须在这里解包。 */
    function unwrap(response) {
      if (response && response.ok === true) return response.value;
      var failure = response && response.error;
      if (!failure) throw new Error("Remote 调用没有返回结果");
      throw new Error(failure.code ? failure.code + "：" + failure.message : String(failure.message));
    }

    /** 命名空间是 apply 期间由 $mount 动态提供的，不能写进 inject。 */
    function namespace(ctx) {
      var api = ctx.get("remote." + NAMESPACE);
      if (api === undefined) throw new Error(NAMESPACE + " Remote 命名空间尚未挂载");
      return api;
    }

    function errorMessage(error) {
      if (error && error.message !== undefined) return String(error.message);
      return String(error);
    }

    // ---- 展示辅助 ----
    function shortTime(iso) {
      if (typeof iso !== "string" || iso === "") return "";
      var date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }

    function preview(text, maximum) {
      var flat = String(text == null ? "" : text).replaceAll("\n", " ").trim();
      return flat.length > maximum ? flat.slice(0, maximum - 1) + "…" : flat;
    }

    /** runs() 记录 → 行。 */
    function recordToRow(record) {
      return {
        id: "r" + record.ordinal,
        badge: "r" + record.ordinal,
        title: preview(record.goal || "无用户文本", 120),
        time: shortTime(record.startedAt),
        failed: record.status === "failed",
        detail: record.overview ? preview(record.overview, 90) : "",
      };
    }

    /**
     * search 的 choice → 行。label 形如 `ISO 时间 · 目标预览`（src/find.ts），
     * 左段能解析成日期就挪到行尾时间位，否则整段当标题。
     */
    function choiceToRow(choice) {
      var label = typeof choice.label === "string" ? choice.label : "";
      var at = label.indexOf("·");
      if (at !== -1) {
        var when = label.slice(0, at).trim();
        if (!Number.isNaN(new Date(when).getTime())) {
          return { id: choice.id, badge: choice.id, title: label.slice(at + 1).trim() || choice.id, time: shortTime(when), failed: false, detail: "" };
        }
      }
      return { id: choice.id, badge: choice.id, title: label || choice.id, time: "", failed: false, detail: "" };
    }

    function searchRows(result) {
      var choices = result && Array.isArray(result.choices) ? result.choices : [];
      return choices.map(choiceToRow);
    }

    /**
     * 老宿主没有 messages 字段时，从 readRun 的 text 里按头行解析
     * （`位置. 角色 工具 · rN/mM`）；预览可以含空行，所以不能按空行切块。
     */
    function parseRunMessages(text) {
      var HEAD = /^(\d+)\. (\S+)(?: (\S+))? · (r\d+\/m\d+)$/u;
      var messages = [];
      var current = null;
      String(text || "").split("\n").forEach(function (line) {
        var match = HEAD.exec(line.trim());
        if (match !== null) {
          current = {
            id: match[4],
            position: Number(match[1]),
            role: match[2],
            toolName: match[3] || "",
            preview: "",
          };
          messages.push(current);
        } else if (current !== null) {
          current.preview = current.preview === "" ? line : current.preview + "\n" + line;
        }
      });
      messages.forEach(function (message) { message.preview = message.preview.trim(); });
      return messages;
    }

    /** readRun 结果 → 结构化消息列表；优先用新宿主的 messages 字段。 */
    function resultMessages(result) {
      if (result && Array.isArray(result.messages)) {
        return result.messages.map(function (m) {
          return {
            id: String(m.id),
            position: Number(m.position),
            role: String(m.role || ""),
            toolName: typeof m.toolName === "string" ? m.toolName : "",
            preview: typeof m.preview === "string" ? m.preview : "",
          };
        });
      }
      return parseRunMessages(result && result.text);
    }

    /** detail 正文：新宿主直接给 body；老宿主剥掉 `---` 包装与续页提示。 */
    function detailBody(result) {
      if (result && typeof result.body === "string") return result.body;
      var text = result && typeof result.text === "string" ? result.text : "";
      var start = text.indexOf("\n---\n");
      var end = text.lastIndexOf("\n---\n");
      if (start !== -1 && end > start) return text.slice(start + 5, end);
      return text;
    }

    var ROLE_TONES = { user: "info", assistant: "neutral", tool: "outline" };
    function roleTone(role) {
      return Object.prototype.hasOwnProperty.call(ROLE_TONES, role) ? ROLE_TONES[role] : "quiet";
    }

    // ---- 小组件 ----
    function Banner(props) {
      if (!props.message) return null;
      return createElement("div", { className: "dsh-recall-error" }, props.message);
    }

    /** 列表行：序号徽标 + 标题（右侧时间）+ 可选详情行。 */
    function Row(props) {
      var row = props.row;
      return createElement(
        "div",
        {
          className: "dsh-recall-row",
          role: "button",
          tabIndex: 0,
          onClick: props.onClick,
          onKeyDown: function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              props.onClick();
            }
          },
        },
        createElement("span", { className: "dsh-recall-row__badge" }, row.badge),
        createElement(
          "div",
          { className: "dsh-recall-row__main" },
          createElement(
            "div",
            { className: "dsh-recall-row__heading" },
            createElement("div", { className: "dsh-recall-row__title" }, row.title),
            row.time === "" ? null : createElement("span", { className: "dsh-recall-row__time" }, row.time),
          ),
          row.failed || row.detail !== ""
            ? createElement(
                "div",
                { className: "dsh-recall-row__detail" },
                row.failed && HostTag !== null ? createElement(HostTag, { tone: "danger" }, "出错") : null,
                row.failed && HostTag === null ? createElement("span", null, "出错 · ") : null,
                row.detail === "" ? null : createElement("span", { className: "dsh-recall-row__detail-text" }, row.detail),
              )
            : null,
        ),
      );
    }

    /** 消息行：m 号 + 角色 Tag + 工具名 + 预览（三行截断）。 */
    function MessageRow(props) {
      var message = props.message;
      return createElement(
        "div",
        {
          className: "dsh-recall-msg",
          role: "button",
          tabIndex: 0,
          onClick: props.onClick,
          onKeyDown: function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              props.onClick();
            }
          },
        },
        createElement(
          "div",
          { className: "dsh-recall-msg__head" },
          createElement("span", { className: "dsh-recall-msg__pos" }, "m" + message.position),
          HostTag !== null
            ? createElement(HostTag, { tone: roleTone(message.role) }, message.role)
            : createElement("span", null, message.role),
          message.toolName === ""
            ? null
            : createElement("span", { className: "dsh-recall-msg__tool" }, message.toolName),
        ),
        message.preview === ""
          ? null
          : createElement("div", { className: "dsh-recall-msg__preview" }, message.preview),
      );
    }

    // ---- 搜索页 ----
    var SCOPES = [
      { value: "all", label: "全部" },
      { value: "summary", label: "摘要" },
      { value: "content", label: "正文" },
    ];

    var DEBOUNCE_MS = 300;

    /**
     * 设置里的「回忆」一节。
     * 三态：未挂载 / 宿主未就绪或出错 / 就绪。
     * 列表视图与详情视图共用一个组件；返回列表时列表状态原样保留。
     */
    function RecallSection(props) {
      var mountState = useState({ phase: "mounting" });
      var mount = mountState[0];
      var setMount = mountState[1];

      var queryState = useState("");
      var query = queryState[0];
      var setQuery = queryState[1];

      var debouncedState = useState("");
      var debounced = debouncedState[0];
      var setDebounced = debouncedState[1];

      var scopeState = useState("all");
      var scope = scopeState[0];
      var setScope = scopeState[1];

      var listState = useState({ phase: "idle", rows: [], more: null, moreLoading: false, note: "" });
      var list = listState[0];
      var setList = listState[1];

      var readingState = useState(null);
      var reading = readingState[0];
      var setReading = readingState[1];

      var messageState = useState(null);
      var readingMessage = messageState[0];
      var setReadingMessage = messageState[1];

      var msgFilterState = useState("");
      var msgFilter = msgFilterState[0];
      var setMsgFilter = msgFilterState[1];

      var aliveRef = useRef(true);
      useEffect(function () {
        aliveRef.current = true;
        return function () { aliveRef.current = false; };
      }, []);

      useEffect(function () {
        props.mount().then(function (failure) {
          if (!aliveRef.current) return;
          if (failure !== null) setMount({ phase: "failed", message: failure });
          else setMount({ phase: "ready" });
        });
      }, []);

      // 输入防抖：停顿后再触发查询，避免每个键击一次远程调用。
      useEffect(function () {
        var timer = setTimeout(function () { setDebounced(query.trim()); }, DEBOUNCE_MS);
        return function () { clearTimeout(timer); };
      }, [query]);

      // 读列表：debounced 为空列全部 Run，非空走搜索。scope 与 debounced 变化都会重查。
      useEffect(function () {
        if (mount.phase !== "ready") return;
        var alive = true;
        var api = namespace(props.ctx);
        var started = debounced === ""
          ? api.runs().then(unwrap).then(function (records) {
              return {
                rows: (Array.isArray(records) ? records : []).map(recordToRow),
                more: null,
              };
            })
          : api.search({ query: debounced, scope: scope, limit: 20 }).then(unwrap).then(function (result) {
              return {
                rows: searchRows(result),
                more: result && result.next ? result.next : null,
              };
            });
        setList(function (prev) {
          return { phase: "loading", rows: prev.rows, more: null, moreLoading: false, note: "" };
        });
        started.then(
          function (data) {
            if (alive) setList({ phase: "idle", rows: data.rows, more: data.more, moreLoading: false, note: "" });
          },
          function (error) {
            if (alive) setList({ phase: "idle", rows: [], more: null, moreLoading: false, note: errorMessage(error) });
          },
        );
        return function () { alive = false; };
      }, [mount.phase, debounced, scope]);

      /** 追加搜索结果的下一页（search.next 是分页参数，不是详情参数）。 */
      function loadMore() {
        if (list.more === null || list.moreLoading) return;
        var api = namespace(props.ctx);
        setList(function (prev) {
          return { phase: prev.phase, rows: prev.rows, more: prev.more, moreLoading: true, note: "" };
        });
        api.search(list.more).then(unwrap).then(
          function (result) {
            if (!aliveRef.current) return;
            var extra = searchRows(result);
            setList(function (prev) {
              return {
                phase: "idle",
                rows: prev.rows.concat(extra),
                more: result && result.next ? result.next : null,
                moreLoading: false,
                note: "",
              };
            });
          },
          function (error) {
            if (!aliveRef.current) return;
            setList(function (prev) {
              return { phase: "idle", rows: prev.rows, more: prev.more, moreLoading: false, note: errorMessage(error) };
            });
          },
        );
      }

      /** 展开一条 Run：search({id}) 分页读消息列表，渲染成结构化的消息行。 */
      function openRun(row) {
        var api = namespace(props.ctx);
        setReading({ row: row, messages: [], more: null, loading: true, note: "" });
        setReadingMessage(null);
        setMsgFilter("");
        api.search({ id: row.id }).then(unwrap).then(
          function (result) {
            if (!aliveRef.current) return;
            setReading({ row: row, messages: resultMessages(result), more: result && result.next ? result.next : null, loading: false, note: "" });
          },
          function (error) {
            if (!aliveRef.current) return;
            setReading({ row: row, messages: [], more: null, loading: false, note: errorMessage(error) });
          },
        );
      }

      /** 追加 Run 消息列表的下一页。 */
      function loadMoreMessages() {
        if (reading === null || reading.more === null || reading.loading) return;
        var api = namespace(props.ctx);
        setReading({ row: reading.row, messages: reading.messages, more: reading.more, loading: true, note: "" });
        api.search(reading.more).then(unwrap).then(
          function (result) {
            if (!aliveRef.current) return;
            setReading(function (cur) {
              if (cur === null || cur.row.id !== reading.row.id) return cur;
              return { row: cur.row, messages: cur.messages.concat(resultMessages(result)), more: result && result.next ? result.next : null, loading: false, note: "" };
            });
          },
          function (error) {
            if (!aliveRef.current) return;
            setReading(function (cur) {
              return cur === null ? cur : { row: cur.row, messages: cur.messages, more: cur.more, loading: false, note: errorMessage(error) };
            });
          },
        );
      }

      /** 打开一条消息的全文（detail 按 12KB 分页，「显示更多」逐页追加）。 */
      function openMessage(message) {
        var api = namespace(props.ctx);
        setReadingMessage({ id: message.id, role: message.role, toolName: message.toolName, pages: [], more: null, loading: true, note: "" });
        api.detail({ id: message.id }).then(unwrap).then(
          function (result) {
            if (!aliveRef.current) return;
            setReadingMessage({ id: message.id, role: message.role, toolName: message.toolName, pages: [detailBody(result)], more: result && result.next ? result.next : null, loading: false, note: "" });
          },
          function (error) {
            if (!aliveRef.current) return;
            setReadingMessage({ id: message.id, role: message.role, toolName: message.toolName, pages: [], more: null, loading: false, note: errorMessage(error) });
          },
        );
      }

      function loadMoreMessagePages() {
        if (readingMessage === null || readingMessage.more === null || readingMessage.loading) return;
        var api = namespace(props.ctx);
        setReadingMessage({ id: readingMessage.id, role: readingMessage.role, toolName: readingMessage.toolName, pages: readingMessage.pages, more: readingMessage.more, loading: true, note: "" });
        api.detail(readingMessage.more).then(unwrap).then(
          function (result) {
            if (!aliveRef.current) return;
            setReadingMessage(function (cur) {
              if (cur === null) return cur;
              return { id: cur.id, role: cur.role, toolName: cur.toolName, pages: cur.pages.concat([detailBody(result)]), more: result && result.next ? result.next : null, loading: false, note: "" };
            });
          },
          function (error) {
            if (!aliveRef.current) return;
            setReadingMessage(function (cur) {
              return cur === null ? cur : { id: cur.id, role: cur.role, toolName: cur.toolName, pages: cur.pages, more: cur.more, loading: false, note: errorMessage(error) };
            });
          },
        );
      }

      if (uiFailure !== null) {
        return createElement(Banner, { message: "界面组件库（dsh-client-ui-primitives）不可用：" + uiFailure });
      }
      if (mount.phase === "mounting") {
        return createElement("div", { className: "dsh-recall-status" }, "正在连接宿主的归档服务…");
      }
      if (mount.phase === "failed") {
        return createElement(Banner, { message: "归档服务不可用：" + mount.message });
      }

      var body;
      if (reading !== null && readingMessage !== null) {
        // 第三级：一条消息的全文
        var messageMeta = readingMessage.toolName === ""
          ? readingMessage.id + " · " + readingMessage.role
          : readingMessage.id + " · " + readingMessage.role + " " + readingMessage.toolName;
        body = createElement(
          "div",
          null,
          createElement(
            "div",
            { className: "dsh-recall-detail-head" },
            createElement(
              HostButton,
              {
                variant: "ghost",
                size: "sm",
                icon: IconBack === null ? undefined : createElement(IconBack, null),
                onClick: function () { setReadingMessage(null); },
              },
              "返回",
            ),
            createElement("span", { className: "dsh-recall-detail-meta" }, messageMeta),
          ),
          createElement(Banner, { message: readingMessage.note }),
          readingMessage.pages.length === 0 && readingMessage.loading
            ? createElement("div", { className: "dsh-recall-status" }, "读取中…")
            : createElement(
                "div",
                { className: "dsh-recall-detail-card" },
                readingMessage.pages.map(function (page, index) {
                  return createElement("div", { key: index, className: "dsh-recall-detail-page" }, page);
                }),
              ),
          readingMessage.more !== null
            ? createElement(
                "div",
                { className: "dsh-recall-more" },
                createElement(
                  HostButton,
                  { variant: "ghost", size: "sm", disabled: readingMessage.loading, onClick: loadMoreMessagePages },
                  readingMessage.loading ? "加载中…" : "显示更多",
                ),
              )
            : null,
        );
      } else if (reading !== null) {
        // 第二级：Run 的消息列表，支持本 Run 内筛选
        var filter = msgFilter.trim().toLowerCase();
        var visible = reading.messages.filter(function (message) {
          if (filter === "") return true;
          return (message.role + " " + message.toolName + " " + message.preview).toLowerCase().indexOf(filter) !== -1;
        });
        body = createElement(
          "div",
          null,
          createElement(
            "div",
            { className: "dsh-recall-detail-head" },
            createElement(
              HostButton,
              {
                variant: "ghost",
                size: "sm",
                icon: IconBack === null ? undefined : createElement(IconBack, null),
                onClick: function () { setReading(null); },
              },
              "返回",
            ),
            createElement(
              "span",
              { className: "dsh-recall-detail-meta" },
              reading.row.time === "" ? reading.row.id : reading.row.id + " · " + reading.row.time,
            ),
          ),
          createElement(
            "div",
            { className: "dsh-recall-filter" },
            createElement(HostInput, {
              icon: IconSearch === null ? undefined : createElement(IconSearch, null),
              value: msgFilter,
              placeholder: "在 " + reading.row.id + " 里筛选消息…",
              onChange: function (event) { setMsgFilter(event.target.value); },
            }),
          ),
          createElement(Banner, { message: reading.note }),
          reading.messages.length === 0 && reading.loading
            ? createElement("div", { className: "dsh-recall-status" }, "读取中…")
            : visible.length === 0
              ? createElement(
                  "div",
                  { className: "dsh-recall-status" },
                  filter === "" ? "这个 Run 没有可读的消息（会话日志可能已缺失）。" : "没有匹配「" + msgFilter.trim() + "」的消息。",
                )
              : createElement(
                  "div",
                  { className: "dsh-recall-list" },
                  visible.map(function (message) {
                    return createElement(MessageRow, {
                      key: message.id,
                      message: message,
                      onClick: function () { openMessage(message); },
                    });
                  }),
                ),
          reading.more !== null
            ? createElement(
                "div",
                { className: "dsh-recall-more" },
                createElement(
                  HostButton,
                  { variant: "ghost", size: "sm", disabled: reading.loading, onClick: loadMoreMessages },
                  reading.loading ? "加载中…" : "显示更多",
                ),
              )
            : null,
        );
      } else {
        var toolbar = createElement(
          "div",
          { className: "dsh-recall-toolbar" },
          createElement(
            "div",
            { className: "dsh-recall-search" },
            createElement(HostInput, {
              icon: IconSearch === null ? undefined : createElement(IconSearch, null),
              value: query,
              placeholder: "搜索过去的执行记录…",
              onChange: function (event) { setQuery(event.target.value); },
            }),
          ),
          createElement(HostSegmented, {
            id: "dsh-recall-scope",
            label: "搜索范围",
            value: scope,
            options: SCOPES,
            onChange: function (next) { setScope(next); },
          }),
        );
        var rows = list.rows.map(function (row) {
          return createElement(Row, {
            key: row.id,
            row: row,
            onClick: function () { openRun(row); },
          });
        });
        body = createElement(
          "div",
          null,
          toolbar,
          createElement(Banner, { message: list.note }),
          list.phase === "loading" && rows.length === 0
            ? createElement("div", { className: "dsh-recall-status" }, "查询中…")
            : rows.length === 0
              ? createElement(
                  "div",
                  { className: "dsh-recall-status" },
                  debounced === "" ? "还没有执行记录；开始对话后会自动记录。" : "没有匹配的记录；换一个词或把范围切到「全部」试试。",
                )
              : createElement("div", { className: list.phase === "loading" ? "dsh-recall-list dsh-recall-list--busy" : "dsh-recall-list" }, rows),
          list.more !== null
            ? createElement(
                "div",
                { className: "dsh-recall-more" },
                createElement(
                  HostButton,
                  { variant: "ghost", size: "sm", disabled: list.moreLoading, onClick: loadMore },
                  list.moreLoading ? "加载中…" : "显示更多",
                ),
              )
            : null,
        );
      }

      return createElement("div", { className: "dsh-recall-root" }, body);
    }

    function apply(ctx) {
      ensureStyle();
      // 惰性挂载：缓存 Promise，失败吞掉只记文本，绝不让 apply 抛错。
      var mounting = null;
      function mount() {
        if (mounting === null) {
          mounting = Promise.resolve()
            .then(function () {
              return ctx.remote.$mount(CONTRIBUTION);
            })
            .then(
              function () {
                return null;
              },
              function (error) {
                console.error("[dsh-recall] Remote 挂载失败", error);
                return errorMessage(error);
              },
            );
        }
        return mounting;
      }

      return ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          { name: "settings.section", id: "recall", order: 60, label: "回忆" },
          function (slotProps) {
            return createElement(RecallSection, {
              ctx: ctx,
              mount: mount,
              close: slotProps === undefined ? undefined : slotProps.close,
            });
          },
        );
      });
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
