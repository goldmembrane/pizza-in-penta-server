const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
require("dotenv").config();

const prisma = new PrismaClient();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const PENTAGON_LAT = 38.8719;
const PENTAGON_LNG = -77.0563;
const RADIUS_METERS = 8046; // 5마일

async function searchPizzaShopsNearby() {
  const allResults = [];
  let nextPageToken = null;
  let page = 1;

  do {
    const params = {
      location: `${PENTAGON_LAT},${PENTAGON_LNG}`,
      radius: RADIUS_METERS,
      keyword: "pizza",
      type: "restaurant",
      key: GOOGLE_API_KEY,
    };
    if (nextPageToken) {
      params.pagetoken = nextPageToken;
      await new Promise((r) => setTimeout(r, 3000)); // token 활성화 대기
    }

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
    const res = await axios.get(url, { params });

    if (res.data.results) {
      allResults.push(...res.data.results);
    }

    nextPageToken = res.data.next_page_token;
    page++;
  } while (nextPageToken && page <= 3); // 최대 3페이지

  return allResults;
}

async function seedPizzaShops() {
  const results = await searchPizzaShopsNearby();

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
          address: place.vicinity || place.formatted_address || "주소 없음",
        },
      });

      console.log(`✅ 저장됨: ${place.name}`);
    } else {
      console.log(`⚠️ 중복: ${place.name}`);
    }
  }

  await prisma.$disconnect();
}

if (require.main === module) {
  seedPizzaShops();
}

module.exports = { seedPizzaShops };
