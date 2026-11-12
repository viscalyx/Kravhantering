// Read-only GitHub evidence collection. All successful outcomes are tied to explicit identities.
export class EvidenceError extends Error {
  constructor(message, state = 'unknown', retryAt = 0) {
    super(message);
    this.state = state;
    this.retryAt = retryAt;
  }
}

export function githubClient({ token, fetch: request = fetch, now = Date.now, signal }) {
  async function get(path) {
    const response = await request(`https://api.github.com/${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const reset = response.headers.get('x-ratelimit-reset');
      const limited =
        response.status === 429 ||
        (response.status === 403 &&
          (retry || response.headers.get('x-ratelimit-remaining') === '0'));
      const retryAt = Math.max(
        retry
          ? Number.isFinite(Number(retry))
            ? now() + Number(retry) * 1000
            : Date.parse(retry) || 0
          : 0,
        limited && reset ? Number(reset) * 1000 : 0,
        limited ? now() + 60_000 : 0,
      );
      throw new EvidenceError(
        `GitHub HTTP ${response.status}: ${path}`,
        !limited && [401, 403, 404].includes(response.status) ? 'inaccessible' : 'unknown',
        retryAt,
      );
    }
    return response.json();
  }
  async function list(path, key) {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const result = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const batch = key ? result[key] : result;
      if (!Array.isArray(batch)) throw new EvidenceError(`Invalid list: ${path}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new EvidenceError(`Pagination limit reached: ${path}`);
  }
  return { get, list };
}

export function validateInput(input) {
  if (
    input.version !== 1 ||
    !/^[\w.-]+\/[\w.-]+$/.test(input.repo) ||
    !['published', 'ready'].includes(input.phase) ||
    !input.policyBranch ||
    !Array.isArray(input.prs) ||
    input.prs.length === 0 ||
    (input.prs.length > 1 && !Number.isSafeInteger(input.stack))
  ) {
    throw new Error(
      'Expected version 1, repo, phase, policyBranch, PRs and (for multiple PRs) stack number',
    );
  }
  if (new Set(input.prs.map((pr) => pr.number)).size !== input.prs.length)
    throw new Error('Duplicate PR');
  for (const pr of input.prs) {
    if (
      !Number.isSafeInteger(pr.number) ||
      pr.number < 1 ||
      !/^[a-f0-9]{40}$/.test(pr.head) ||
      !Array.isArray(pr.checks) ||
      pr.checks.length === 0
    )
      throw new Error('Each PR needs number, full head SHA and checks');
    const keys = new Set();
    for (const check of pr.checks) {
      if (
        !check.context ||
        !Number.isSafeInteger(check.appId) ||
        !check.workflow?.startsWith('.github/workflows/') ||
        !check.event ||
        (check.readyAfter && !Number.isFinite(Date.parse(check.readyAfter)))
      ) {
        throw new Error(
          'Each check needs context, appId, workflow, event and a valid optional readyAfter',
        );
      }
      const key = JSON.stringify([check.context, check.appId, check.workflow, check.event]);
      if (keys.has(key)) throw new Error('Duplicate check identity');
      keys.add(key);
    }
  }
  return input;
}

function outcome(states) {
  return (
    ['diverged', 'inaccessible', 'unknown', 'failed', 'pending'].find((state) =>
      states.includes(state),
    ) ?? 'successful'
  );
}

const failedConclusions = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
]);

async function diagnostics(run, api, root) {
  try {
    const artifacts = await api.list(`${root}/actions/runs/${run.id}/artifacts`, 'artifacts');
    return {
      diagnostics: artifacts
        .filter(
          (artifact) =>
            !artifact.expired && Date.parse(artifact.created_at) >= Date.parse(run.run_started_at),
        )
        .map(({ id, name, url }) => ({ id, name, url }))
        .sort((a, b) => a.id - b.id),
    };
  } catch (error) {
    return {
      diagnostics: [],
      diagnosticState: error.state ?? 'unknown',
      diagnosticError: error.message,
      retryAt: error.retryAt || 0,
    };
  }
}

async function identities(input, api, root) {
  const prs = [];
  for (const expected of input.prs) {
    const pr = await api.get(`${root}/pulls/${expected.number}`);
    prs.push({
      number: pr.number,
      head: pr.head?.sha,
      branch: pr.head?.ref,
      base: pr.base?.ref,
      draft: pr.draft,
      state: pr.state,
    });
  }
  let stack;
  if (input.stack !== undefined) {
    const found = await api.get(`${root}/stacks/${input.stack}`);
    stack = {
      number: found.number,
      base: found.base?.ref,
      members: found.pull_requests?.map((pr) => ({ number: pr.number, head: pr.head?.sha })),
    };
  }
  return { prs, ...(stack ? { stack } : {}) };
}

function divergence(input, observed) {
  if (
    observed.prs.some(
      (pr, index) =>
        pr.number !== input.prs[index].number ||
        pr.head !== input.prs[index].head ||
        pr.state !== 'open',
    )
  )
    return 'PR head or open state changed';
  if (
    observed.prs.some(
      (pr, index) =>
        pr.base !== (index === 0 ? input.policyBranch : observed.prs[index - 1].branch),
    )
  )
    return 'PR base changed';
  if (
    input.stack !== undefined &&
    (observed.stack.number !== input.stack ||
      observed.stack.base !== input.policyBranch ||
      JSON.stringify(observed.stack.members) !==
        JSON.stringify(input.prs.map(({ number, head }) => ({ number, head }))))
  )
    return 'Stack target, membership or heads changed';
  return undefined;
}

async function requiredPolicy(input, api, root) {
  const branch = encodeURIComponent(input.policyBranch);
  const rules = await api.list(`${root}/rules/branches/${branch}`);
  const info = await api.get(`${root}/branches/${branch}`);
  if (!info.protection || typeof info.protection.enabled !== 'boolean')
    throw new EvidenceError('Branch protection evidence missing');
  const requirements = rules
    .filter((rule) => rule.type === 'required_status_checks')
    .flatMap((rule) =>
      rule.parameters.required_status_checks.map((check) => ({
        context: check.context,
        appId: check.integration_id,
      })),
    );
  if (rules.some((rule) => rule.type === 'workflows'))
    throw new EvidenceError('Required workflow rules need an explicit policy adapter');
  if (info.protection.enabled) {
    const protection = await api.get(`${root}/branches/${branch}/protection`);
    const statusChecks = protection.required_status_checks;
    if (statusChecks != null && !Array.isArray(statusChecks.checks))
      throw new EvidenceError('Required checks evidence missing');
    requirements.push(
      ...(statusChecks?.checks ?? []).map((check) => ({
        context: check.context,
        appId: check.app_id,
      })),
    );
  }
  return requirements;
}

function boundCheck(job, appId, head, checks) {
  return checks.find(
    (item) =>
      item.id === Number(job.check_run_url?.split('/').at(-1)) &&
      item.app?.id === appId &&
      item.name === job.name &&
      item.head_sha === head,
  );
}

function ambiguousProducer(check, pr, runs, checks, matchingJobs) {
  const knownIds = new Set(matchingJobs.map((job) => Number(job.check_run_url?.split('/').at(-1))));
  const producerKey = (run) => JSON.stringify([run.path, run.event, run.head_branch]);
  const latest = new Map();
  for (const run of [...runs].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
  )) {
    if (!latest.has(producerKey(run))) latest.set(producerKey(run), run.id);
  }
  return checks.some((item) => {
    if (
      item.app?.id !== check.appId ||
      item.name !== check.context ||
      item.head_sha !== pr.head ||
      knownIds.has(item.id)
    )
      return false;
    const producer = runs.find((run) => run.check_suite_id === item.check_suite?.id);
    // An unbound check or a second current producer cannot satisfy one unambiguous policy context.
    return !producer || latest.get(producerKey(producer)) === producer.id;
  });
}

async function checkEvidence(check, input, pr, runs, checks, api, root) {
  const identity = {
    context: check.context,
    appId: check.appId,
    workflow: check.workflow,
    event: check.event,
    ...(check.readyAfter ? { readyAfter: check.readyAfter } : {}),
  };
  const candidates = runs.filter(
    (run) =>
      run.head_sha === pr.head &&
      run.head_branch === pr.branch &&
      run.path === check.workflow &&
      run.event === check.event,
  );
  if (candidates.some((run) => !Number.isFinite(Date.parse(run.created_at)))) {
    throw new EvidenceError('Workflow creation time missing');
  }
  candidates.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const run = candidates[0];
  const history = candidates
    .slice(1)
    .map(({ id, run_attempt, conclusion }) => ({ run: id, attempt: run_attempt, conclusion }));
  if (!run)
    return { ...identity, state: 'pending', reason: 'Expected workflow has not appeared', history };
  const current = {
    ...identity,
    run: run.id,
    attempt: run.run_attempt,
    url: run.html_url,
    history,
  };
  if (
    input.phase === 'ready' &&
    check.readyAfter &&
    Date.parse(run.created_at) < Date.parse(check.readyAfter)
  ) {
    return { ...current, state: 'pending', reason: 'Waiting for a run created after readiness' };
  }
  const jobs = await api.list(`${root}/actions/runs/${run.id}/jobs?filter=all`, 'jobs');
  current.workflowFailures = jobs
    .filter(
      (job) =>
        job.run_id === run.id &&
        job.head_sha === pr.head &&
        job.run_attempt === run.run_attempt &&
        job.status === 'completed' &&
        failedConclusions.has(job.conclusion) &&
        boundCheck(job, check.appId, pr.head, checks),
    )
    .map((job) => ({
      job: job.id,
      name: job.name,
      attempt: job.run_attempt,
      conclusion: job.conclusion,
      url: job.html_url,
    }))
    .sort((a, b) => a.job - b.job);
  if (current.workflowFailures.length) Object.assign(current, await diagnostics(run, api, root));
  const matching = jobs.filter(
    (job) =>
      job.name === check.context &&
      job.head_sha === pr.head &&
      job.run_id === run.id &&
      job.run_attempt <= run.run_attempt,
  );
  matching.sort((a, b) => b.run_attempt - a.run_attempt);
  const job = matching[0];
  if (!job)
    return {
      ...current,
      state: run.status === 'completed' ? 'unknown' : 'pending',
      reason: 'Required job missing',
    };
  if (matching.filter((other) => other.run_attempt === job.run_attempt).length !== 1)
    return { ...current, state: 'unknown', reason: 'Ambiguous job identity' };
  const bound = boundCheck(job, check.appId, pr.head, checks);
  if (!bound)
    return {
      ...current,
      state: 'unknown',
      reason: 'Job/check application identity not established',
    };
  if (ambiguousProducer(check, pr, runs, checks, matching))
    return { ...current, state: 'unknown', reason: 'Ambiguous required-check producer' };
  current.job = job.id;
  current.jobAttempt = job.run_attempt;
  current.url = job.html_url;
  current.history = [
    ...history,
    ...matching.slice(1).map((old) => ({
      run: run.id,
      attempt: old.run_attempt,
      job: old.id,
      conclusion: old.conclusion,
    })),
  ];
  const retained = job.run_attempt < run.run_attempt;
  if (retained && job.conclusion !== 'success')
    return {
      ...current,
      state: 'pending',
      reason: 'Previous failure awaits current attempt evidence',
    };
  if (job.status !== 'completed') return { ...current, state: 'pending' };
  if (job.conclusion === 'success')
    return { ...current, retained, state: run.status === 'completed' ? 'successful' : 'pending' };
  if (failedConclusions.has(job.conclusion))
    return { ...current, state: 'failed', conclusion: job.conclusion };
  return { ...current, state: 'unknown', reason: `Required job conclusion: ${job.conclusion}` };
}

export async function observe(input, api, now = Date.now) {
  validateInput(input);
  const root = `repos/${input.repo}`;
  const result = {
    version: 1,
    repo: input.repo,
    phase: input.phase,
    expected: input.prs.map(({ number, head }) => ({ number, head })),
    observedAt: new Date(now()).toISOString(),
    prs: [],
    blockers: [],
  };
  try {
    result.observed = await identities(input, api, root);
    const changed = divergence(input, result.observed);
    if (changed) return { ...result, state: 'diverged', blockers: [changed] };
    const required = await requiredPolicy(input, api, root);
    for (const pr of input.prs) {
      const missing = required.filter(
        (rule) =>
          !pr.checks.some(
            (check) =>
              check.context === rule.context &&
              (rule.appId == null || rule.appId === -1 || check.appId === rule.appId),
          ),
      );
      if (missing.length)
        throw new EvidenceError(
          `PR ${pr.number}: required checks missing from manifest: ${missing.map((rule) => rule.context).join(', ')}`,
        );
      const runs = await api.list(`${root}/actions/runs?head_sha=${pr.head}`, 'workflow_runs');
      const checks = await api.list(
        `${root}/commits/${pr.head}/check-runs?filter=all`,
        'check_runs',
      );
      const evidence = [];
      for (const check of pr.checks) {
        const found = await checkEvidence(
          check,
          input,
          { ...pr, branch: result.observed.prs.find((item) => item.number === pr.number).branch },
          runs,
          checks,
          api,
          root,
        );
        evidence.push(found);
        if (found.retryAt) {
          const partialState = found.state === 'successful' ? 'unknown' : found.state;
          return {
            ...result,
            state: partialState,
            retryAt: found.retryAt,
            blockers: ['Diagnostics rate limited; remaining evidence not refreshed'],
            prs: [
              ...result.prs,
              { number: pr.number, head: pr.head, state: partialState, checks: evidence },
            ],
          };
        }
      }
      const ready =
        input.phase !== 'ready' ||
        !result.observed.prs.find((item) => item.number === pr.number).draft;
      result.prs.push({
        number: pr.number,
        head: pr.head,
        state: outcome([...evidence.map((check) => check.state), ...(ready ? [] : ['pending'])]),
        checks: evidence,
      });
      if (!ready) result.blockers.push(`PR ${pr.number} remains draft`);
    }
    const confirmed = await identities(input, api, root);
    const changedDuringRead = divergence(input, confirmed);
    if (changedDuringRead)
      return { ...result, observed: confirmed, state: 'diverged', blockers: [changedDuringRead] };
    if (input.phase === 'ready' && confirmed.prs.some((pr) => pr.draft)) {
      return {
        ...result,
        observed: confirmed,
        state: 'pending',
        blockers: ['Readiness changed during observation'],
      };
    }
    result.state = outcome(result.prs.map((pr) => pr.state));
    return result;
  } catch (error) {
    return {
      ...result,
      state: error.state ?? 'unknown',
      blockers: [error.message],
      retryAt: error.retryAt || 0,
    };
  }
}
