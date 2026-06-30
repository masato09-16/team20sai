"use client";

import { useState, useRef, SyntheticEvent } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, Crop, PixelCrop } from "react-image-crop";
// @ts-ignore
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export function ImageCropper({ imageSrc, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imageRef = useRef<HTMLImageElement | null>(null);

  // 画像が読み込まれたら初期の切り抜き枠を中央に配置
  const onImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    
    const initialCrop = centerCrop(
      makeAspectCrop(
        {
          unit: "%",
          width: 80,
        },
        width / height,
        width,
        height
      ),
      width,
      height
    );
    setCrop(initialCrop);
  };

  // 切り抜き実行処理
  const handleCrop = async () => {
    if (!imageRef.current || !completedCrop) return;

    const image = imageRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height
    );

    canvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
      }
    }, "image/jpeg", 0.95);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-900/90 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-white p-6 shadow-xl max-h-[90vh]">
        <header className="mb-4">
          <h2 className="text-lg font-bold text-stone-800">黒板の位置を調整</h2>
          <p className="text-xs text-stone-500">枠の四隅をドラッグして、黒板の部分だけを囲んでください。</p>
        </header>

        <div className="flex-1 overflow-auto flex justify-center items-center border border-stone-200 bg-stone-50 rounded-lg p-2 max-h-[60vh]">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="トリミング元画像"
              onLoad={onImageLoad}
              className="max-h-[55vh] object-contain"
            />
          </ReactCrop>
        </div>

        <footer className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleCrop}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
          >
            この範囲で切り抜く
          </button>
        </footer>
      </div>
    </div>
  );
}