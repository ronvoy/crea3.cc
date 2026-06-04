import React from "react";

const contactName = import.meta.env.VITE_PROJECT_CONTACT_NAME || "Project contact";
const contactEmail = import.meta.env.VITE_PROJECT_CONTACT_EMAIL || "";
const contactOrg = import.meta.env.VITE_PROJECT_CONTACT_ORG || "";
const website = import.meta.env.VITE_PROJECT_WEBSITE || "";

// Optional override: comma-separated partner names in .env (VITE_PROJECT_PARTNERS="A,B,C")
const partnersFromEnv = (import.meta.env.VITE_PROJECT_PARTNERS || "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

const defaultPartners = [
  "Università degli Studi di Napoli Federico II",
  "Vrije Universiteit Brussel (VUB)",
  "University of Zagreb – Faculty of Law",
  "Vilnius University",
  "Università degli Studi Suor Orsola Benincasa",
  "TalTech – Tallinn University of Technology",
  "Adiconsum – Associazione Difesa Consumatori e Ambiente",
  "FBE – Federation des Barreaux d'Europe",
  "University of Ljubljana",
];

const partnerNames = partnersFromEnv.length ? partnersFromEnv : defaultPartners;

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={compact ? "mt-6" : "mt-10"}>
      <div className="mx-auto max-w-6xl px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <div>
              <div className="text-sm font-semibold text-white/90">Project contact</div>
              <div className="mt-2 text-sm text-white/70">
                {contactOrg ? <div className="font-medium text-white/80">{contactOrg}</div> : null}
                <div className="mt-1">
                  {contactEmail ? (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="underline underline-offset-4 hover:text-white"
                    >
                      {contactName}{contactName && contactEmail ? " — " : ""}
                      {contactEmail}
                    </a>
                  ) : (
                    <span>{contactName}</span>
                  )}
                </div>
                {website ? (
                  <div className="mt-1">
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-white"
                    >
                      {website}
                    </a>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 text-xs text-white/50">
                Secure access via enterprise identity. Email verification required.
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-white/90">Partners</div>
                <div className="text-[11px] text-white/50">Recognized institutions</div>
              </div>

              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <img
                  src="/partners.png"
                  alt="Project partners"
                  className="w-full h-auto object-contain"
                  loading="lazy"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {partnerNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
                    title={name}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-3 text-xs text-white/50 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>© {new Date().getFullYear()} CREA3 Dispute Resolution Platform</div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                Mailpit local email enabled
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
