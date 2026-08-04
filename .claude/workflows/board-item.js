export const meta = {
  name: 'board-item',
  description: 'Take one board item from issue to a reviewed plan and a working implementation',
  whenToUse: 'Picking up an item from the V-Tech WebChat board. Pass the issue number as args, e.g. {issue: 20}. Stops before committing - the branch is left for a human to review.',
  phases: [
    { title: 'Understand', detail: 'read the issue and map the code it touches' },
    { title: 'Plan', detail: 'three independent plans from different angles' },
    { title: 'Review', detail: 'adversarially review each plan as it lands' },
    { title: 'Choose', detail: 'merge the survivors into one plan' },
    { title: 'Implement', detail: 'apply it on a branch, test-first' },
    { title: 'Verify', detail: 'client suite, Release build, and an independent check' },
  ],
}

const issue = String(args?.issue ?? args ?? '').trim()
if (!/^\d+$/.test(issue)) {
  throw new Error(`Pass the issue number, e.g. {issue: 20}. Got: ${JSON.stringify(args)}`)
}

// Every agent gets this. The repo's conventions live in skills; pointing at them beats
// restating them here, where they would immediately start drifting out of date.
const REPO = `
Repo: WebChat - ASP.NET Core (.NET 10) + SignalR API, React 19 / MUI v9 / Redux Toolkit SPA
built by Vite 8. Solution at WebChat/WebChat.sln, client at WebChat/WebChat/ClientApp.

Read these before doing anything, and follow them:
  CLAUDE.md                              - repo-wide constraints and traps
  docs/ctx/ORIENTATION.md                - what lives where
  docs/ctx/README.md                     - index of prior notes; check for one covering this area
  .claude/skills/fix-flow/SKILL.md       - the defect pipeline, especially proving a test fails first
  .claude/skills/git-convention/SKILL.md - branch and commit format
  .claude/skills/commit-authorship/SKILL.md - no AI co-author trailer, ever

Hard constraints that have each cost real time here:
  - Every stored DateTime must be UTC; Npgsql throws on Local/Unspecified.
  - Newtonsoft.Json is deliberate: endpoints return Dictionary<DateTime,...> keys the client parses.
  - JSX only in .jsx files; Vite does not transform JSX in .js.
  - The build must stay at 0 warnings.
  - UI talks to services/chat-service.ts, never api-service or mocks directly.
`

const ISSUE_SCHEMA = {
  type: 'object',
  required: ['title', 'problem', 'affectedFiles', 'acceptance', 'openQuestions'],
  properties: {
    title: { type: 'string' },
    problem: { type: 'string', description: 'The defect or gap in your own words, not the issue text' },
    affectedFiles: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths, most relevant first' },
    existingCoverage: { type: 'string', description: 'What already tests this area, honestly - "none" if none' },
    acceptance: { type: 'array', items: { type: 'string' }, description: 'Checkable conditions that mean this is done' },
    openQuestions: { type: 'array', items: { type: 'string' }, description: 'Anything a plan cannot resolve from the repo alone' },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['summary', 'steps', 'tests', 'risks', 'outOfScope'],
  properties: {
    summary: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'change', 'why'],
        properties: { file: { type: 'string' }, change: { type: 'string' }, why: { type: 'string' } },
      },
    },
    tests: {
      type: 'array',
      description: 'Each test, and crucially how it is proved to fail before the fix exists',
      items: {
        type: 'object',
        required: ['name', 'asserts', 'provedFailingBy'],
        properties: { name: { type: 'string' }, asserts: { type: 'string' }, provedFailingBy: { type: 'string' } },
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    outOfScope: { type: 'array', items: { type: 'string' }, description: 'Deliberately not done, so review does not ask for it' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'score', 'blocking', 'notes'],
  properties: {
    verdict: { enum: ['sound', 'salvageable', 'wrong'] },
    score: { type: 'integer', minimum: 1, maximum: 10 },
    blocking: {
      type: 'array',
      description: 'Objections that must be answered before implementing. Empty if none.',
      items: {
        type: 'object',
        required: ['objection', 'consequence'],
        properties: { objection: { type: 'string' }, consequence: { type: 'string' } },
      },
    },
    notes: { type: 'string' },
  },
}

phase('Understand')
const brief = await agent(`${REPO}

Read GitHub issue #${issue} of borschetsky/WebChat:
    gh issue view ${issue} --repo borschetsky/WebChat

Then investigate the code it concerns until you can describe the problem in your own words
rather than paraphrasing the issue. Read the actual files. Check docs/ctx/README.md for a
note covering this area - it will usually save you the investigation.

Be exact about existing coverage. "56 tests pass" is not coverage of this area; name the
tests that would fail if this were broken, or say plainly that none would. That question is
what this repo has got wrong before.

Do not write any code.`, { label: `read:#${issue}`, phase: 'Understand', schema: ISSUE_SCHEMA })

log(`#${issue}: ${brief.title}`)
log(`${brief.affectedFiles.length} files in scope; coverage today: ${brief.existingCoverage}`)
if (brief.openQuestions.length) log(`open questions: ${brief.openQuestions.join(' | ')}`)

// Three angles rather than three attempts at the same plan. Identical prompts produce
// near-identical plans and the review stage then has nothing to compare.
const ANGLES = [
  {
    key: 'minimal',
    brief: `Smallest change that fully satisfies the acceptance criteria. Prefer editing what
exists over adding structure. Treat every new file and every new abstraction as a cost you
must justify. If the smallest correct change is still large, say so rather than shrinking
the scope to make the plan look neat.`,
  },
  {
    key: 'robust',
    brief: `Assume this will regress. Where does the failure become impossible rather than
merely fixed - a build error, a type, a guard that throws at boot? This repo's best fixes
work that way: IncludeSpaOutput fails the publish when dist is empty; ValidateRequiredConfiguration
refuses to boot without secrets. Prefer defence at both ends of a contract between two
components, and say why both halves must stay.`,
  },
  {
    key: 'test-first',
    brief: `Design the tests first and let them dictate the change. For each test state exactly
how you will prove it fails before the fix exists - that is the step this repo has burned
itself on: a regression test for the search loop passed against the buggy code because its
harness never re-rendered, so it proved nothing. Reproduce the whole mechanism, not its shape.`,
  },
]

const reviewed = await pipeline(
  ANGLES,
  (angle) => agent(`${REPO}

Write an implementation plan for issue #${issue}.

CONTEXT ESTABLISHED SO FAR
${JSON.stringify(brief, null, 2)}

YOUR ANGLE
${angle.brief}

Read the real files before planning; the brief above is a starting point, not the truth.
Be concrete - name files and describe changes precisely enough that someone else could
apply them. Do not write the code itself.

State what you are deliberately not doing, so review does not treat scope you rejected as
something you missed.`, { label: `plan:${angle.key}`, phase: 'Plan', schema: PLAN_SCHEMA }),

  (plan, angle) => agent(`${REPO}

Review this implementation plan for issue #${issue}. Your job is to find what is wrong with
it, not to improve it. Default to scepticism.

THE PLAN (angle: ${angle.key})
${JSON.stringify(plan, null, 2)}

ORIGINAL CONTEXT
${JSON.stringify(brief, null, 2)}

Check the plan against the actual code - a plan that names a file that does not exist, or
misdescribes what a function does, is wrong however sensible it reads.

Weigh these in particular:
  - Does every test have a credible way of being proved to fail first? A test that would
    pass against the unfixed code is worse than no test: it is read later as proof the bug
    cannot recur. This is the single most common failure in this repo's history.
  - Does the plan explain the whole symptom, or only part of it?
  - Does it break anything in CLAUDE.md - UTC DateTimes, Newtonsoft, the chat-service seam,
    JSX file extensions, the 0-warning build?
  - Is it scoped to this issue, or has it grown into a refactor?
  - Would it leave the codebase harder to change than it found it?

Mark blocking only what must be answered before implementing. Do not pad the list; a review
that objects to everything is as useless as one that objects to nothing.`,
    { label: `review:${angle.key}`, phase: 'Review', schema: REVIEW_SCHEMA })
    .then((review) => ({ angle: angle.key, plan, review })),
)

const candidates = reviewed.filter(Boolean)
if (!candidates.length) throw new Error('Every plan failed to produce a reviewed candidate.')

for (const c of candidates) {
  log(`${c.angle}: ${c.review.verdict} (${c.review.score}/10), ${c.review.blocking.length} blocking`)
}

// Barrier is correct here: choosing requires comparing all three against each other.
phase('Choose')
const chosen = await agent(`${REPO}

Three plans for issue #${issue} were written from different angles and each independently
reviewed. Produce the single plan to implement.

${JSON.stringify(candidates, null, 2)}

Do not simply pick the highest score. Take the strongest plan as the base and graft in what
the others got right - the minimal plan often has the better scope, the robust one the better
failure mode, the test-first one the better tests.

Every blocking objection must be answered: resolved in the merged plan, or explicitly
rejected with a reason. Answering none of them is not an option.

If all three are wrong about something the reviews missed, say so and write the correct plan.

Return the merged plan in the same schema, plus a short note on what you took from where and
how each blocking objection was handled.`, {
  label: 'choose',
  phase: 'Choose',
  schema: {
    type: 'object',
    required: ['plan', 'rationale', 'objectionsHandled'],
    properties: {
      plan: PLAN_SCHEMA,
      rationale: { type: 'string' },
      objectionsHandled: { type: 'array', items: { type: 'string' } },
    },
  },
})

log(`chosen: ${chosen.plan.summary}`)

phase('Implement')
const built = await agent(`${REPO}

Implement this plan for issue #${issue}. Follow .claude/skills/fix-flow/SKILL.md throughout.

THE PLAN
${JSON.stringify(chosen.plan, null, 2)}

RATIONALE AND OBJECTIONS ALREADY SETTLED
${chosen.rationale}
${chosen.objectionsHandled.join('\n')}

Order of work, which is not negotiable:
  1. Create a branch per .claude/skills/git-convention/SKILL.md. Never work on master.
  2. Write the tests FIRST. Run them. Watch them FAIL, with the message you expected.
     If they pass before the fix exists they are testing nothing - fix the test, not the code.
     Record the actual failure output; you must report it.
  3. Implement.
  4. Re-run: the new tests pass, the full client suite passes, and
     dotnet build WebChat.sln -c Release is still 0 warnings.
  5. Do NOT commit and do NOT open a PR. Leave the branch with the changes in the working
     tree for a human to read.

If the plan turns out to be wrong once you are in the code, stop and say so rather than
forcing it through. A plan is a hypothesis, and you are the first to test it against reality.

Report honestly: what you changed, the exact failure output that proved each test valid, what
you could not do, and anything you left unverified.`, {
  label: 'implement',
  phase: 'Implement',
  schema: {
    type: 'object',
    required: ['branch', 'filesChanged', 'testFailureEvidence', 'suiteResult', 'buildResult', 'notDone'],
    properties: {
      branch: { type: 'string' },
      filesChanged: { type: 'array', items: { type: 'string' } },
      testFailureEvidence: { type: 'string', description: 'Verbatim output from running the new tests BEFORE the fix' },
      suiteResult: { type: 'string' },
      buildResult: { type: 'string' },
      notDone: { type: 'array', items: { type: 'string' } },
      planWasWrong: { type: 'string', description: 'Empty unless the plan had to be departed from' },
    },
  },
})

log(`branch ${built.branch}, ${built.filesChanged.length} files`)

// The implementer grading its own work is the weakest link in any pipeline like this, so
// the last word goes to an agent that did not write the code.
phase('Verify')
const audit = await agent(`${REPO}

An agent implemented issue #${issue} on branch ${built.branch}. Check its work independently.
It is grading its own homework; you are not.

WHAT IT CLAIMS
${JSON.stringify(built, null, 2)}

Verify by running things, not by reading the claims:
  1. git diff master...${built.branch} - does the diff match what was claimed?
  2. Run the client suite yourself: cd WebChat/WebChat/ClientApp && npm run test
  3. Run: cd WebChat && dotnet build WebChat.sln -c Release  (0 warnings, or it is a regression)
  4. THE IMPORTANT ONE: revert the source fix only - not the tests - re-run the new tests,
     and confirm they actually fail. Then restore. If they still pass, the tests are false
     and this work is not done, whatever else is green.
  5. Check the diff against CLAUDE.md's constraints.

Report what you actually observed. If the implementer overclaimed, say exactly where.`, {
  label: 'verify',
  phase: 'Verify',
  schema: {
    type: 'object',
    required: ['testsProvedValid', 'suitePasses', 'buildClean', 'discrepancies', 'verdict'],
    properties: {
      testsProvedValid: { type: 'boolean', description: 'Tests were confirmed to fail with the fix reverted' },
      revertEvidence: { type: 'string' },
      suitePasses: { type: 'boolean' },
      buildClean: { type: 'boolean' },
      discrepancies: { type: 'array', items: { type: 'string' }, description: 'Where the claims and reality differ' },
      verdict: { enum: ['ready for review', 'needs work'] },
    },
  },
})

log(`verdict: ${audit.verdict}; tests proved valid: ${audit.testsProvedValid}`)

return {
  issue: Number(issue),
  title: brief.title,
  branch: built.branch,
  plan: chosen.plan.summary,
  rationale: chosen.rationale,
  planScores: candidates.map((c) => ({ angle: c.angle, verdict: c.review.verdict, score: c.review.score })),
  filesChanged: built.filesChanged,
  testFailureEvidence: built.testFailureEvidence,
  audit,
  notDone: built.notDone,
  planWasWrong: built.planWasWrong || null,
}
