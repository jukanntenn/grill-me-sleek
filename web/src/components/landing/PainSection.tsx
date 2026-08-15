// §1 Pain — "Where does this plan break?" Three quotes of the agent's
// silent assumptions; the visitor recognizes their own diff review.

import { useTranslation } from "react-i18next";

const QUOTE_KEYS = ["landing.s1.quote1", "landing.s1.quote2", "landing.s1.quote3"] as const;

export function PainSection() {
  const { t } = useTranslation();
  return (
    <section className="py-[var(--spacing-4xl)]">
      <div className="mx-auto max-w-[1080px] px-[var(--spacing-md)] text-center">
        <h2 className="display-lg text-ink text-balance">{t("landing.s1.title")}</h2>
        <p className="body-lg text-body mx-auto mt-[var(--spacing-md)] max-w-[620px]">
          {t("landing.s1.body")}
        </p>
        <ul className="mt-[var(--spacing-2xl)] grid list-none gap-[var(--spacing-md)] text-left md:grid-cols-3">
          {QUOTE_KEYS.map((key) => (
            <li
              key={key}
              className="border-hairline bg-canvas rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-lg)] shadow-[var(--shadow-card)]"
            >
              <p className="text-ink font-mono text-sm">“{t(key)}”</p>
              <p className="caption text-mute mt-[var(--spacing-xs)]">
                {t("landing.s1.attribution")}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
