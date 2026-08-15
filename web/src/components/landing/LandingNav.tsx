// LandingNav — sticky top bar. Solid canvas + hairline (no blur/glass).
// Wordmark: a selected-radio dot + lowercase mono name — the product's core
// gesture (picking an option) doubles as the brand mark. Reuses Controls so
// the landing ships with theme + locale switching for free.

import { useTranslation } from "react-i18next";
import { Controls } from "../Controls";
import { PillButton } from "./PillButton";
import { REPO_URL } from "./demoData";

export function LandingNav() {
  const { t } = useTranslation();
  return (
    <header className="bg-canvas border-hairline sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-[var(--spacing-md)] px-[var(--spacing-md)]">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="grill-me-sleek on GitHub"
          className="flex shrink-0 items-center gap-2"
        >
          <span aria-hidden="true" className="bg-primary inline-block size-2 rounded-full" />
          <span className="text-ink font-mono text-sm">grill-me-sleek</span>
        </a>
        <div className="flex items-center gap-[var(--spacing-sm)]">
          <div className="hidden sm:block">
            <Controls className="mb-0 flex items-center gap-2" />
          </div>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="body-sm-strong text-body hover:text-ink hidden transition-colors md:inline"
          >
            {t("landing.nav.github")}
          </a>
          <PillButton href={REPO_URL} size="sm">
            {t("landing.nav.install")}
          </PillButton>
        </div>
      </div>
    </header>
  );
}
