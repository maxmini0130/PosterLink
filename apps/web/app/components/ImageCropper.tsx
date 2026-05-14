"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, RotateCw, ZoomIn, Sun, Contrast } from "lucide-react";

interface ImageCropperProps {
  image: string;
  onCropComplete: (croppedImage: Blob) => void;
  onCancel: () => void;
}

type AspectOption = { label: string; value: number | undefined };

const ASPECT_OPTIONS: AspectOption[] = [
  { label: "자유", value: undefined },
  { label: "3:4", value: 3 / 4 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "9:16", value: 9 / 16 },
];

export function ImageCropper({ image, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [aspectIndex, setAspectIndex] = useState(1); // default 3:4

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

      const radians = getRadianAngle(rotation);
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));

      const rotW = img.width * cos + img.height * sin;
      const rotH = img.width * sin + img.height * cos;

      const rotCanvas = document.createElement("canvas");
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      const rotCtx = rotCanvas.getContext("2d")!;

      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.rotate(radians);
      rotCtx.translate(-img.width / 2, -img.height / 2);
      rotCtx.drawImage(img, 0, 0);

      // 출력 최대 크기를 1500px로 제한 (모바일 업로드 최적화)
      const MAX_OUTPUT = 1500;
      const rawW = croppedAreaPixels.width;
      const rawH = croppedAreaPixels.height;
      const scale = Math.min(1, MAX_OUTPUT / Math.max(rawW, rawH));
      canvas.width = Math.round(rawW * scale);
      canvas.height = Math.round(rawH * scale);

      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      ctx.drawImage(
        rotCanvas,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        rawW,
        rawH,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob((blob) => {
        if (blob) onCropComplete(blob);
      }, "image/jpeg", 0.88);
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

  const currentAspect = ASPECT_OPTIONS[aspectIndex].value;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 md:p-6 text-white bg-black/50 backdrop-blur-md z-10">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl transition-all active:scale-95 font-black text-sm"
        >
          <X size={18} /> 취소
        </button>
        <h2 className="text-sm font-black uppercase tracking-widest">이미지 편집</h2>
        <button
          onClick={getCroppedImg}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 text-sm"
        >
          <Check size={18} /> 완료
        </button>
      </div>

      {/* 비율 선택 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-black/40 overflow-x-auto">
        {ASPECT_OPTIONS.map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => setAspectIndex(i)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-black transition-all ${
              aspectIndex === i
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-gray-300 hover:bg-white/20"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 크로퍼 */}
      <div
        className="flex-1 relative bg-neutral-900"
        style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
      >
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={currentAspect}
          onCropChange={onCropChange}
          onCropComplete={onCropCompleteInternal}
          onZoomChange={onZoomChange}
        />
      </div>

      {/* 슬라이더 */}
      <div className="p-4 md:p-8 bg-black/50 backdrop-blur-md space-y-4">
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
