import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-32">
      <Spinner />
      <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">
        Loading
      </p>
    </div>
  );
}
