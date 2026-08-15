// LandingFooter — hairline top, mono captions. Minimal on purpose: the page
// ends the moment the conversion path does.

import { useTranslation } from "react-i18next";
import { REPO_URL } from "./demoData";

export function LandingFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-hairline border-t">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-[var(--spacing-sm)] px-[var(--spacing-md)] py-[var(--spacing-xl)]">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="bg-primary inline-block size-2 rounded-full" />
          <span className="text-ink font-mono text-sm">grill-me-sleek</span>
        </span>
        <nav className="caption text-body flex items-center gap-[var(--spacing-md)]">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink transition-colors"
          >
            GitHub
          </a>
          <a
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink transition-colors"
          >
            {t("landing.footer.license")}
          </a>
          <a
            href={`${REPO_URL}#self-hosting`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink transition-colors"
          >
            {t("landing.footer.selfHost")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
