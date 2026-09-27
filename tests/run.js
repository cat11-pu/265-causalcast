import assert from "node:assert";
import { depsMet, register } from "../causal.js";
import { step, close } from "../deliver.js";
import { render } from "../app.js";

const base = {
  budget: 1, nodes: ["n0", "n1"],
  state: { delivered: [], buffer: [], seen: [], applied: [] },
  events: [],
  sender_error_code: "E_UNKNOWN_SENDER", dep_error_code: "E_UNKNOWN_DEP",
  msg_error_code: "E_DUPLICATE_MESSAGE", stuck_error_code: "E_STUCK",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("depsMet returns a flag", () => {
  assert.strictEqual(typeof depsMet(["m1", "n0", []], []), "boolean");
});

check("register returns a list", () => {
  assert.ok(Array.isArray(register([], ["m1", "n0", []], base.nodes)));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
