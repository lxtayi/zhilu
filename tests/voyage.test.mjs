import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

// Exercise the production recap hooks with a minimal DOM; no network or LLM.
function recap(count) {
  const dialogs = [];
  function element() {
    const children = new Map();
    return {
      style: {}, listeners: {}, open: false, innerHTML: "",
      setAttribute() {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      },
      showModal() { this.open = true; },
      close() { this.open = false; },
      remove() { this.removed = true; }
    };
  }
  const clusters = Array.from({ length: count }, (_, i) => ({
    id: `dynamic_${i}`, name: `岛${i}`, summary: `简介${i}`, color: "#786184"
  }));
  const context = vm.createContext({
    state: { result: { clusters, question: "验收问题" } },
    elements: { islandMap: {} }, window: {},
    document: {
      querySelector: () => null, createElement: element,
      head: { append() {} }, body: { append(dialog) { dialogs.push(dialog); } },
      addEventListener() {}
    },
    enterIsland(index) { context.entered = index; },
    openPerson() {}, renderResult() {}, submitQuestion() {},
    restart() { context.showTrail(() => { context.restarted = true; }); },
    showTrail() {}, showToast() {},
    safeColor: value => value, escapeHtml: value => String(value),
    safeAvatarUrl: value => value,
    getComputedStyle: () => ({ backgroundImage: "none" }),
    requestAnimationFrame() {}, cancelAnimationFrame() {}, setTimeout() {}
  });
  vm.runInContext(source.slice(source.indexOf("const islandLayouts"), source.indexOf("function renderIslands")) +
    source.slice(source.indexOf("/* Voyage map modal v2 */")), context);
  return { context, clusters, dialogs };
}

for (const count of [1, 2, 3, 4, 5]) {
  test(`航线回顾保留 ${count} 个已访问岛、人物及返回操作`, async () => {
    const { context, clusters, dialogs } = recap(count);
    for (let i = 0; i < count; i++) {
      await context.enterIsland(i);
      assert.equal(context.entered, i);
      context.openPerson({ id: `person${i}`, name: `作者${i}`, avatar: "https://example.com/avatar.png" }, clusters[i]);
    }
    context.showTrail();
    const dialog = dialogs.at(-1);
    assert.equal(dialog.open, true);
    assert.equal((dialog.innerHTML.match(/class="voyage-island-label"/g) || []).length, count);
    assert.equal((dialog.innerHTML.match(/class="voyage-person-card"/g) || []).length, count);
    assert.equal((dialog.innerHTML.match(/class="island-terrain"/g) || []).length, count);
    assert.ok(dialog.innerHTML.includes(`岛${count - 1}`));
    assert.ok(dialog.innerHTML.includes("https://example.com/avatar.png"));
    assert.ok(dialog.innerHTML.includes("voyage-ship"));
    dialog.querySelector(".voyage-continue").listeners.click();
    assert.equal(dialog.open, false);
    assert.equal(context.restarted, undefined);
    context.showTrail();
    dialogs.at(-1).querySelector(".voyage-next").listeners.click();
    assert.equal(context.restarted, true);
  });
}

test("仅访问第五岛时保持中心位置，重复访问去重，新问题清空记录", async () => {
  const { context, clusters, dialogs } = recap(5);
  await context.enterIsland(4);
  await context.enterIsland(4);
  const person = { id: "p", name: "同一个人" };
  context.openPerson(person, clusters[4]);
  context.openPerson(person, clusters[4]);
  context.showTrail();
  assert.match(dialogs[0].innerHTML, /--island-x:50.00%;--island-y:45.00%/);
  assert.equal((dialogs[0].innerHTML.match(/class="voyage-person-card"/g) || []).length, 1);
  await context.submitQuestion();
  context.showTrail();
  assert.equal(dialogs.length, 1);
});
