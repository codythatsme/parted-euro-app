import { z } from "zod";

export const CALLOUT_VARIANTS = ["destructive", "warning"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

const linkMark = z.object({
  type: z.literal("link"),
  attrs: z.object({
    href: z.string().url().or(z.string().regex(/^(mailto|tel):/)),
    target: z.string().nullish(),
    rel: z.string().nullish(),
    class: z.string().nullish(),
  }),
});

const simpleMark = z.object({
  type: z.enum(["bold", "italic"]),
});

const mark = z.discriminatedUnion("type", [simpleMark, linkMark]);

const textNode = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
  marks: z.array(mark).optional(),
});

const paragraph = z.object({
  type: z.literal("paragraph"),
  content: z.array(textNode).optional(),
});

const heading = z.object({
  type: z.literal("heading"),
  attrs: z.object({ level: z.literal(2) }),
  content: z.array(textNode).optional(),
});

const horizontalRule = z.object({
  type: z.literal("horizontalRule"),
});

type ListItemNode = {
  type: "listItem";
  content: ParagraphOrListNode[];
};
type ParagraphOrListNode =
  | z.infer<typeof paragraph>
  | { type: "bulletList"; content: ListItemNode[] }
  | { type: "orderedList"; content: ListItemNode[] };

const listItem: z.ZodType<ListItemNode> = z.lazy(() =>
  z.object({
    type: z.literal("listItem"),
    content: z.array(paragraphOrList),
  }),
);

const bulletList = z.object({
  type: z.literal("bulletList"),
  content: z.array(listItem),
});

const orderedList = z.object({
  type: z.literal("orderedList"),
  content: z.array(listItem),
});

const paragraphOrList: z.ZodType<ParagraphOrListNode> = z.lazy(() =>
  z.discriminatedUnion("type", [paragraph, bulletList, orderedList]),
);

const callout = z.object({
  type: z.literal("callout"),
  attrs: z.object({ variant: z.enum(CALLOUT_VARIANTS) }),
  content: z.array(paragraph).min(1),
});

const blockNode = z.discriminatedUnion("type", [
  paragraph,
  heading,
  bulletList,
  orderedList,
  horizontalRule,
  callout,
]);

export const tiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(blockNode).min(1),
});

export type TiptapDoc = z.infer<typeof tiptapDocSchema>;
export type TiptapBlock = z.infer<typeof blockNode>;
export type TiptapText = z.infer<typeof textNode>;
export type TiptapMark = z.infer<typeof mark>;
export type TiptapParagraph = z.infer<typeof paragraph>;
export type TiptapHeading = z.infer<typeof heading>;
export type TiptapCallout = z.infer<typeof callout>;
export type TiptapListItem = z.infer<typeof listItem>;
export type TiptapBulletList = z.infer<typeof bulletList>;
export type TiptapOrderedList = z.infer<typeof orderedList>;

export const emptyTiptapDoc: TiptapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
