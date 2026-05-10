"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { StarterKit } from "@tiptap/starter-kit";
import { CALLOUT_VARIANTS, type CalloutVariant } from "./tiptap-schema";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "warning" satisfies CalloutVariant,
        parseHTML: (el) => {
          const v = el.getAttribute("data-variant");
          return CALLOUT_VARIANTS.includes(v as CalloutVariant) ? v : "warning";
        },
        renderHTML: (attrs) => ({ "data-variant": attrs.variant as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "callout" }),
      0,
    ];
  },
});

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2] },
    blockquote: false,
    code: false,
    codeBlock: false,
    strike: false,
    hardBreak: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: false,
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
  }),
  Callout,
];
