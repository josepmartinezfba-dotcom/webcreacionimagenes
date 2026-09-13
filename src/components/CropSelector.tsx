'use client';

import { useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { Rect } from '@/lib/types';

interface CropSelectorProps {
  imageUrl: string;
  onCropChange: (rect: Rect | null) => void;
}

export default function CropSelector({ imageUrl, onCropChange }: CropSelectorProps) {
  const [crop, setCrop] = useState<Crop>();

  function handleComplete(pixelCrop: PixelCrop, img: HTMLImageElement) {
    if (pixelCrop.width < 4 || pixelCrop.height < 4) {
      onCropChange(null);
      return;
    }
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    onCropChange({
      x: Math.round(pixelCrop.x * scaleX),
      y: Math.round(pixelCrop.y * scaleY),
      width: Math.round(pixelCrop.width * scaleX),
      height: Math.round(pixelCrop.height * scaleY)
    });
  }

  return (
    <div className="crop-selector">
      <ReactCrop
        crop={crop}
        onChange={(_, percentCrop) => setCrop(percentCrop)}
        onComplete={(pixelCrop, _percentCrop) => {
          const img = document.getElementById('source-image-el') as HTMLImageElement | null;
          if (img) handleComplete(pixelCrop, img);
        }}
        keepSelection
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img id="source-image-el" src={imageUrl} alt="Carta original" className="crop-selector__image" />
      </ReactCrop>
      <p className="hint">Dibuja un rectangulo exactamente sobre la ilustracion de la carta (sin marco ni texto).</p>
    </div>
  );
}
