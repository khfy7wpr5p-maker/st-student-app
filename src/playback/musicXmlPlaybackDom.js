export function localNameOf(node) {
  if (node === null || node === undefined) {
    return "";
  }

  if (typeof node.localName === "string" && node.localName.length > 0) {
    return node.localName;
  }

  const name = typeof node.nodeName === "string" ? node.nodeName : "";
  const separator = name.indexOf(":");
  return separator >= 0 ? name.slice(separator + 1) : name;
}

export function elementChildren(node) {
  const list = node?.childNodes;

  if (list === null || list === undefined) {
    return [];
  }

  return Array.from(list).filter((child) => child?.nodeType === 1);
}

export function childrenNamed(node, name) {
  return elementChildren(node).filter(
    (child) => localNameOf(child) === name,
  );
}

export function firstChildNamed(node, name) {
  return childrenNamed(node, name)[0] ?? null;
}

export function textOf(node) {
  return typeof node?.textContent === "string"
    ? node.textContent.trim()
    : "";
}

export function numberText(node) {
  const value = Number(textOf(node));
  return Number.isFinite(value) ? value : null;
}

export function hasDescendantNamed(node, name) {
  for (const child of elementChildren(node)) {
    if (
      localNameOf(child) === name ||
      hasDescendantNamed(child, name)
    ) {
      return true;
    }
  }

  return false;
}

export function createBrowserMusicXmlParser() {
  return Object.freeze({
    parse(xml) {
      if (typeof globalThis.DOMParser !== "function") {
        return null;
      }

      try {
        return new globalThis.DOMParser().parseFromString(
          xml,
          "application/xml",
        );
      } catch {
        return null;
      }
    },
  });
}
