// Deliberately limited Markdown: paragraphs, h2/h3, ordered/unordered lists.
// Raw HTML is never interpreted. The same parser drives content and the TOC.
type ContentBlock =
  | { type: "heading"; level: 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export function parseBlogContent(content: string): ContentBlock[] {
  let headingIndex = 0;
  return content.trim().split(/\n\s*\n/).map((block): ContentBlock => {
    const heading = /^(#{2,3})\s+(.+)$/.exec(block.trim());
    if (heading) {
      headingIndex += 1;
      const text = heading[2];
      const anchor = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      return { type: "heading", level: heading[1].length as 2 | 3, text, id: `${headingIndex}-${anchor}` };
    }
    const lines = block.trim().split("\n");
    if (lines.every((line) => /^(?:- |\d+\. )/.test(line))) {
      return { type: "list", ordered: /^\d+\./.test(lines[0]), items: lines.map((line) => line.replace(/^(?:- |\d+\. )/, "")) };
    }
    return { type: "paragraph", text: block.replace(/\s*\n\s*/g, " ") };
  });
}

export function BlogContent({ content }: { content: string }) {
  return <div className="blog-prose">{parseBlogContent(content).map((block, index) => {
    if (block.type === "heading") {
      const Heading = block.level === 2 ? "h2" : "h3";
      return <Heading key={block.id} id={block.id}>{block.text}</Heading>;
    }
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</List>;
    }
    return <p key={index}>{block.text}</p>;
  })}</div>;
}

export function BlogTableOfContents({ content }: { content: string }) {
  const headings = parseBlogContent(content).filter((block) => block.type === "heading");
  if (!headings.length) return null;
  return <nav className="blog-toc" aria-label="Оглавление статьи">
    <h2>В этой статье</h2>
    <ol>{headings.map((heading) => <li key={heading.id} className={heading.level === 3 ? "blog-toc__nested" : undefined}>
      <a href={`#${heading.id}`}>{heading.text}</a>
    </li>)}</ol>
  </nav>;
}
