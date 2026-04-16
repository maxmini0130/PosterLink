"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, RotateCw, ZoomIn } from "lucide-react";

interface ImageCropperProps {
  image: string;
  onCropComplete: (croppedImage: Blob) => void;
  onCancel: () => void;
}

export function ImageCropper({ image, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropChange = (crop: any) => setCrop(crop);
  const onZoomChange = (zoom: any) => setZoom(zoom);

  const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      image.setAttribute("crossOrigin", "anonymous");
      image.src = url;
    });

  const getCroppedImg = async () => {
    try {
      const img: any = await createImage(image);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) return;

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      ctx.drawImage(
        img,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );

      canvas.toBlob((blob) => {
        if (blob) onCropComplete(blob);
      }, "image/jpeg");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between p-6 text-white bg-black/50 backdrop-blur-md z-10">
        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-all">
          <X size={24} />
        </button>
        <h2 className="text-sm font-black uppercase tracking-widest">Image Correction</h2>
        <button 
          onClick={getCroppedImg}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95"
        >
          <Check size={18} /> 완료
        </button>
      </div>

      <div className="flex-1 relative bg-neutral-900">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={3 / 4}
          onCropChange={onCropChange}
          onCropComplete={onCropCompleteInternal}
          onZoomChange={onZoomChange}
        />
      </div>

      <div className="p-10 bg-black/50 backdrop-blur-md space-y-8">
        <div className="flex items-center gap-6">
          <ZoomIn className="text-gray-400" size={20} />
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            onChange={(e: any) => setZoom(e.target.value)}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
        <div className="flex items-center gap-6">
          <RotateCw className="text-gray-400" size={20} />
          <input
            type="range"
            value={rotation}
            min={0}
            max={360}
            step={1}
            onChange={(e: any) => setRotation(e.target.value)}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      </div>
    </div>
  );
}
