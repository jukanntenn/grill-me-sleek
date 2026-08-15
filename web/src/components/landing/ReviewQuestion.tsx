// §3 Objection — "Why not just let the agent ask me in the terminal?"
// Rendered as a single-choice question in the app's own visual language:
// the product is the recommended option; the alternatives' descriptions are
// their cost. Static (no real radios) so it adds no keyboard traps.

import { useTranslation } from "react-i18next";

export function ReviewQuestion() {
  const { t } = useTranslation();
  return (
    <section className="py-[var(--spacing-4xl)]">
      <div className="mx-auto max-w-[1080px] px-[var(--spacing-md)] text-center">
        <h2 className="display-lg text-ink mx-auto max-w-[720px] text-balance">
          {t("landing.s3.title")}
        </h2>
        <ul className="mx-auto mt-[var(--spacing-2xl)] max-w-[640px] list-none text-left">
          <ReviewOption label={t("landing.s3.opt1Label")} desc={t("landing.s3.opt1Desc")} />
          <ReviewOption label={t("landing.s3.opt2Label")} desc={t("landing.s3.opt2Desc")} />
          <ReviewOption
            label={t("landing.s3.opt3Label")}
            desc={t("landing.s3.opt3Desc")}
            selected
            badge={t("recommended")}
          />
        </ul>
      </div>
    </section>
  );
}

function ReviewOption({
  label,
  desc,
  selected,
  badge,
}: {
  label: string;
  desc: string;
  selected?: boolean;
  badge?: string;
}) {
  return (
    <li
      className={`border-hairline bg-canvas mt-[var(--spacing-xs)] flex items-center gap-2.5 rounded-[var(--radius-md)] border px-[var(--spacing-sm)] py-[var(--spacing-xs)] first:mt-0 ${
        selected ? "border-primary" : ""
      }`}
    >
      {selected ? (
        <span className="border-primary bg-primary flex size-4 shrink-0 items-center justify-center rounded-full border-2">
          <span className="bg-on-primary size-2 rounded-full" />
        </span>
      ) : (
        <span className="border-hairline-strong size-4 shrink-0 rounded-full border-2" />
      )}
      <div>
        <span className="text-ink text-sm">{label}</span>
        <span className="caption text-mute block">{desc}</span>
      </div>
      {selected && badge && (
        <span className="bg-canvas-soft caption text-body ml-auto shrink-0 rounded-[var(--radius-full)] px-[var(--spacing-xs)]">
          {badge}
        </span>
      )}
    </li>
  );
}
