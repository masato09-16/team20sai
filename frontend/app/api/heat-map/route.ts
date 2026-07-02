import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get('userImage');

    if (!image) {
      return NextResponse.json({ error: "画像が見つかりません" }, { status: 400 });
    }

    // 💡 湖の写真から、あなたがpublicフォルダに入れた「otehon.png」を返すように変更しました
    return NextResponse.json({
      message: "AIが画像を解析しました！",
      imageUrl: "/otehon.png", 
      success: true
    });

  } catch (error) {
    console.error("APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーです" }, { status: 500 });
  }
}