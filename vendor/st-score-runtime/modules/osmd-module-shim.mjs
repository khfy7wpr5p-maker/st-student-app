const OpenSheetMusicDisplay = globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay;

if (OpenSheetMusicDisplay === undefined) {
  throw new Error("OSMD browser global is unavailable inside the renderer-owned runtime.");
}

export { OpenSheetMusicDisplay };
export default { OpenSheetMusicDisplay };
