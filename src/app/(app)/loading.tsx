// Shown at once while the next tab's server data loads, so a tap never feels frozen.
export default function Loading() {
  const pulse = "animate-pulse motion-reduce:animate-none";
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className={`h-9 w-44 rounded-xl bg-white/60 ${pulse}`} />
      <div className={`h-4 w-64 max-w-full rounded-lg bg-white/50 ${pulse}`} />
      {[0, 1, 2].map((i) => (
        <div key={i} className={`glass h-28 rounded-3xl ${pulse}`} />
      ))}
    </div>
  );
}
