export interface Product {
  sku: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
}

// Sample data standing in for a real capability. There's no products/stock
// read capability on the backend yet (server/api has no modules for this
// domain), so this returns fixed sample rows rather than faking a network
// call to an endpoint that doesn't exist. Swap this for a real
// apiGet("/products") (or whatever the capability ends up being called)
// once that capability exists - the component calling this doesn't need to
// change, only this function's body.
const products: Product[] = [
  { sku: "SKU-10234", name: "Oat milk, 1L", category: "Beverages", price: 4.5, quantity: 42 },
  { sku: "SKU-20118", name: "Sourdough loaf", category: "Bakery", price: 6.25, quantity: 8 },
  { sku: "SKU-30542", name: "Free-range eggs, dozen", category: "Dairy", price: 7.8, quantity: 0 },
  {
    sku: "SKU-41087",
    name: "Cherry tomatoes, 500g",
    category: "Produce",
    price: 3.2,
    quantity: 25,
  },
  { sku: "SKU-52231", name: "Sea salt crackers", category: "Snacks", price: 2.95, quantity: 60 },
  { sku: "SKU-63398", name: "Whole milk, 2L", category: "Dairy", price: 5.1, quantity: 3 },
  { sku: "SKU-74456", name: "Avocado, each", category: "Produce", price: 1.75, quantity: 0 },
  {
    sku: "SKU-85512",
    name: "Dark roast coffee, 250g",
    category: "Beverages",
    price: 11.0,
    quantity: 17,
  },
  { sku: "SKU-96678", name: "Croissant, butter", category: "Bakery", price: 3.4, quantity: 14 },
  { sku: "SKU-10789", name: "Mixed nuts, 300g", category: "Snacks", price: 8.5, quantity: 29 },
];

export async function listProducts(): Promise<Product[]> {
  return products;
}
