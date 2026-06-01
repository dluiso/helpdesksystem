"use client";

import { PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface UserSignature {
  htmlSignature: string;
  useSignatureByDefault: boolean;
}

export function SignatureInserter({ onInsert }: { onInsert: (html: string) => void }) {
  const [signature, setSignature] = useState<UserSignature | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<UserSignature>("/profile/signature")
      .then((response) => {
        if (mounted) {
          setSignature(response);
        }
      })
      .catch(() => {
        if (mounted) {
          setSignature(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const hasSignature = Boolean(signature?.htmlSignature?.trim());

  return (
    <button
      className="button ghost"
      type="button"
      onClick={() => {
        if (hasSignature) {
          onInsert(signature?.htmlSignature ?? "");
        }
      }}
      disabled={!hasSignature}
      title={hasSignature ? "Insert your saved signature" : "No saved signature configured"}
    >
      <PenLine size={16} aria-hidden="true" />
      <span>Signature</span>
    </button>
  );
}
