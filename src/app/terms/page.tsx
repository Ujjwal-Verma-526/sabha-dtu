import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use — Sabha",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="12 October 2026">
      <p>
        By using Sabha you agree to these terms. Sabha is a student project at
        Delhi Technological University (DTU).
      </p>

      <h2>The service</h2>
      <p>
        Sabha is provided as-is, without warranties. It may change, break or
        go offline at any time, and we can&apos;t promise it will always be
        available or error-free.
      </p>

      <h2>Using Sabha</h2>
      <p>
        Use Sabha lawfully and respectfully. Don&apos;t abuse it, try to break
        into it, or register under someone else&apos;s name.
      </p>

      <h2>Clubs and events</h2>
      <p>
        Clubs are responsible for their own events and the content they post,
        including descriptions, images and any rules for attending. Sabha does
        not organise the events listed on it.
      </p>

      <h2>Removal</h2>
      <p>
        We may remove accounts or content that are abusive or break these
        terms.
      </p>

      <h2>Your data</h2>
      <p>
        How we handle your data is described in the{" "}
        <Link href="/privacy" className="font-medium text-primary underline">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>Changes and contact</h2>
      <p>
        These terms may change; the date above shows the latest version.
        Questions: <ContactLink />.
      </p>
    </LegalPage>
  );
}
