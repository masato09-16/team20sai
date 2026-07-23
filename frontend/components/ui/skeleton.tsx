import { cn } from "./utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("ui-skeleton", className)}
      {...props}
    />
  );
}

export { Skeleton };
