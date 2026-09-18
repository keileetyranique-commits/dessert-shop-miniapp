type Health = {
  status: "ok";
  service: "dessert-shop-api";
};

export function health(): Health {
  return { status: "ok", service: "dessert-shop-api" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(health()));
}
