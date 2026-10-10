/**
 * 查询语法与 pi-experiencev2 的 query.ts 逐条同构，宿主 `compileSessionTextFilter`
 * 只支持单个字面短语，做不到 AND/OR 与引号短语，所以在插件内解析。
 *
 * 语义：clause 之间 OR，clause 之内 AND；裸词小写化后按子串匹配，
 * 引号短语整体匹配；`OR` 必须大写且是独立 token。
 */
export type ParsedQuery = {
    clauses: string[][];
};
export declare function parseQuery(input: string): ParsedQuery;
export declare function queryMatches(haystack: string, query: ParsedQuery): boolean;
/** 首个命中 clause 的首个 term 在文本中的位置；无命中返回 -1。 */
export declare function queryHitIndex(haystack: string, query: ParsedQuery): number;
