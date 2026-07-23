"use client";

import { type SyntheticEvent, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
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

  const onImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = event.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 82 }, width / height, width, height),
      width,
      height
    );

    setCrop(initialCrop);
  };

  const handleCrop = async () => {
    if (!imageRef.current || !completedCrop) return;

    const image = imageRef.current;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;

    context.drawImage(
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

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCropComplete(blob);
        }
      },
      "image/jpeg",
      0.95
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-900/72 p-4 backdrop-blur-sm">
      <div className="ui-card flex max-h-[90vh] w-full max-w-2xl flex-col p-5 shadow-lift sm:p-6">
        <header className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold text-ink-900">黒板写真の範囲を調整</h2>
          <p className="text-xs leading-relaxed text-stone-600">
            診断したい黒板部分だけを枠で囲んでください。余白や机が少ないほど、採点が安定します。
          </p>
        </header>

        <div className="flex max-h-[60vh] flex-1 items-center justify-center overflow-auto rounded-lg border border-canvas-line bg-canvas-muted p-2">
          <ReactCrop crop={crop} onChange={(nextCrop) => setCrop(nextCrop)} onComplete={(nextCrop) => setCompletedCrop(nextCrop)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="トリミング対象の黒板写真"
              onLoad={onImageLoad}
              className="max-h-[55vh] object-contain"
            />
          </ReactCrop>
        </div>

        <footer className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="ui-button-quiet min-h-10 px-4 py-2">
            キャンセル
          </button>
          <button type="button" onClick={handleCrop} className="ui-button-primary min-h-10 px-4 py-2">
            この範囲で診断する
          </button>
        </footer>
      </div>
    </div>
  );
}
