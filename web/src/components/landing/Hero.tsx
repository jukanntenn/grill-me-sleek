// Hero — the page opens the way a grilling session does: a round kicker,
// the agent's first question as the H1, then the real QuestionCard a visitor
// would receive. The mesh gradient appears here and nowhere else.

import { useTranslation } from "react-i18next";
import { QuestionCard } from "../QuestionCard";
import { SingleControl } from "../SingleControl";
import { CommandBox } from "./CommandBox";
import { MeshGradient } from "./MeshGradient";
import { PillButton } from "./PillButton";
import { heroAnswer, heroQuestion } from "./demoData";

export function Hero() {
  const { t } = useTranslation();

  const scrollToInstall = () => {
    const el = document.getElementById("install");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <section className="relative isolate overflow-hidden">
      <MeshGradient />
      <div className="relative mx-auto max-w-[1080px] px-[var(--spacing-md)] pt-[var(--spacing-5xl)] pb-[var(--spacing-5xl)] text-center">
        <p className="text-mute font-mono text-xs tracking-[0.12em]">{t("landing.hero.kicker")}</p>
        <h1 className="display-xl text-ink mx-auto mt-[var(--spacing-md)] max-w-[760px] text-balance">
          {t("landing.hero.title")}
        </h1>
        <p className="body-lg text-body mx-auto mt-[var(--spacing-md)] max-w-[620px]">
          {t("landing.hero.subtitle")}
        </p>
        <div className="mt-[var(--spacing-xl)] flex flex-wrap items-center justify-center gap-[var(--spacing-sm)]">
          <PillButton onClick={scrollToInstall}>{t("landing.hero.cta")}</PillButton>
          <CommandBox command="npx @grilling-sleek/cli" />
        </div>
        {/* Static preview of a real question card — inert so the radios are
         * visible but not focusable (the live demo lives in §4). */}
        <div className="mx-auto mt-[var(--spacing-4xl)] max-w-[560px] text-left" inert={true}>
          <QuestionCard question={heroQuestion}>
            <SingleControl question={heroQuestion} value={heroAnswer} onChange={() => {}} />
          </QuestionCard>
          <p className="caption text-mute mt-[var(--spacing-sm)] text-center">
            {t("landing.hero.preview")}
          </p>
        </div>
      </div>
    </section>
  );
}
