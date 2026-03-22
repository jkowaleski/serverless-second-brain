const pulse = "animate-pulse rounded bg-[var(--color-border)]";

export function CardSkeleton() {
  return (
    <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
      <div className={`w-1 shrink-0 rounded-l-lg ${pulse}`} />
      <div className="min-w-0 flex-1 p-3 space-y-2.5">
        <div className={`h-4 w-2/5 ${pulse}`} />
        <div className={`h-3 w-full ${pulse}`} />
        <div className={`h-3 w-3/4 ${pulse}`} />
        <div className="flex gap-1.5">
          <div className={`h-4 w-14 rounded-full ${pulse}`} />
          <div className={`h-4 w-16 rounded-full ${pulse}`} />
          <div className={`h-4 w-12 rounded-full ${pulse}`} />
        </div>
      </div>
    </div>
  );
}

export function CardListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}><CardSkeleton /></li>
      ))}
    </ul>
  );
}

export function NodeDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className={`h-7 w-3/5 ${pulse}`} />
        <div className="flex gap-2">
          <div className={`h-5 w-16 rounded-full ${pulse}`} />
          <div className={`h-5 w-20 rounded-full ${pulse}`} />
        </div>
      </div>
      <div className="space-y-2">
        <div className={`h-4 w-full ${pulse}`} />
        <div className={`h-4 w-full ${pulse}`} />
        <div className={`h-4 w-4/5 ${pulse}`} />
        <div className={`h-4 w-full ${pulse}`} />
        <div className={`h-4 w-2/3 ${pulse}`} />
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-5 w-16 rounded-full ${pulse}`} />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-[var(--color-border)] p-4 space-y-2">
            <div className={`h-3 w-16 ${pulse}`} />
            <div className={`h-8 w-12 ${pulse}`} />
          </div>
        ))}
      </div>
      <CardListSkeleton count={4} />
    </div>
  );
}
