// 修复复盘会话日志：session/title 事件补 messageSeqs 与 source 字段。
// 会话日志是逐帧追加的拼接 zstd 容器（每帧独立解码、带内容校验和），
// 必须按帧处理；node 的 zstdDecompressSync 只解第一帧。
// 帧布局与 dsh-session-persistence-jsonl 的 scanZstdFrames 一致。
// 用法: node repair-sessions.mjs <session.v4.jsonl.zstd>...
import { readFileSync, writeFileSync, chmodSync, statSync } from "node:fs";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";

const ZSTD_MAGIC = 4247762216;
const CHECKSUM_OPTIONS = { params: { [constants.ZSTD_c_checksumFlag]: 1 } };

function scanFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) throw new Error(`torn frame at byte ${start}`);
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`invalid frame magic at byte ${offset}`);
    offset += 4;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) throw new Error(`reserved frame-header bit at byte ${offset - 1}`);
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    for (;;) {
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) throw new Error(`reserved block type at byte ${offset - 3}`);
      offset += blockType === 1 ? 1 : blockSize;
      if (lastBlock) break;
    }
    if (checksum) offset += 4;
    frames.push({ start, end: offset });
  }
  return frames;
}

for (const file of process.argv.slice(2)) {
  const raw = readFileSync(file);
  const frames = scanFrames(raw);
  let fixed = 0;
  const out = [];
  for (const frame of frames) {
    const text = zstdDecompressSync(raw.subarray(frame.start, frame.end)).toString("utf8");
    const lines = text.split("\n");
    const repaired = lines.map((line) => {
      if (!line.trim()) return line;
      const event = JSON.parse(line);
      if (event.type === "session/title" && !Array.isArray(event.data?.messageSeqs)) {
        event.data.messageSeqs = [];
        event.data.source = { kind: "user" };
        fixed += 1;
        return JSON.stringify(event);
      }
      return line;
    });
    out.push(zstdCompressSync(Buffer.from(repaired.join("\n"), "utf8"), CHECKSUM_OPTIONS));
  }
  if (fixed === 0) {
    console.log(`skip (无损坏): ${file}`);
    continue;
  }
  const mode = statSync(file).mode;
  writeFileSync(file, Buffer.concat(out));
  chmodSync(file, mode);
  console.log(`fixed ${fixed} title event(s), ${frames.length} frames: ${file}`);
}
