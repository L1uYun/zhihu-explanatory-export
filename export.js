#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const outputDirectory = path.join(__dirname, "raw");
const endpoint = "https://www.zhihu.com/api/v4/columns/explanatory/items";
const limit = 100;

const escapeYaml = (value) => JSON.stringify(String(value ?? ""));

const htmlToMarkdown = (html) => {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level, text) => {
      return `${"#".repeat(Number(level))} ${text}\n\n`;
    })
    .replace(/<(b|strong)>([\s\S]*?)<\/\1\s*>/gi, "**$2**")
    .replace(/<(i|em)>([\s\S]*?)<\/\1\s*>/gi, "*$2*")
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, "![image]($1)")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, "[$2]($1)")
    .replace(/<hr\s*\/?>/gi, "\n---\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const safeFilename = (title, id) => {
  const suffix = String(id).slice(-8);
  const normalized = title
    .replace(/[\\/:*?"<>|\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
  return `${normalized || "untitled"}-${suffix}.md`;
};

const fetchPage = async (offset) => {
  const response = await fetch(`${endpoint}?limit=${limit}&offset=${offset}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} at offset ${offset}`);
  }
  return response.json();
};

const main = async () => {
  const articles = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset);
    if (!Array.isArray(page.data) || page.data.length === 0) {
      throw new Error(`Empty page at offset ${offset}`);
    }
    articles.push(...page.data);
    process.stdout.write(`Fetched ${articles.length}/${page.paging.totals}\n`);
    if (page.paging.is_end) break;
    offset = Number(new URL(page.paging.next).searchParams.get("offset"));
  }

  await fs.writeFile(path.join(outputDirectory, "items.json"), JSON.stringify(articles, null, 2));

  const markdownDirectory = path.join(__dirname, "markdown");
  await fs.mkdir(markdownDirectory, { recursive: true });

  const manifest = articles.map((article, index) => {
    const number = String(articles.length - index).padStart(3, "0");
    const filename = `${number}-${safeFilename(article.title, article.id)}`;
    const frontMatter = [
      "---",
      `title: ${escapeYaml(article.title)}`,
      `id: ${escapeYaml(article.id)}`,
      `url: ${escapeYaml(article.url)}`,
      `created: ${escapeYaml(new Date(article.created * 1000).toISOString())}`,
      `updated: ${escapeYaml(new Date(article.updated * 1000).toISOString())}`,
      `position: ${articles.length - index}`,
      "---",
      "",
    ].join("\n");
    const body = htmlToMarkdown(article.content);
    fs.writeFile(path.join(markdownDirectory, filename), `${frontMatter}# ${article.title}\n\n${body}\n`);
    return {
      number: articles.length - index,
      title: article.title,
      id: article.id,
      url: article.url,
      created: new Date(article.created * 1000).toISOString().slice(0, 10),
      file: path.join("markdown", filename),
    };
  });

  await fs.writeFile(path.join(__dirname, "manifest.json"), JSON.stringify(manifest, null, 2));
  process.stdout.write(`Saved ${articles.length} articles\n`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
