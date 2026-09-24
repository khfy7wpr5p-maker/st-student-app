const MOBILE_VIEWPORT_MAX_WIDTH = 640;
const MAX_AUTOMATIC_SCALE = 1.28;

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function parseViewBox(svg) {
  const raw = svg?.getAttribute?.("viewBox");
  if (typeof raw !== "string") return null;
  const values = raw.trim().split(/\s+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) return null;
  return Object.freeze({ x: values[0], y: values[1], width: values[2], height: values[3] });
}

function unionBoxes(boxes) {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top });
}

function graphicalBounds(svg) {
  const children = Array.from(svg?.children ?? []);
  const boxes = [];
  for (const child of children) {
    const tag = String(child?.tagName ?? "").toLowerCase();
    if (["rect", "defs", "style", "title", "desc"].includes(tag) || typeof child?.getBBox !== "function") continue;
    try {
      const box = child.getBBox();
      const x = finiteNumber(box?.x);
      const y = finiteNumber(box?.y);
      const width = finiteNumber(box?.width);
      const height = finiteNumber(box?.height);
      if (x !== null && y !== null && width !== null && height !== null && width > 0 && height > 0) {
        boxes.push({ x, y, width, height });
      }
    } catch {
      // Unsupported SVG geometry is ignored; renderer output remains authoritative.
    }
  }
  return unionBoxes(boxes);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fittedViewBox(original, content) {
  const horizontalPadding = Math.max(4, content.width * 0.04);
  const verticalPadding = Math.max(4, content.height * 0.08);
  const paddedWidth = content.width + horizontalPadding * 2;
  const paddedHeight = content.height + verticalPadding * 2;
  const minimumWidth = original.width / MAX_AUTOMATIC_SCALE;
  const width = Math.min(original.width, Math.max(paddedWidth, minimumWidth));
  const height = Math.min(original.height, paddedHeight);
  const centerX = content.x + content.width / 2;
  const centerY = content.y + content.height / 2;
  const x = clamp(centerX - width / 2, original.x, original.x + original.width - width);
  const y = clamp(centerY - height / 2, original.y, original.y + original.height - height);
  return Object.freeze({ x, y, width, height });
}

function applyFit(svg, box) {
  svg.setAttribute("viewBox", [box.x, box.y, box.width, box.height].join(" "));
  svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  svg.removeAttribute?.("width");
  svg.removeAttribute?.("height");
  if (svg.style && typeof svg.style === "object") {
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
  }
}

export function fitNotationViewport(root, { viewportWidth = globalThis?.innerWidth } = {}) {
  if (!Number.isFinite(viewportWidth) || viewportWidth > MOBILE_VIEWPORT_MAX_WIDTH || root === null || typeof root?.querySelectorAll !== "function") {
    return Object.freeze({ fitted: 0 });
  }
  let fitted = 0;
  for (const svg of root.querySelectorAll("svg")) {
    try {
      const original = parseViewBox(svg);
      const content = graphicalBounds(svg);
      if (original === null || content === null) continue;
      applyFit(svg, fittedViewBox(original, content));
      fitted += 1;
    } catch {
      // Presentation fitting must never downgrade otherwise valid notation.
    }
  }
  return Object.freeze({ fitted });
}
