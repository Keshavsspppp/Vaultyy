"use client";

import { useState, type FormEvent } from "react";
import { Modal, Button, TextInput } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  title: string;
  initial?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

/** Used for both "New folder" and "Rename". The form remounts on every open so state resets. */
export function NameModal({ open, title, onClose, ...rest }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {open && <NameForm onClose={onClose} {...rest} />}
    </Modal>
  );
}

function NameForm({ initial = "", submitLabel = "OK", onClose, onSubmit }: Omit<Props, "open" | "title">) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Select the base name (without extension) like Drive does.
  function selectBase(el: HTMLInputElement | null) {
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <TextInput ref={selectBase} value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-5">
        <Button type="button" variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
