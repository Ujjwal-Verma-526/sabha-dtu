import { ButtonLink } from "@/components/ui/Button";
import { NoticePage } from "@/components/ui/EmptyState";

/** The manage pages' answer to someone who isn't a manager of this club. */
export function NotManager() {
  return (
    <NoticePage
      icon="manage"
      title="You don't manage this club"
      action={
        <ButtonLink href="/clubs" variant="soft">
          Browse clubs
        </ButtonLink>
      }
    >
      Only this club&apos;s admins and coordinators, and Sabha admins, can open this page.
    </NoticePage>
  );
}

/** The super-admin pages' answer to everyone else. */
export function NotSuperAdmin() {
  return (
    <NoticePage
      icon="manage"
      title="Sabha admins only"
      action={
        <ButtonLink href="/events" variant="soft">
          Back to events
        </ButtonLink>
      }
    >
      This area is for Sabha super admins only.
    </NoticePage>
  );
}
