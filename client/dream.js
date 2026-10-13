/** Auto Dream 左侧入口。由主客户端挂载 recall Remote 后调用 install(ctx, mount)。 */
window.__ModuleLoader__.load({
  id: "dsh-recall-dream",
  factory: function (require) {
    var React = require("react");
    var h = React.createElement;
    var UI;
    var uiError = "";
    try { UI = require("@deepseek-ai/dsh-client-ui-primitives"); }
    catch (error) { uiError = message(error); }
    var PAGE_SIZE = 30;
    // 等复盘会话登记进会话目录：实测窗口约 1.4 秒，留 10 秒余量。
    var REVEAL_ATTEMPTS = 20;
    var REVEAL_DELAY_MS = 500;
    var EMPTY_SESSIONS = { ids: [], byId: {} };
    var EMPTY_STATUSES = new Map();
    var STYLE_ID = "dsh-recall-dream-style";
    var FONT = '"Mona Sans VF",-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Backtick Fix","Noto Sans",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"';
    var CSS = [
      ".dsh-dream-shell,.dsh-dream{display:flex;flex-direction:column;min-height:0;font-family:" + FONT + ";color:var(--dsw-alias-label-primary,inherit)}",
      ".dsh-dream-shell{flex:1;overflow:hidden}",
      ".dsh-dream-tabs{display:flex;gap:20px;flex:none;margin:0 16px 8px}",
      ".dsh-dream-tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;padding:8px 0;color:var(--dsw-alias-label-secondary,inherit);font:inherit;cursor:pointer}",
      ".dsh-dream-tab[aria-selected=true]{color:var(--dsw-alias-label-primary,inherit);border-bottom-color:currentColor}",
      ".dsh-dream-task-tree{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}",
      ".dsh-dream{flex:1;overflow:auto;padding:4px 12px 12px;font-size:13px;line-height:20px}",
      ".dsh-dream-head{display:flex;justify-content:space-between;align-items:center;padding:0 4px 8px;gap:8px}",
      ".dsh-dream-actions{display:flex;gap:4px;align-items:center;flex:none}",
      ".dsh-dream-muted{color:var(--dsw-alias-label-secondary,inherit);font-size:12px;line-height:18px}",
      ".dsh-dream-list{display:flex;flex-direction:column;gap:2px}",
      ".dsh-dream-item{border-radius:var(--dsw-radius-md,8px)}",
      ".dsh-dream-item[data-selected=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}",
      ".dsh-dream-row{appearance:none;display:block;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:9px 10px;border-radius:var(--dsw-radius-md,8px);cursor:pointer}",
      ".dsh-dream-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}",
      ".dsh-dream-row:focus-visible,.dsh-dream-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:-2px}",
      ".dsh-dream-heading{display:flex;align-items:baseline;gap:8px}",
      ".dsh-dream-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-dream-time{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,inherit)}",
      ".dsh-dream-meta{display:flex;gap:6px;align-items:center;margin-top:2px}",
      ".dsh-dream-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}",
      ".dsh-dream-running{color:var(--dsw-alias-brand-primary,#4d6bfe)}",
      ".dsh-dream-failed,.dsh-dream-error{color:var(--dsw-alias-state-error-primary,#e5534b)}",
      ".dsh-dream-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}",
      ".dsh-dream-item-actions{padding:0 10px 8px}",
      ".dsh-dream-modal{width:min(860px,100%);max-height:100%;font-family:" + FONT + ";font-size:13px;line-height:20px}",
      ".dsh-dream-modal-content{overflow:auto;min-height:0}",
      ".dsh-dream-detail h3,.dsh-dream-evidence h3{font-size:14px;font-weight:600;margin:16px 0 8px}",
      ".dsh-dream-detail h4{font-size:12px;font-weight:600;margin:8px 0 4px}",
      ".dsh-dream-detail p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0 8px}",
      ".dsh-dream-conclusion{margin:12px 0}",
      ".dsh-dream-sources{display:flex;flex-wrap:wrap;gap:2px}",
      ".dsh-dream-change{border:1px solid var(--dsw-alias-border-primary,rgba(128,128,128,.2));border-radius:var(--dsw-radius-md,8px);padding:8px 10px;margin:8px 0}",
      ".dsh-dream-change summary{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;overflow-wrap:anywhere}",
      ".dsh-dream-change summary::-webkit-details-marker{display:none}",
      ".dsh-dream-chevron{flex:none}.dsh-dream-change[open]>summary>.dsh-dream-chevron{transform:rotate(90deg)}",
      ".dsh-dream-change summary>.dsh-dream-muted{margin-left:auto;flex:none}",
      ".dsh-dream-material{display:flex;align-items:baseline;gap:6px;margin:8px 0}.dsh-dream-material>span{flex:1;min-width:0;overflow-wrap:anywhere}.dsh-dream-material>time{flex:none}",
      ".dsh-dream-body{white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;max-height:320px;font-size:12px;line-height:18px;margin:4px 0 8px;padding:8px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent)}",
      ".dsh-dream-evidence{margin-top:16px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-primary,rgba(128,128,128,.2))}.dsh-dream-evidence .dsh-dream-head{padding:0}.dsh-dream-evidence .dsh-dream-head h3{margin:4px 0 8px}",
      ".dsh-dream-empty,.dsh-dream-error{padding:8px 4px;font-size:12px;line-height:18px;overflow-wrap:anywhere}",
      ".dsh-dream-more{align-self:center;margin-top:8px}",
      "@media(prefers-reduced-motion:no-preference){.dsh-dream-running .dsh-dream-dot{animation:dsh-dream-pulse 1.4s ease-in-out infinite}}",
      "@keyframes dsh-dream-pulse{50%{opacity:.35}}",
    ].join("\n");

    function message(error) { return error && error.message ? String(error.message) : String(error); }
    function unwrap(result) {
      if (result && result.ok === true) return result.value;
      var error = result && result.error;
      throw new Error(error ? (error.code ? error.code + "：" : "") + error.message : "复盘没有返回结果");
    }
    function basename(path) { return String(path || "当前项目").replace(/[\\/]+$/, "").split(/[\\/]/).pop(); }
    function shortTime(value) {
      var date = new Date(value);
      if (!value || Number.isNaN(date.getTime())) return "";
      return date.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    function currentSession(state) {
      var byId = state.byId || {};
      return Object.keys(byId).find(function (id) {
        return byId[id].retainedBy && byId[id].retainedBy.mainView > 0;
      }) || null;
    }
    function RefreshIcon() {
      return h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true },
        h("path", { d: "M20 11a8 8 0 1 0-2.3 6.7M20 4v7h-7", strokeLinecap: "round", strokeLinejoin: "round" }));
    }
    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      var style = document.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("data-plugin-css", "dsh-recall/dream");
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    /** 与 IM 插件 version 1 注册表保持同一形状；宿主任务树仍由原组件渲染。 */
    function createRegistry(officialTree) {
      var tabs = new Map();
      var listeners = new Set();
      var snapshot = [];
      var registry = {
        version: 1,
        officialTree: officialTree,
        sessionFilters: [],
        getTabs: function () { return snapshot; },
        subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener); }; },
        insert: function (tab) {
          tabs.set(tab.id, tab);
          publish();
          return function () { if (tabs.get(tab.id) === tab) { tabs.delete(tab.id); publish(); } };
        },
        addSessionFilter: function (filter) {
          registry.sessionFilters = registry.sessionFilters.concat(filter);
          publish();
          return function () {
            registry.sessionFilters = registry.sessionFilters.filter(function (item) { return item !== filter; });
            publish();
          };
        },
      };
      function publish() {
        snapshot = Array.from(tabs.values()).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        listeners.forEach(function (listener) { listener(); });
      }
      return registry;
    }

    function install(ctx, mount) {
      ensureStyle();
      var disposed = false;
      var listeners = new Set();
      var membershipListeners = new Set();
      var ids = new Set();
      var membershipRevision = 0;
      var requestGeneration = 0;
      var loading = false;
      var refreshAgain = false;
      var timer = null;
      var watch = null;
      var watchStarting = false;
      var state = { phase: "mounting", status: null, rows: [], hasMore: false, moreLoading: false, operation: "", error: "", watchError: "" };
      var activeBinding = null;
      var ownsShell = null;
      var synchronizing = false;
      var unsubscribers = [];

      function subscribe(listener) { listeners.add(listener); return function () { listeners.delete(listener); }; }
      function snapshot() { return state; }
      function patch(next) {
        if (disposed) return;
        state = Object.assign({}, state, next);
        listeners.forEach(function (listener) { listener(); });
      }
      function api() {
        var service = ctx.get("remote.recall");
        if (!service) throw new Error("复盘服务尚未挂载");
        return service;
      }
      function updateMembership(status, rows) {
        var next = new Set(Array.isArray(status.sessionIds) ? status.sessionIds : []);
        rows.forEach(function (row) { if (row.sessionId) next.add(row.sessionId); });
        if (next.size === ids.size && Array.from(next).every(function (id) { return ids.has(id); })) return;
        ids = next;
        membershipRevision += 1;
        membershipListeners.forEach(function (listener) { listener(); });
        if (activeBinding) activeBinding.refresh();
      }
      function page(result) {
        if (!result || !Array.isArray(result.items) || typeof result.hasMore !== "boolean") throw new Error("复盘列表格式不正确");
        return result;
      }
      function scheduleRefresh() {
        if (disposed || timer !== null) return;
        timer = setTimeout(function () { timer = null; refresh(); }, 150);
      }
      async function refresh() {
        if (disposed || state.phase === "mounting") return;
        if (loading) { refreshAgain = true; return; }
        loading = true;
        var generation = ++requestGeneration;
        patch({ phase: state.status ? "ready" : "loading" });
        try {
          var service = api();
          var values = await Promise.all([service.dreamStatus().then(unwrap), service.dreams({ offset: 0, limit: PAGE_SIZE }).then(unwrap)]);
          if (disposed || generation !== requestGeneration) return;
          var status = values[0];
          var first = page(values[1]);
          var seen = new Set(first.items.map(function (row) { return row.id; }));
          var rows = first.items.concat(state.rows.filter(function (row) { return !seen.has(row.id); }));
          var hasMore = Boolean(first.hasMore && (state.rows.length <= PAGE_SIZE || state.hasMore));
          updateMembership(status, rows);
          patch({ phase: "ready", status: status, rows: rows, hasMore: hasMore, moreLoading: false });
        } catch (error) {
          if (!disposed && generation === requestGeneration) patch({ phase: "failed", moreLoading: false, error: "无法读取复盘：" + message(error) });
        } finally {
          loading = false;
          if (refreshAgain) { refreshAgain = false; scheduleRefresh(); }
        }
      }
      async function loadMore() {
        if (loading || state.moreLoading || !state.hasMore) return;
        var generation = requestGeneration;
        var offset = state.rows.length;
        patch({ moreLoading: true });
        try {
          var next = page(unwrap(await api().dreams({ offset: offset, limit: PAGE_SIZE })));
          if (disposed || generation !== requestGeneration) return;
          var present = new Set(state.rows.map(function (row) { return row.id; }));
          var rows = state.rows.concat(next.items.filter(function (row) { return !present.has(row.id); }));
          updateMembership(state.status, rows);
          patch({ rows: rows, hasMore: Boolean(next.hasMore), moreLoading: false });
        } catch (error) {
          if (!disposed && generation === requestGeneration) patch({ moreLoading: false, error: "无法读取更多复盘：" + message(error) });
        }
      }
      async function startWatch() {
        if (disposed || watch || watchStarting) return;
        watchStarting = true;
        var handle;
        try {
          handle = api().dreamWatch();
          watch = handle;
          patch({ watchError: "" });
          for await (var notification of handle) {
            if (disposed) break;
            scheduleRefresh();
          }
          if (!disposed) patch({ watchError: "复盘实时更新已停止，请刷新重连。" });
        } catch (error) {
          if (!disposed) patch({ watchError: "复盘实时更新中断：" + message(error) });
        } finally {
          if (handle) handle.dispose();
          if (watch === handle) watch = null;
          watchStarting = false;
        }
      }
      function openSession(id) {
        if (!id) throw new Error("这次复盘尚未创建会话");
        var navigation = ctx.get("uiWorkspace");
        if (!navigation || typeof navigation.openSession !== "function") throw new Error("宿主未提供会话导航");
        navigation.openSession(id);
      }
      /**
       * 会话目录里找不到该 id 时报的就是这句。复盘会话由宿主直接创建，从创建到登记进
       * 目录有一段延迟（实测约 1.4 秒），dreamRun 一返回就导航必然落进这段窗口。
       */
      function notListedYet(error) {
        return /unknown session/i.test(message(error));
      }
      /**
       * 等复盘会话登记进会话目录再导航。目录快照只能靠 `sessions.refresh()` 推进，
       * 所以每轮都主动刷一次，而不是干等。
       */
      async function revealSession(id) {
        var sessions = ctx.get("sessions");
        var canProbe = Boolean(sessions && typeof sessions.refresh === "function");
        for (var attempt = 0; attempt < REVEAL_ATTEMPTS; attempt += 1) {
          if (disposed) return;
          if (canProbe) {
            try { await sessions.refresh(); } catch (error) { /* 刷新失败就退避后再试 */ }
            if (disposed) return;
          }
          try { openSession(id); return; }
          catch (error) {
            if (!canProbe || !notListedYet(error)) throw error;
          }
          await new Promise(function (resolve) { setTimeout(resolve, REVEAL_DELAY_MS); });
        }
        throw new Error("复盘会话已创建，但会话目录一直没登记它；请在列表中手动打开 " + id);
      }
      async function perform(method, argument) {
        if (state.operation || disposed) return;
        patch({ operation: method, error: "" });
        try {
          var service = api();
          var result = argument === undefined ? await service[method]() : await service[method](argument);
          var value = unwrap(result);
          if (disposed) return;
          if ((method === "dreamRun" || method === "dreamRetry") && value && value.sessionId) await revealSession(value.sessionId);
        } catch (error) { patch({ error: message(error) }); }
        finally { patch({ operation: "" }); await refresh(); }
      }

      function SourceLinks(props) {
        return h("div", { className: "dsh-dream-sources" }, props.sources.map(function (source) {
          return h(UI.Button, { key: source, variant: "ghost", size: "sm", onClick: function () { props.onRead(source); } }, source);
        }));
      }
      function DetailModal(props) {
        var detailState = React.useState({ job: null, loading: true, error: "" });
        var detail = detailState[0];
        var setDetail = detailState[1];
        var evidenceState = React.useState(null);
        var evidence = evidenceState[0];
        var setEvidence = evidenceState[1];
        var jobRequest = React.useRef(0);
        var evidenceRequest = React.useRef(0);
        var evidenceElement = React.useRef(null);
        async function loadJob() {
          var generation = ++jobRequest.current;
          setDetail(function (previous) { return { job: previous.job, loading: true, error: "" }; });
          try {
            var job = unwrap(await api().dreamDetail(props.summary.id));
            if (generation === jobRequest.current) setDetail({ job: job, loading: false, error: "" });
          } catch (error) {
            if (generation === jobRequest.current) setDetail(function (previous) { return { job: previous.job, loading: false, error: message(error) }; });
          }
        }
        async function readEvidence(id, next) {
          var generation = ++evidenceRequest.current;
          var isRun = /^r[1-9]\d*$/.test(id);
          setEvidence(function (previous) {
            return { id: id, isRun: isRun, text: next && previous ? previous.text : "", messages: next && previous ? previous.messages : [], pages: next && previous ? previous.pages : [], next: next || null, loading: true, error: "" };
          });
          try {
            // Run 索引由 search({id:rN}) 读取；detail 只读取 rN/mM 消息正文。
            var result = unwrap(await (isRun ? api().search(next || { id: id }) : api().detail(next || { id: id })));
            if (generation !== evidenceRequest.current) return;
            setEvidence(function (previous) {
              return { id: id, isRun: isRun, text: result.displayText || result.text,
                messages: previous.messages.concat(isRun ? result.messages || [] : []),
                pages: previous.pages.concat(isRun ? [] : [typeof result.body === "string" ? result.body : result.text]),
                next: result.next || null, loading: false, error: "" };
            });
          } catch (error) {
            if (generation === evidenceRequest.current) setEvidence(function (previous) { return Object.assign({}, previous, { loading: false, error: message(error) }); });
          }
        }
        React.useEffect(function () {
          loadJob();
          return function () { jobRequest.current += 1; evidenceRequest.current += 1; };
        }, [props.summary.id]);
        React.useEffect(function () {
          if (evidence && evidenceElement.current) evidenceElement.current.scrollIntoView({ block: "nearest" });
        }, [evidence && evidence.id]);
        var job = detail.job;
        var body = !job ? null : h("div", { className: "dsh-dream-detail" },
          h("div", { className: "dsh-dream-muted" }, job.cwd + " · " + shortTime(job.startedAt)),
          job.error ? h("div", { className: "dsh-dream-error", role: "alert" }, job.error) : null,
          job.correctionError ? h("div", { className: "dsh-dream-error", role: "alert" }, "补充复盘失败：" + job.correctionError) : null,
          h("h3", null, "审计报告"),
          job.conclusions.length ? job.conclusions.map(function (conclusion, index) {
            return h("div", { key: index, className: "dsh-dream-conclusion" },
              h("span", { className: "dsh-dream-muted" }, { fact: "事实", inference: "推断", unverified: "待核实" }[conclusion.kind]),
              h("p", null, conclusion.text), h(SourceLinks, { sources: conclusion.sources, onRead: readEvidence }));
          }) : h("p", null, job.noChangeReason || "尚未提交报告。"),
          h("details", { className: "dsh-dream-change" },
            h("summary", null, h("svg", { className: "dsh-dream-chevron", width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true }, h("path", { d: "m9 5 7 7-7 7", strokeLinecap: "round", strokeLinejoin: "round" })), "检查了 " + job.batch.length + " 条记录"),
            job.batch.map(function (run) { return h("div", { key: run.id, className: "dsh-dream-material" },
              h(UI.Button, { variant: "ghost", size: "sm", onClick: function () { readEvidence("r" + run.ordinal); } }, "r" + run.ordinal),
              h("span", null, run.goal || "无用户文本"), h("time", { className: "dsh-dream-muted", dateTime: run.startedAt }, shortTime(run.startedAt))); })));
        return h(UI.Modal, { open: true, onClose: props.onClose, title: props.summary.title || "复盘详情", closeLabel: "关闭详情", className: "dsh-dream-modal", contentClassName: "dsh-dream-modal-content",
          footer: h("div", { className: "dsh-dream-actions" },
            h(UI.Button, { variant: "ghost", size: "sm", disabled: detail.loading, onClick: loadJob }, "刷新结果"),
            h(UI.Button, { variant: "ghost", size: "sm", onClick: function () { try { openSession(props.summary.sessionId); props.onClose(); } catch (error) { setDetail(function (previous) { return Object.assign({}, previous, { error: message(error) }); }); } } }, "打开会话")) },
          detail.loading ? h("div", { className: "dsh-dream-muted", role: "status" }, "读取复盘详情…") : null,
          detail.error ? h("div", { className: "dsh-dream-error", role: "alert" }, detail.error) : null,
          body,
          evidence ? h("section", { className: "dsh-dream-evidence", ref: evidenceElement, "aria-label": "来源资料" },
            h("div", { className: "dsh-dream-head" }, h("h3", null, "来源 " + evidence.id),
              !evidence.isRun ? h(UI.Button, { variant: "ghost", size: "sm", onClick: function () { readEvidence(evidence.id.split("/")[0]); } }, "查看所属记录") : null),
            evidence.error ? h("div", { className: "dsh-dream-error", role: "alert" }, evidence.error) : null,
            evidence.isRun ? evidence.messages.map(function (item) { return h("button", { key: item.id, type: "button", className: "dsh-dream-row", onClick: function () { readEvidence(item.id); } },
              h("div", null, item.id + " · " + item.role + (item.toolName ? " · " + item.toolName : "")), h("div", { className: "dsh-dream-muted" }, item.preview)); }) : h("pre", { className: "dsh-dream-body" }, evidence.pages.join("")),
            evidence.isRun && !evidence.loading && !evidence.messages.length ? h("pre", { className: "dsh-dream-body" }, evidence.text || "没有可读取的消息。") : null,
            evidence.loading ? h("div", { className: "dsh-dream-muted", role: "status" }, "读取来源…") : null,
            !evidence.loading && evidence.next ? h(UI.Button, { variant: "ghost", size: "sm", onClick: function () { readEvidence(evidence.id, evidence.next); } }, "显示更多") : null,
            !evidence.loading && evidence.error ? h(UI.Button, { variant: "ghost", size: "sm", onClick: function () { readEvidence(evidence.id, evidence.next); } }, "重试读取") : null) : null);
      }

      function DreamList(props) {
        var view = React.useSyncExternalStore(subscribe, snapshot, snapshot);
        var sessions = typeof props.useSessions === "function" ? props.useSessions(function (value) { return value; }) : EMPTY_SESSIONS;
        var statuses = typeof props.useSessionStatus === "function" ? props.useSessionStatus(function (value) { return value; }) : EMPTY_STATUSES;
        var selected = currentSession(sessions);
        var selectedDetail = React.useState(null);
        var status = view.status;
        var pendingCount = status && typeof status.pendingCount === "number" ? status.pendingCount : 0;
        var running = Boolean(status && status.running);
        var busy = Boolean(view.operation);
        if (!UI || !UI.Button) return h("div", { className: "dsh-dream-error", role: "alert" }, "无法加载宿主控件：" + (uiError || "Button 不可用"));
        var Button = UI.Button;
        var available = Boolean(status && status.enabled);
        var pauseLabel = status && status.paused ? "恢复自动复盘" : "暂停自动复盘";
        var info = !status ? "读取中…" : !status.enabled ? "自动复盘未启用" : status.paused ? "自动复盘已暂停" : pendingCount ? "待复盘 " + pendingCount + " 条" : "暂无待复盘记录";
        return h("div", { className: "dsh-dream", "aria-label": "复盘" },
          h("div", { className: "dsh-dream-head" },
            h("span", { className: "dsh-dream-muted" }, info),
            h("div", { className: "dsh-dream-actions" },
              h(Button, { variant: "ghost", size: "sm", icon: h(RefreshIcon), "aria-label": "刷新复盘", title: "刷新复盘", disabled: busy, onClick: function () { patch({ error: "" }); startWatch(); refresh(); } }),
              h(Button, { variant: "ghost", size: "sm", disabled: busy || !status, onClick: function () { perform("dreamPause", !status.paused); }, title: pauseLabel }, status && status.paused ? "恢复" : "暂停"))),
          h("div", { className: "dsh-dream-head" },
            h(Button, { variant: "ghost", size: "sm", disabled: busy || !available || running || !pendingCount, onClick: function () { perform("dreamRun"); } }, "立即复盘"),
            running ? h(Button, { variant: "ghost", size: "sm", disabled: busy, onClick: function () { perform("dreamStop"); } }, "停止本次") : null),
          view.error ? h("div", { className: "dsh-dream-error", role: "alert" }, view.error) : null,
          view.watchError ? h("div", { className: "dsh-dream-error", role: "alert" }, view.watchError) : null,
          h("div", { className: "dsh-dream-list" }, view.rows.map(function (job) {
            var live = statuses && statuses.get ? statuses.get(job.sessionId) : undefined;
            var phase = job.status;
            var label = { starting: "准备中", running: "正在复盘", completed: "已完成", failed: "失败", cancelled: "已停止", interrupted: "已中断" }[phase] || phase;
            if (phase === "running" && live && live.pendingInteraction) label = "等待处理";
            var preview = job.error || (job.correctionError ? "补充复盘失败：" + job.correctionError : job.preview) || job.noChangeReason || "";
            var retryable = phase === "failed" || phase === "cancelled" || phase === "interrupted";
            return h("div", { key: job.id, className: "dsh-dream-item", "data-selected": selected === job.sessionId },
              h("button", { className: "dsh-dream-row", type: "button", title: job.cwd || "复盘", onClick: function () { try { openSession(job.sessionId); } catch (error) { patch({ error: message(error) }); } } },
                h("div", { className: "dsh-dream-heading" }, h("span", { className: "dsh-dream-title" }, job.title || basename(job.cwd)), h("time", { className: "dsh-dream-time", dateTime: job.startedAt, title: job.startedAt }, shortTime(job.startedAt))),
                h("div", { className: "dsh-dream-meta dsh-dream-muted" + (phase === "running" || phase === "starting" ? " dsh-dream-running" : phase === "failed" ? " dsh-dream-failed" : "") },
                  h("span", { className: "dsh-dream-dot", "aria-hidden": true }), label,
                  h("span", null, "· " + job.batchCount + " 条")),
                preview ? h("div", { className: "dsh-dream-preview dsh-dream-muted" }, preview) : null),
              h("div", { className: "dsh-dream-item-actions dsh-dream-actions" },
                h(Button, { variant: "ghost", size: "sm", onClick: function () { selectedDetail[1](job); } }, "详情"),
                retryable ? h(Button, { variant: "ghost", size: "sm", disabled: busy || running || !available, onClick: function () { perform("dreamRetry", job.id); } }, "重试") : null));
          })),
          !view.rows.length ? h("div", { className: "dsh-dream-empty dsh-dream-muted" }, view.phase === "mounting" || view.phase === "loading" ? "读取复盘…" : "还没有复盘。积累记录后会自动运行，也可以立即复盘。") : null,
          view.hasMore ? h(Button, { className: "dsh-dream-more", variant: "ghost", size: "sm", disabled: view.moreLoading || loading, onClick: loadMore }, view.moreLoading ? "加载中…" : "显示更多") : null,
          selectedDetail[0] ? h(DetailModal, { key: selectedDetail[0].id, summary: selectedDetail[0], onClose: function () { selectedDetail[1](null); } }) : null);
      }

      /** 纯净宿主只有一个 workspaces 槽位，外壳复用其官方组件与全部注入 props。 */
      function Shell(props) {
        var registry = props.registry;
        var tabs = React.useSyncExternalStore(registry.subscribe, registry.getTabs, registry.getTabs);
        var membership = React.useSyncExternalStore(function (listener) { membershipListeners.add(listener); return function () { membershipListeners.delete(listener); }; }, function () { return membershipRevision; }, function () { return membershipRevision; });
        var rawUseSessions = props.useSessions;
        var sessions = typeof rawUseSessions === "function" ? rawUseSessions(function (value) { return value; }) : EMPTY_SESSIONS;
        var selected = currentSession(sessions);
        var tabState = React.useState("tasks");
        var tab = tabState[0];
        var setTab = tabState[1];
        var previous = React.useRef(undefined);
        var filters = registry.sessionFilters;
        var filteredSnapshot = React.useRef({ source: null, filters: null, value: null, membership: -1 });
        var useTaskSessions = React.useCallback(function (selector, equal) {
          if (typeof rawUseSessions !== "function") return selector(EMPTY_SESSIONS);
          return rawUseSessions(function (source) {
            var cached = filteredSnapshot.current;
            if (cached.source !== source || cached.filters !== filters || cached.membership !== membership) {
              var kept = source.ids.filter(function (id) { return filters.every(function (filter) { return filter(id); }); });
              var byId = {};
              kept.forEach(function (id) { byId[id] = source.byId[id]; });
              cached = { source: source, filters: filters, membership: membership, value: Object.assign({}, source, { ids: kept, byId: byId }) };
              filteredSnapshot.current = cached;
            }
            return selector(cached.value);
          }, equal);
        }, [rawUseSessions, filters, membership]);
        React.useEffect(function () {
          var matching = tabs.find(function (item) { return item.matchSession && item.matchSession(selected); });
          var matchId = matching ? matching.id : "tasks";
          if (previous.current && previous.current.id === selected && previous.current.match === matchId) return;
          previous.current = { id: selected, match: matchId };
          setTab(matchId);
        }, [selected, tabs, membership]);
        React.useEffect(function () {
          if (tab !== "tasks" && !tabs.some(function (item) { return item.id === tab; })) setTab("tasks");
        }, [tabs, tab]);
        var hostProps = Object.assign({}, props, { useSessions: useTaskSessions });
        delete hostProps.registry;
        delete hostProps.officialTree;
        var Official = props.officialTree;
        if (props.wide === false) return h(Official, hostProps);
        var chosen = tabs.find(function (item) { return item.id === tab; });
        var panelProps = Object.assign({}, props, { openSession: function (id) { openSession(id); }, open: function (id) { openSession(id); } });
        return h("div", { className: "dsh-dream-shell" },
          h("div", { className: "dsh-dream-tabs", role: "tablist", "aria-label": "会话分类" },
            h("button", { className: "dsh-dream-tab", type: "button", role: "tab", "aria-selected": tab === "tasks", onClick: function () { setTab("tasks"); } }, "任务"),
            tabs.map(function (item) { return h("button", { key: item.id, className: "dsh-dream-tab", type: "button", role: "tab", "aria-selected": tab === item.id, onClick: function () { setTab(item.id); } }, item.label); })),
          h("div", { className: "dsh-dream-task-tree", style: { display: chosen ? "none" : undefined } }, h(Official, hostProps)),
          chosen ? chosen.render(panelProps) : null);
      }

      function makeTab() { return { id: "dream", label: "复盘", order: 30, matchSession: function (id) { return ids.has(id); }, render: function (props) { return h(DreamList, props); } }; }
      function notifyPeers() { queueMicrotask(function () { window.dispatchEvent(new Event("dsh-native-sidebar-change")); }); }
      function bindRegistry(registry) {
        if (registry.version !== 1 || !registry.insert || !registry.addSessionFilter) throw new Error("宿主侧栏注册表不支持复盘页签");
        var original = Object.getOwnPropertyDescriptor(registry, "sessionFilters");
        var restoreFilters = function () {};
        // IM 的旧注册表原地改数组，而任务过滤缓存按数组身份缓存。保留其原数组，
        // 只对读取提供稳定快照；其 addSessionFilter/disposer 仍修改原数组，不会丢掉其他插件的过滤器。
        if (original && Array.isArray(original.value) && original.configurable) {
          var source = original.value;
          var copied = [];
          var revision = -1;
          function snapshotFilters() {
            if (revision !== membershipRevision || source.length !== copied.length || source.some(function (filter, index) { return filter !== copied[index]; })) {
              copied = source.slice();
              revision = membershipRevision;
            }
            return copied;
          }
          Object.defineProperty(registry, "sessionFilters", { configurable: true, enumerable: original.enumerable, get: snapshotFilters, set: function (value) { source = value; } });
          restoreFilters = function () {
            var current = Object.getOwnPropertyDescriptor(registry, "sessionFilters");
            if (current && current.get === snapshotFilters) Object.defineProperty(registry, "sessionFilters", Object.assign({}, original, { value: source }));
          };
        }
        var removeFilter = registry.addSessionFilter(function (id) { return !ids.has(id); });
        var removeTab = registry.insert(makeTab());
        return {
          registry: registry,
          refresh: function () { var next = registry.insert(makeTab()); removeTab(); removeTab = next; },
          dispose: function () { removeTab(); removeFilter(); restoreFilters(); },
        };
      }
      function detachBinding() { if (activeBinding) activeBinding.dispose(); activeBinding = null; }
      function releaseShell() {
        if (!ownsShell) return;
        var owned = ownsShell;
        ownsShell = null;
        if (owned.entry.component === owned.wrapper) owned.entry.component = owned.original;
        if (owned.entry.__dshNativeTabs === owned.registry) delete owned.entry.__dshNativeTabs;
        notifyPeers();
      }
      function syncSidebar() {
        if (disposed || synchronizing) return;
        synchronizing = true;
        try {
          var read = ctx.slots.entriesOfSlot || ctx.slots.entries;
          var entries = read.call(ctx.slots, "sidebar.workspaces");
          var entry = entries.find(function (item) { return item && item.component; });
          if (ownsShell && (entry !== ownsShell.entry || entry.component !== ownsShell.wrapper)) { detachBinding(); releaseShell(); }
          if (!entry) { detachBinding(); return; }
          var registry = entry.__dshNativeTabs || entry.component.__dshNativeTabs;
          if (!registry) {
            if (entry.component.__dshNativeTabHost || entry.component.__dshAutomationWrapped) throw new Error("当前侧栏外壳没有提供共享页签注册表");
            var Official = entry.component;
            registry = createRegistry(Official);
            var ownedRegistry = registry;
            function DreamWorkspaceShell(props) { return h(Shell, Object.assign({}, props, { officialTree: Official, registry: ownedRegistry })); }
            DreamWorkspaceShell.displayName = "DreamWorkspaceShell";
            DreamWorkspaceShell.__dshNativeTabHost = true;
            DreamWorkspaceShell.__dshNativeTabs = registry;
            entry.__dshNativeTabs = registry;
            entry.component = DreamWorkspaceShell;
            ownsShell = { entry: entry, original: Official, wrapper: DreamWorkspaceShell, registry: registry };
            notifyPeers();
          }
          if (!activeBinding || activeBinding.registry !== registry) { detachBinding(); activeBinding = bindRegistry(registry); }
        } catch (error) { patch({ error: "无法接入复盘侧栏：" + message(error) }); console.error("[dsh-recall] 复盘侧栏接入失败", error); }
        finally { synchronizing = false; }
      }

      unsubscribers.push(ctx.slots.inject("sidebar.workspaces", function () {
        syncSidebar();
        var stop = ctx.slots.subscribe("sidebar.workspaces", syncSidebar);
        var stopSidebar = ctx.slots.subscribe("sidebar", syncSidebar);
        window.addEventListener("dsh-native-sidebar-change", syncSidebar);
        return function () { stop(); stopSidebar(); window.removeEventListener("dsh-native-sidebar-change", syncSidebar); detachBinding(); releaseShell(); };
      }));
      // Watch 承担精确进度通知；连接中断时仍可借助宿主会话生命周期事件刷新。
      ["api-session/added", "api-session/status", "api-session/removed"].forEach(function (event) {
        unsubscribers.push(ctx.remote.$on(event, function () { if (!watch) scheduleRefresh(); }));
      });
      Promise.resolve().then(mount).then(function (failure) {
        if (disposed) return;
        if (failure) throw new Error(failure);
        patch({ phase: "loading" });
        startWatch();
        return refresh();
      }).catch(function (error) { patch({ phase: "failed", error: "无法挂载复盘服务：" + message(error) }); });

      return function () {
        if (disposed) return;
        disposed = true;
        requestGeneration += 1;
        if (timer !== null) clearTimeout(timer);
        if (watch) watch.dispose();
        unsubscribers.reverse().forEach(function (stop) { if (typeof stop === "function") stop(); });
        listeners.clear();
        membershipListeners.clear();
      };
    }
    return { install: install };
  },
});
