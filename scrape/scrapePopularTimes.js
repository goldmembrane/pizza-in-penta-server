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
  const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
  const userAgent = getRandomUserAgent();

  const url = `https://www.google.com/maps/search/?api=1&query=Extreme+Pizza&query_place_id=${placeId}`;

  console.log(
    `🌐 [Attempt ${attempt}] Using proxy: ${proxy.username}@${proxy.host}`
  );

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: {
        server: `http://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password,
      },
    });

    const context = await browser.newContext({
      userAgent,
      locale: "ko-KR",
    });

    const page = await context.newPage();

    // 차단 리소스 최소화 (Playwright는 자동 처리 좋음)
    await page.route("**/*", (route) => {
      const blocked = ["image", "stylesheet", "font", "media"];
      if (blocked.includes(route.request().resourceType())) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // 페이지 이동
    await page.goto(url, { waitUntil: "load", timeout: 60000 });

    // 안정성 확보 대기
    await page.waitForTimeout(5000);

    // 혼잡도 요소 대기
    await page.waitForSelector("div[aria-label*='현재 붐비는 정도']", {
      timeout: 15000,
    });

    const data = await page.evaluate(() => {
      try {
        const el = [
          ...document.querySelectorAll("div[aria-label*='현재 붐비는 정도']"),
        ].find((el) =>
          el.getAttribute("aria-label")?.includes("현재 붐비는 정도")
        );

        if (!el)
          return {
            popularity: null,
            source: null,
            reason: "Element not found",
          };

        const label = el.getAttribute("aria-label");
        const realtime = label?.match(/현재 붐비는 정도:\s*(\d{1,3})%/);
        const avg = label?.match(/\(일반적으로는\s*(\d{1,3})%\)/);

        if (realtime)
          return { popularity: parseInt(realtime[1]), source: "realtime" };
        if (avg) return { popularity: parseInt(avg[1]), source: "average" };
        return { popularity: null, source: null, reason: "Parsing failed" };
      } catch (e) {
        return {
          popularity: null,
          source: null,
          reason: "Eval error: " + e.message,
        };
      }
    });

    await browser.close();
    return data;
  } catch (err) {
    console.error(`❌ [Attempt ${attempt}] Error: ${err.message}`);
    if (browser) await browser.close();

    const isDetached =
      err.message.includes("detached") || err.message.includes("timeout");
    if (isDetached && attempt < maxAttempts) {
      console.warn("🔁 재시도 중...");
      await new Promise((r) => setTimeout(r, 2000));
      return scrapePopularTimes(placeId, attempt + 1, maxAttempts);
    }

    return {
      popularity: null,
      source: null,
      reason: `Exception: ${err.message}`,
    };
  }
}

module.exports = { scrapePopularTimes };
