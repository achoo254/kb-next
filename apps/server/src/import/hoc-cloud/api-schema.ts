/**
 * The Học Cloud API answers the importer reads (public, no sign-in): `GET /api/labs`, `GET /api/labs/:slug`,
 * `GET /api/exercises`, `GET /api/exercises/:slug`. Lab fields follow Học Cloud's lab schema v3 (THINK · SEE ·
 * TRY IT). Only the fields the importer renders are checked; a missing or mistyped one stops the import before
 * anything is written. Unknown extra fields are ignored.
 */
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]{1,64}$/);
const Text = z.string();
const Screenshot = z.object({ src: z.string().min(1), alt: Text, caption: Text });

export const LabIndex = z.object({
  labs: z.array(z.object({ slug: Slug, title: Text, module: Text })),
});

export const ExerciseIndex = z.object({
  exercises: z.array(z.object({ slug: Slug, title: Text, topic: Text.nullable() })),
});

const Misconception = z.object({ wrong: Text, right: Text, why: Text });

/** TL;DR rows differ per lab (what/why, or layer/pdu/device…): every field is a string, `why` always present. */
const TldrRow = z.record(z.string(), z.string()).refine((row) => typeof row.why === 'string', { message: 'tldr row without why' });

const WalkthroughStep = z.object({
  step: z.union([z.number(), z.string()]),
  what: Text,
  why: Text,
  whyBreaks: Text.optional(),
  observeWith: Text,
  code: Text.optional(),
  lang: Text.optional(),
  note: Text.optional(),
  deploymentUse: Text.optional(),
  failModes: z.array(z.object({ symptom: Text, evidence: Text })).optional(),
  fixSteps: z.array(z.object({ step: Text, command: Text.optional() })).optional(),
  automateScript: z.object({ lang: Text, code: Text, note: Text.optional() }).optional(),
});

/** Why each wrong option is wrong: a map from option index to text, or one text for all. */
const WhyWrong = z.union([Text, z.record(z.string(), Text)]);

const QuizQuestion = z.object({
  q: Text,
  options: z.array(Text).min(2),
  correct: z.number().int().min(0),
  whyCorrect: Text,
  whyOthersWrong: WhyWrong.optional(),
  whyWrong: WhyWrong.optional(),
});

const Flashcard = z.object({ front: Text, back: Text, why: Text.optional() });

const TryAtHome = z.object({
  title: Text.optional(),
  why: Text,
  cmd: Text,
  observeWith: Text.optional(),
  estimatedMinutes: z.number().optional(),
  vmTarget: Text.optional(),
  phaseType: Text.optional(),
  steps: z.array(z.object({ n: z.number().int(), do: Text, expect: Text, screenshot: Screenshot.optional() })).optional(),
  analysis: z.object({ observation: Text, mechanism: Text, lesson: Text }).optional(),
  troubleshooting: z.array(z.object({ symptom: Text, fix: Text })).optional(),
});

export const LabDetail = z.object({
  lab: z.object({
    slug: Slug,
    module: Text,
    title: Text.min(1),
    estimated_minutes: z.number().nullable(),
    content_hash: Text.min(1),
    tldr: z.array(TldrRow),
    walkthrough: z.array(WalkthroughStep).min(1),
    quiz: z.array(QuizQuestion),
    flashcards: z.array(Flashcard),
    try_at_home: z.array(TryAtHome),
    misconceptions: z.array(Misconception),
    /** An interactive playground on the Học Cloud page; kb links to it instead of copying it. */
    diagram: z.object({ type: Text, component: Text }).nullish(),
  }),
});

export const ExerciseDetail = z.object({
  exercise: z.object({
    slug: Slug,
    title: Text.min(1),
    topic: Text.nullable(),
    brief: Text,
    estimated_minutes: z.number().nullable(),
    content_hash: Text.min(1),
    guide: z.array(z.object({ step: z.number().int(), instruction: Text, command: Text.optional(), note: Text.optional() })),
    demo: z.array(
      z.object({ step: z.number().int(), what: Text, command: Text.optional(), output: Text.optional(), note: Text.optional(), screenshot: Screenshot.optional() }),
    ),
    references: z.array(z.object({ label: Text, url: z.string().min(1) })),
  }),
});

export type Lab = z.infer<typeof LabDetail>['lab'];
export type Exercise = z.infer<typeof ExerciseDetail>['exercise'];
export type QuizWhyWrong = z.infer<typeof WhyWrong>;
