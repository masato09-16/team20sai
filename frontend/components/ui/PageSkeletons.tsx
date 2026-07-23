import { Skeleton } from "@/components/ui/skeleton";

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-label="読み込み中">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="ui-card-compact flex items-center justify-between gap-4 p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-7 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <section className="space-y-4" aria-label="読み込み中">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="ui-card space-y-4 p-4">
        <Skeleton className="h-6 w-36" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    </section>
  );
}
