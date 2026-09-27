import fs from "node:fs";
import { depsMet, register } from "./causal.js";
import { step, close } from "./deliver.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/cast.json", "utf8"));
const events = spec.events || [];
const half = Math.ceil(events.length / 2);
const first = step(spec);
const closed = close(Object.assign({}, spec, { state: first.state }));
const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
const replay = step(Object.assign({}, spec, { state: closed.state }));
const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
const full = step(Object.assign({}, spec, { budget: events.length + 2 }));
const fullClosed = close(Object.assign({}, spec, { state: full.state }));
const fingerprint = function (state) {
  return JSON.stringify({
    delivered: state.delivered.slice().sort(),
    buffer: state.buffer.map(function (row) { return row[0]; }).sort(),
    applied: state.applied.length
  });
};

emit("收尾后交付序列 =", JSON.stringify(closed.state.delivered));
emit("收尾后缓冲条数 =", closed.state.buffer.length);
emit("首轮交付条数 =", first.delivered);
emit("二档交付条数 =", wide.delivered);
emit("两个预算档交付不同 =", first.delivered !== wide.delivered);
emit("收尾前待交付账 =", first.buffered_before);
emit("压在账上的消息 =", JSON.stringify(first.buffered));
emit("收尾补齐条数 =", closed.catchup);
emit("收尾后待交付账 =", closed.state.buffer.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新交付 =", replay.delivered);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
try {
  step(Object.assign({}, { budget: 1, nodes: ["n0", "n1"],
    state: { delivered: [], buffer: [], seen: [], applied: [] },
    events: [{ id: 1, kind: "send", msg: "m1", sender: "n9", deps: [] }] }));
  emit("未知发送者报码", "没有报错");
} catch (error) {
  emit("未知发送者报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { budget: 1, nodes: ["n0", "n1"],
    state: { delivered: [], buffer: [], seen: [], applied: [] },
    events: [{ id: 1, kind: "send", msg: "m1", sender: "n0", deps: ["m9"] }] }));
  emit("未知依赖报码", "没有报错");
} catch (error) {
  emit("未知依赖报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { budget: 1, nodes: ["n0", "n1"],
    state: { delivered: [], buffer: [], seen: ["m1"], applied: [] },
    events: [{ id: 1, kind: "send", msg: "m1", sender: "n0", deps: [] }] }));
  emit("重复消息报码", "没有报错");
} catch (error) {
  emit("重复消息报码", error && error.code ? error.code : String(error.message));
}
try {
  close(Object.assign({}, { budget: 1, nodes: ["n0", "n1"],
    state: { delivered: ["m1"], buffer: [["m2", "n0", ["m9"]]], seen: ["m1", "m2"], applied: [] },
    events: [] }));
  emit("收尾卡住报码", "没有报错");
} catch (error) {
  emit("收尾卡住报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { budget: 1, nodes: ["n0", "n1"],
    state: { delivered: [], buffer: [], seen: [], applied: [] },
    events: [{ id: 1, kind: "peek", msg: "m1" }] }));
  emit("事件不合法报码", "没有报错");
} catch (error) {
  emit("事件不合法报码", error && error.code ? error.code : String(error.message));
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后交付序列": [
    "m1",
    "m2",
    "m3",
    "m4",
    "m5"
  ],
  "收尾后缓冲条数": 0,
  "首轮交付条数": 1,
  "二档交付条数": 3,
  "两个预算档交付不同": true,
  "收尾前待交付账": 4,
  "压在账上的消息": [
    [
      "m2",
      "n1",
      [
        "m1"
      ]
    ],
    [
      "m3",
      "n2",
      [
        "m2"
      ]
    ],
    [
      "m4",
      "n0",
      [
        "m1"
      ]
    ],
    [
      "m5",
      "n1",
      [
        "m4"
      ]
    ]
  ],
  "收尾补齐条数": 4,
  "收尾后待交付账": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新交付": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "未知发送者报码": "E_UNKNOWN_SENDER",
  "未知依赖报码": "E_UNKNOWN_DEP",
  "重复消息报码": "E_DUPLICATE_MESSAGE",
  "收尾卡住报码": "E_STUCK",
  "事件不合法报码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
