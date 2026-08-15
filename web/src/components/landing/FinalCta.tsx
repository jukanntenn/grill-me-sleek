// §5 Final CTA — mirrors the app's completion screen (TerminalPage chrome):
// the landing itself "completes". Both install paths + the trigger phrase.

import { useTranslation } from "react-i18next";
import { CommandBox } from "./CommandBox";
import { PillButton } from "./PillButton";
import { REPO_URL } from "./demoData";

export function FinalCta() {
  const { t } = useTranslation();
  return (
    <section id="install" className="pt-[var(--spacing-4xl)] pb-[var(--spacing-5xl)]">
      <div className="mx-auto max-w-[720px] px-[var(--spacing-md)]">
        <div className="bg-canvas-soft rounded-[var(--radius-lg)] px-[var(--spacing-3xl)] py-[var(--spacing-3xl)] text-center shadow-[var(--shadow-card)]">
          <h2 className="display-md text-ink">{t("landing.s5.title")}</h2>
          <p className="body-lg text-body mt-[var(--spacing-sm)]">{t("landing.s5.body")}</p>
          <div className="mt-[var(--spacing-xl)] flex flex-col items-center gap-[var(--spacing-sm)]">
            <div className="flex flex-col items-center gap-[var(--spacing-xxs)]">
              <span className="text-mute font-mono text-xs tracking-[0.12em]">
                {t("landing.s5.cliLabel")}
              </span>
              <CommandBox command="npx @grilling-sleek/cli" />
            </div>
            <div className="flex flex-col items-center gap-[var(--spacing-xxs)]">
              <span className="text-mute font-mono text-xs tracking-[0.12em]">
                {t("landing.s5.pluginLabel")}
              </span>
              <CommandBox
                command="/plugin marketplace add jukanntenn/grill-me-sleek"
                prompt=""
                testId="plugin-command"
              />
            </div>
          </div>
          <p className="body-sm text-body mt-[var(--spacing-xl)]">
            {t("landing.s5.triggerLead")}{" "}
            <span className="text-ink font-mono text-sm">{t("landing.s5.trigger")}</span>
          </p>
          <div className="mt-[var(--spacing-lg)]">
            <PillButton href={REPO_URL} variant="secondary">
              {t("landing.s5.github")}
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  );
}
