import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL(
  "../.github/workflows/ci.yml",
  import.meta.url,
);

test("main CI publishes the current Student shell to the existing GitHub Pages site", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /^  deploy-pages:\n/m);
  assert.match(
    workflow,
    /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(
    workflow,
    /needs: \[test, renderer-runtime, tab-browser\]/,
  );
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /cp index\.html service-worker\.js _site\//);
  assert.match(workflow, /cp -R src vendor _site\//);
  assert.match(workflow, /uses: actions\/configure-pages@v5/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /uses: actions\/deploy-pages@v4/);
});
