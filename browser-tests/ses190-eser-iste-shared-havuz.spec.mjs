import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

let server;
let baseUrl;

before(async () => {
  server = await startRepositoryStaticServer();
  baseUrl = server.baseUrl;
});

after(async () => {
  if (server) {
    await server.close();
  }
});

test(
  "SES-190 request form and shared Havuz stay accessible and presentation-only",
  { timeout: 60_000 },
  async () => {
    const browserName = process.env.ST_BROWSER ?? "chromium";
    const browserType = { chromium, webkit }[browserName];
    assert.ok(browserType, `Unsupported ST_BROWSER: ${browserName}`);

    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(`${baseUrl}/index.html`);
      assert.equal(response.status(), 200);

      await page.evaluate(async () => {
        const [{ renderStudentApp }, { STUDENT_APP_SCREENS }] =
          await Promise.all([
            import("/src/ui/renderStudentApp.js"),
            import("/src/ui/studentAppController.js"),
          ]);

        document.body.innerHTML = renderStudentApp({
          student08: true,
          screen: STUDENT_APP_SCREENS.MY_WORK,
          session: { studentId: "student-a" },
          assignmentState: "ACTIVE",
          items: [],
          practice: null,
        });
      });

      const workSection = page.getByRole("heading", {
        name: "Benim Çalışmalarım",
      }).locator("xpath=ancestor::section[1]");
      await assert.doesNotReject(() =>
        workSection.getByRole("button", { name: "Eser İste" }).waitFor(),
      );
      await assert.doesNotReject(() =>
        workSection.getByRole("button", { name: "Havuz" }).waitFor(),
      );

      await page.evaluate(async () => {
        const [{ renderStudentApp }, { STUDENT_APP_SCREENS }] =
          await Promise.all([
            import("/src/ui/renderStudentApp.js"),
            import("/src/ui/studentAppController.js"),
          ]);

        document.body.innerHTML = renderStudentApp({
          student08: true,
          screen: STUDENT_APP_SCREENS.WORK_REQUEST,
          session: { studentId: "student-a" },
          items: [],
          practice: null,
          workRequestStatus: "success",
        });
      });

      await page.getByLabel("Eser adı").fill("Carcassi Op. 60 No. 3");
      await assert.doesNotReject(() =>
        page.getByRole("button", { name: "Gönder" }).waitFor(),
      );
      await assert.doesNotReject(() =>
        page.getByText("İsteğiniz öğretmeninize gönderildi.").waitFor(),
      );

      await page.evaluate(async () => {
        const [{ renderStudentApp }, { STUDENT_APP_SCREENS }] =
          await Promise.all([
            import("/src/ui/renderStudentApp.js"),
            import("/src/ui/studentAppController.js"),
          ]);

        document.body.innerHTML = renderStudentApp({
          student08: true,
          screen: STUDENT_APP_SCREENS.SHARED_REQUEST_POOL,
          session: { studentId: "student-b" },
          items: [{
            title: "Carcassi Op. 60 No. 3",
            displayNameOrNickname: "Ahmet",
            requestId: "request-secret",
            studentId: "student-secret",
            teacherId: "teacher-secret",
          }],
          practice: null,
        });
      });

      await assert.doesNotReject(() =>
        page.getByText("Carcassi Op. 60 No. 3").waitFor(),
      );
      await assert.doesNotReject(() => page.getByText("Ahmet").waitFor());
      assert.equal(await page.getByText("Aktife Al").count(), 0);
      assert.equal(await page.getByText("Repertuara Al").count(), 0);
      assert.equal(await page.getByText("Kaldır").count(), 0);

      const bodyText = await page.locator("body").innerText();
      const bodyHtml = await page.locator("body").innerHTML();
      assert.equal(bodyText.includes("request-secret"), false);
      assert.equal(bodyText.includes("student-secret"), false);
      assert.equal(bodyText.includes("teacher-secret"), false);
      assert.equal(bodyHtml.includes("data-request-id"), false);
      assert.equal(bodyHtml.includes("data-student-id"), false);
      assert.equal(bodyHtml.includes("data-teacher-id"), false);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert.ok(
        overflow.scrollWidth <= overflow.clientWidth,
        `horizontal overflow: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
      );
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
    }
  },
);