import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { listBlogPosts, getBlogPost } from "../../src/features/blog/repository";

test("public blog: cards, filters, navigation and sitemap", async ({ page, request }) => {
  const posts = await listBlogPosts();
  const response = await page.goto("/blog");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Блог Oblik OS");
  await expect(page.locator(".blog-card")).toHaveCount(5);
  await page.getByRole("button", { name: "Кейсы", exact: true }).click();
  await expect(page.locator(".blog-card")).toHaveCount(0);
  await expect(page.getByText("В этой категории пока нет статей.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "AI-персонажи", exact: true }).click();
  await expect(page.locator(".blog-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Все статьи", exact: true }).click();
  await page.locator(".blog-card__link").first().click();
  await expect(page).toHaveURL(new RegExp(`/blog/${posts[0].slug}$`));
  await expect(page.getByRole("link", { name: "Создать своего AI-персонажа", exact: true })).toHaveAttribute("href", "https://app.oblikos.ru/register");
  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.status()).toBe(200);
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain("<loc>https://oblikos.ru/</loc>");
  expect(sitemap).toContain("<loc>https://oblikos.ru/blog</loc>");
  for (const post of posts) expect(sitemap).toContain(`<loc>https://oblikos.ru/blog/${post.slug}</loc>`);
  expect(sitemap).not.toContain("/dashboard");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: https://oblikos.ru/sitemap.xml");
  expect(robots).toContain("Allow: /blog");
});

test("all articles: server-rendered content, metadata, schema, images and TOC", async ({ page, request }) => {
  const posts = await listBlogPosts();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const summary of posts) {
    const post = (await getBlogPost(summary.slug))!;
    const wordCount = post.content.trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(500);
    expect(wordCount).toBeLessThanOrEqual(800);
    const response = await page.goto(`/blog/${post.slug}`);
    expect(response?.status()).toBe(200);
    const html = await response!.text();
    expect(html).toContain(post.title);
    expect(html).toContain("application/ld+json");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(post.title);
    await expect(page).toHaveTitle(`${post.title} · Oblik OS`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", post.description);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://oblikos.ru/blog/${post.slug}`);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `https://oblikos.ru/blog/${post.slug}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `https://oblikos.ru${post.coverImage}`);
    await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute("content", post.publishedAt);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    const schema = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(schema[0]["@type"]).toBe("BreadcrumbList");
    expect(schema[0].itemListElement).toHaveLength(3);
    expect(schema[1]["@type"]).toBe("BlogPosting");
    expect(schema[1].headline).toBe(post.title);
    expect(schema[1].dateModified).toBe(post.updatedAt ?? post.publishedAt);
    expect(schema[1].mainEntityOfPage["@id"]).toBe(`https://oblikos.ru/blog/${post.slug}`);
    const anchors = await page.locator(".blog-toc a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(await page.evaluate((href) => Boolean(document.getElementById(href!.slice(1))), anchor)).toBe(true);
    }
    await page.locator(".blog-toc a").first().click();
    expect(new URL(page.url()).hash).toBeTruthy();
    await expect(page.locator(".blog-related .blog-card")).toHaveCount(3);
    expect(await page.locator(".blog-related a").evaluateAll((links, slug) => links.every((link) => !link.getAttribute("href")?.endsWith(slug)), post.slug)).toBe(true);
    for (const image of await page.locator("img").evaluateAll((images) => images.map((item) => item.getAttribute("src")!))) {
      expect((await request.get(image)).status()).toBe(200);
    }
  }
  expect(errors).toEqual([]);
  expect((await request.get("/blog/nonexistent-article")).status()).toBe(404);
});

test("responsive blog at 320, 390, 768 and 1440 px", async ({ page }) => {
  await mkdir("artifacts/blog", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/blog", "/blog/kak-sozdat-ai-personazha"]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(page.getByRole("navigation", { name: "Публичная навигация" })).toBeVisible();
      await page.screenshot({ path: `artifacts/blog/${path === "/blog" ? "index" : "article"}-${width}.png`, fullPage: true });
    }
  }
});

test("landing navigation reaches the blog through the public proxy", async ({ page, request }) => {
  test.skip(!process.env.BLOG_LANDING_ORIGIN, "Run with playwright.blog.config.ts and BLOG_LANDING_ORIGIN");
  const origin = process.env.BLOG_LANDING_ORIGIN!;
  await page.goto(origin);
  await page.locator(".desktop-nav").getByRole("link", { name: "Блог", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/blog`);
  await expect(page.locator("h1")).toHaveText("Блог Oblik OS");
  await expect(page.locator(".blog-card")).toHaveCount(5);
  await page.locator(".blog-card__link").first().click();
  await expect(page.locator(".blog-prose")).toBeVisible();
  await page.reload();
  await expect(page.locator(".blog-prose")).toBeVisible();
  await expect.poll(() => page.locator(".blog-header img, .blog-cover img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  for (const src of await page.locator("img").evaluateAll((images) => images.map((image) => image.getAttribute("src")!))) {
    expect((await request.get(`${origin}${src}`)).status()).toBe(200);
  }
  expect((await request.get(`${origin}/sitemap.xml`)).status()).toBe(200);
  expect(await (await request.get(`${origin}/robots.txt`)).text()).toContain("Allow: /blog");
  const rsc = await request.get(`${origin}/blog?_rsc=blog-proxy-check`, { headers: { RSC: "1" } });
  expect(rsc.headers()["content-type"]).toContain("text/x-component");
  await page.getByRole("navigation", { name: "Публичная навигация" }).getByRole("link", { name: "Блог", exact: true }).click();
  await expect(page.locator(".blog-card")).toHaveCount(5);
  // Mobile landing menu gets the same public link from the existing navItems.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(origin);
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  await page.locator(".mobile-menu").getByRole("link", { name: /Блог/ }).click();
  await expect(page).toHaveURL(`${origin}/blog`);
  await expect(page.locator("h1")).toBeVisible();
});
