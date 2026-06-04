import React, { useRef, useState, useEffect } from "react";
import { Crop, Scissors, Sparkles, RefreshCw, PlusCircle, Check } from "lucide-react";
import { CroppedImage } from "../types";

interface ImageCropperProps {
  onImageCropped: (cropped: CroppedImage) => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ onImageCropped }) => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, width: 200, height: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<"move" | "resize-se" | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load selected graphic file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSourceImage(reader.result as string);
        // Reset crop box attributes
        setCropBox({ x: 50, y: 50, width: 200, height: 150 });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, type: "move" | "resize-se") => {
    e.preventDefault();
    setIsDragging(true);
    setDragType(type);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !imgRef.current) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      const rect = imgRef.current.getBoundingClientRect();
      const maxW = rect.width;
      const maxH = rect.height;

      setDragStart({ x: e.clientX, y: e.clientY });

      if (dragType === "move") {
        setCropBox((prev) => {
          let newX = prev.x + dx;
          let newY = prev.y + dy;
          
          // Clamp borders
          newX = Math.max(0, Math.min(newX, maxW - prev.width));
          newY = Math.max(0, Math.min(newY, maxH - prev.height));
          
          return { ...prev, x: newX, y: newY };
        });
      } else if (dragType === "resize-se") {
        setCropBox((prev) => {
          let newW = prev.width + dx;
          let newH = prev.height + dy;

          // Constraints
          newW = Math.max(40, Math.min(newW, maxW - prev.x));
          newH = Math.max(40, Math.min(newH, maxH - prev.y));

          return { ...prev, width: newW, height: newH };
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, dragType]);

  /**
   * core WHITE SPACE AUTOCROP algorithm matching Python np.asarray(pil_img.convert("L")) < threshold
   */
  const autocropWhitespace = (ctx: CanvasRenderingContext2D, width: number, height: number, pad = 12, thresh = 245) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let hasContent = false;

    // Scan pixels for structural brightness values (grayscale translation)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const a = data[offset + 3];

        // Gray level thresholding (L)
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // Is pixel darker than thresh (and not fully transparent)?
        if (gray < thresh && a > 50) {
          hasContent = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasContent) {
      return { x: 0, y: 0, w: width, h: height };
    }

    // Apply custom padding boundary constraints
    const croppedX = Math.max(0, minX - pad);
    const croppedY = Math.max(0, minY - pad);
    const croppedW = Math.min(width, maxX + pad + 1) - croppedX;
    const croppedH = Math.min(height, maxY + pad + 1) - croppedY;

    return { x: croppedX, y: croppedY, w: croppedW, h: croppedH };
  };

  // Perform crop action
  const handleCropAction = (shouldAutocrop = false) => {
    if (!imgRef.current || !canvasRef.current) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Determine proportions
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const dispWidth = img.width;
    const dispHeight = img.height;

    const scaleX = naturalWidth / dispWidth;
    const scaleY = naturalHeight / dispHeight;

    // Find bounding region relative to natural size
    const srcX = cropBox.x * scaleX;
    const srcY = cropBox.y * scaleY;
    const srcW = cropBox.width * scaleX;
    const srcH = cropBox.height * scaleY;

    // Phase 1: Draw bounding selection onto temp canvas
    canvas.width = srcW;
    canvas.height = srcH;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    let finalX = 0;
    let finalY = 0;
    let finalW = srcW;
    let finalH = srcH;

    if (shouldAutocrop) {
      // Phase 2: Analyze grayscale pixel margins and trim whitespace borders
      const bounds = autocropWhitespace(ctx, srcW, srcH, 12, 245);
      finalX = bounds.x;
      finalY = bounds.y;
      finalW = bounds.w;
      finalH = bounds.h;

      // Draw trimmed content onto a secondary fitted canvas
      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = finalW;
      croppedCanvas.height = finalH;
      const cropperCtx = croppedCanvas.getContext("2d");
      if (cropperCtx) {
        cropperCtx.drawImage(canvas, finalX, finalY, finalW, finalH, 0, 0, finalW, finalH);
        
        // Export base64 url
        const croppedBase64 = croppedCanvas.toDataURL("image/png");
        const imgId = "imgC" + Math.floor(Math.random() * 100000);
        
        // Match proportional HWP system guidelines (~38,000 width standard scale)
        const targetWidth = 38000;
        const targetHeight = Math.floor(targetWidth * finalH / finalW);

        onImageCropped({
          id: imgId,
          token: `@IMG:${imgId}@`,
          dataUrl: croppedBase64,
          width: targetWidth,
          height: targetHeight
        });
        
        setSourceImage(null); // Reset
        return;
      }
    }

    // Standard crop fallback
    const croppedBase64 = canvas.toDataURL("image/png");
    const imgId = "imgC" + Math.floor(Math.random() * 100000);
    const targetWidth = 38000;
    const targetHeight = Math.floor(targetWidth * finalH / finalW);

    onImageCropped({
      id: imgId,
      token: `@IMG:${imgId}@`,
      dataUrl: croppedBase64,
      width: targetWidth,
      height: targetHeight
    });

    setSourceImage(null); // Reset
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 transition-all">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
            <Crop className="w-4.5 h-4.5 text-indigo-600 animate-pulse" />
            수학 문제집 도형/그림 크롭 영역 지정
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            수학 문제집이나 PDF 영역에서 그림만 골라 삽입할 수 있습니다.
          </p>
        </div>
        
        <div className="relative inline-block">
          <input
            type="file"
            id="cropper-file-input"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <label
            htmlFor="cropper-file-input"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100/50 rounded-lg cursor-pointer hover:bg-indigo-100 transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            도형 사진 불러오기
          </label>
        </div>
      </div>

      {sourceImage ? (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
          <div 
            ref={containerRef} 
            className="relative overflow-hidden border border-slate-200 bg-white shadow-inner max-h-[500px] flex justify-center mt-2 cursor-crosshair select-none"
          >
            <img
              ref={imgRef}
              src={sourceImage}
              alt="Source content to crop"
              className="max-h-[500px] select-none object-contain pointer-events-none"
              id="cropper-target-image"
            />
            
            {/* The interactive overlay bounding selector box */}
            <div
              style={{
                position: "absolute",
                left: `${cropBox.x}px`,
                top: `${cropBox.y}px`,
                width: `${cropBox.width}px`,
                height: `${cropBox.height}px`,
                border: "2px solid #6366f1",
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
              }}
              className="group"
            >
              <div 
                className="w-full h-full cursor-move absolute top-0 left-0" 
                onMouseDown={(e) => handleMouseDown(e, "move")}
              />
              
              {/* Resize Handle at Bottom-Right */}
              <div
                onMouseDown={(e) => handleMouseDown(e, "resize-se")}
                className="absolute bottom-0 right-0 w-4 h-4 bg-indigo-600 border border-white rounded-tl-md shadow cursor-se-resize flex items-center justify-center"
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full" />
              </div>

              {/* Box Tag indicator */}
              <div className="absolute top-0 left-0 -translate-y-full bg-indigo-600 text-[10px] font-mono text-white px-2 py-0.5 rounded-t font-semibold flex items-center gap-1">
                <Scissors className="w-2.5 h-2.5" />
                선택 크기: {Math.floor(cropBox.width)} x {Math.floor(cropBox.height)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => setSourceImage(null)}
              className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              취소
            </button>
            
            <button
              id="btn-normal-crop"
              onClick={() => handleCropAction(false)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300/50 rounded-lg transition-colors"
            >
              <Scissors className="w-3.5 h-3.5 text-slate-500" />
              지정 크기 단면 크롭
            </button>

            <button
              id="btn-auto-crop"
              onClick={() => handleCropAction(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-100 shadow border border-indigo-700 rounded-lg transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              흰 여백 자동 피팅 크롭 (Re-calculate)
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50/20">
          <Crop className="w-8 h-8 text-slate-300 stroke-[1.5]" />
          <p className="text-xs text-slate-500 font-medium mt-2">
            크롭할 수학 기하 도형이나 그래프 문제 그림 파일이 있으신가요?
          </p>
          <span className="text-[10px] text-slate-400 mt-1">
            불러온 뒤 단원체크 문제집 여백을 AI 처럼 타이트하게 자동으로 도려낼 수 있습니다. (pad 12px)
          </span>
        </div>
      )}

      {/* Hidden processing canvas element */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
