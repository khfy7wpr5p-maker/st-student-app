const INVITE_FRAGMENT_PATTERN = /^#\/invite\/([A-Za-z0-9._~-]{1,2048})$/u;

export function parseInviteFragment(hash) {
  if (typeof hash !== "string") {
    return null;
  }

  const match = INVITE_FRAGMENT_PATTERN.exec(hash);
  return match === null ? null : match[1];
}

export function stripInviteFragment({
  historyObject = globalThis.history,
  locationObject = globalThis.location,
} = {}) {
  if (parseInviteFragment(locationObject?.hash) === null) {
    return false;
  }

  if (typeof historyObject?.replaceState !== "function") {
    return false;
  }

  const pathname =
    typeof locationObject?.pathname === "string" ? locationObject.pathname : "/";
  const search =
    typeof locationObject?.search === "string" ? locationObject.search : "";

  historyObject.replaceState(null, "", `${pathname}${search}`);
  return true;
}
