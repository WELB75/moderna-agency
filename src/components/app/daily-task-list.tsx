"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { createDailyTask, toggleDailyTask, deleteDailyTask } from "@/lib/actions/daily-tasks";

type DailyTask = {
  id: string;
  titre: string;
  fait: boolean;
};

export function DailyTaskList({ tasks }: { tasks: DailyTask[] }) {
  const [titre, setTitre] = useState("");
  const [isPending, startTransition] = useTransition();

  const todo = tasks.filter((t) => !t.fait);
  const done = tasks.filter((t) => t.fait);

  function handleAdd() {
    const value = titre.trim();
    if (!value) return;
    setTitre("");
    const formData = new FormData();
    formData.set("titre", value);
    startTransition(async () => {
      try {
        await createDailyTask(formData);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  function handleToggle(id: string, fait: boolean) {
    startTransition(async () => {
      try {
        await toggleDailyTask(id, fait);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteDailyTask(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Ajouter une tâche..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" disabled={isPending} onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      <div className="space-y-2">
        {todo.length === 0 && done.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien à faire pour l&apos;instant.</p>
        ) : (
          todo.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
          ))
        )}
      </div>

      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Terminé ({done.length})
          </p>
          {done.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: DailyTask;
  onToggle: (id: string, fait: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md border p-3 transition-colors",
        task.fait ? "bg-muted/40" : "hover:border-primary/50"
      )}
    >
      <Checkbox
        checked={task.fait}
        onCheckedChange={(value) => onToggle(task.id, value === true)}
        className="h-5 w-5 shrink-0"
      />
      <button
        type="button"
        onClick={() => onToggle(task.id, !task.fait)}
        className={cn(
          "flex-1 text-left text-sm",
          task.fait && "text-muted-foreground line-through"
        )}
      >
        {task.titre}
      </button>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
