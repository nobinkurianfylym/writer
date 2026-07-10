"use client";

import { useState } from "react";
import { TitlePageEditor } from "@fylym/editor";
import type { Block } from "@fylym/screenplay-core";
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@fylym/ui";

const EMPTY_TITLE_BLOCK: Block = {
  id: "title-page",
  type: "title_page",
  text: "Title: Untitled\nAuthor: ",
  marks: [],
  attrs: {},
};

export function TitlePageSheet({
  block,
  onChange,
}: {
  block: Block | null;
  onChange: (updated: Block) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Title page
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Title page</DialogTitle>
        </DialogHeader>
        <TitlePageEditor
          block={block ?? EMPTY_TITLE_BLOCK}
          onChange={onChange}
        />
      </DialogContent>
    </Dialog>
  );
}
