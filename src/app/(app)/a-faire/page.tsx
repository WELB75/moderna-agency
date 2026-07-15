import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyTasks } from "@/db/schema";
import { DailyTaskList } from "@/components/app/daily-task-list";

export default async function AFairePage() {
  const db = getDb();
  const tasks = await db.select().from(dailyTasks).orderBy(asc(dailyTasks.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">À faire</h1>
        <p className="text-sm text-muted-foreground">Les tâches à ne pas oublier</p>
      </div>

      <DailyTaskList tasks={tasks} />
    </div>
  );
}
