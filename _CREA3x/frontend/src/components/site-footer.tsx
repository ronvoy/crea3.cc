import React from 'react'
import { useI18n } from '../i18n'

const website = import.meta.env.VITE_PROJECT_WEBSITE || ''

// Two project contacts (overridable via .env; sensible sample defaults otherwise).
const contact1 = {
  name: import.meta.env.VITE_PROJECT_CONTACT1_NAME || 'Dr. Elena Conti',
  email: import.meta.env.VITE_PROJECT_CONTACT1_EMAIL || 'elena.conti@crea3.eu',
}
const contact2 = {
  name: import.meta.env.VITE_PROJECT_CONTACT2_NAME || 'Dr. Marco De Luca',
  email: import.meta.env.VITE_PROJECT_CONTACT2_EMAIL || 'marco.deluca@crea3.eu',
}

function Contact({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{role}</div>
      <div className="text-sm font-medium text-slate-900">{name}</div>
      <a href={`mailto:${email}`} className="text-sm text-blue-700 underline underline-offset-4 hover:text-blue-800">
        {email}
      </a>
    </div>
  )
}

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  return (
    <footer className={compact ? 'mt-6' : 'mt-10'}>
      <div className="mx-auto w-full max-w-screen-2xl px-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t('footerProjectContact')}</div>
              <Contact name={contact1.name} email={contact1.email} role={t('footerCoordinatorRole')} />
              <Contact name={contact2.name} email={contact2.email} role={t('footerTechRole')} />
              {website ? (
                <div className="mt-3">
                  <a href={website} target="_blank" rel="noreferrer" className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900">
                    {website}
                  </a>
                </div>
              ) : null}
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{t('footerPartners')}</div>
                <div className="text-[11px] text-slate-500">{t('footerPartnersNote')}</div>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                <img
                  src="/partners.png"
                  alt="Partner institutions: Federico II, VUB, University of Zagreb, Vilnius University, Suor Orsola Benincasa, TalTech, Adiconsum, FBE, University of Ljubljana"
                  className="mx-auto h-auto w-full max-w-xl object-contain"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-500">
            <div>© {new Date().getFullYear()} {t('footerRights')}</div>
          </div>
        </div>
      </div>
    </footer>
  )
}
