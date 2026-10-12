import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const qrPattern = [
  1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0,
  1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1,
  0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
];

const steps = [
  {
    n: "01",
    title: "Admin creates the event",
    body: "Name, venue, capacity, registration deadline. Takes a couple of minutes.",
  },
  {
    n: "02",
    title: "It goes public",
    body: "Live on Sabha immediately — anyone can find it, no login needed.",
  },
  {
    n: "03",
    title: "Student registers",
    body: "One tap once they're signed in. No forms to re-fill.",
  },
  {
    n: "04",
    title: "QR ticket is issued",
    body: "Unique per registration, lands straight in their account.",
  },
  {
    n: "05",
    title: "Scanned at the door",
    body: "Admin scans it on check-in. Registration flips to checked-in, instantly.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pt-16 pb-24 md:grid-cols-2 md:items-center md:pt-24">
        <div>
          <Badge>DTU societies · registrations open</Badge>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Every DTU event,
            <br />
            one QR ticket.
          </h1>
          <p className="mt-6 max-w-md text-lg text-ink-soft">
            Sabha lists what DTU societies are actually running. Sign in,
            register, get a ticket, walk in when it scans clean at the gate.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <ButtonLink href="#how-it-works" variant="primary">
              See how it works
            </ButtonLink>
            <ButtonLink href="#for-societies" variant="ghost">
              For society admins
            </ButtonLink>
          </div>
        </div>

        {/* Signature element: a tilted ticket stub, standing in for the QR ticket every registration produces */}
        <div className="flex justify-center md:justify-end">
          <div className="w-72 -rotate-3 rounded-2xl border border-line bg-surface p-5 shadow-[0_20px_50px_-20px_rgba(21,22,26,0.25)]">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold text-ink">
                Sabha
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
                Admit one
              </span>
            </div>
            <p className="mt-4 font-display text-xl font-semibold leading-tight text-ink">
              Robowars
              <br />
              Finals
            </p>
            <p className="mt-1 font-mono text-xs text-ink-soft">
              Sat · Main Auditorium · 5:00 PM
            </p>

            <div className="ticket-perf my-5" />

            <div className="mx-auto grid w-28 grid-cols-9 gap-[2px]">
              {qrPattern.map((bit, i) => (
                <span
                  key={i}
                  className={bit ? "aspect-square bg-ink" : "aspect-square"}
                />
              ))}
            </div>
            <p className="mt-3 text-center font-mono text-[10px] tracking-[0.2em] text-ink-soft">
              SBH-4F91-K2
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink">
            Five steps, one scan
          </h2>
          <p className="mt-2 max-w-lg text-ink-soft">
            No spreadsheets, no guest lists printed at midnight. The whole
            loop lives in one place.
          </p>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step) => (
              <Card key={step.n} className="flex flex-col gap-2">
                <span className="font-mono text-sm text-accent">
                  {step.n}
                </span>
                <h3 className="font-display text-base font-semibold text-ink">
                  {step.title}
                </h3>
                <p className="text-sm text-ink-soft">{step.body}</p>
              </Card>
            ))}
          </ol>
        </div>
      </section>

      {/* For societies / students */}
      <section id="for-societies" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-ink p-6 text-paper">
            <h3 className="font-display text-2xl font-bold">
              For society admins
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-paper/80">
              <li>Publish an event and take registrations same-day.</li>
              <li>Watch registrations come in, live, no export needed.</li>
              <li>Scan tickets at the door — no manual list-checking.</li>
              <li>Know exactly who showed up, not just who signed up.</li>
            </ul>
          </div>
          <Card>
            <h3 className="font-display text-2xl font-bold text-ink">
              For students
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-ink-soft">
              <li>Every society&apos;s events, one place to check.</li>
              <li>Only real DTU societies, so it&apos;s not full of dead listings.</li>
              <li>Your ticket lives in your account — nothing to lose.</li>
              <li>Register once, walk in on a scan, no queue for names.</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-10 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display font-semibold text-ink">Sabha</span>
          <span className="font-mono text-xs">
            Built for Delhi Technological University · MVP in progress
          </span>
        </div>
      </footer>
    </main>
  );
}
