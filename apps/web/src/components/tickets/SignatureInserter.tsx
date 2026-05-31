"use client";

import { PenLine } from "lucide-react";

export function SignatureInserter({ onInsert }: { onInsert: (html: string) => void }) {
  return (
    <button
      className="button ghost"
      type="button"
      onClick={() => onInsert("<p>Regards,<br />Support Team</p>")}
    >
      <PenLine size={16} aria-hidden="true" />
      <span>Signature</span>
    </button>
  );
}
