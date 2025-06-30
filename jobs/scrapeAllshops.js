const { PrismaClient } = require("@prisma/client");
const { scrapePopularTimes } = require("../scrape/scrapePopularTimes");

const prisma = new PrismaClient();

// ✅ 기준점: 펜타곤
const PENTAGON_LAT = 38.8719;
const PENTAGON_LNG = -77.0563;
const RADIUS_MILES = 2;

// ✅ 시간대 구분
function getTimeSlot() {
  const hour = new Date().getHours();
  if (hour < 6) return "00-06";
  if (hour < 12) return "06-12";
  if (hour < 18) return "12-18";
  return "18-24";
}

async function scrapeAllShops() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const timeSlot = getTimeSlot();

  // ✅ 펜타곤 반경 2마일 내 매장만 필터링
  const shops = await prisma.$queryRaw`
    SELECT *, 
      (3959 * acos(
        cos(radians(${PENTAGON_LAT})) * cos(radians(lat)) *
        cos(radians(lng) - radians(${PENTAGON_LNG})) +
        sin(radians(${PENTAGON_LAT})) * sin(radians(lat))
      )) AS distance_miles
    FROM pizzashop
    HAVING distance_miles <= ${RADIUS_MILES}
  `;

  for (const shop of shops) {
    try {
      console.log(`📍 [${shop.name}] 혼잡도 수집 중...`);
      const popularity = await scrapePopularTimes(shop.placeId);

      if (popularity === null) {
        console.warn(`⚠️ ${shop.name}: 혼잡도 추출 실패`);
        continue;
      }

      await prisma.shopMetric.create({
        data: {
          shopId: shop.id,
          date: new Date(date),
          timeSlot,
          popularity,
        },
      });

      console.log(`✅ 저장 완료: ${shop.name} ${timeSlot} → ${popularity}%`);
    } catch (err) {
      console.error(`❌ ${shop.name} 에러:`, err.message);
    }
  }

  await prisma.$disconnect();
}

// 수동 실행도 가능하게
if (require.main === module) {
  scrapeAllShops();
}

module.exports = { scrapeAllShops };
