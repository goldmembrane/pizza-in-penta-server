const { chromium } = require("playwright");
const fs = require("fs");
require("dotenv").config();

function getRandomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
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
      const now = new Date();
      const hour = now.getHours();
      let realtime = null;
      let average = null;

      // ✅ 실시간 막대(class=fMc7Ne mQXJne) 먼저 우선 추출
      const realtimeEl = document.querySelector("div.fMc7Ne.mQXJne");
      if (realtimeEl && realtimeEl.getAttribute("aria-label")) {
        const label = realtimeEl.getAttribute("aria-label");
        const rMatch = label.match(/\b(100|[1-9]?[0-9])%/);

        realtime = parseInt(rMatch[1], 10);
      }

      // ✅ fallback: aria-label 기반 전체 검사
      if (realtime === null && average === null) {
        const elements = [...document.querySelectorAll('[aria-label$="%"]')];

        for (const el of elements) {
          const label = el.getAttribute("aria-label");
          if (!label) continue;

          // 평균만 (현재 시간 기준)
          const hourMatch = label.match(
            /(\d{1,2})시.*붐비는 정도\s?(\d{1,3})%/
          );
          if (hourMatch && parseInt(hourMatch[1]) === hour) {
            average = parseInt(hourMatch[2]);
            break;
          }
        }
      }

      if (realtime !== null)
        return { popularity: realtime, source: "realtime" };
      if (average !== null && realtime === null)
        return { popularity: average, source: "average" };

      return {
        popularity: null,
        source: null,
        reason: "해당 시간의 aria-label 없음 또는 형식 불일치",
      };
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

    return {
      popularity: null,
      source: null,
      reason: err.message,
    };
  }
}

module.exports = { scrapePopularTimes };
