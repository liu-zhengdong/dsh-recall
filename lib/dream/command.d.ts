import type { CommandsLike } from "../dsh.ts";
import type { DreamEngine } from "./engine.ts";
/** 人用命令与侧栏共用同一个引擎，不创建第二套调度状态。 */
export declare function registerDreamCommand(commands: CommandsLike | undefined, engine: () => DreamEngine): void;
