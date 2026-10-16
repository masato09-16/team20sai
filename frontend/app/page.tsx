import { redirect } from "next/navigation";

export default function RootPage() {
  // メインの新規練習画面へ転送
  redirect("/practice/new");
}