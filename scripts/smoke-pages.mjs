/**
 * Dev utility: log in as a seeded user, visit pages, screenshot them and report
 * HTTP status + browser console/page errors.
 *   node scripts/smoke-pages.mjs <outDir> <email> /path1 /path2 ...
 */
import { chromium } from "@playwright/test";

const [, , outDir, email, ...paths] = process.argv;
const base = process.env.BASE_URL ?? "http://localhost:3000";
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: Number(process.env.VW ?? 1360), height: 900 },
});
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(`PAGEERROR ${p.url()} ${e.message}`));
p.on(
  "console",
  (m) =>
    m.type() === "error" &&
    errs.push(`CONSOLE ${p.url()} ${m.text().slice(0, Number(process.env.ERRLEN ?? 300))}`),
);
await p.goto(`${base}/login`);
await p.fill("#email", email);
await p.fill("#password", process.env.SEED_PASSWORD ?? "Passw0rd!2026");
await p.click("button[type=submit]");
await p.waitForURL("**/dashboard", { timeout: 120000 });
for (const path of paths) {
  const r = await p.goto(base + path, { timeout: 180000 });
  const h1 = await p
    .locator("h1")
    .first()
    .textContent()
    .catch(() => "?");
  console.log(path, r.status(), "|", h1);
  await p.screenshot({
    path: `${outDir}/${email.split("@")[0]}${path.replace(/[/?=&]/g, "_")}.png`,
    fullPage: true,
    caret: "initial",
    animations: "allow",
  });
}
console.log(errs.join("\n") || "no errors");
await b.close();
