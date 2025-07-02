const { PrismaClient } = require("@prisma/client");
const { scrapePopularTimes } = require("../scrape/scrapePopularTimes");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
require("dotenv").config();

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

const PENTAGON_LAT = 38.8719;
const PENTAGON_LNG = -77.0563;
const RADIUS_MILES = 2;

function getTimeSlot() {
  const hour = dayjs().tz("America/New_York").hour();
  if (hour < 6) return "00-06";
  if (hour < 12) return "06-12";
  if (hour < 18) return "12-18";
  return "18-24";
}

function isBusinessHour() {
  const hour = dayjs().tz("America/New_York").hour();
  return hour >= 9 && hour <= 23;
}

async function scrapeAllShops() {
  if (!isBusinessHour()) {
    console.warn("⏰ [워싱턴 기준] 영업시간이 아니므로 수집 건너뜀");
    return;
  }

  const date = dayjs().tz("America/New_York").format("YYYY-MM-DD");
  const timeSlot = getTimeSlot();

  const shops = await prisma.$queryRaw`
    SELECT *, 
      (3959 * acos(
        cos(radians(${PENTAGON_LAT})) * cos(radians(lat)) *
        cos(radians(lng) - radians(${PENTAGON_LNG})) +
        sin(radians(${PENTAGON_LAT})) * sin(radians(lat))
      )) AS distance_miles
    FROM PizzaShop
    HAVING distance_miles <= ${RADIUS_MILES}
  `;

  for (const shop of shops) {
    try {
      console.log(`📍 [${shop.name}] 혼잡도 수집 중...`);
      const { popularity, source, reason } = await scrapePopularTimes(
        shop.placeId
      );

      if (popularity === null) {
        console.warn(
          `⚠️ ${shop.name}: 혼잡도 추출 실패 (${reason || "알 수 없는 원인"})`
        );
        continue;
      }

      await prisma.shopMetric.create({
        data: {
          shopId: shop.id,
          date: new Date(date),
          timeSlot,
          popularity,
          source,
        },
      });

      console.log(
        `✅ 저장 완료: ${shop.name} ${timeSlot} → ${popularity}% (${source})`
      );
    } catch (err) {
      console.error(`❌ ${shop.name} 에러:`, err.message);
    }
  }

  await prisma.$disconnect();
}

if (require.main === module) {
  scrapeAllShops();
}

module.exports = { scrapeAllShops };
