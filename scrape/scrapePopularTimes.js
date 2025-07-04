const { chromium } = require("playwright");
const fs = require("fs");
require("dotenv").config();

function getRandomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X...)",
    "Mozilla/5.0 (X11; Linux x86_64)...",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function loadProxies() {
  const raw = fs.readFileSync("./proxies.json", "utf-8");
  return JSON.parse(raw);
}

async function scrapePopularTimes(placeId, attempt = 1, maxAttempts = 3) {
  const proxies = loadProxies();
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  const proxyServer = `http://${proxy.host}:${proxy.port}`;
  const userAgent = getRandomUserAgent();
  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  console.log(
    `\n📍 [Attempt ${attempt}] Using proxy: ${proxy.username}@${proxy.host}`
  );

  const browser = await chromium.launch({
    headless: true,
    proxy: {
      server: proxyServer,
      username: proxy.username,
      password: proxy.password,
    },
  });

  try {
    const context = await browser.newContext({
      userAgent,
      locale: "ko-KR",
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    await page.route("**/*", (route) => {
      const blocked = ["image", "stylesheet", "font", "media"];
      if (blocked.includes(route.request().resourceType())) route.abort();
      else route.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(15000);

    const result = await page.evaluate(() => {
      const elements = [...document.querySelectorAll('[aria-label$="%"]')];

      let realtime = null;
      let average = null;

      for (const el of elements) {
        const label = el.getAttribute("aria-label");
        if (!label) continue;

        if (label.includes("현재 붐비는") && label.includes("일반적으로는")) {
          const match = label.match(/현재 붐비는 정도\s?(\d{1,3})%/);
          if (match) {
            realtime = parseInt(match[1]);
          }
        } else if (!average) {
          const match = label.match(/\d{1,3}%/);
          if (match) {
            average = parseInt(match[0]);
          }
        }
      }

      if (realtime !== null)
        return { popularity: realtime, source: "realtime" };
      if (average !== null) return { popularity: average, source: "average" };
      return null;
    });

    await browser.close();
    return result;
  } catch (err) {
    console.error(`❌ [Attempt ${attempt}] Error: ${err.message}`);
    await browser.close();

    const isRetryable =
      err.message.includes("Navigation") || err.message.includes("timeout");
    if (isRetryable && attempt < maxAttempts) {
      console.warn("🔁 재시도 중...");
      await new Promise((res) => setTimeout(res, 2000));
      return scrapePopularTimes(placeId, attempt + 1, maxAttempts);
    }

    return null;
  }
}

module.exports = { scrapePopularTimes };
