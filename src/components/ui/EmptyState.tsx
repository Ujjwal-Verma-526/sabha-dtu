import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** Dashed box for "nothing here yet" and "you can't see this" states. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: IconName;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-control px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <Icon name={icon} className="mx-auto text-[28px] text-ink-soft" />}
      <p className={cn("text-lg font-semibold text-ink", icon && "mt-3")}>{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * A whole page that only says one thing: "you don't manage this club", "no
 * profile found". Same width and spacing as the plain pages.
 */
export function NoticePage({
  icon,
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-10 pb-16 md:pt-16">
      <EmptyState icon={icon} title={title} action={action}>
        {children}
      </EmptyState>
    </main>
  );
}
