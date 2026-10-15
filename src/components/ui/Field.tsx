import { cn } from "@/lib/utils";

// Shared pieces for the plain forms (profile, club details, event form).

/** The label above a field. */
export const labelClass = "text-sm font-semibold text-ink";
/** "· optional", "· IST" after a label. */
export const labelHintClass = "font-normal text-ink-soft";
/** One line of guidance under a field. */
export const helpClass = "text-[13px] leading-snug text-ink-soft";
/** Label + field + help/error stacked. */
export const fieldStackClass = "flex min-w-0 flex-col gap-1.5";

/** The error under a field. Its id is what the field's aria-describedby names. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span
      id={id}
      role="alert"
      // A long value in the message (a pasted URL) must wrap, not widen the form.
      className="text-[13px] font-medium text-danger [overflow-wrap:anywhere]"
    >
      {message}
    </span>
  );
}

/** Form-level error or "Saved" line, above or below a form. */
export function FormNotice({
  tone,
  children,
  className,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm font-medium [overflow-wrap:anywhere]",
        tone === "error"
          ? "border-danger-line bg-danger-soft text-danger"
          : "border-success/30 bg-success-soft text-success",
        className,
      )}
    >
      {children}
    </p>
  );
}
