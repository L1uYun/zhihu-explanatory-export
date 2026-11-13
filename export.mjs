const outputDirectory = "/Users/l1uyun/agentwork/_tmp/zhihu-explanatory/raw";
const markdownDirectory = "/Users/l1uyun/agentwork/_tmp/zhihu-explanatory/markdown";
const endpoint = "https://www.zhihu.com/api/v4/columns/explanatory/items";
const limit = 100;
const encoder = new TextEncoder();
const runtime = typeof chrome !== "undefined" && chrome.runtime?.id ? chrome : browser;

const escapeYaml = (value) => JSON.stringify(String(value ?? ""));

const htmlToMarkdown = (html) => {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level, text) => `${"#".repeat(Number(level))} ${text}\n\n`)
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
  const normalized = String(title ?? "").replace(/[\\/:*?"<>|\n\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
  return `${normalized || "untitled"}-${suffix}.md`;
};

const main = async () => {
  const articles = [];
  let offset = 0;
  while (true) {
    const response = await fetch(`${endpoint}?limit=${limit}&offset=${offset}`, { credentials: "include" });
    if (!response.ok) throw new Error(`HTTP ${response.status} at offset ${offset}`);
    const page = await response.json();
    if (!Array.isArray(page.data) || page.data.length === 0) throw new Error(`Empty page at offset ${offset}`);
    articles.push(...page.data);
    console.log(`Fetched ${articles.length}/${page.paging.totals}`);
    if (page.paging.is_end) break;
    offset = Number(new URL(page.paging.next).searchParams.get("offset"));
  }
  await runtime.downloads.download({
    url: URL.createObjectURL(new Blob([JSON.stringify(articles, null, 2)], { type: "application/json" })),
    filename: "zhihu-explanatory-raw/items.json",
    conflictAction: "overwrite",
  });
  const manifest = [];
  for (const [index, article] of articles.entries()) {
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
    const markdown = `${frontMatter}# ${article.title}\n\n${htmlToMarkdown(article.content)}\n`;
    await runtime.downloads.download({
      url: URL.createObjectURL(new Blob([markdown], { type: "text/markdown" })),
      filename: `zhihu-explanatory-markdown/${filename}`,
      conflictAction: "overwrite",
    });
    manifest.push({ number: articles.length - index, title: article.title, id: article.id, url: article.url, created: new Date(article.created * 1000).toISOString().slice(0, 10), file: `markdown/${filename}` });
  }
  await runtime.downloads.download({
    url: URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" })),
    filename: "zhihu-explanatory/manifest.json",
    conflictAction: "overwrite",
  });
  console.log(`Saved ${articles.length} articles`);
};

main().catch((error) => console.error(error));
