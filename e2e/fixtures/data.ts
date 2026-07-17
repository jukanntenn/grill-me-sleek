/**
 * 数据 fixtures
 *
 * 借鉴 airflow 的 data.ts 模式
 * 通过 cli/ 命令准备测试数据
 */

import { test as base } from './pom';
import {
  createSession,
  generateGrilling,
  type CreateSessionResult,
} from '../utils/cli';

// 会话数据
export type SessionFixtureData = {
  session: CreateSessionResult;
  grillingJson: string;
};

// 多轮数据
export type MultiRoundFixtureData = {
  session: CreateSessionResult;
  rounds: Array<{ grillingJson: string; roundNumber: number }>;
};

export type DataFixtures = {
  // 基础会话（单轮）
  basicSession: SessionFixtureData;

  // 多轮会话
  multiRoundSession: MultiRoundFixtureData;

  // 所有题型会话
  allQuestionTypesSession: SessionFixtureData;

  // 可取消的会话
  cancellableSession: SessionFixtureData;
};

export const test = base.extend<DataFixtures>({
  basicSession: [
    async ({}, use) => {
      const grillingJson = generateGrilling({
        name: 'Basic Test Session',
        questions: [
          {
            id: 'q_auth',
            header: 'Auth Method',
            text: 'Which authentication method should we use?',
            type: 'single',
            options: [
              { label: 'JWT' },
              { label: 'Session Cookies' },
            ],
            recommended: 0,
          },
        ],
      });

      const session = await createSession('Basic Test Session', grillingJson);

      await use({ session, grillingJson });
    },
    { scope: 'test' },
  ],

  multiRoundSession: [
    async ({}, use) => {
      const round1Json = generateGrilling({
        name: 'Round 1',
        questions: [
          {
            id: 'q_auth',
            header: 'Auth Method',
            text: 'Which authentication method?',
            type: 'single',
            options: [
              { label: 'JWT' },
              { label: 'Session Cookies' },
            ],
            recommended: 0,
          },
        ],
      });

      const session = await createSession('Multi-Round Test', round1Json);

      const round2Json = generateGrilling({
        name: 'Round 2',
        questions: [
          {
            id: 'q_db',
            header: 'Database',
            text: 'Which database?',
            type: 'single',
            options: [
              { label: 'PostgreSQL' },
              { label: 'MySQL' },
            ],
            recommended: 0,
          },
        ],
      });

      await use({
        session,
        rounds: [
          { grillingJson: round1Json, roundNumber: 1 },
          { grillingJson: round2Json, roundNumber: 2 },
        ],
      });
    },
    { scope: 'test' },
  ],

  allQuestionTypesSession: [
    async ({}, use) => {
      const grillingJson = generateGrilling({
        name: 'All Question Types',
        questions: [
          {
            id: 'q_single',
            header: 'Single Choice',
            text: 'Choose one option',
            type: 'single',
            options: [
              { label: 'Option A', description: 'First option' },
              { label: 'Option B', description: 'Second option' },
              { label: 'Option C', description: 'Third option' },
            ],
            recommended: 0,
          },
          {
            id: 'q_multi',
            header: 'Multiple Choice',
            text: 'Choose multiple options',
            type: 'multi',
            options: [
              { label: 'Feature A' },
              { label: 'Feature B' },
              { label: 'Feature C' },
            ],
          },
          {
            id: 'q_text',
            header: 'Text Input',
            text: 'Enter your thoughts',
            type: 'text',
            max_length: 500,
            placeholder: 'Type here...',
          },
          {
            id: 'q_yesno',
            header: 'Yes/No',
            text: 'Do you agree?',
            type: 'single',
            variant: 'yesno',
          },
          {
            id: 'q_rating',
            header: 'Rating',
            text: 'Rate this proposal',
            type: 'single',
            variant: 'rating',
            rating_max: 5,
          },
        ],
        additional_notes: {
          label: 'Additional Notes',
          placeholder: 'Any other thoughts?',
          max_length: 1000,
          required: false,
        },
      });

      const session = await createSession('All Question Types', grillingJson);

      await use({ session, grillingJson });
    },
    { scope: 'test' },
  ],

  cancellableSession: [
    async ({}, use) => {
      const grillingJson = generateGrilling({
        name: 'Cancellable Session',
        questions: [
          {
            id: 'q1',
            header: 'Question',
            text: 'This session will be cancelled',
            type: 'text',
          },
        ],
      });

      const session = await createSession('Cancellable Session', grillingJson);

      await use({ session, grillingJson });
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
