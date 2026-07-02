import type {
  TaskResult,
  SuiteResultSummary,
  CategoryMetric,
} from "./types.js";

export function calculateMetrics(
  taskResults: TaskResult[],
): SuiteResultSummary {
  const totalTasks = taskResults.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      passAt1Count: 0,
      passAtKCount: 0,
      passAt1Rate: 0,
      passAtKRate: 0,
      categories: {},
    };
  }

  let passAt1Count = 0;
  let passAtKCount = 0;
  const categoryTasks: Record<string, TaskResult[]> = {};

  for (const task of taskResults) {
    if (task.passedAt1) {
      passAt1Count++;
    }
    if (task.passed) {
      passAtKCount++;
    }

    if (!categoryTasks[task.category]) {
      categoryTasks[task.category] = [];
    }
    categoryTasks[task.category].push(task);
  }

  const categories: Record<string, CategoryMetric> = {};
  for (const [category, tasks] of Object.entries(categoryTasks)) {
    let catPassAt1 = 0;
    let catPassAtK = 0;
    for (const t of tasks) {
      if (t.passedAt1) {
        catPassAt1++;
      }
      if (t.passed) {
        catPassAtK++;
      }
    }
    categories[category] = {
      category,
      totalTasks: tasks.length,
      passAt1Count: catPassAt1,
      passAtKCount: catPassAtK,
      passAt1Rate: tasks.length > 0 ? catPassAt1 / tasks.length : 0,
      passAtKRate: tasks.length > 0 ? catPassAtK / tasks.length : 0,
    };
  }

  return {
    totalTasks,
    passAt1Count,
    passAtKCount,
    passAt1Rate: passAt1Count / totalTasks,
    passAtKRate: passAtKCount / totalTasks,
    categories,
  };
}
