const { chromium } = require("playwright");
const fs = require("fs");
require("dotenv").config();

function getRandomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
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

      const now = new Date();
      const currentHour = now.toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      });

      for (const el of elements) {
        const label = el.getAttribute("aria-label");
        if (!label) continue;

        // 1. 실시간 + 평균 혼합
        if (label.includes("현재 붐비는") && label.includes("일반적으로는")) {
          const realtimeMatch = label.match(/현재 붐비는 정도\s?(\d{1,3})%/);
          const averageMatch = label.match(/일반적으로는\s?(\d{1,3})%/);
          if (realtimeMatch) realtime = parseInt(realtimeMatch[1]);
          if (averageMatch) average = parseInt(averageMatch[1]);
        }

        // 2. 실시간만 있는 경우
        else if (label.includes("현재 붐비는")) {
          const match = label.match(/현재 붐비는 정도\s?(\d{1,3})%/);
          if (match) realtime = parseInt(match[1]);
        }

        // 3. 평균만 있는 경우: 시간대 일치해야
        else if (
          !label.includes("현재 붐비는") &&
          !label.includes("일반적으로는") &&
          new RegExp(`^${currentHour}시.*붐비는 정도\\s?(\\d{1,3})%`).test(
            label
          )
        ) {
          const match = label.match(/\d{1,2}시.*붐비는 정도\s?(\d{1,3})%/);
          if (match) average = parseInt(match[1]);
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
