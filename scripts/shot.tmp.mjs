import { chromium } from "@playwright/test";
const [,, out, email, path, w] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(w ?? 1360), height: 900 } });
await p.goto("http://localhost:3000/login"); await p.fill("#email", email); await p.fill("#password", "Passw0rd!2026");
await p.click("button[type=submit]"); await p.waitForURL("**/dashboard", { timeout: 120000 });
await p.goto("http://localhost:3000" + path); await p.waitForTimeout(2500);
await p.screenshot({ path: out, fullPage: true }); await b.close();
