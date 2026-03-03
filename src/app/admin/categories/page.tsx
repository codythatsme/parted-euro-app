import { type Metadata } from "next";
import { CategoriesPage } from "./_components/categories-page";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
  return <CategoriesPage />;
}
