import React, { useEffect, useState, useRef } from "react";
import { parseMarkup } from "../utils/hwpxGenerator";

// Hook to load KaTeX on demand from a trusted CDN
function useKaTeX() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // If already initialized
    if ((window as any).katex) {
      setReady(true);
      return;
    }

    // Load stylesheet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css";
    document.head.appendChild(link);

    // Load script
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js";
    script.async = true;
    script.onload = () => {
      setReady(true);
    };
    document.head.appendChild(script);

    return () => {
      // Clean up (optional, but keep it active for other render calls)
    };
  }, []);

  return ready;
}

interface InlineMathProps {
  formula: string;
}

const InlineMath: React.FC<InlineMathProps> = ({ formula }) => {
  const katexReady = useKaTeX();
  const elRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (katexReady && elRef.current && (window as any).katex) {
      try {
        // Remove backslash or brace markers if they disrupt simple inline views
        let cleanFormula = formula.trim();
        (window as any).katex.render(cleanFormula, elRef.current, {
          displayMode: false,
          throwOnError: false,
        });
      } catch (err) {
        console.warn("KaTeX Error", err);
      }
    }
  }, [formula, katexReady]);

  if (!katexReady) {
    return <span className="font-mono text-xs text-amber-600 bg-amber-50 px-1 rounded mx-0.5">{`$${formula}$`}</span>;
  }

  return <span ref={elRef} className="px-0.5 text-slate-900 inline-block align-middle" />;
};

interface LatexPreviewProps {
  text: string;
  className?: string;
  images?: { id: string; dataUrl: string }[];
}

export const LatexPreview: React.FC<LatexPreviewProps> = ({ text, className = "", images = [] }) => {
  // Check if line matches an embedded image token, e.g. @IMG:imgC1@
  let imgMatchId = "";
  if (images.length > 0) {
    for (const image of images) {
      if (text.includes(`@IMG:${image.id}@`)) {
        imgMatchId = image.id;
        break;
      }
    }
  }

  if (imgMatchId) {
    const targetImage = images.find((i) => i.id === imgMatchId);
    const parts = text.split(`@IMG:${imgMatchId}@`);

    return (
      <div className={`my-2 flex flex-col items-center justify-center p-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 ${className}`}>
        {parts[0] && <div className="text-sm text-slate-700 mb-2">{parts[0]}</div>}
        {targetImage && (
          <img
            src={targetImage.dataUrl}
            alt="Embedded diagram"
            className="max-h-48 max-w-full rounded border bg-white shadow-sm object-contain"
            id={`img-preview-${imgMatchId}`}
          />
        )}
        {parts[1] && <div className="text-sm text-slate-700 mt-2">{parts[1]}</div>}
      </div>
    );
  }

  const segments = parseMarkup(text);

  return (
    <div className={`leading-relaxed text-slate-800 ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === "e") {
          return <InlineMath key={idx} formula={seg.content} />;
        }
        return <span key={idx} className="whitespace-pre-wrap">{seg.content}</span>;
      })}
    </div>
  );
};
