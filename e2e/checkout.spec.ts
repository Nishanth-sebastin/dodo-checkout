import { expect, test, type Frame, type Page } from "@playwright/test";

const CHECKOUT = "http://localhost:5174";

async function openCheckout(page: Page, trigger: () => Promise<void>): Promise<Frame> {
  // A previous checkout may still be fading out; wait for a frame that's new.
  const before = new Set(page.frames());
  await trigger();
  let frame: Frame | undefined;
  await expect
    .poll(() => (frame = page.frames().find((f) => !before.has(f) && f.url().startsWith(CHECKOUT))))
    .toBeTruthy();
  await frame!.locator(".dialog").waitFor();
  return frame!;
}

const buy = (page: Page, id: string) => () => page.locator(`button.buy[data-product="${id}"]`).click();

async function typeCard(page: Page, frame: Frame, number: string) {
  await frame.locator("#email").click();
  await page.keyboard.type("buyer@example.com");
  await page.keyboard.press("Tab");
  await page.keyboard.type(number); // auto-advances to expiry, then CVC
  await page.keyboard.type("1234" + "123");
}

/** What the host page's callbacks received, oldest first. */
async function hostLog(page: Page): Promise<string[]> {
  const items = await page.locator("#log li").evaluateAll((lis) =>
    lis.map((li) => `${li.querySelector(".k")!.textContent} ${li.querySelector(".p")!.textContent}`.trim()),
  );
  return items.reverse();
}

const frameCount = (page: Page) => page.frames().filter((f) => f.url().startsWith(CHECKOUT)).length;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("happy path: success reaches the host before the customer closes, and only the session id", async ({ page, browserName }) => {
  const frame = await openCheckout(page, buy(page, "prod_123"));
  await typeCard(page, frame, "4242424242424242");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // an impatient second submit
  await expect(frame.getByRole("heading", { name: "Payment successful" })).toBeVisible();

  const log = await hostLog(page);
  expect(log.filter((l) => l.startsWith("onSuccess"))).toHaveLength(1);
  expect(log.join("\n")).not.toMatch(/4242|buyer@example\.com/);

  await page.keyboard.press("Enter"); // Done is focused
  await expect.poll(() => hostLog(page)).toContainEqual('onClose {"reason":"completed"}');
  // Safari on macOS doesn't focus a button when it's clicked, so there's nothing to restore there.
  if (browserName !== "webkit") await expect(page.locator('button.buy[data-product="prod_123"]')).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute("style", /overflow: hidden/);
});

test("the first keystroke lands in the email field, even where the browser blocks autofocus (Safari)", async ({ page }) => {
  const frame = await openCheckout(page, buy(page, "prod_123"));
  await page.keyboard.type("maya@example.com");
  await expect(frame.locator("#email")).toHaveValue("maya@example.com");
});

test("the host can open a new checkout immediately after one closes", async ({ page }) => {
  await openCheckout(page, buy(page, "prod_123"));
  await page.keyboard.press("Escape");
  const frame = await openCheckout(page, buy(page, "prod_456"));
  await expect(frame.getByRole("heading", { name: "Field Guide to Type" })).toBeVisible();
});

test("decline stays inside the checkout and puts the customer back on the card", async ({ page, browserName }) => {
  const frame = await openCheckout(page, buy(page, "prod_456"));
  await typeCard(page, frame, "4000000000000002");
  await page.keyboard.press("Enter");
  await expect(frame.getByRole("alert")).toContainText("declined");
  if (browserName === "webkit") {
    // Safari refuses focus moves a frame makes on its own; the next keystroke goes to the card instead.
    await page.keyboard.type("4");
    await expect(frame.locator("#card")).toHaveValue("4");
  } else {
    await expect(frame.locator("#card")).toBeFocused();
  }
  expect((await hostLog(page)).some((l) => /decline|onError/.test(l))).toBe(false);

  await page.keyboard.press("Escape");
  await expect.poll(() => hostLog(page)).toContainEqual('onClose {"reason":"dismissed"}');
});

test("fails once, then succeeds on retry, without a second session", async ({ page, browserName }) => {
  const frame = await openCheckout(page, buy(page, "prod_123"));
  await typeCard(page, frame, "4000000000000341");
  await page.keyboard.press("Enter");
  const retry = frame.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  if (browserName !== "webkit") await expect(retry).toBeFocused();
  await retry.click();
  await expect(frame.getByRole("heading", { name: "Payment successful" })).toBeVisible();
  expect((await hostLog(page)).filter((l) => l.startsWith("onSuccess"))).toHaveLength(1);
});

test("double-clicking Buy opens one checkout", async ({ page }) => {
  await openCheckout(page, () => page.locator("#double-buy").click());
  await page.waitForTimeout(300);
  expect(frameCount(page)).toBe(1);
  await page.keyboard.press("Escape");
  await expect.poll(() => hostLog(page)).toContainEqual('onClose {"reason":"dismissed"}');
  expect((await hostLog(page)).filter((l) => l.startsWith("onClose"))).toHaveLength(1);
});

test("unknown product: onError, a clear screen, then onClose with reason error", async ({ page }) => {
  const frame = await openCheckout(page, () => page.locator("#missing-product").click());
  await expect(frame.getByRole("heading", { name: "This item isn't available" })).toBeVisible();
  await expect.poll(() => hostLog(page)).toContainEqual(expect.stringMatching(/^onError .*product_not_found/));
  await frame.getByRole("button", { name: "Back to store" }).click();
  await expect.poll(() => hostLog(page)).toContainEqual('onClose {"reason":"error"}');
});

test("host close() waits for an in-flight payment, so success is never lost", async ({ page }) => {
  const frame = await openCheckout(page, buy(page, "prod_456"));
  await typeCard(page, frame, "4242424242424242");
  await page.keyboard.press("Enter");
  await expect(frame.getByRole("button", { name: /Processing/ })).toBeVisible();
  await page.keyboard.press("Escape"); // ignored mid-payment
  await page.evaluate(() => (window as any).__handle?.close());
  expect(frameCount(page)).toBe(1);
  await expect.poll(() => hostLog(page)).toContainEqual(expect.stringMatching(/^onSuccess/));
});

test("offline: Pay is disabled with a clear message, and it recovers on reconnect", async ({ page, context }) => {
  const frame = await openCheckout(page, buy(page, "prod_123"));
  await context.setOffline(true);
  await expect(frame.getByRole("status").filter({ hasText: "offline" })).toBeVisible();
  await expect(frame.getByRole("button", { name: /Pay/ })).toBeDisabled();
  await context.setOffline(false);
  await expect(frame.getByRole("button", { name: /Pay/ })).toBeEnabled();
  await expect(frame.getByText("You're offline")).toHaveCount(0);
});

test("misusing the API throws immediately", async ({ page }) => {
  await page.locator("#bad-options").click();
  await expect.poll(() => hostLog(page)).toContainEqual(expect.stringMatching(/productId/));
});

test("checkout that never loads: onError, a visible message, focus on Close", async ({ page }) => {
  // Block the checkout document itself, as if its host were down.
  await page.route(/localhost:5174\/\?embed=/, (route) => route.abort());
  await page.clock.install();
  await page.locator('button.buy[data-product="prod_123"]').click();
  await page.clock.fastForward(11_000);
  await expect.poll(() => hostLog(page)).toContainEqual(expect.stringMatching(/^onError .*checkout_unavailable/));
  const dismiss = page.getByRole("button", { name: "Close", exact: true });
  await expect(dismiss).toBeFocused();
  await dismiss.click();
  await expect.poll(() => hostLog(page)).toContainEqual('onClose {"reason":"error"}');
});
