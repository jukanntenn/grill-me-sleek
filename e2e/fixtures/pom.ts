/**
 * Page Object Model fixtures
 * 
 * 借鉴 airflow 的 pom.ts 模式
 */

import { test as base } from '@playwright/test';
import { QuestionsPage } from '../pages/QuestionsPage';
import { TerminalPage } from '../pages/TerminalPage';
import { Controls } from '../pages/Controls';

export type PomFixtures = {
  questionsPage: QuestionsPage;
  terminalPage: TerminalPage;
  controls: Controls;
};

export const test = base.extend<PomFixtures>({
  questionsPage: async ({ page }, use) => {
    await use(new QuestionsPage(page));
  },
  terminalPage: async ({ page }, use) => {
    await use(new TerminalPage(page));
  },
  controls: async ({ page }, use) => {
    await use(new Controls(page));
  },
});
