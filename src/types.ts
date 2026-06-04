export interface Problem {
  id: string; // Unique transient UUID or layout identifier
  number: string; // User-facing problem number e.g. "01", "24"
  lines: string[]; // Problem body rows. Rows containing "①" represent multi-choice selections.
}

export interface CroppedImage {
  id: string; // Unique image ID e.g. "imgC1"
  token: string; // Placeholder string matching `@IMG:id@` inside problem text
  dataUrl: string; // Base64 PNG image source
  width?: number; // Custom HwpUnit display width
  height?: number; // Custom HwpUnit display height
}

export interface MathSegment {
  type: "t" | "e"; // "t" = plain text, "e" = HWP formula script
  content: string;
}
