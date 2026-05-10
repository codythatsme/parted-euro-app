"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tiptapDocSchema, type TiptapDoc } from "~/lib/tiptap-schema";
import { api } from "~/trpc/react";
import { TiptapEditor } from "./tiptap-editor";

type Initial = { title: string; body: TiptapDoc };

export function WarrantyForm({ initial }: { initial: Initial }) {
  const utils = api.useUtils();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState<TiptapDoc>(initial.body);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(initial.title);
    setBody(initial.body);
  }, [initial]);

  const dirty =
    title !== initial.title ||
    JSON.stringify(body) !== JSON.stringify(initial.body);

  const update = api.pages.warranty.update.useMutation({
    onSuccess: () => {
      toast.success("Warranty page saved");
      void utils.pages.warranty.get.invalidate();
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });

  const onSave = () => {
    setTitleError(null);
    setBodyError(null);

    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Title is required");
      return;
    }

    const parsed = tiptapDocSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setBodyError(
        `Body contains content not allowed by the schema (${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}).`,
      );
      return;
    }

    update.mutate({ title: trimmed, body: parsed.data });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Header</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="warranty-title">Title</Label>
          <Input
            id="warranty-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {titleError && (
            <p className="text-sm text-destructive">{titleError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Body</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <TiptapEditor initial={initial.body} onChange={setBody} />
          {bodyError && <p className="text-sm text-destructive">{bodyError}</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || update.isPending}
          onClick={() => {
            setTitle(initial.title);
            setBody(initial.body);
          }}
        >
          Reset
        </Button>
        <Button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={onSave}
        >
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
