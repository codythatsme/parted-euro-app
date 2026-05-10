import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Separator } from "~/components/ui/separator";
import {
  type TiptapBlock,
  type TiptapDoc,
  type TiptapMark,
  type TiptapText,
} from "~/lib/tiptap-schema";

const isExternalHref = (href: string) =>
  /^https?:\/\//i.test(href) && !href.includes("partedeuro.com.au");

const renderText = (node: TiptapText, key: string) => {
  let el: React.ReactNode = node.text;
  for (const m of node.marks ?? []) {
    el = wrapMark(m, el, key);
  }
  return <span key={key}>{el}</span>;
};

const wrapMark = (m: TiptapMark, child: React.ReactNode, key: string) => {
  switch (m.type) {
    case "bold":
      return <strong key={`${key}-b`}>{child}</strong>;
    case "italic":
      return <em key={`${key}-i`}>{child}</em>;
    case "link": {
      const external = isExternalHref(m.attrs.href);
      return (
        <a
          key={`${key}-a`}
          href={m.attrs.href}
          className="text-primary underline-offset-4 hover:underline"
          {...(external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {child}
        </a>
      );
    }
  }
};

const renderInlines = (
  content: TiptapText[] | undefined,
  keyPrefix: string,
) => content?.map((n, i) => renderText(n, `${keyPrefix}-t${i}`));

const renderBlock = (block: TiptapBlock, key: string): React.ReactNode => {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={key} className="leading-7 [&:not(:first-child)]:mt-4">
          {renderInlines(block.content, key)}
        </p>
      );
    case "heading":
      return (
        <h2
          key={key}
          className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0"
        >
          {renderInlines(block.content, key)}
        </h2>
      );
    case "bulletList":
      return (
        <ul key={key} className="my-4 ml-6 list-disc [&>li]:mt-2">
          {block.content.map((li, i) => (
            <li key={`${key}-li${i}`}>
              {li.content.map((c, j) => renderBlock(c, `${key}-li${i}-c${j}`))}
            </li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="my-4 ml-6 list-decimal [&>li]:mt-2">
          {block.content.map((li, i) => (
            <li key={`${key}-li${i}`}>
              {li.content.map((c, j) => renderBlock(c, `${key}-li${i}-c${j}`))}
            </li>
          ))}
        </ol>
      );
    case "horizontalRule":
      return <Separator key={key} className="my-8" />;
    case "callout":
      return (
        <Alert key={key} variant={block.attrs.variant} className="my-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {block.content.map((p, i) => renderBlock(p, `${key}-c${i}`))}
          </AlertDescription>
        </Alert>
      );
  }
};

export function TiptapRender({ doc }: { doc: TiptapDoc }) {
  return (
    <div className="text-foreground">
      {doc.content.map((b, i) => renderBlock(b, `b${i}`))}
    </div>
  );
}
