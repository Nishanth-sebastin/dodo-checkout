// node e2e/screens.mjs  -> docs/*.png (dev servers must be running)
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
async function shoot(name, { mobile = false, dark = false, card, theme = "light", after } = {}) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: dark ? "dark" : "light",
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/");
  await page.selectOption("#opt-theme", theme);
  await page.locator('button.buy[data-product="prod_123"]').click();
  const frame = await (async () => {
    for (let i = 0; i < 50; i++) {
      const f = page.frames().find((x) => x.url().startsWith("http://localhost:5174"));
      if (f && (await f.locator(".dialog").count())) return f;
      await page.waitForTimeout(100);
    }
  })();
  await page.waitForTimeout(400);
  if (card) {
    await page.keyboard.insertText("maya@example.com");
    await page.keyboard.press("Tab");
    await page.keyboard.type(card);
    await page.keyboard.type("1234123");
  }
  if (after) await after(page, frame);
  await page.screenshot({ path: `docs/${name}.png` });
  await ctx.close();
}

await shoot("01-form");
await shoot("02-processing", { card: "4242424242424242", after: async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(300); } });
await shoot("03-declined", { card: "4000000000000002", after: async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(1600); } });
await shoot("04-retry", { card: "4000000000000341", after: async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(1600); } });
await shoot("05-success", { card: "4242424242424242", after: async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(2200); } });
await shoot("06-dark", { theme: "dark", dark: true });
await shoot("07-mobile", { mobile: true });
await browser.close();
console.log("done");
