import type { Metadata } from "next";
import { ContactLink, LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Sabha",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="16 October 2026">
      <p>
        Sabha is a student project at Delhi Technological University (DTU). It
        is run by a student, not a company. Questions about your data go to{" "}
        <ContactLink />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          Your name and email address. If you sign in with Google, we receive
          only your name and email from Google.
        </li>
        <li>
          Optional profile details you choose to add: roll number, branch and
          batch year.
        </li>
        <li>
          An optional profile photo you upload. It is resized in your browser
          and stored by Sabha.
        </li>
        <li>
          Event registrations, the QR tickets issued for them, and the time you
          were checked in at the door.
        </li>
        <li>Club membership requests and memberships.</li>
        <li>Club logos and event banners that club managers upload.</li>
      </ul>
      <p>
        You sign in with an email magic link or with Google. There is no
        password.
      </p>

      <h2>Why we collect it</h2>
      <p>
        To run sign-in, event registration, tickets and door check-in, and club
        management. We use it for nothing else.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          <strong>You</strong> can see your own profile, registrations and
          tickets.
        </li>
        <li>
          <strong>Club admins and coordinators</strong> can see the name and
          profile photo of people who request to join or belong to their
          club. For their club&apos;s events they can see who registered and
          who has been checked in, by name. They do not see your email, roll
          number, branch or batch year.
        </li>
        <li>
          <strong>Sabha platform administrators</strong> can see every
          profile, including email addresses, in order to manage clubs and
          accounts.
        </li>
        <li>
          <strong>Anyone with the link</strong> can view your profile photo, if
          you add one. It appears next to your name, and viewing it needs no
          sign-in.
        </li>
        <li>
          Nobody else can see the rest of another user&apos;s profile. Club
          logos and event banners are public.
        </li>
      </ul>
      <p>We never sell your data and never share it for advertising.</p>

      <h2>Where it is stored</h2>
      <p>
        Your data is stored with Supabase (database, sign-in and file storage)
        and the site is hosted on Vercel. These providers process data on our
        behalf under their own terms and privacy policies.
      </p>

      <h2>Cookies</h2>
      <p>
        Sabha uses only the cookies it needs for signing in: the sign-in
        session cookie, and a short-lived cookie (up to one hour) that
        remembers which page to return you to after you sign in. There are no
        tracking or analytics cookies.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your data by emailing{" "}
        <ContactLink />. You can also edit your profile yourself on the
        profile page, including replacing or removing your photo. When you do,
        the old photo is deleted from our storage, though copies already saved
        by browsers may remain for a while. Accounts are deleted on request.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, we will update the date at the top of this
        page.
      </p>
    </LegalPage>
  );
}
