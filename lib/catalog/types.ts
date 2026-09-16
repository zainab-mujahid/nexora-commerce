export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type ProductImage = {
  id: string;
  s3_key: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
};

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  // Postgres numeric columns are serialized as strings over PostgREST to
  // avoid JSON's lossy float precision — parse with Number()/parseFloat()
  // at the point of display, never assume this is already a number.
  price: string;
  stock: number;
  images: ProductImage[];
};

export type ProductDetail = ProductListItem & {
  description: string | null;
  is_active: boolean;
  category: Category | null;
};
