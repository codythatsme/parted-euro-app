"use client";

import { type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  AlertTriangle,
  Bold,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { editorExtensions } from "~/lib/tiptap-extensions";
import {
  CALLOUT_VARIANTS,
  type CalloutVariant,
  type TiptapDoc,
} from "~/lib/tiptap-schema";
import { cn } from "~/lib/utils";

const ToolbarButton = ({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) => (
  <Button
    type="button"
    size="icon"
    variant={active ? "secondary" : "ghost"}
    aria-pressed={!!active}
    disabled={disabled}
    onClick={onClick}
    title={title}
    className="h-8 w-8"
  >
    {children}
  </Button>
);

const LinkDialog = ({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const [href, setHref] = useState("");

  useEffect(() => {
    if (open) {
      const current = editor.getAttributes("link").href;
      setHref(typeof current === "string" ? current : "");
    }
  }, [open, editor]);

  const apply = () => {
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: href.trim() })
        .run();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="link-href">URL</Label>
          <Input
            id="link-href"
            placeholder="https://… or mailto:… or tel:…"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty and click Apply to remove the link.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CalloutInsertDialog = ({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const [variant, setVariant] = useState<CalloutVariant>("warning");

  const insert = () => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "callout",
        attrs: { variant },
        content: [{ type: "paragraph" }],
      })
      .run();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert callout</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select
            value={variant}
            onValueChange={(v) => setVariant(v as CalloutVariant)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALLOUT_VARIANTS.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={insert}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export function TiptapEditor({
  initial,
  onChange,
}: {
  initial: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [calloutOpen, setCalloutOpen] = useState(false);

  const editor = useEditor({
    extensions: editorExtensions,
    content: initial,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as TiptapDoc),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_hr]:my-6 [&_a]:text-primary [&_a]:underline [&_div[data-type=callout]]:my-4 [&_div[data-type=callout]]:rounded-md [&_div[data-type=callout]]:border [&_div[data-type=callout]]:p-3 [&_div[data-type=callout][data-variant=destructive]]:border-destructive/50 [&_div[data-type=callout][data-variant=destructive]]:text-destructive [&_div[data-type=callout][data-variant=warning]]:border-amber-500/50 [&_div[data-type=callout][data-variant=warning]]:text-amber-700",
      },
    },
  });

  if (!editor) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex max-h-[28rem] flex-col overflow-hidden rounded-md border">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/30 p-1">
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={editor.isActive("link")}
          onClick={() => setLinkOpen(true)}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          title="Insert separator"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Insert callout"
          active={editor.isActive("callout")}
          onClick={() => setCalloutOpen(true)}
        >
          <AlertTriangle className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className={cn("p-4")} />
      </div>
      <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
      <CalloutInsertDialog
        editor={editor}
        open={calloutOpen}
        onOpenChange={setCalloutOpen}
      />
    </div>
  );
}
