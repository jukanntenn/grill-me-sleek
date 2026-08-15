// §2 How it works — 01/02/03 storyboard. Each card carries a fragment of the
// real interface (terminal frame → question card → JSON receipt) instead of
// an icon; the mechanics explain themselves.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section className="py-[var(--spacing-4xl)]">
      <div className="mx-auto max-w-[1080px] px-[var(--spacing-md)] text-center">
        <h2 className="display-lg text-ink">{t("landing.s2.title")}</h2>
        <ol className="mt-[var(--spacing-2xl)] grid list-none gap-[var(--spacing-md)] text-left md:grid-cols-3">
          <Step
            tag={t("landing.s2.step1Tag")}
            title={t("landing.s2.step1Title")}
            body={t("landing.s2.step1Body")}
          >
            <TerminalFrame />
          </Step>
          <Step
            tag={t("landing.s2.step2Tag")}
            title={t("landing.s2.step2Title")}
            body={t("landing.s2.step2Body")}
          >
            <MiniQuestion />
          </Step>
          <Step
            tag={t("landing.s2.step3Tag")}
            title={t("landing.s2.step3Title")}
            body={t("landing.s2.step3Body")}
          >
            <ReceiptFrame />
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({
  tag,
  title,
  body,
  children,
}: {
  tag: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <li className="border-hairline bg-canvas flex flex-col rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-lg)] shadow-[var(--shadow-card)]">
      <p className="text-mute font-mono text-xs tracking-[0.12em]">{tag}</p>
      <div className="mt-[var(--spacing-sm)]">{children}</div>
      <h3 className="display-sm text-ink mt-[var(--spacing-md)]">{title}</h3>
      <p className="body-sm text-body mt-[var(--spacing-xs)]">{body}</p>
    </li>
  );
}

/** Shared chrome for the in-card interface fragments. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="border-hairline bg-canvas-soft rounded-[var(--radius-sm)] border p-[var(--spacing-sm)]">
      <div className="code text-body">{children}</div>
    </div>
  );
}

function TerminalFrame() {
  return (
    <Frame>
      <div>
        <span className="text-mute select-none">$ </span>
        <span className="text-ink">grill me on my plan to add OAuth login</span>
      </div>
      <div className="text-success">✓ 12 questions ready</div>
      <div className="text-link">→ grillingsleek.online/#/aX4f</div>
      <div className="text-mute">⠿ waiting for your answers…</div>
    </Frame>
  );
}

function MiniQuestion() {
  const { t } = useTranslation();
  return (
    <Frame>
      <div>
        <span className="text-ink font-semibold">AUTH</span>
        <span className="text-error"> *</span>
      </div>
      <div className="text-ink">Which auth scheme should we use?</div>
      <div className="mt-[var(--spacing-xs)] flex flex-col gap-1">
        <MiniOption label="Stateless JWT" selected recommendedLabel={t("recommended")} />
        <MiniOption label="Server sessions" />
        <MiniOption label="OAuth 2.0 + OIDC" />
      </div>
    </Frame>
  );
}

function MiniOption({
  label,
  selected,
  recommendedLabel,
}: {
  label: string;
  selected?: boolean;
  recommendedLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {selected ? (
        <span className="border-primary bg-primary flex size-4 shrink-0 items-center justify-center rounded-full border-2">
          <span className="bg-on-primary size-2 rounded-full" />
        </span>
      ) : (
        <span className="border-hairline-strong size-4 shrink-0 rounded-full border-2" />
      )}
      <span className="text-ink">{label}</span>
      {selected && recommendedLabel && (
        <span className="bg-canvas text-mute ml-auto rounded-[var(--radius-full)] px-[var(--spacing-xs)] text-xs">
          {recommendedLabel}
        </span>
      )}
    </div>
  );
}

function ReceiptFrame() {
  return (
    <Frame>
      <div className="text-success">✓ 12 answers → agent</div>
      <div className="text-mute">{`{"auth":"jwt","db":"postgres"}`}</div>
      <div className="text-ink">next round → same tab</div>
    </Frame>
  );
}
