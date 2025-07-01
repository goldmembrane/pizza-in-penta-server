const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
require("dotenv").config();

const prisma = new PrismaClient();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const PENTAGON_LAT = 38.8719;
const PENTAGON_LNG = -77.0563;
const RADIUS_METERS = 3200; // 약 2마일

// ✅ 수집할 키워드 (원하면 도넛 매장 추가 가능)
const TARGET_KEYWORDS = [
  "Domino's Pizza",
  "Papa John's Pizza",
  "Pizza Hut",
  "Little Caesars Pizza",
  "MOD Pizza",
  "Blaze Pizza",
  "California Pizza Kitchen",
  "Marco's Pizza",
  "Sbarro",
  "Jet's Pizza",
  "Hungry Howie's Pizza",
  "Papa Murphy's",
  "Round Table Pizza",
];

async function searchShops(keyword) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
  const res = await axios.get(url, {
    params: {
      query: `${keyword} near Pentagon`,
      location: `${PENTAGON_LAT},${PENTAGON_LNG}`,
      radius: RADIUS_METERS,
      key: GOOGLE_API_KEY,
    },
  });

  return res.data.results;
}

async function seedPizzaShops() {
  for (const keyword of TARGET_KEYWORDS) {
    const results = await searchShops(keyword);

    for (const place of results) {
      const exists = await prisma.pizzaShop.findFirst({
        where: { placeId: place.place_id },
      });

      if (!exists) {
        await prisma.pizzaShop.create({
          data: {
            name: place.name,
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
            placeId: place.place_id,
            address: place.formatted_address,
          },
        });

        console.log(`✅ 저장됨: ${place.name}`);
      } else {
        console.log(`⚠️ 중복: ${place.name}`);
      }
    }
  }

  await prisma.$disconnect();
}

// 수동 실행 or 자동 호출 가능
if (require.main === module) {
  seedPizzaShops();
}

module.exports = { seedPizzaShops };
