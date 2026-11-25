const schedules = { redemptions: 60 * 60_000, carts: 60_000 };
type Job = keyof typeof schedules;
const lastRuns: Partial<Record<Job, { checkedAt: Date; succeeded: boolean }>> = {};

export async function runTrackedJob(name: Job, run: () => Promise<unknown>) {
  let succeeded = false;
  try {
    await run();
    succeeded = true;
  } catch (error) {
    console.error("Falha no processamento de", name, error);
  } finally {
    lastRuns[name] = { checkedAt: new Date(), succeeded };
  }
}

export function getProcessingHealth(now: Date) {
  const jobs = (Object.keys(schedules) as Job[]).map((name) => {
    const check = lastRuns[name];
    const status = !check ? "UNKNOWN" :
      check.succeeded && now.getTime() - check.checkedAt.getTime() <= schedules[name] * 2 ? "UP" : "DEGRADED";
    return { name, status, checkedAt: check?.checkedAt ?? null };
  });
  const status = jobs.some((job) => job.status === "DEGRADED") ? "DEGRADED" :
    jobs.every((job) => job.status === "UP") ? "UP" : "UNKNOWN";
  return { status, availabilityPercent: null, jobs };
}
