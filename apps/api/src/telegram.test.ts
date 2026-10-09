import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { ApiError } from "./errors.js";
import { verifyInitData } from "./telegram.js";

const token = "test-bot-token";

function sign(fields: Record<string, string>, botToken = token, now = Date.now()) {
  const params = new URLSearchParams({ ...fields, auth_date: String(Math.floor(now / 1000)) });
  const dataCheck = [...params.keys()]
    .sort()
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

test("верная подпись initData возвращает пользователя", () => {
  const initData = sign({
    user: JSON.stringify({ id: 42, first_name: "Иван", last_name: "Петров" }),
  });
  const user = verifyInitData(initData, token);
  assert.equal(user.id, "42");
  assert.equal(user.name, "Иван Петров");
});

test("подменённая подпись отклоняется", () => {
  const initData = sign({ user: JSON.stringify({ id: 42, first_name: "Иван" }) }).replace(/hash=[0-9a-f]+/, "hash=" + "ab".repeat(32));
  assert.throws(() => verifyInitData(initData, token), (error: unknown) => error instanceof ApiError && error.code === "INIT_DATA_INVALID");
});

test("просроченный auth_date отклоняется", () => {
  const initData = sign({ user: JSON.stringify({ id: 7, first_name: "Азиз" }) }, token, Date.now() - 25 * 60 * 60 * 1000);
  assert.throws(() => verifyInitData(initData, token), (error: unknown) => error instanceof ApiError && error.code === "INIT_DATA_EXPIRED");
});
