import JSZip from "jszip";
import { Problem, CroppedImage } from "../types";

// Map LaTeX symbols to Hancom HWP math notation
export const LATEX_TO_HWP: { [key: string]: string } = {
  "\\sqrt": "sqrt",
  "\\times": "times",
  "\\div": "div",
  "\\pm": "+-",
  "\\mp": "-+",
  "\\cdot": "cdot",
  "\\cdots": "cdots",
  "\\ldots": "...",
  "\\leq": "<=",
  "\\geq": ">=",
  "\\neq": "!=",
  "\\infty": "inf",
  "\\alpha": "alpha",
  "\\beta": "beta",
  "\\gamma": "gamma",
  "\\delta": "delta",
  "\\theta": "theta",
  "\\pi": "pi",
  "\\lambda": "lambda",
  "\\mu": "mu",
  "\\sigma": "sigma",
  "\\sum": "sum",
  "\\int": "int",
  "\\lim": "lim",
  "\\left": "",
  "\\right": "",
  "\\overline": "bar",
  "\\bar": "bar",
};

/**
 * Clean up LaTeX \frac{a}{b} expressions into HWP {a} over {b} format (handles nested fractions recursively)
 */
export function convertLatexFracToHwp(s: string): string {
  function findBrace(text: string, start: number): number {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") {
        depth++;
      } else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  while (s.includes("\\frac")) {
    const idx = s.indexOf("\\frac");
    const b1 = s.indexOf("{", idx);
    if (b1 === -1) break;
    const b1e = findBrace(s, b1);
    if (b1e === -1) break;
    const num = s.substring(b1 + 1, b1e);

    const b2 = s.indexOf("{", b1e);
    if (b2 === -1) break;
    const b2e = findBrace(s, b2);
    if (b2e === -1) break;
    const den = s.substring(b2 + 1, b2e);

    const repl = "{" + num + "} over {" + den + "}";
    s = s.substring(0, idx) + repl + s.substring(b2e + 1);
  }
  return s;
}

/**
 * Converts a standard LaTeX math string to the Hancom HWP math equation format
 */
export function latexToHwp(latex: string): string {
  let s = latex.trim();
  // Remove starting/ending $ or $$ if any
  s = s.replace(/^\$\$?/, "").replace(/\$\$?$/, "");

  // Convert fractions recursively
  s = convertLatexFracToHwp(s);

  // Replace backslashed symbols with Space-padded HWP syntax
  for (const [tex, hwp] of Object.entries(LATEX_TO_HWP)) {
    const escapedTex = tex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedTex, "g");
    s = s.replace(regex, " " + hwp + " ");
  }

  // Remove other stray latex tags
  s = s.replace(/\\/g, "");

  // Clean continuous spacing
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Standardize HWP equation:
 * - Convert LaTeX macros if needed
 * - Flatten spaces
 * - Append ` (tick spacing) for text margin (aesthetic HWP standard)
 */
export function normalizeEqn(script: string, addTrailingSpace = true): string {
  if (script.includes("\\")) {
    script = latexToHwp(script);
  }
  script = script.replace(/[ \t]+/g, " ").trim();
  if (addTrailingSpace && script && !script.endsWith("`")) {
    script = script + "`";
  }
  return script;
}

/**
 * Estimate accurate HwpUnit dimensions for Hancom so the equation renders crisply on load
 */
export function estimateEqnSize(script: string): { width: number; height: number; baseLine: number } {
  const CW: { [key: string]: number } = {
    '(': 460, ')': 501, '+': 1015, ',': 434, '-': 961, '.': 253, '/': 460,
    '0': 564, '1': 561, '2': 561, '3': 595, '4': 588, '5': 585,
    '6': 599, '7': 607, '8': 576, '9': 615, '=': 1153,
    'a': 603, 'b': 491, 'c': 472, 'd': 530, 'e': 500, 'f': 535,
    'g': 530, 'h': 530, 'i': 280, 'j': 280, 'k': 600, 'l': 367,
    'm': 1012, 'n': 560, 'o': 530, 'p': 530, 'q': 530, 'r': 400,
    's': 460, 't': 360, 'u': 560, 'v': 530, 'w': 780, 'x': 664,
    'y': 605, 'z': 500, '|': 218, '℃': 1042, '`': 58, ' ': 0,
    '<': 1153, '>': 1153, '!': 280, '*': 560,
  };

  const DEFAULT_CW = 560;
  const FRAC_PAD = 560;
  const SUP_RATIO = 0.65;

  const textWidth = (s: string) => [...s].reduce((acc, c) => acc + (CW[c] ?? DEFAULT_CW), 0);

  const readToken = (s: string): [string, number] => {
    const s2 = s.trimStart();
    const lead = s.length - s2.length;
    if (!s2) return ["", lead];

    if (s2[0] === "{") {
      let depth = 0;
      for (let j = 0; j < s2.length; j++) {
        if (s2[j] === "{") depth++;
        else if (s2[j] === "}") {
          depth--;
          if (depth === 0) return [s2.substring(1, j), lead + j + 1];
        }
      }
      return [s2.substring(1), lead + s2.length];
    }

    const m = s2.match(/^[0-9a-zA-Z]+/);
    if (m) return [m[0], lead + m[0].length];
    return [s2[0], lead + 1];
  };

  const measure = (s: string): number => {
    s = s.trim();
    if (!s) return 0;
    let total = 0;
    let i = 0;

    while (i < s.length) {
      if (s.substring(i, i + 4) === "over" && (i === 0 || !/[a-zA-Z0-9]/.test(s[i - 1])) && (i + 4 >= s.length || !/[a-zA-Z0-9]/.test(s[i + 4]))) {
        i += 4;
        continue;
      }

      if (s[i] === "{") {
        let d = 0;
        let j = i;
        while (j < s.length) {
          if (s[j] === "{") d++;
          else if (s[j] === "}") {
            d--;
            if (d === 0) break;
          }
          j++;
        }
        const inner = s.substring(i + 1, j);
        const rest = s.substring(j + 1).trimStart();

        if (rest.startsWith("over")) {
          const after = s.substring(j + 1);
          const k = after.indexOf("over") + 4;
          const [denStr, consumed] = readToken(after.substring(k));
          const numW = measure(inner);
          const denW = measure(denStr);
          total += Math.max(numW, denW) + FRAC_PAD;
          i = j + 1 + k + consumed;
          continue;
        } else {
          total += measure(inner);
          i = j + 1;
          continue;
        }
      }

      if (s[i] === "^" || s[i] === "_") {
        const [tok, consumed] = readToken(s.substring(i + 1));
        total += Math.floor(measure(tok) * SUP_RATIO);
        i += 1 + consumed;
        continue;
      }

      const simpleFrac = s.substring(i).match(/^([0-9a-zA-Z]+)over([0-9a-zA-Z]+)/);
      if (simpleFrac) {
        const numW = textWidth(simpleFrac[1]);
        const denW = textWidth(simpleFrac[2]);
        total += Math.max(numW, denW) + FRAC_PAD;
        i += simpleFrac[0].length;
        continue;
      }

      if (s.substring(i, i + 2) === "rm") {
        i += 2;
        const unitMatch = s.substring(i).match(/^[a-zA-Z]+/);
        if (unitMatch) {
          total += unitMatch[0].length * 575;
          i += unitMatch[0].length;
        }
        continue;
      }

      if (s.substring(i, i + 3) === "ita") {
        i += 3;
        continue;
      }

      const mc = s.substring(i).match(/^[a-zA-Z]+/);
      if (mc) {
        const word = mc[0];
        const CMD: { [key: string]: number } = {
          'sqrt': 700, 'times': 800, 'cdot': 300, 'cdots': 900,
          'left': 200, 'right': 200,
          'bar': 0, 'vec': 0, 'hat': 0, 'alpha': 600, 'beta': 600,
          'pi': 600, 'theta': 600, 'sum': 800, 'int': 700,
          'lim': 900, 'inf': 700, 'triangle': 1100, 'cases': 0,
          'neq': 1153, 'leq': 1153, 'geq': 1153
        };
        total += CMD[word] ?? textWidth(word);
        i += word.length;
        continue;
      }

      total += CW[s[i]] ?? DEFAULT_CW;
      i += 1;
    }
    return total;
  };

  const width = Math.max(Math.floor(measure(script)), 300);
  let height = 1000;
  let baseLine = 86;

  if (script.includes("cases") || script.includes("#")) {
    height = 4650;
    baseLine = 58;
  } else if (script.includes("over") || script.includes("sqrt")) {
    height = 2250;
    baseLine = 66;
  } else if (script.includes("^") || script.includes("_")) {
    height = 1175;
    baseLine = 88;
  }

  return { width, height, baseLine };
}

/**
 * Split a paragraph line into textual and equation segments
 */
export function parseMarkup(line: string): { type: "t" | "e"; content: string }[] {
  const segs: { type: "t" | "e"; content: string }[] = [];
  let buf = "";
  let i = 0;

  while (i < line.length) {
    if (line[i] === "«") {
      if (buf) {
        segs.push({ type: "t", content: buf });
        buf = "";
      }
      const j = line.indexOf("»", i);
      if (j === -1) {
        buf += line[i];
        i++;
        continue;
      }
      segs.push({ type: "e", content: line.substring(i + 1, j) });
      i = j + 1;
    } else {
      buf += line[i];
      i++;
    }
  }

  if (buf) {
    segs.push({ type: "t", content: buf });
  }

  return segs;
}

/**
 * Converts 원문자 (①-⑤) back and forth
 */
const CHOICE_MARKS = "①②③④⑤⑥⑦⑧⑨⑩";
function isChoiceLine(line: string): boolean {
  return [...CHOICE_MARKS].filter((c) => line.includes(c)).length >= 2;
}

function splitChoices(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  for (const char of line) {
    if (CHOICE_MARKS.includes(char)) {
      if (cur.trim()) result.push(cur.trim());
      cur = char;
    } else {
      cur += char;
    }
  }
  if (cur.trim()) result.push(cur.trim());
  return result;
}

/**
 * Main Export Builder: Generates fully-valid HWPX zip files client-side!
 */
export async function generateHwpxBlob(
  problems: Problem[],
  croppedImages: CroppedImage[] = [],
  options: {
    fontName?: string;
    answersVertical?: boolean;
    leftAlign?: boolean;
    bracketNumber?: boolean;
  } = {}
): Promise<Blob> {
  const zip = new JSZip();

  const fontName = options.fontName || "나눔바른고딕 옛한글";
  const leftAlign = options.leftAlign !== false; // default true
  const answersVertical = options.answersVertical ?? true;
  const bracketNumber = options.bracketNumber ?? true;

  // 1. mimetype (must be uncompressed method 0)
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });

  // 2. META-INF/container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="Contents/content.hpf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // 3. Contents/content.hpf (manifest)
  let imgManifest = "";
  croppedImages.forEach((img) => {
    imgManifest += `    <opf:item id="${img.id}" href="BinData/${img.id}.png" media-type="image/png" isEmbeded="1"/>\n`;
  });

  zip.file(
    "Contents/content.hpf",
    `<?xml version="1.0" encoding="utf-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <opf:metadata>
    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">HWPX Export</dc:title>
    <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">HWPX Equation Studio</dc:creator>
    <opf:meta name="title" content="HWPX Export"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
${imgManifest}  </opf:manifest>
  <opf:spine toc="ncx">
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`
  );

  // 4. Contents/header.xml
  const justifyAttribute = leftAlign ? "LEFT" : "JUSTIFY";
  zip.file(
    "Contents/header.xml",
    `<?xml version="1.0" encoding="utf-8"?>
<hh:header xmlns:hh="http://www.hancom.co.kr/hwpml/2011/header" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.0">
  <hh:beginNum seqNo="1" eqnNo="1" picNo="1" tblNo="1" pageNo="1"/>
  <hh:fontfaces itemCnt="1">
    <hh:fontface lang="HANGUL" itemCnt="1">
      <hh:font id="0" face="${fontName}" type="TTF"/>
    </hh:fontface>
  </hh:fontfaces>
  <hh:charPrs itemCnt="1">
    <hh:charPr id="0" height="1000" textColor="#000000">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    </hh:charPr>
  </hh:charPrs>
  <hh:paraPrs itemCnt="2">
    <hh:paraPr id="0" breakRatio="100">
      <hh:align horzAlign="${justifyAttribute}"/>
      <hh:lineSpacing type="PERCENT" value="160"/>
    </hh:paraPr>
    <hh:paraPr id="1" breakRatio="100">
      <hh:align horzAlign="CENTER"/>
      <hh:lineSpacing type="PERCENT" value="160"/>
    </hh:paraPr>
  </hh:paraPrs>
  <hh:stylePrs itemCnt="1">
    <hh:stylePr id="0" name="Normal" charPrIDRef="0" paraPrIDRef="0"/>
  </hh:stylePrs>
</hh:header>`
  );

  // 5. Build section0 body XML paragraphs dynamically!
  let pXml = "";
  let eqCounter = 1;
  let imageCounter = 1;

  // Helper inside loop to compile lines
  const writeLineParagraphPrs = (lineContent: string) => {
    // Check if line contains any image tokens, e.g. @IMG:imgC1@
    let containsImage = false;
    let imageRefId = "";

    croppedImages.forEach((img) => {
      if (lineContent.includes(`@IMG:${img.id}@`)) {
        containsImage = true;
        imageRefId = img.id;
      }
    });

    // Paragraph tag with center aligning if matching graphics placeholder
    const paraPrId = containsImage ? "1" : "0";
    let nodeStr = `  <hp:p paraPrIDRef="${paraPrId}">\n`;
    nodeStr += `    <hp:run charPrIDRef="0">\n`;

    if (containsImage && imageRefId) {
      // Inline picture block XML
      const activeImg = croppedImages.find((img) => img.id === imageRefId);
      const disp_w = activeImg?.width || 38000;
      const disp_h = activeImg?.height || 25000;
      const picId = 2000000000 + imageCounter++;

      const picXml = `<hp:pic id="${picId}" zOrder="0" numberingType="PICTURE" textWrap="SQUARE" textFlow="BOTH_SIDES" lock="0" groupLevel="0" instid="${picId}" reverse="0">
        <hp:offset x="0" y="0"/>
        <hp:orgSz width="${disp_w}" height="${disp_h}"/>
        <hp:curSz width="${disp_w}" height="${disp_h}"/>
        <hp:flip horizontal="0" vertical="0"/>
        <hp:rotationInfo angle="0" centerX="${Math.floor(disp_w / 2)}" centerY="${Math.floor(disp_h / 2)}"/>
        <hp:renderingInfo>
          <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
          <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
          <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
        </hp:renderingInfo>
        <hp:imgRect>
          <hc:pt0 x="0" y="0"/><hc:pt1 x="${disp_w}" y="0"/>
          <hc:pt2 x="${disp_w}" y="${disp_h}"/><hc:pt3 x="0" y="${disp_h}"/>
        </hp:imgRect>
        <hp:imgClip left="0" right="0" top="0" bottom="0"/>
        <hp:inMargin left="0" right="0" top="0" bottom="0"/>
        <hc:img binaryItemIDRef="${imageRefId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
        <hp:effects/>
        <hp:sz width="${disp_w}" widthRelTo="ABSOLUTE" height="${disp_h}" heightRelTo="ABSOLUTE" protect="0"/>
        <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/>
        <hp:outMargin left="0" right="0" top="0" bottom="0"/>
        <hp:shapeComment>그림입니다.</hp:shapeComment>
      </hp:pic>`;

      // Split at the token
      const parts = lineContent.split(`@IMG:${imageRefId}@`);
      nodeStr += `      <hp:t>${escapeXml(parts[0])}</hp:t>\n`;
      nodeStr += `      ${picXml}\n`;
      nodeStr += `      <hp:t>${escapeXml(parts[1] || "")}</hp:t>\n`;
    } else {
      // Normal text with optional equations
      const segments = parseMarkup(lineContent);
      segments.forEach((seg) => {
        if (seg.type === "t") {
          nodeStr += `      <hp:t>${escapeXml(seg.content)}</hp:t>\n`;
        } else {
          // Normalize and estimate sizing for Hancom editor engine
          const rawScript = seg.content;
          const script = normalizeEqn(rawScript);
          const { width, height, baseLine } = estimateEqnSize(script);
          const eqId = eqCounter++;

          nodeStr += `      <hp:equation id="${eqId}" zOrder="0" numberingType="EQUATION" textWrap="SQUARE" textFlow="BOTH_SIDES" lock="0" version="Equation Version 60" baseLine="${baseLine}" textColor="#000000" baseUnit="1000" lineMode="CHAR">
            <hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>
            <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>
            <hp:outMargin left="56" right="56" top="0" bottom="0"/>
            <hp:shapeComment>수식입니다.</hp:shapeComment>
            <hp:script>${escapeXml(script)}</hp:script>
          </hp:equation>\n`;
        }
      });
    }

    nodeStr += `    </hp:run>\n`;
    nodeStr += `  </hp:p>\n`;
    return nodeStr;
  };

  problems.forEach((p) => {
    // Problem block title e.g. [0001]
    const header = bracketNumber ? `[${p.number}]` : p.number;
    pXml += `  <hp:p paraPrIDRef="0">\n    <hp:run charPrIDRef="0">\n      <hp:t>${escapeXml(header)}</hp:t>\n    </hp:run>\n  </hp:p>\n`;

    p.lines.forEach((line) => {
      if (!line.trim()) {
        pXml += `  <hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p>\n`;
      } else if (answersVertical && isChoiceLine(line)) {
        // Break multiple choices into separate sequential paragraphs
        const choices = splitChoices(line);
        choices.forEach((choice) => {
          pXml += writeLineParagraphPrs(choice);
        });
      } else {
        pXml += writeLineParagraphPrs(line);
      }
    });

    // Spacer paragraph at problem bottom
    pXml += `  <hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p>\n`;
  });

  zip.file(
    "Contents/section0.xml",
    `<?xml version="1.0" encoding="utf-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:opf="http://www.idpf.org/2007/opf">
${pXml}</hs:sec>`
  );

  // 6. Write binary image data under Contents/BinData to align with href="BinData/..."
  croppedImages.forEach((img) => {
    const binary = atob(img.dataUrl.split(",")[1]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) {
      bytes[j] = binary.charCodeAt(j);
    }
    zip.file(`Contents/BinData/${img.id}.png`, bytes);
  });

  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6
    }
  });
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/**
 * Parsing function that reads an uploaded HWPX document (XML) and reconstructs
 * the Problem structures & equations for fully visual, bidirectional high-fidelity editing!
 */
export async function parseHwpxBlob(file: File): Promise<{ problems: Problem[]; error?: string }> {
  try {
    const zip = await JSZip.loadAsync(file);
    const section0Xml = await zip.file("Contents/section0.xml")?.async("string");

    if (!section0Xml) {
      return { problems: [], error: "section0.xml not found. Invalid or corrupted HWPX file structure." };
    }

    // A lightweight string/XML parser for paragraph sequences <hp:p>
    const parser = new DOMParser();
    const doc = parser.parseFromString(section0Xml, "application/xml");
    const pNodes = doc.getElementsByTagNameNS("http://www.hancom.co.kr/hwpml/2011/paragraph", "p");

    const problems: Problem[] = [];
    let currentProblem: Problem | null = null;

    for (let i = 0; i < pNodes.length; i++) {
      const pNode = pNodes[i];
      let rowText = "";

      // Loop runs <hp:run> inside paragraph
      const runs = pNode.getElementsByTagNameNS("http://www.hancom.co.kr/hwpml/2011/paragraph", "run");
      for (let r = 0; r < runs.length; r++) {
        const run = runs[r];
        // Children of run in order (t vs equation)
        for (let c = 0; c < run.childNodes.length; c++) {
          const child = run.childNodes[c];
          const localName = (child as any).localName;

          if (localName === "t") {
            rowText += child.textContent || "";
          } else if (localName === "equation") {
            const scriptNode = (child as Element).getElementsByTagNameNS("http://www.hancom.co.kr/hwpml/2011/paragraph", "script")[0];
            if (scriptNode) {
              const rawScript = scriptNode.textContent || "";
              // Remove trailing backtick tick (`), formatting-only token
              const cleanedScript = rawScript.endsWith("`") ? rawScript.slice(0, -1) : rawScript;
              rowText += `«${cleanedScript}»`;
            }
          }
        }
      }

      const trimmedRow = rowText.trim();
      // Heuristic: Is it a paragraph header [0001] or [1] or 01. or [01]?
      const isHeaderMatch = trimmedRow.match(/^\[([a-zA-Z0-9]+)\]$/) || trimmedRow.match(/^([0-9]+)\.?$/);

      if (isHeaderMatch) {
        if (currentProblem) {
          problems.push(currentProblem);
        }
        currentProblem = {
          id: Math.random().toString(36).substring(2, 9),
          number: isHeaderMatch[1] || isHeaderMatch[2],
          lines: [],
        };
      } else {
        if (currentProblem) {
          // If empty paragraph and last item in problem is already empty, ignore double spacing
          if (trimmedRow === "" && currentProblem.lines[currentProblem.lines.length - 1] === "") {
            continue;
          }
          currentProblem.lines.push(rowText); // retain tabs/spacing
        } else if (trimmedRow !== "") {
          // Create orphan root problem if no headers present
          currentProblem = {
            id: Math.random().toString(36).substring(2, 9),
            number: "01",
            lines: [rowText],
          };
        }
      }
    }

    if (currentProblem) {
      problems.push(currentProblem);
    }

    // Clean blank lines at end of each problem
    problems.forEach((p) => {
      while (p.lines.length > 0 && p.lines[p.lines.length - 1].trim() === "") {
        p.lines.pop();
      }
    });

    return { problems };
  } catch (err: any) {
    console.error("Error parsing HWPX ZIP", err);
    return { problems: [], error: err.message || "Unpacking failed. Make sure the file is a valid .hwpx document." };
  }
}
