"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, RotateCw, ZoomIn, Sun, Contrast } from "lucide-react";

interface ImageCropperProps {
  image: string;
  onCropComplete: (croppedImage: Blob) => void;
  onCancel: () => void;
}

export function ImageCropper({ image, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropChange = (crop: any) => setCrop(crop);
  const onZoomChange = (zoom: any) => setZoom(zoom);

  const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.addEventListener("load", () => resolve(img));
      img.addEventListener("error", (error) => reject(error));
      img.setAttribute("crossOrigin", "anonymous");
      img.src = url;
    });

  const getRadianAngle = (degree: number) => (degree * Math.PI) / 180;

  const getCroppedImg = async () => {
    try {
      const img = await createImage(image);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx || !croppedAreaPixels) return;

      // 회전을 적용하려면 전체 이미지를 회전 후 크롭해야 함
      const radians = getRadianAngle(rotation);
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));

      // 회전된 전체 이미지의 바운딩 박스 크기
      const rotW = img.width * cos + img.height * sin;
      const rotH = img.width * sin + img.height * cos;

      // 1단계: 회전된 전체 이미지를 임시 캔버스에 그리기
      const rotCanvas = document.createElement("canvas");
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      const rotCtx = rotCanvas.getContext("2d")!;

      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.rotate(radians);
      rotCtx.translate(-img.width / 2, -img.height / 2);
      rotCtx.drawImage(img, 0, 0);

      // 2단계: 회전된 이미지에서 크롭 영역 추출
      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      // 밝기/대비 필터 적용
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

      ctx.drawImage(
        rotCanvas,
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
      }, "image/jpeg", 0.92);
    } catch (e) {
      console.error(e);
    }
  };

  const resetAdjustments = () => {
    setBrightness(100);
    setContrast(100);
    setRotation(0);
    setZoom(1);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 md:p-6 text-white bg-black/50 backdrop-blur-md z-10">
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

      <div
        className="flex-1 relative bg-neutral-900"
        style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
      >
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

      <div className="p-6 md:p-10 bg-black/50 backdrop-blur-md space-y-5">
        {/* 줌 */}
        <div className="flex items-center gap-4">
          <ZoomIn className="text-gray-400 shrink-0" size={18} />
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-[10px] font-bold text-gray-500 w-10 text-right">{Number(zoom).toFixed(1)}x</span>
        </div>

        {/* 회전 */}
        <div className="flex items-center gap-4">
          <RotateCw className="text-gray-400 shrink-0" size={18} />
          <input
            type="range"
            value={rotation}
            min={-180}
            max={180}
            step={1}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-[10px] font-bold text-gray-500 w-10 text-right">{rotation}°</span>
        </div>

        {/* 밝기 */}
        <div className="flex items-center gap-4">
          <Sun className="text-gray-400 shrink-0" size={18} />
          <input
            type="range"
            value={brightness}
            min={50}
            max={200}
            step={5}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
          />
          <span className="text-[10px] font-bold text-gray-500 w-10 text-right">{brightness}%</span>
        </div>

        {/* 대비 */}
        <div className="flex items-center gap-4">
          <Contrast className="text-gray-400 shrink-0" size={18} />
          <input
            type="range"
            value={contrast}
            min={50}
            max={200}
            step={5}
            onChange={(e) => setContrast(Number(e.target.value))}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <span className="text-[10px] font-bold text-gray-500 w-10 text-right">{contrast}%</span>
        </div>

        {/* 초기화 버튼 */}
        {(brightness !== 100 || contrast !== 100 || rotation !== 0 || zoom !== 1) && (
          <button
            onClick={resetAdjustments}
            className="w-full py-2 text-xs font-black text-gray-400 hover:text-white transition-colors"
          >
            초기화
          </button>
        )}
      </div>
    </div>
  );
}
