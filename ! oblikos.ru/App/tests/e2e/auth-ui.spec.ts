import { test, expect } from "@playwright/test";

test("auth forms preserve composition and fit desktop and mobile", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [900, 720], [768, 1024], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    for (const mode of ["login", "register"]) {
      await page.goto(`/${mode}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".auth-split__content > .brand")).toBeVisible();
      expect(await page.locator(".auth-card").evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
      if (width >= 900) {
        await expect(page.locator(".auth-visual")).toBeVisible();
        await expect.poll(() => page.locator(".auth-visual img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 1)).toBe(true);
        const formSide = await page.locator(".auth-split__form-side").boundingBox();
        // The existing stable scrollbar gutter reduces available layout width.
        const split = await page.locator(".auth-split").boundingBox();
        expect(formSide!.width / split!.width).toBeCloseTo(0.41, 2);
      } else {
        await expect(page.locator(".auth-visual")).toBeHidden();
        expect(await page.locator(".auth-visual img").evaluate((image: HTMLImageElement) => image.currentSrc)).toMatch(/^data:/);
        expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("character-portrait.webp")))).toBe(false);
      }
      await expect(page.getByText("Недоступные способы входа ещё не настроены.")).toHaveCount(0);
      for (const provider of ["Яндекс ID", "VK ID"]) {
        const button = page.getByRole("button", { name: `Продолжить с ${provider}` });
        await expect(button).toBeDisabled();
        await expect(button.locator(".oauth-button__icon")).toHaveCount(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (mode === "register") {
        await expect(page.getByText("Минимум 8 символов.", { exact: true })).toBeVisible();
        await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute("maxlength", "128");
      } else {
        const input = await page.getByLabel("Пароль", { exact: true }).boundingBox();
        const link = await page.getByRole("link", { name: "Забыли пароль?" }).boundingBox();
        expect(link!.y - input!.y - input!.height).toBeLessThanOrEqual(5);
        expect(Math.abs(link!.x + link!.width - input!.x - input!.width)).toBeLessThan(1);
      }
      await page.screenshot({ path: `artifacts/auth-ui-${mode}-${width}.png`, fullPage: true });
    }
  }
});

test("validation errors stay beside fields and reuse their reserved space", async ({ page }) => {
  await page.goto("/register");
  const button = page.getByRole("button", { name: "Создать аккаунт", exact: true });
  const before = await button.boundingBox();
  await button.click();
  await expect(page.locator("#auth-email-feedback")).toHaveText("Введите email.");
  await expect(page.locator("#auth-password-feedback")).toHaveText("Введите пароль.");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  const after = await button.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  await page.getByLabel("Email", { exact: true }).fill("invalid-email");
  await page.getByLabel("Пароль", { exact: true }).fill("short");
  await page.getByLabel("Повторите пароль").fill("different");
  await button.click();
  await expect(page.locator("#auth-email-feedback")).toHaveText("Введите корректный email.");
  await expect(page.locator("#auth-password-feedback")).toHaveText("Пароль должен содержать не менее 8 символов.");
  await expect(page.locator("#auth-confirmation-feedback")).toHaveText("Пароли не совпадают.");
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email", { exact: true }).fill("ui-check@example.com");
  await page.getByLabel("Пароль", { exact: true }).fill("valid-password-123");
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await button.click();
  await expect(page.getByLabel("Повторите пароль")).toBeFocused();
  await page.screenshot({ path: "artifacts/auth-ui-validation.png", fullPage: true });
});

test("inputs and submit buttons have consistent interaction states", async ({ page }) => {
  for (const mode of ["login", "register"]) {
    await page.goto(`/${mode}`);
    const input = page.getByLabel("Email", { exact: true });
    const button = page.locator("button[type=submit]");
    const border = await input.evaluate((element) => getComputedStyle(element).borderColor);
    await input.hover();
    await expect.poll(() => input.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(border);
    await input.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const hoverBorder = await input.evaluate((element) => getComputedStyle(element).borderColor);
    await input.focus();
    await page.mouse.move(0, 0);
    await expect.poll(() => input.evaluate((element) => getComputedStyle(element).borderColor)).toBe(hoverBorder);
    expect(await input.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
    const background = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
    await button.hover();
    await expect.poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(background);
    await page.mouse.down();
    expect(await button.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  await page.goto("/login?error=ProviderUnavailable");
  await expect(page.locator(".form-message")).toHaveText("Не удалось войти этим способом. Попробуйте другой.");
});

test("submission shows loading, prevents retries and recovers from errors", async ({ page }) => {
  for (const mode of ["login", "register"] as const) {
    await page.goto(`/${mode}`);
    await page.getByLabel("Email", { exact: true }).fill("ui-check@example.com");
    await page.getByLabel("Пароль", { exact: true }).fill("valid-password-123");
    if (mode === "register") await page.getByLabel("Повторите пароль").fill("valid-password-123");
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let requests = 0;
    const path = mode === "login" ? "**/api/auth/callback/credentials" : "**/register";
    await page.route(path, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests++;
      await held;
      if (mode === "login") {
        await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ url: `${new URL(page.url()).origin}/login?error=CredentialsSignin` }) });
      } else {
        await route.abort("failed");
      }
    });
    await page.getByRole("button", { name: mode === "login" ? "Войти" : "Создать аккаунт", exact: true }).click();
    const loading = page.getByRole("button", { name: mode === "login" ? "Входим..." : "Создаём аккаунт...", exact: true });
    await expect(loading).toBeDisabled();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
    await expect.poll(() => requests).toBe(1);
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(requests).toBe(1);
    await page.screenshot({ path: `artifacts/auth-ui-${mode}-loading.png`, fullPage: true });
    release();
    await expect(page.locator(".form-message[role=alert]")).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeEnabled();
    await expect(page.locator("button[type=submit]")).toBeEnabled();
    await page.unroute(path);
  }
});
