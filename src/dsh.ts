/**
 * 宿主接口的结构化声明。
 *
 * 这里刻意不 import 任何 `@deepseek-ai/*` 包：那些包只随 DSH 安装分发，
 * npm 上的版本号与宿主不一致，把它们的类型写进插件会把插件锁死在某个版本上。
 * 插件运行时只需要下面这些成员，宿主多给的字段一律忽略。
 */

export interface ContentBlockLike {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: string;
}

export interface MessageLike {
  id?: string;
  role?: string;
  content?: string | ContentBlockLike[];
  /** assistant 消息的 source 带 provider/model，是摘要路由最可靠的来源。 */
  source?: { kind?: string; provider?: string; model?: string };
  toolCallId?: string;
  isError?: boolean;
  stopReason?: string;
  errorMessage?: string;
}

export interface SessionEventLike {
  type?: string;
  seq?: number;
  time?: number;
  data?: unknown;
}

export interface SessionHeaderLike {
  id?: string;
  cwd?: string;
  parentSession?: string;
}

export interface SessionLike {
  id?: string;
  header?: SessionHeaderLike;
  append?(type: string, data: unknown): unknown;
}

export interface SessionLogSnapshotLike {
  session?: SessionHeaderLike;
  events: SessionEventLike[];
}

export interface DreamAgentLike {
  id: string;
  session: SessionLike;
  followup(message: { id: string; role: "user"; source: { kind: "user" }; content: { type: "text"; text: string }[] }): void;
  whenIdle(): Promise<void>;
  cancel(cause: { kind: "user" | "disposed" }): void;
}

export interface AgentHandleLike {
  agent: DreamAgentLike;
  dispose(): Promise<void>;
}

export interface AgentsLike {
  root?: AgentsLike;
  create(options: {
    sessionId: string;
    meta: { cwd: string };
    signal?: AbortSignal;
    agentOptions?: { provider: string; model: string };
    setup?: (ctx: PluginContextLike, agent: DreamAgentLike) => void;
  }): Promise<AgentHandleLike>;
  get?(id: string): DreamAgentLike | undefined;
  withoutInitiator?<T>(operation: () => T): T;
}

export interface SessionsLike { get(id: string): SessionLike | undefined; }

/** `ctx.sessionQuery` 的最小面：只用到回读日志。 */
export interface SessionQueryLike {
  readSession(sessionId: string): Promise<SessionLogSnapshotLike>;
  listSessions?(signal?: AbortSignal): Promise<{ header: SessionHeaderLike }[]>;
}

/** `ctx.llm.stream()` 的入参；只声明本插件实际传的字段。 */
export interface GenerateOptionsLike {
  provider: string;
  model: string;
  messages: unknown[];
  system?: string;
  maxTokens?: number;
  sessionId?: string;
  signal?: AbortSignal;
}

export interface StreamChunkLike {
  type?: string;
  /** 块序号；只有块级帧（block-start / 增量 / block-end）带，usage 与 finish 不带。 */
  index?: number;
  text?: string;
  block?: ContentBlockLike;
  reason?: unknown;
}

export interface LlmLike {
  stream(options: GenerateOptionsLike): AsyncIterable<StreamChunkLike>;
}

export interface KvTableLike<V> {
  get(key: string): V | undefined;
  entries(): IterableIterator<[string, V]>;
  readonly size: number;
  put(key: string, value: V): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface DomainLike {
  table(name: string): KvTableLike<unknown>;
  close?(): Promise<void>;
}

export interface DomainFacilityLike {
  open(spec: unknown): Promise<unknown>;
}

export interface LoggerLike {
  debug?(format: unknown, ...param: unknown[]): void;
  info?(format: unknown, ...param: unknown[]): void;
  warn?(format: unknown, ...param: unknown[]): void;
  error?(format: unknown, ...param: unknown[]): void;
}

export interface ToolRunContextLike {
  agent?: { id?: string; session?: SessionLike };
  signal?: AbortSignal;
}

export interface ToolDefinitionLike {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render(args: unknown, value: unknown): unknown[];
    presentationMeta?(args: unknown, value: unknown): unknown;
  };
  execute(args: never, exec: ToolRunContextLike): Promise<unknown>;
  presentCall?(args: unknown): unknown;
  presentResult?(args: unknown, result: unknown): unknown;
}

export interface ToolsLike {
  register(definition: unknown): () => void;
  restrict?(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void;
}

export interface CommandInvocationLike {
  rawInput?: string;
  signal?: AbortSignal;
  agent?: { id?: string; session?: SessionLike };
}

export interface CommandResultLike {
  kind: "success" | "error";
  text: string;
}

export interface CommandsLike {
  register(definition: {
    name: string;
    description: string;
    input?: { hint?: string };
    handler(
      invocation: CommandInvocationLike,
    ): CommandResultLike | Promise<CommandResultLike>;
  }): () => void;
}

/**
 * 插件能看到的 cordis 上下文。
 *
 * **不要用属性直读可选服务**：cordis 的代理对没写进 `inject` 的服务名抛
 * `cannot get property "x" without inject`，而不是返回 `undefined`。
 * 只有 `inject` 里声明的服务（本插件是 storageDomain 与 sessionQuery）可以直读，
 * 其余可选服务一律走 `get()`。
 */
export interface PluginContextLike {
  sessionQuery?: SessionQueryLike;
  storageDomain?: DomainFacilityLike;
  logger?: LoggerLike;
  get(name: string): unknown;
  /** 向其他包暴露一个服务；Remote 桥用它注册 typertRemote 绑定。 */
  provide(key: string, value: unknown): unknown;
  on(event: string, listener: (...args: never[]) => void, options?: { global?: boolean }): () => boolean;
  inject(names: string[], callback: (scope: PluginContextLike) => unknown): unknown;
  effect(callback: () => unknown, label?: string): unknown;
}
