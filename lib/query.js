/**
 * 查询语法与 pi-experiencev2 的 query.ts 逐条同构，宿主 `compileSessionTextFilter`
 * 只支持单个字面短语，做不到 AND/OR 与引号短语，所以在插件内解析。
 *
 * 语义：clause 之间 OR，clause 之内 AND；裸词小写化后按子串匹配，
 * 引号短语整体匹配；`OR` 必须大写且是独立 token。
 */
export function parseQuery(input) {
    const clauses = [];
    let clause = [];
    let index = 0;
    const push = () => {
        if (clause.length === 0)
            throw new Error("OR needs terms on both sides");
        clauses.push(clause);
        clause = [];
    };
    while (index < input.length) {
        const character = input[index];
        if (/\s/u.test(character)) {
            index++;
            continue;
        }
        if (character === '"') {
            const close = input.indexOf('"', index + 1);
            if (close === -1)
                throw new Error("Unclosed quote in query");
            const phrase = input.slice(index + 1, close);
            if (phrase === "")
                throw new Error("Empty quoted phrase");
            const after = input[close + 1];
            if (after !== undefined && !/\s/u.test(after))
                throw new Error("Quoted phrase must be a complete token");
            clause.push(phrase.toLowerCase());
            index = close + 1;
            continue;
        }
        let end = index;
        while (end < input.length && !/\s/u.test(input[end]))
            end++;
        const word = input.slice(index, end);
        if (word.includes('"'))
            throw new Error("Unexpected quote in query");
        if (word === "OR")
            push();
        else
            clause.push(word.toLowerCase());
        index = end;
    }
    if (clause.length > 0)
        clauses.push(clause);
    else if (clauses.length > 0)
        throw new Error("OR needs terms on both sides");
    return { clauses };
}
export function queryMatches(haystack, query) {
    if (query.clauses.length === 0)
        return true;
    const lower = haystack.toLowerCase();
    return query.clauses.some((clause) => clause.every((term) => lower.includes(term)));
}
/** 首个命中 clause 的首个 term 在文本中的位置；无命中返回 -1。 */
export function queryHitIndex(haystack, query) {
    const lower = haystack.toLowerCase();
    for (const clause of query.clauses) {
        if (!clause.every((term) => lower.includes(term)))
            continue;
        const index = lower.indexOf(clause[0]);
        if (index !== -1)
            return index;
    }
    return -1;
}
