"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Folder, HardDrive } from "lucide-react";
import { Modal, Button } from "@/components/ui/Modal";
import { api } from "@/lib/client";
import type { NodeDTO } from "@/lib/nodes";

type FolderRow = { id: string; name: string };

type Props = {
  open: boolean;
  nodes: NodeDTO[];
  onClose: () => void;
  onMove: (targetId: string | null) => Promise<void>;
};

/** Drill-down folder picker for moving one or more items. Remounts on open so navigation state resets. */
export function MoveModal({ open, nodes, onClose, onMove }: Props) {
  const title = nodes.length === 1 ? `Move "${nodes[0].name}"` : `Move ${nodes.length} items`;
  return (
    <Modal open={open && nodes.length > 0} onClose={onClose} title={title} width="max-w-lg">
      {open && nodes.length > 0 && <Picker nodes={nodes} onClose={onClose} onMove={onMove} />}
    </Modal>
  );
}

function Picker({ nodes, onClose, onMove }: { nodes: NodeDTO[]; onClose: () => void; onMove: Props["onMove"] }) {
  const [trail, setTrail] = useState<FolderRow[]>([]); // [] = root
  const [loaded, setLoaded] = useState<{ forId: string | null; rows: FolderRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentId = trail.length ? trail[trail.length - 1].id : null;
  const rows = loaded && loaded.forId === currentId ? loaded.rows : null; // null = loading

  useEffect(() => {
    let cancelled = false;
    api<FolderRow[]>(`/api/folders${currentId ? `?parent=${currentId}` : ""}`)
      .then((r) => !cancelled && setLoaded({ forId: currentId, rows: r }))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onMove(currentId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const moving = new Set(nodes.map((n) => n.id));
  const sameParent = nodes.every((n) => (n.parentId ?? null) === currentId);
  const intoSelf = trail.some((t) => moving.has(t.id));

  return (
    <>
      <div className="flex items-center gap-1 text-sm mb-3 overflow-x-auto whitespace-nowrap">
        <button onClick={() => setTrail([])} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-hover">
          <HardDrive size={16} /> All files
        </button>
        {trail.map((t, i) => (
          <span key={t.id} className="flex items-center gap-1">
            <ChevronRight size={16} className="text-muted" />
            <button onClick={() => setTrail(trail.slice(0, i + 1))} className="rounded-md px-2 py-1 hover:bg-hover">
              {t.name}
            </button>
          </span>
        ))}
      </div>

      <div className="h-64 overflow-y-auto rounded-md border border-border bg-background">
        {rows === null ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">No folders here</p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  disabled={moving.has(r.id)}
                  onClick={() => setTrail([...trail, r])}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover disabled:opacity-40"
                >
                  <Folder size={20} className="text-muted" />
                  <span className="flex-1 truncate">{r.name}</span>
                  <ChevronRight size={16} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-5">
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={confirm} disabled={busy || sameParent || intoSelf}>
          Move here
        </Button>
      </div>
    </>
  );
}
