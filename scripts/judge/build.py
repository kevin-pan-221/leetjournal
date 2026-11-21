"""Generate the offline NeetCode 150 judge pack.

    python3 scripts/judge/build.py [--examples saved-snapshots.json]

Writes public/offline-judge/<slug>.json plus index.json. Hidden tests are fixed
edge cases first, then seeded random cases, then large cases (complexity checks).
Expected values come from the reference solutions in this folder, and every
expected value is validated against the problem's own checker.

--examples takes a JSON list of {slug, md, ex, content} rows exported from a
LeetJournal database to cross-check reference solutions against LeetCode's
official examples. It is optional and never shipped.
"""
import copy
import json
import os
import pathlib
import re
import sys

if os.environ.get('PYTHONHASHSEED') != '0':
    # Generators iterate sets of strings; pin hashing so rebuilds are byte-identical.
    os.execve(sys.executable, [sys.executable, *sys.argv], {**os.environ, 'PYTHONHASHSEED': '0'})
sys.setrecursionlimit(100000)
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

import lib  # noqa: E402
import p_arrays, p_lists_trees, p_search, p_dp, p_design  # noqa: E402,F401
from bundled import BUNDLED  # noqa: E402

harness = {}
exec(compile((ROOT / 'public' / 'offline-harness.py').read_text(), 'offline-harness.py', 'exec'), harness)
matches = harness['matches']

OUT = ROOT / 'public' / 'offline-judge'
NEETCODE_150 = [line.strip() for line in (HERE / 'neetcode150.txt').read_text().splitlines() if line.strip()]
MAX_BYTES = 1_500_000
# LeetCode method signatures (name, parameter names and types) for function problems.
SIGNATURES = json.loads((HERE / 'signatures.json').read_text())


def canonical(value):
    return json.dumps(value, sort_keys=True)


def build_problem(spec):
    rng = lib.make_rng(spec['slug'])
    arg_sets = [tuple(a) for a in spec['fixed']]
    if spec['gen']:
        arg_sets += [spec['gen'](rng, 'small') for _ in range(spec['random_cases'])]
        arg_sets += [spec['gen'](rng, 'large') for _ in range(spec['large'] or 0)]
    tests, seen = [], set()
    for args in arg_sets:
        key = canonical(list(args))
        if key in seen:
            continue
        seen.add(key)
        expected = spec['solve'](*copy.deepcopy(list(args)))
        case = {'args': list(args), 'expected': expected}
        if spec['observe'] is not None:
            case['observe'] = spec['observe']
        # Round-trip through JSON exactly as the app will, then self-validate.
        case = json.loads(json.dumps(case, allow_nan=False))
        if not matches(case, case['expected'], spec['checker']):
            raise SystemExit(f"{spec['slug']}: reference output fails its own checker for {key[:200]}")
        tests.append(case)
    examples = tests[:min(3, len(spec['fixed']))]
    pack = {'version': 1, 'slug': spec['slug'], 'mode': spec['mode'], 'checker': spec['checker'], 'examples': examples, 'tests': tests}
    pack['metadata'] = spec['metadata'] or SIGNATURES[spec['slug']]
    if spec['slug'] in BUNDLED:
        b = BUNDLED[spec['slug']]
        pack['bundled'] = {'title': b['title'], 'content': b['content'], 'exampleTestcases': b['examples'],
                           'metaData': json.dumps(spec['metadata']), 'codeSnippets': [{'langSlug': 'python3', 'code': b['starter']}]}
    return pack


def statement_outputs(html):
    text = re.sub(r'<[^>]+>', '', html).replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&nbsp;', ' ')
    outs = []
    for section in re.split(r'Output:\s*', text)[1:]:
        chunk = re.split(r'Explanation:|Example\s+\d|Constraints:|Follow', section)[0].strip()
        for end in range(len(chunk), 0, -1):
            try:
                outs.append(json.loads(chunk[:end].replace('true', 'true')))
                break
            except ValueError:
                continue
        else:
            outs.append(None)
    return outs


def verify_examples(path):
    rows = {r['slug']: r for r in json.loads(pathlib.Path(path).read_text())}
    checked, problems = 0, []
    for slug, spec in lib.PROBLEMS.items():
        row = rows.get(slug)
        if not row or not row.get('ex') or not row.get('content') or spec['mode'] != 'function' and spec['mode'] not in ('lca', 'linked-list-cycle', 'codec', 'clone-graph', 'copy-random-list'):
            continue
        meta = spec['metadata'] or json.loads(row['md'])
        arity = len(meta['params'])
        lines = [l for l in row['ex'].splitlines() if l.strip()]
        outputs = statement_outputs(row['content'])
        for i in range(0, len(lines) - arity + 1, arity):
            n = i // arity
            if n >= len(outputs) or outputs[n] is None:
                continue
            args = [json.loads(l) for l in lines[i:i + arity]]
            actual = spec['solve'](*copy.deepcopy(args))
            case = {'args': args, 'expected': outputs[n]}
            checked += 1
            if not matches(case, json.loads(json.dumps(actual)), spec['checker']):
                problems.append(f'{slug} example {n + 1}: reference {json.dumps(actual)[:120]} != statement {json.dumps(outputs[n])[:120]}')
    print(f'Cross-checked {checked} official examples')
    for p in problems:
        print('  MISMATCH', p)
    return not problems


def main():
    args = sys.argv[1:]
    missing = [s for s in NEETCODE_150 if s not in lib.PROBLEMS]
    if missing:
        raise SystemExit('Missing reference solutions: ' + ', '.join(missing))
    OUT.mkdir(parents=True, exist_ok=True)
    index, total = {}, 0
    for slug in NEETCODE_150:
        pack = build_problem(lib.PROBLEMS[slug])
        data = json.dumps(pack, separators=(',', ':'), allow_nan=False)
        if len(data) > MAX_BYTES:
            raise SystemExit(f'{slug}: pack is {len(data)} bytes (limit {MAX_BYTES})')
        (OUT / f'{slug}.json').write_text(data)
        total += len(data)
        index[slug] = {'tests': len(pack['tests']), 'mode': pack['mode'], 'bundled': 'bundled' in pack}
    bundled = {slug: json.loads((OUT / f'{slug}.json').read_text())['bundled'] for slug in index if index[slug]['bundled']}
    # The desktop app stores these without contacting LeetCode (their statements are Premium-only there).
    (ROOT / 'src-tauri' / 'src' / 'offline_bundled.json').write_text(json.dumps(bundled, indent=1, sort_keys=True) + '\n')
    (OUT / 'index.json').write_text(json.dumps({'version': 1, 'book': 'neetcode-150', 'problems': index}, separators=(',', ':')))
    for stale in OUT.glob('*.json'):
        if stale.stem not in index and stale.name != 'index.json':
            stale.unlink()
    print(f'Wrote {len(index)} problems, {sum(v["tests"] for v in index.values())} tests, {total / 1e6:.1f} MB to {OUT.relative_to(ROOT)}')
    if '--examples' in args:
        if not verify_examples(args[args.index('--examples') + 1]):
            raise SystemExit(1)


if __name__ == '__main__':
    main()
