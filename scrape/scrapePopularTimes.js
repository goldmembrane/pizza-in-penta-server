const { chromium } = require("playwright");
const fs = require("fs");

function getRandomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36",
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
  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  console.log(
    `📍 [Attempt ${attempt}] Using proxy: ${proxy.username}@${proxy.host}`
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
      locale: "ko-KR",
      userAgent,
      extraHTTPHeaders: {
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const page = await context.newPage();

    await page.route("**/*", (route) => {
      const blocked = ["image", "stylesheet", "font", "media"];
      if (blocked.includes(route.request().resourceType())) route.abort();
      else route.continue();
    });

    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(5000); // 안정성 확보

    const result = await page.evaluate(() => {
      try {
        const realtimeEl = Array.from(
          document.querySelectorAll("div[aria-label$='%']")
        ).find((el) => el.classList.contains("mQXJne"));

        const averageEls = Array.from(
          document.querySelectorAll("div[aria-label$='%']")
        ).filter((el) => !el.classList.contains("mQXJne"));

        const realtimeLabel = realtimeEl?.getAttribute("aria-label");
        const realtime = realtimeLabel
          ? parseInt(realtimeLabel.replace("%", ""))
          : null;

        const averageValues = averageEls
          .map((el) => el.getAttribute("aria-label"))
          .filter((label) => label && label.includes("%"))
          .map((label) => parseInt(label.replace("%", "")));

        const average =
          averageValues.length > 0 ? Math.max(...averageValues) : null;

        if (realtime === null && average === null) return null;

        return {
          popularity: realtime ?? average,
          source: realtime !== null ? "realtime" : "average",
        };
      } catch (e) {
        return null;
      }
    });

    await browser.close();

    if (!result) {
      console.log(`⚠️ 혼잡도 데이터 없음 → 저장 생략: ${placeId}`);
      return null;
    }

    console.log(
      `✅ 저장 완료: ${placeId} → ${result.popularity}% (${result.source})`
    );
    return result;
  } catch (err) {
    if (browser) await browser.close();
    console.error(`❌ [Attempt ${attempt}] Error: ${err.message}`);

    const retryable =
      err.message.includes("detached") || err.message.includes("timeout");
    if (retryable && attempt < maxAttempts) {
      console.warn("🔁 재시도 중...");
      await new Promise((res) => setTimeout(res, 2000));
      return scrapePopularTimes(placeId, attempt + 1, maxAttempts);
    }

    return null;
  }
}

module.exports = { scrapePopularTimes };
