import { useState, useRef, useEffect, ChangeEvent } from "react";
import {
  FileUp,
  FileText,
  Sparkles,
  Download,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Eye,
  Settings,
  Image as ImageIcon,
  HelpCircle,
  Undo2,
  ListTodo,
  Smile,
  Copy,
  PlusCircle,
  FileDown,
  Menu,
  X,
  RefreshCw,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Problem, CroppedImage } from "./types";
import { parseHwpxBlob, generateHwpxBlob, latexToHwp } from "./utils/hwpxGenerator";
import { LatexPreview } from "./components/LatexPreview";
import { ImageCropper } from "./components/ImageCropper";

const CHOICE_MARKS = "①②③④⑤⑥⑦⑧⑨⑩";

// Pre-populated high-fidelity mathematical problems on initial render
const DEFAULT_PROBLEMS: Problem[] = [
  {
    id: "p1",
    number: "01",
    lines: [
      "두 복소수 «z_1 = (1 - i)^2», «z_2 = \\frac{3 - \\sqrt{3}i}{3 + \\sqrt{3}i}»에 대하여 «z_1 z_2»의 값은?",
      "① «-2»  ② «-1»  ③ «0»  ④ «1»  ⑤ «2»"
    ]
  },
  {
    id: "p2",
    number: "02",
    lines: [
      "실수 전체의 집합에서 미분가능한 함수 «f(x)»가 다음 조건을 만족시킨다.",
      "(가) 모든 실수 «x»에 대하여 «f'(x) > 0»이다.",
      "(나) «\\lim_{n \\to \\infty} \\sum_{k=1}^n f\\left(1 + \\frac{2k}{n}\\right) \\frac{2}{n} = \\int_{1}^{3} f(t) dt = 12»",
      "이때 곡선 «y = f(x)»와 «x»축 및 두 직선 «x=1», «x=3»으로 둘러싸인 도형의 넓이를 구하시오."
    ]
  }
];

export default function App() {
  const [problems, setProblems] = useState<Problem[]>(DEFAULT_PROBLEMS);
  const [croppedImages, setCroppedImages] = useState<CroppedImage[]>([]);
  const [fontName, setFontName] = useState("나눔바른고딕 옛한글");
  const [leftAlign, setLeftAlign] = useState(true);
  const [answersVertical, setAnswersVertical] = useState(true);
  const [bracketNumber, setBracketNumber] = useState(true);

  // Focus and insert helpers
  const [activeInputRef, setActiveInputRef] = useState<{ problemId: string; lineIndex: number } | null>(null);
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [testPaperTitle, setTestPaperTitle] = useState("수식연구회 수학 단원체크 문제집");
  const [testPaperSub, setTestPaperSub] = useState("수학 영역");
  const [testPaperPeriod, setTestPaperPeriod] = useState("제 1 교시");
  const [printColumns, setPrintColumns] = useState<"1col" | "2col">("2col");
  const [showStudentInfo, setShowStudentInfo] = useState(true);
  const [activeTab, setActiveTab] = useState<"problems" | "cropper">("problems");

  // Load HWPX file directly in browser
  const handleHwpxUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadError(null);
    setAiLoading(true);
    setAiStatusMessage("HWPX 파일 구조 분석 및 압축 해제 중...");

    try {
      const result = await parseHwpxBlob(file);
      if (result.error) {
        setLoadError(result.error);
      } else if (result.problems.length > 0) {
        setProblems(result.problems);
      } else {
        setLoadError("가져올 수 있는 한글 수식 문항이 없습니다.");
      }
    } catch (err: any) {
      setLoadError("HWPX 파일을 읽는 과정에서 분석 오류가 발생했습니다.");
    } finally {
      setAiLoading(false);
      e.target.value = ""; // clear
    }
  };

  // Compress math sheets/photos client-side to fit below proxy limits and speed up OCR transit
  const compressImage = (file: File): Promise<{ base64Content: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        // If it's a PDF, read it natively without canvas downscaling
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("파일 읽기에 실패했습니다."));
        reader.onload = () => {
          const result = reader.result as string;
          resolve({
            base64Content: result.split(",")[1],
            mimeType: file.type || "application/pdf",
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("이미지 파일 로드에 실패했습니다."));
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => reject(new Error("이미지 해독에 실패했습니다."));
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 1200; // Efficient resolution for high-quality math OCR and ultra-small payload
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({
              base64Content: (event.target?.result as string).split(",")[1],
              mimeType: file.type,
            });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          // Compress to JPEG with 0.80 quality to heavily shrink file size (~92% reduction)
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.80);
          resolve({
            base64Content: compressedDataUrl.split(",")[1],
            mimeType: "image/jpeg",
          });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // Convert HWP/PDF/images using AI OCR via Express Server endpoint
  const handleAiOcrUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadError(null);

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isImage && !isPdf) {
      setLoadError("AI 변환 실패: 지원하지 않는 파일 형식입니다. 이미지(PNG/JPG) 또는 PDF 파일만 지원합니다.");
      e.target.value = "";
      return;
    }

    // Defensive file size limits to prevent server OOM or proxy gateway timeout errors
    const maxPdfSize = 8 * 1024 * 1024; // 8MB limit for PDFs
    const maxImgSize = 15 * 1024 * 1024; // 15MB limit for images

    if (isPdf && file.size > maxPdfSize) {
      setLoadError("AI 변환 실패: PDF 파일 용량이 너무 큽니다 (최대 8MB). 더 작게 분할하거나, 선명하게 캡처한 이미지(PNG/JPG) 파일로 변환하여 올려주세요.");
      e.target.value = "";
      return;
    }

    if (isImage && file.size > maxImgSize) {
      setLoadError("AI 변환 실패: 이미지 파일 용량이 너무 큽니다 (최대 15MB). 해상도를 조절하거나 용량을 더 가볍게 압축하여 제출해주세요.");
      e.target.value = "";
      return;
    }

    setAiLoading(true);
    setAiStatusMessage("Gemini AI 수식 인지 분석기 작동 중 (30초 가량 소요)...");

    try {
      // 1. Process and compress file to fit safely within transfer payload limits
      const { base64Content, mimeType } = await compressImage(file);

      // 2. Submit to backend API route
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64Content,
          mimeType: mimeType,
          filename: file.name
        })
      });

      let data: any;
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.error("Failed to parse JSON response:", jsonErr);
        throw new Error(
          "서버 연결 혹은 AI 응답 수신에 실패했습니다. (클라우드 환경의 일시적 요청 한계 초과 상태일 수 있습니다. 이미지의 크기를 더 줄여서 다시 한 번만 시도해 주세요.)"
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "AI OCR processing failed.");
      }

      if (data.problems && data.problems.length > 0) {
        // Hydrate with proper transient state IDs
        const hydrated: Problem[] = data.problems.map((p: any) => ({
          id: Math.random().toString(36).substring(2, 9),
          number: p.number || "01",
          lines: p.lines || []
        }));
        setProblems(hydrated);
      } else {
        throw new Error("AI가 아무런 문제를 수집하지 못했습니다. 선명한 수학 문제를 업로드해주세요.");
      }
    } catch (err: any) {
      setLoadError(`AI 변환 실패: ${err.message || "서버 혹은 API 키 설정을 확인해주세요."}`);
    } finally {
      setAiLoading(false);
      e.target.value = "";
    }
  };

  // Compile and Save as HWPX Document ZIP download
  const handleExportHwpx = async () => {
    try {
      const blob = await generateHwpxBlob(problems, croppedImages, {
        fontName,
        leftAlign,
        answersVertical,
        bracketNumber
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "수식연구회_도형_단원체크.hwpx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowExportModal(true);
    } catch (err: any) {
      alert(`파일 생성 오류: ${err.message || "내보내기가 실패했습니다."}`);
    }
  };

  // Add blank problem
  const addNewProblem = () => {
    const nextNum = (problems.length + 1).toString().padStart(2, "0");
    const newProb: Problem = {
      id: Math.random().toString(36).substring(2, 9),
      number: nextNum,
      lines: ["새로운 단원체크 문제 내용입니다.", "① «1»  ② «2»  ③ «3»  ④ «4»  ⑤ «5»"]
    };
    setProblems([...problems, newProb]);
    setActiveTab("problems");
  };

  // Edit individual row lines
  const handleLineChange = (pId: string, index: number, value: string) => {
    setProblems((prev) =>
      prev.map((p) => {
        if (p.id === pId) {
          const freshLines = [...p.lines];
          freshLines[index] = value;
          return { ...p, lines: freshLines };
        }
        return p;
      })
    );
  };

  const handleNumberChange = (pId: string, val: string) => {
    setProblems((prev) =>
      prev.map((p) => (p.id === pId ? { ...p, number: val } : p))
    );
  };

  const addLineToProblem = (pId: string) => {
    setProblems((prev) =>
      prev.map((p) => (p.id === pId ? { ...p, lines: [...p.lines, ""] } : p))
    );
  };

  const removeLineFromProblem = (pId: string, index: number) => {
    setProblems((prev) =>
      prev.map((p) => {
        if (p.id === pId) {
          const freshLines = p.lines.filter((_, i) => i !== index);
          return { ...p, lines: freshLines.length === 0 ? [""] : freshLines };
        }
        return p;
      })
    );
  };

  const deleteProblem = (pId: string) => {
    setProblems((prev) => prev.filter((p) => p.id !== pId));
  };

  const moveProblem = (idx: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= problems.length) return;

    const fresh = [...problems];
    const temp = fresh[idx];
    fresh[idx] = fresh[targetIdx];
    fresh[targetIdx] = temp;
    setProblems(fresh);
  };

  // Graphics library handler
  const handleImageCropped = (cropped: CroppedImage) => {
    setCroppedImages([...croppedImages, cropped]);
    setActiveTab("problems");

    // Auto-insert image token at the currently active line or top-most problem
    if (activeInputRef && problems.length > 0) {
      const { problemId, lineIndex } = activeInputRef;
      setProblems((prev) =>
        prev.map((p) => {
          if (p.id === problemId) {
            const nextLines = [...p.lines];
            // Append or insert image token
            nextLines[lineIndex] = nextLines[lineIndex] + ` @IMG:${cropped.id}@`;
            return { ...p, lines: nextLines };
          }
          return p;
        })
      );
    } else if (problems.length > 0) {
      // Append image token on its own row at the end of the first problem
      setProblems((prev) => {
        const fresh = [...prev];
        fresh[0] = {
          ...fresh[0],
          lines: [...fresh[0].lines, `[도형 데이터] @IMG:${cropped.id}@`]
        };
        return fresh;
      });
    }
  };

  // Injects quick templates into currently focused equation fields
  const injectMathSymbol = (symbol: string) => {
    if (!activeInputRef) return;
    const { problemId, lineIndex } = activeInputRef;

    setProblems((prev) =>
      prev.map((p) => {
        if (p.id === problemId) {
          const freshLines = [...p.lines];
          const elKey = `${problemId}-${lineIndex}`;
          const inputEl = inputRefs.current[elKey];

          if (inputEl) {
            const start = inputEl.selectionStart || 0;
            const end = inputEl.selectionEnd || 0;
            const currentVal = freshLines[lineIndex];
            const insertVal = `«${symbol}»`;

            const updatedVal =
              currentVal.substring(0, start) + insertVal + currentVal.substring(end);
            freshLines[lineIndex] = updatedVal;

            // Trigger dynamic re-focus timing
            setTimeout(() => {
              inputEl.focus();
              inputEl.setSelectionRange(start + insertVal.length, start + insertVal.length);
            }, 50);
          } else {
            // Append directly at the line end
            freshLines[lineIndex] = freshLines[lineIndex] + ` «${symbol}»`;
          }
          return { ...p, lines: freshLines };
        }
        return p;
      })
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans flex flex-col antialiased selection:bg-indigo-100">
      
      {/* Absolute Dynamic full-page loading indicators */}
      <AnimatePresence>
        {aiLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="bg-white/95 border border-slate-200 shadow-2xl rounded-2xl max-w-md w-full p-6 text-center flex flex-col items-center">
              <RefreshCw className="w-9 h-9 text-indigo-600 animate-spin mb-4" />
              <h4 className="text-md font-semibold text-slate-800">문항 처리 분석 엔진 작동 중</h4>
              <p className="text-xs text-slate-500 mt-2 font-medium">{aiStatusMessage}</p>
              <div className="w-full bg-slate-100 rounded-full h-1 mt-4 overflow-hidden">
                <div className="bg-indigo-600 h-1 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main header navbar */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/60 shadow-xs px-5 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-mono font-bold shadow-md shadow-indigo-100">
              f
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">HWPX Equation Studio</h1>
                <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full border border-slate-200/50">v2.5 Full-Stack</span>
              </div>
              <p className="text-xs text-slate-500 font-medium">한글 HWPX 수학 문제집 수식 문서 제작기</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick blank problem button */}
            <button
              onClick={addNewProblem}
              className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              문제 추가 (+1)
            </button>

            {/* Direct HWPX Parser trigger */}
            <div className="relative">
              <input
                id="file-hwpx-uploader"
                type="file"
                accept=".hwpx"
                className="hidden"
                onChange={handleHwpxUpload}
              />
              <label
                htmlFor="file-hwpx-uploader"
                className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-200 cursor-pointer shadow-xs transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                기존 HWPX 불러오기
              </label>
            </div>

            {/* AI Document OCR trigger */}
            <div className="relative">
              <input
                id="file-ai-uploader"
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleAiOcrUpload}
              />
              <label
                htmlFor="file-ai-uploader"
                className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-4 py-2 rounded-lg border border-indigo-100/40 cursor-pointer shadow-xs transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
                PDF/이미지 AI 수식 변환
              </label>
            </div>

            {/* New high-comfort PDF layout printer */}
            <button
              onClick={() => setShowPrintModal(true)}
              disabled={problems.length === 0}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold px-4.5 py-2.5 rounded-lg shadow-md shadow-emerald-100 transition-all border border-emerald-700 cursor-pointer active:scale-95 animate-pulse hover:animate-none"
            >
              <Download className="w-3.5 h-3.5" />
              오류 없는 PDF 시험지 내보내기
            </button>

            {/* Big floating trigger */}
            <button
              onClick={handleExportHwpx}
              disabled={problems.length === 0}
              className="flex items-center gap-1 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-600 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-250 transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-500" />
              HWPX로 백업하기
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Controls & Import Guides */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Error Banner */}
          {loadError && (
            <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-xl text-rose-800 text-xs flex items-start gap-2.5 animate-bounce">
              <div className="bg-rose-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">!</div>
              <div>
                <span className="font-semibold">오류 알림: </span>
                {loadError}
              </div>
            </div>
          )}

          {/* Configuration panel */}
          <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-4">
              <Settings className="w-4 h-4 text-slate-400" />
              한글 문서 레이아웃 속성 설정
            </h2>

            <div className="space-y-4">
              {/* Custom Font Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">한컴 폰트명 지정 (Font Face)</label>
                <input
                  type="text"
                  value={fontName}
                  onChange={(e) => setFontName(e.target.value)}
                  placeholder="예: 나눔바른고딕 옛한글, 함초롬바탕"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <span className="text-[10px] text-slate-400 mt-1 block leading-relaxed leading-[1.35]">
                  * 한글(한컴오피스) 기본 수식 서체 장식에 적용될 기본 글자 모양입니다.
                </span>
              </div>

              {/* Direct Toggles */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLeftAlign(!leftAlign)}
                  className={`flex flex-col items-start p-2.5 rounded-lg border transition-all text-left ${
                    leftAlign
                      ? "border-indigo-100 bg-indigo-50/50 text-indigo-700"
                      : "border-slate-200 bg-slate-50/40 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-xs font-bold">왼쪽 맞춤 (LEFT)</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">수식 간격 벌어짐과 줄바꿈 이상을 해결합니다.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAnswersVertical(!answersVertical)}
                  className={`flex flex-col items-start p-2.5 rounded-lg border transition-all text-left ${
                    answersVertical
                      ? "border-indigo-100 bg-indigo-50/50 text-indigo-700"
                      : "border-slate-200 bg-slate-50/40 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-xs font-bold">오지선다 세로 정렬</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">①~⑤ 문항 선택지를 아래로 배열합니다.</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setBracketNumber(!bracketNumber)}
                  className={`flex flex-col items-start p-2.5 rounded-lg border transition-all text-left ${
                    bracketNumber
                      ? "border-indigo-100 bg-indigo-50/50 text-indigo-700"
                      : "border-slate-200 bg-slate-50/40 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-xs font-bold">인덱스 대괄호 [01]</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">문항 번호를 대괄호 묶음 형식으로 내보냅니다.</span>
                </button>

                <div className="flex flex-col justify-center p-2 text-slate-400 border border-dotted border-slate-200 rounded-lg bg-slate-50/10">
                  <span className="text-[10px] text-center">동작 스크립트:<br/><b>mimetype-application</b></span>
                </div>
              </div>
            </div>
          </section>

          {/* Interactive Graphics Library & Cropper */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("problems")}
              className={`flex-1 py-2 text-xs font-bold border-b-2 text-center transition-all ${
                activeTab === "problems"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              기본 수식 도구 (Palette)
            </button>
            <button
              onClick={() => setActiveTab("cropper")}
              className={`flex-1 py-2 text-xs font-bold border-b-2 text-center transition-all ${
                activeTab === "cropper"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              도형 크롭 & 삽입 (PIL)
            </button>
          </div>

          {activeTab === "problems" ? (
            <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  한글 수식 표준기 신속 입력 팔레트
                </h3>
                <p className="text-[10px] text-slate-400 mb-3 block leading-[1.35]">
                  원하는 문제 입력 칸을 클릭하고 하래 기호를 누르면 <code>«수식»</code> 형태로 자동 인출됩니다.
                </p>

                {/* Grid palette buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: "분수 (over)", code: "\\frac{a}{b}" },
                    { label: "제곱근 (sqrt)", code: "\\sqrt{x}" },
                    { label: "곱하기 (times)", code: "\\times" },
                    { label: "나누기 (div)", code: "\\div" },
                    { label: "플마 (+-)", code: "\\pm" },
                    { label: "이하 (<=)", code: "\\leq" },
                    { label: "이상 (>=)", code: "\\geq" },
                    { label: "같지않다", code: "\\neq" },
                    { label: "무한대 (inf)", code: "\\infty" },
                    { label: "리미트 (lim)", code: "\\lim_{n \\to \\infty}" },
                    { label: "시그마 (sum)", code: "\\sum_{k=1}^n" },
                    { label: "인테그럴", code: "\\int_{a}^{b}" },
                    { label: "알파 (alpha)", code: "\\alpha" },
                    { label: "베타 (beta)", code: "\\beta" },
                    { label: "파이 (pi)", code: "\\pi" }
                  ].map((sym, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => injectMathSymbol(sym.code)}
                      className="p-2 border border-slate-150 rounded-lg text-slate-700 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900 text-left transition-all group"
                    >
                      <div className="text-[10px] font-bold text-slate-600 group-hover:text-indigo-600 truncate">{sym.label}</div>
                      <code className="text-[9px] text-slate-400 block font-mono mt-0.5 truncate">{sym.code}</code>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cropped Library overview inside tools list */}
              {croppedImages.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">포착된 수식 도형 목록</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {croppedImages.map((img) => (
                      <div key={img.id} className="p-2 border border-slate-200 rounded-lg bg-slate-50 text-center relative group">
                        <img src={img.dataUrl} className="h-14 mx-auto object-contain bg-white rounded border mb-1.5" />
                        <div className="text-[10px] font-mono text-slate-500 font-bold select-all truncate">{img.token}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(img.token);
                            alert("토큰이 클립보드에 무사히 복사되었습니다! 문제 행 본문에 붙여넣어(Ctrl+V) 삽입해보세요.");
                          }}
                          className="absolute inset-0 bg-slate-900/40 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          코드 복사
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <ImageCropper onImageCropped={handleImageCropped} />
          )}

          {/* Guidelines on reconstruction */}
          <section className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-5 text-xs text-amber-800 space-y-2.5">
            <h3 className="font-bold flex items-center gap-1.5 text-amber-900">
              <HelpCircle className="w-4 h-4 text-amber-700" />
              격식 문서 수식 렌더링 팁 (Tip)
            </h3>
            <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px] leading-relaxed">
              <li>
                <b>한글 수식 구획</b>: 본문 중 <code>« ... »</code>로 감싼 구획은 완벽한 한컴 수학 표준식(equation)으로 빌드됩니다.
              </li>
              <li>
                <b>도형 및 삽화 결합</b>: 이미지 크로퍼에서 조각낸 도형 토큰(예: <code>@IMG:imgC1@</code>)을 작성 행 중간에 기입하면 한글 본문 가운데에 그림 객체(hwpPic)로 자동 치환 배정됩니다!
              </li>
              <li>
                <b>spacing 및 벌어짐 한컴 해결법</b>: Windows PC 한글 프로그램에서 내보낸 <code>.hwpx</code> 파일을 열면 기본 폰트 크기 간격이 맞물려 보일 수 있습니다. 이럴 땐 문항을 클릭해 수식 편집기로 한 번만 스캔하시거나, 기 제공된 <b>수식_자동재계산.py</b> (pywin32) 코드를 돌려 한글 파일로 강제 계산 보정을 하시면 사방 여백 비율이 수식 폭(estimate)에 따라 깔끔하게 타이트하게 자리 잡습니다!
              </li>
            </ul>
          </section>

        </div>

        {/* RIGHT COLUMN: Real-Time Interactive Editor Workspace */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ListTodo className="w-4.5 h-4.5 text-indigo-600" />
              학습 수학 문항 편집 보드 ({problems.length}개 수식 단원체크)
            </h2>
            <button
              onClick={() => {
                setProblems([]);
                setCroppedImages([]);
              }}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
            >
              전체 비우기
            </button>
          </div>

          <div className="space-y-4">
            {problems.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-2xl p-12 text-center bg-white shadow-xs">
                <FileText className="w-12 h-12 text-slate-300 stroke-[1.25] mx-auto" />
                <h3 className="text-sm font-semibold text-slate-800 mt-4">단원체크 문제 목록이 비어 있습니다</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  상단의 "기존 HWPX 불러오기", "PDF/이미지 AI 수식 변환" 또는 "문제 추가..." 버튼을 클릭하여 수학 문제를 채워주세요.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <button
                    onClick={addNewProblem}
                    className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-4 py-2 rounded-lg"
                  >
                    새 문제 카드 올리기
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {problems.map((prob, idx) => (
                  <motion.div
                    layoutId={prob.id}
                    key={prob.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden"
                  >
                    {/* Header bar within card */}
                    <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="font-mono text-xs font-bold text-slate-400">Idx: {idx + 1}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-700">문제 인덱스:</span>
                          <input
                            type="text"
                            value={prob.number}
                            onChange={(e) => handleNumberChange(prob.id, e.target.value)}
                            className="w-12 text-center font-bold text-indigo-600 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 py-0.5 text-xs"
                          />
                        </div>
                      </div>

                      {/* Card utility actions */}
                      <div className="flex items-center gap-1.5">
                        <button
                          title="위로 이동"
                          onClick={() => moveProblem(idx, "up")}
                          disabled={idx === 0}
                          className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 bg-white border border-slate-200 rounded shadow-xs"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="아래로 이동"
                          onClick={() => moveProblem(idx, "down")}
                          disabled={idx === problems.length - 1}
                          className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 bg-white border border-slate-200 rounded shadow-xs"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="문항 삭제"
                          onClick={() => deleteProblem(prob.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 bg-white border border-slate-200 rounded shadow-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Layout panels: Left Draft Edit + Right Visual LaTeX View */}
                    <div className="grid grid-cols-1 md:grid-cols-2">
                      
                      {/* Left side editor drafting */}
                      <div className="p-5 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col gap-3">
                        <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1">
                          편집 에디터 (Drafting LaTeX inside «...»)
                        </div>

                        {prob.lines.map((line, lIdx) => {
                          const elKey = `${prob.id}-${lIdx}`;
                          return (
                            <div key={lIdx} className="flex items-start gap-2 group">
                              <div className="flex flex-col gap-1 w-full">
                                <div className="relative">
                                  <input
                                    ref={(el) => {
                                      inputRefs.current[elKey] = el;
                                    }}
                                    type="text"
                                    value={line}
                                    onChange={(e) => handleLineChange(prob.id, lIdx, e.target.value)}
                                    onFocus={() => setActiveInputRef({ problemId: prob.id, lineIndex: lIdx })}
                                    className="w-full text-xs font-mono text-slate-700 px-3 py-2 pr-8 rounded-lg border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:bg-white bg-slate-50/50 focus:outline-none transition-all"
                                    placeholder={lIdx === 0 ? "문제를 입력하시고 수학 기호는 «LaTeX»로 묶어주세요" : "선택지 또는 세부 문구 기술"}
                                  />
                                  
                                  {/* Quick clear button */}
                                  {line && (
                                    <button
                                      type="button"
                                      onClick={() => handleLineChange(prob.id, lIdx, "")}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 rounded-full"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                
                                {/* Live HWP Translator Syntax Check Box */}
                                {line.includes("«") && (
                                  <div className="text-[9px] font-mono bg-slate-50 border border-slate-150 px-2 py-0.5 rounded text-indigo-600/80 flex items-center justify-between">
                                    <span>한컴 수식 코드 변환식:</span>
                                    <span className="font-bold font-mono">
                                      {(() => {
                                        const match = line.match(/«([^»]+)»/);
                                        return match ? latexToHwp(match[1]) : "";
                                      })()}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => removeLineFromProblem(prob.id, lIdx)}
                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-slate-50 rounded transition-colors shrink-0 mt-0.5"
                                title="이 행 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}

                        {/* Line append trigger */}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => addLineToProblem(prob.id)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
                          >
                            <Plus className="w-3 h-3" />
                            행 추가 (+ Line)
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const choiceStr = "① «»  ② «»  ③ «»  ④ «»  ⑤ «»";
                              setProblems((pList) =>
                                pList.map((p) => (p.id === prob.id ? { ...p, lines: [...p.lines, choiceStr] } : p))
                              );
                            }}
                            className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 border border-dashed border-slate-200 hover:border-indigo-300 px-2 py-0.5 rounded-md"
                          >
                            <PlusCircle className="w-3 h-3 text-slate-400" />
                            오지선다 선택지 템플릿 삽입
                          </button>
                        </div>
                      </div>

                      {/* Right side live rendering overview */}
                      <div className="p-5 bg-slate-50/30 flex flex-col gap-3">
                        <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          한글 가상 인쇄 보기 (Interactive KaTeX Renderer)
                        </div>

                        {/* Header preview symbol */}
                        <div className="text-sm font-bold text-slate-900 border-b border-dashed border-slate-150 pb-2">
                          {bracketNumber ? `[${prob.number}]` : prob.number}
                        </div>

                        {/* Rendering blocks */}
                        <div className="space-y-2.5">
                          {prob.lines.map((line, lIdx) => {
                            if (answersVertical && [...CHOICE_MARKS].filter((c) => line.includes(c)).length >= 2) {
                              // Break rendering apart just like HWPX output compile to preview cleanly
                              const choicesList = [];
                              let currStr = "";
                              for (const symbol of line) {
                                if (CHOICE_MARKS.includes(symbol)) {
                                  if (currStr.trim()) choicesList.push(currStr.trim());
                                  currStr = symbol;
                                } else {
                                  currStr += symbol;
                                }
                              }
                              if (currStr.trim()) choicesList.push(currStr.trim());

                              return (
                                <div key={lIdx} className="space-y-1 bg-indigo-50/10 p-1.5 rounded-lg border border-indigo-100/20">
                                  {choicesList.map((ch, chI) => (
                                    <LatexPreview key={chI} text={ch} className="text-xs py-0.5 text-slate-700 font-medium" images={croppedImages} />
                                  ))}
                                </div>
                              );
                            }

                            return (
                              <LatexPreview
                                key={lIdx}
                                text={line || " "}
                                className="text-xs text-slate-700 leading-relaxed font-normal"
                                images={croppedImages}
                              />
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Floating guidelines modal explaining the auto calculator */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowExportModal(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 rounded bg-slate-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-md font-bold text-slate-900">HWPX 문제집 내보내기 완료!</h3>
                  <p className="text-xs text-slate-500 font-medium">수식연구회 격식 표준형 HWPX가 저장되었습니다.</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  내보낸 HWPX 파일은 한컴오피스 한글 2014 이상 또는 HWPX 호환 뷰어에서 <b>더블클릭</b>으로 즉시 원활히 편집 가능합니다.
                </p>

                <div className="border border-amber-200/50 bg-amber-50/40 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    💡 수식 여백 및 장식 너비(Re-calculate) 권고 사항
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    한글 프로그램에서 HWPX를 열었을 때, 개별 수식 개체가 좁게 몰려 보이거나 줄바꿈 여백이 늘어지는 경우가 있을 수 있습니다.
                    이는 한글 프로그램 자체의 수식 레이아웃 갱신(Recalc) 정책 때문입니다.
                  </p>
                  <p className="text-[11px] font-semibold text-slate-700 leading-relaxed">
                    다음 방법 중 하나로 단번에 격식 간격을 정리할 수 있습니다:
                  </p>
                  <ul className="list-decimal list-inside space-y-1.5 text-[10.5px] text-slate-600 pl-1">
                    <li>
                      <b>한컴 수식 수동갱신</b>: 수식을 더블클릭했다가 수식편집기 창을 그대로 닫아주시면(Esc) 한글이 크기를 인지하여 맞춤 복구됩니다.
                    </li>
                    <li>
                      <b>제공된 계산기 활용 (강력 권장)</b>: 동봉된 <code>수식_자동재계산.py</code>를 실행하여 다운로드 된 <code>hwpx</code>를 끌어다 놓으시면(Drag & Drop) 한글 OLE 라이브러리가 백그라운드에서 모든 수식을 1초만에 일괄 갱신하여 <b>_완성.hwp</b> 문서로 정교하게 보존 배출해 줍니다!
                    </li>
                  </ul>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm"
                  >
                    확인 및 닫기
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Print Preview Screen Modal */}
      <AnimatePresence>
        {showPrintModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full p-6 shadow-2xl relative flex flex-col md:flex-row gap-6"
            >
              <button
                onClick={() => setShowPrintModal(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 rounded-full bg-slate-100 hover:bg-slate-200 p-2 cursor-pointer transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Control panel of print settings */}
              <div className="w-full md:w-2/5 flex flex-col justify-between gap-4 max-h-[85vh] overflow-y-auto pr-2 no-scrollbar">
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-widest leading-none">
                      Vector PDF Publisher
                    </span>
                    <h3 className="text-md font-extrabold text-slate-900 mt-2 flex items-center gap-1.5 leading-none">
                      <Settings className="w-4.5 h-4.5 text-emerald-600" />
                      PDF 인쇄 및 레이아웃 설정
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-normal">
                      오류 없이 고해상도 수식 백터 PDF 시험지로 포맷팅을 맞춤 설정합니다.
                    </p>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">시험지 대제목 (주제명)</label>
                      <input
                        type="text"
                        value={testPaperTitle}
                        onChange={(e) => setTestPaperTitle(e.target.value)}
                        placeholder="예: 중등 수학 도형 단원 종합 체크"
                        className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-800 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">영역명</label>
                        <input
                          type="text"
                          value={testPaperSub}
                          onChange={(e) => setTestPaperSub(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-800 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">교시명</label>
                        <input
                          type="text"
                          value={testPaperPeriod}
                          onChange={(e) => setTestPaperPeriod(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-800 transition-all"
                        />
                      </div>
                    </div>

                    {/* Choose column splitting */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">인쇄 레이아웃 단수</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setPrintColumns("1col")}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            printColumns === "1col"
                              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                          }`}
                        >
                          A4 1단 수직 나열
                        </button>
                        <button
                          onClick={() => setPrintColumns("2col")}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            printColumns === "2col"
                              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                          }`}
                        >
                          A4 2단 모의고사 분할
                        </button>
                      </div>
                    </div>

                    {/* Toggle metadata bar */}
                    <button
                      onClick={() => setShowStudentInfo(!showStudentInfo)}
                      className={`flex items-center justify-between p-2.5 border rounded-lg w-full text-left transition-all ${
                        showStudentInfo
                          ? "border-emerald-100 bg-emerald-50/20 text-emerald-900"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500"
                      }`}
                    >
                      <div className="pr-2">
                        <div className="text-xs font-bold">인적 사항 기입란 표시</div>
                        <div className="text-[9px] opacity-75 mt-0.5">상단에 학교/학년/반/성명란을 배치합니다.</div>
                      </div>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center border font-bold ${showStudentInfo ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 text-transparent"}`}>✓</div>
                    </button>

                    <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/50 text-[10.5px] text-amber-800 space-y-1.5 font-medium leading-relaxed">
                      <p className="font-bold text-amber-900 flex items-center gap-1">
                        📢 오류 없는 무결점 PDF 보관법
                      </p>
                      <p>
                        "인쇄 다이얼로그 열기" 클릭 시 대상을 <b>[PDF로 저장]</b>으로 교체하시면, 깨지거나 유실되는 수식과 이미지 없이 완전 고품질 벡터로 영구 저장됩니다!
                      </p>
                      <p className="opacity-90">
                        * 시험지 여백은 인쇄 창 설정에서 [기본] 또는 [없음] 상태로 한층 더 미세 정교하게 균형을 맞추실 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 border-t pt-4 mt-2">
                  <button
                    onClick={() => setShowPrintModal(false)}
                    className="flex-1 py-3 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
                  >
                    이전으로
                  </button>
                  <button
                    onClick={() => {
                      setTimeout(() => {
                        window.print();
                      }, 120);
                    }}
                    className="flex-2 py-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-100/50 transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    PDF 인쇄 다이얼로그 열기
                  </button>
                </div>
              </div>

              {/* Right Side: Virtual interactive simulator of test paper */}
              <div className="w-full md:w-3/5 bg-slate-100 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[460px] max-h-[85vh] overflow-y-auto select-none no-scrollbar">
                <div className="text-[10px] font-bold text-slate-400 self-start mb-2 uppercase tracking-tight">가상 A4 실시간 인쇄용 레이아웃 시뮬레이터 (A4 Aspect Ratio)</div>
                <div className="w-full max-w-[420px] aspect-[1/1.414] bg-white border border-slate-300 shadow-xl rounded-md p-5 text-slate-900 flex flex-col overflow-y-auto text-[10px] scale-95 origin-top relative no-scrollbar select-none">
                  
                  {/* Grid header sheet */}
                  <div className="border-b border-slate-800 pb-2 mb-4">
                    <div className="flex justify-between items-end text-[7px] font-black text-slate-400">
                      <span>{testPaperPeriod}</span>
                      <span className="text-[10px] tracking-widest text-slate-800 font-black">{testPaperSub}</span>
                      <span>f-Equation Studio</span>
                    </div>
                    <div className="text-center my-2 font-black text-xs leading-snug text-slate-800">
                      {testPaperTitle || "무제목 평가지"}
                    </div>
                    {showStudentInfo && (
                      <div className="flex justify-end gap-3 text-[7px] text-slate-400 mt-2 border-t pt-1 border-slate-100 font-mono">
                        <span>학년: ____</span>
                        <span>반: ____</span>
                        <span>이름: __________</span>
                      </div>
                    )}
                  </div>

                  {/* problems inner tree list */}
                  {printColumns === "2col" ? (
                    <div className="grid grid-cols-2 gap-4 relative flex-1 text-[8px] content-start">
                      <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-slate-200 -translate-x-1/2" />
                      {problems.map((p, pidx) => (
                        <div key={p.id} className="pr-1 leading-normal pb-1">
                          <div className="font-black flex gap-1 items-start text-emerald-600 text-[8px] mb-0.5">
                            <span>{pidx + 1}.</span>
                            <span className="text-slate-400 font-medium">({bracketNumber ? `[${p.number}]` : p.number})</span>
                          </div>
                          <div className="pl-2 space-y-1 text-slate-600 text-[7px]">
                            {p.lines.map((ln, lnidx) => {
                              const cleanText = ln.replace(/@IMG:[^@]+@/g, "[그림 데이터]");
                              return <div key={lnidx} className="truncate">{cleanText}</div>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3 flex-1 text-[9px] content-start">
                      {problems.map((p, pidx) => (
                        <div key={p.id} className="pb-1 leading-normal">
                          <div className="font-bold flex gap-1 items-start text-emerald-600 text-[9px] mb-0.5">
                            <span>문제 {pidx + 1}.</span>
                            <span className="text-slate-400 font-medium">({bracketNumber ? `[${p.number}]` : p.number})</span>
                          </div>
                          <div className="pl-3 space-y-1 text-slate-600 text-[8px]">
                            {p.lines.map((ln, lnidx) => {
                              const cleanText = ln.replace(/@IMG:[^@]+@/g, "[그림 데이터]");
                              return <div key={lnidx} className="truncate">{cleanText}</div>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[6px] text-slate-400 text-center mt-auto pt-2 border-t tracking-wider">
                    * Interactive Custom A4 Layout Engine
                  </div>
                </div>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actual printed vector container - hidden inside workspace, shown only for system dialog */}
      <div id="print-section" className="hidden print:block text-black bg-white p-4 font-sans text-xs">
        <div className="border-b-[3px] border-double border-black pb-4 mb-6">
          <div className="flex justify-between items-end text-xs font-bold font-mono">
            <span>{testPaperPeriod}</span>
            <span className="text-xl tracking-[0.25em] font-black">{testPaperSub}</span>
            <span>f-Equation Studio</span>
          </div>
          <div className="text-center my-4">
            <h1 className="text-2xl font-black tracking-wide leading-tight">{testPaperTitle}</h1>
          </div>
          {showStudentInfo && (
            <div className="flex justify-end gap-6 text-xs font-mono border-t pt-2 border-slate-300 mt-2">
              <span>학교: _________________</span>
              <span>학년: _____ 반: _____ 번: _____</span>
              <span>성명: __________________</span>
            </div>
          )}
        </div>

        {printColumns === "2col" ? (
          <div className="grid grid-cols-2 gap-x-12 gap-y-8 relative">
            {/* Split boundary line */}
            <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-slate-300 -translate-x-1/2" />
            {problems.map((prob, idx) => (
              <div key={prob.id} className="print-avoid-break break-inside-avoid relative pb-2 leading-relaxed">
                <div className="flex items-start gap-1 font-bold mb-1.5">
                  <span className="text-xs font-black shrink-0">{idx + 1}.</span>
                  <span className="text-[10px] text-slate-400 font-normal shrink-0">({bracketNumber ? `[${prob.number}]` : prob.number})</span>
                </div>
                <div className="space-y-2 text-xs pl-4 pr-1">
                  {prob.lines.map((line, lIdx) => {
                    if (answersVertical && [...CHOICE_MARKS].filter((c) => line.includes(c)).length >= 2) {
                      const choicesList = [];
                      let currStr = "";
                      for (const symbol of line) {
                        if (CHOICE_MARKS.includes(symbol)) {
                          if (currStr.trim()) choicesList.push(currStr.trim());
                          currStr = symbol;
                        } else {
                          currStr += symbol;
                        }
                      }
                      if (currStr.trim()) choicesList.push(currStr.trim());

                      return (
                        <div key={lIdx} className="space-y-1 pt-1.5">
                          {choicesList.map((ch, chI) => (
                            <LatexPreview key={chI} text={ch} className="text-xs text-slate-900" images={croppedImages} />
                          ))}
                        </div>
                      );
                    }
                    return (
                      <LatexPreview
                        key={lIdx}
                        text={line || " "}
                        className="text-xs text-slate-900 leading-relaxed font-normal"
                        images={croppedImages}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            {problems.map((prob, idx) => (
              <div key={prob.id} className="print-avoid-break break-inside-avoid border-b border-slate-150 pb-6 last:border-b-0 leading-relaxed">
                <div className="flex items-start gap-1 font-bold mb-2">
                  <span className="text-sm font-extrabold text-slate-900 shrink-0">문제 {idx + 1}.</span>
                  <span className="text-[10px] text-slate-400 font-normal shrink-0">({bracketNumber ? `[${prob.number}]` : prob.number})</span>
                </div>
                <div className="space-y-3 pl-6">
                  {prob.lines.map((line, lIdx) => {
                    if (answersVertical && [...CHOICE_MARKS].filter((c) => line.includes(c)).length >= 2) {
                      const choicesList = [];
                      let currStr = "";
                      for (const symbol of line) {
                        if (CHOICE_MARKS.includes(symbol)) {
                          if (currStr.trim()) choicesList.push(currStr.trim());
                          currStr = symbol;
                        } else {
                          currStr += symbol;
                        }
                      }
                      if (currStr.trim()) choicesList.push(currStr.trim());

                      return (
                        <div key={lIdx} className="space-y-1 pt-1">
                          {choicesList.map((ch, chI) => (
                            <LatexPreview key={chI} text={ch} className="text-xs text-slate-900" images={croppedImages} />
                          ))}
                        </div>
                      );
                    }
                    return (
                      <LatexPreview
                        key={lIdx}
                        text={line || " "}
                        className="text-xs text-slate-900 leading-relaxed font-normal"
                        images={croppedImages}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center text-[10px] text-slate-405 mt-24 pt-4 border-t border-slate-200 font-mono">
          * f-Equation Studio AI OCR 수식 출판 시스템 (Vector PDF representation)
        </div>
      </div>

      {/* Humble Footer */}
      <footer className="mt-12 bg-white border-t border-slate-200/50 py-6 text-center text-slate-400">
        <p className="text-[11px] font-mono leading-relaxed">
          &copy; 2026-PRESENT HWPX Math Equation Studio. Powered by Google AI Studio Build.
        </p>
        <p className="text-[10px] text-slate-300 mt-1">
          Supported file imports: .hwpx documents, images & pdf exam papers via Gemini Multi-Modal Model (3.5-flash).
        </p>
      </footer>
    </div>
  );
}
