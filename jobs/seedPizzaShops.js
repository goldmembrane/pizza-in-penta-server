const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
require("dotenv").config();

const prisma = new PrismaClient();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const PENTAGON_LAT = 38.8719;
const PENTAGON_LNG = -77.0563;
const RADIUS_METERS = 3200;

async function searchPizzaShopsNearby() {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
  const res = await axios.get(url, {
    params: {
      location: `${PENTAGON_LAT},${PENTAGON_LNG}`,
      radius: RADIUS_METERS,
      keyword: "pizza",
      type: "restaurant",
      key: GOOGLE_API_KEY,
    },
  });

  return res.data.results;
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
