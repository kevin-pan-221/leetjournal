import json, io, contextlib, traceback, collections, typing, heapq, math, itertools, functools, bisect, builtins, time, linecache, sys, string, random, re, operator

# Python's default recursion limit (1000) is kept on purpose: deeper Python recursion
# overflows the WebAssembly stack and stops the runtime instead of raising RecursionError.
RECURSION_HINT = ('\nHint: offline Python supports about 1000 nested calls (LeetCode allows more). '
                  'Hidden tests are sized to fit; check for missing base cases or switch to iteration.')


# ---- Comparison -----------------------------------------------------------------

def same_json(left, right):
    # Python considers True == 1; JSON test comparisons must not.
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, float) or isinstance(right, float):
        # LeetCode accepts floating-point answers within 1e-5.
        return isinstance(left, (int, float)) and isinstance(right, (int, float)) and abs(left - right) <= 1e-5 * max(1.0, abs(right))
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(same_json(a, b) for a, b in zip(left, right))
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(same_json(left[k], right[k]) for k in left)
    return left == right


def _key(item):
    return json.dumps(item, sort_keys=True)


def _sorted(items):
    return sorted(items, key=_key)


def check_topological_order(actual, expected, args):
    n, prerequisites = args
    if not expected:
        return actual == []
    if not isinstance(actual, list) or sorted(actual) != list(range(n)):
        return False
    position = {course: i for i, course in enumerate(actual)}
    return all(position[b] < position[a] for a, b in prerequisites)


def check_alien_order(actual, expected, args):
    words = args[0]
    if expected == '':
        return actual == ''
    if not isinstance(actual, str) or sorted(actual) != sorted({c for w in words for c in w}):
        return False
    rank = {c: i for i, c in enumerate(actual)}
    for a, b in zip(words, words[1:]):
        for x, y in zip(a, b):
            if x != y:
                if rank[x] > rank[y]:
                    return False
                break
    return True


def check_longest_palindrome(actual, expected, args):
    s = args[0]
    return isinstance(actual, str) and len(actual) == len(expected) and actual == actual[::-1] and actual in s


CHECKERS = {
    'exact': lambda actual, expected, args: same_json(actual, expected),
    'unordered': lambda actual, expected, args: isinstance(actual, list) and isinstance(expected, list) and same_json(_sorted(actual), _sorted(expected)),
    'nested-unordered': lambda actual, expected, args: isinstance(actual, list) and isinstance(expected, list)
        and all(isinstance(x, list) for x in actual)
        and same_json(_sorted([_sorted(x) for x in actual]), _sorted([_sorted(x) for x in expected])),
    'topological-order': check_topological_order,
    'alien-order': check_alien_order,
    'longest-palindrome': check_longest_palindrome,
}


def matches(case, actual, checker):
    expected = case['expected']
    if case.get('unordered') and isinstance(actual, list) and isinstance(expected, list):
        return same_json(_sorted(actual), _sorted(expected))
    return CHECKERS.get(checker, CHECKERS['exact'])(actual, expected, case['args'])


def solution_error(error):
    frames = [frame for frame in traceback.extract_tb(error.__traceback__) if frame.filename == '<solution>']
    return (''.join(traceback.format_list(frames)) + ''.join(traceback.format_exception_only(type(error), error)))[:4000]


# ---- LeetCode data structures -------------------------------------------------

# Every node built by the judge or by a solution is tracked so it can be unlinked
# iteratively after each case. Freeing a long chain otherwise recurses in C and
# overflows the WebAssembly stack (a fatal error, not a Python exception).
_NODES = []


class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next
        _NODES.append(self)


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right
        _NODES.append(self)


class RandomNode:
    def __init__(self, x=0, next=None, random=None):
        self.val, self.next, self.random = int(x), next, random
        _NODES.append(self)


class GraphNode:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []
        _NODES.append(self)


def release_nodes():
    for node in _NODES:
        try:
            node.__dict__.clear()
        except Exception:
            pass
    _NODES.clear()


def decode_arg(value, kind):
    if kind == 'json':
        return value
    if kind.endswith('[]'):
        if not isinstance(value, list):
            raise TypeError('Expected a JSON array for ' + kind)
        return [decode_arg(item, kind[:-2]) for item in value]
    if kind == 'ListNode':
        node = None
        for item in reversed(value or []):
            node = ListNode(item, node)
        return node
    if kind == 'TreeNode':
        if not value or value[0] is None:
            return None
        root = TreeNode(value[0])
        queue = collections.deque([root])
        remaining = iter(value[1:])
        while queue:
            node = queue.popleft()
            for side in ('left', 'right'):
                try:
                    val = next(remaining)
                except StopIteration:
                    return root
                if val is not None:
                    child = TreeNode(val)
                    setattr(node, side, child)
                    queue.append(child)
        return root
    return value


def encode_result(value, kind):
    if kind == 'json':
        return value
    if kind.endswith('[]'):
        # Preserve tuples/views accepted by Python solutions, but do not silently
        # turn strings or dictionaries into array results.
        if isinstance(value, (str, bytes, dict)) or value is None:
            raise TypeError('Expected an iterable result for ' + kind)
        result = []
        for item in value:
            if len(result) >= 200000:
                raise ValueError('Oversized array result')
            result.append(encode_result(item, kind[:-2]))
        return result
    if kind == 'ListNode':
        items, seen = [], set()
        while value is not None:
            if id(value) in seen or len(items) >= 200000:
                raise ValueError('Cyclic or oversized linked-list result')
            seen.add(id(value)); items.append(value.val); value = value.next
        return items
    if kind == 'TreeNode':
        items, seen, queue = [], set(), collections.deque([value])
        while queue:
            node = queue.popleft()
            if node is None:
                items.append(None)
                continue
            if id(node) in seen or len(items) >= 200000:
                raise ValueError('Cyclic or oversized tree result')
            seen.add(id(node)); items.append(node.val); queue.extend((node.left, node.right))
        while items and items[-1] is None:
            items.pop()
        return items
    if kind in ('double', 'float') and isinstance(value, int) and not isinstance(value, bool):
        return float(value)
    return value


# ---- Execution modes -----------------------------------------------------------

def solution(namespace):
    if 'Solution' not in namespace:
        raise NameError("Define class Solution (keep LeetCode's starter signature).")
    return namespace['Solution']()


def run_function(namespace, case, metadata):
    args = [decode_arg(arg, param['type']) for arg, param in zip(case['args'], metadata['params'])]
    actual = getattr(solution(namespace), metadata['name'])(*args)
    if 'observe' in case:
        observed = case['observe']
        return encode_result(args[observed], metadata['params'][observed]['type'])
    return encode_result(actual, metadata['return']['type'])


def run_design(namespace, case, metadata):
    operations, arguments = case['args']
    if not operations or len(operations) != len(arguments):
        raise ValueError('operations and arguments must have the same length')
    if operations[0] not in namespace:
        raise NameError('Define class ' + operations[0] + " (keep LeetCode's starter signature).")
    instance = namespace[operations[0]](*arguments[0])
    out = [None]
    for name, args in zip(operations[1:], arguments[1:]):
        out.append(getattr(instance, name)(*args))
    return out


def run_linked_list_cycle(namespace, case, metadata):
    values, pos = case['args']
    nodes = [ListNode(v) for v in values]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if nodes and pos >= 0:
        nodes[-1].next = nodes[pos]
    return solution(namespace).hasCycle(nodes[0] if nodes else None)


def encode_random_list(head, forbidden=()):
    order, index, node = [], {}, head
    while node is not None:
        if id(node) in index or len(order) > 200000:
            raise ValueError('Returned list has a cycle in next pointers')
        if id(node) in forbidden:
            raise ValueError('Returned list reuses a node from the original list; create a deep copy')
        index[id(node)] = len(order)
        order.append(node)
        node = node.next
    out = []
    for node in order:
        target = getattr(node, 'random', None)
        if target is not None and id(target) not in index:
            raise ValueError('A random pointer refers to a node outside the returned list')
        out.append([node.val, None if target is None else index[id(target)]])
    return out


def run_copy_random_list(namespace, case, metadata):
    pairs = case['args'][0]
    nodes = [RandomNode(v) for v, _ in pairs]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    for node, (_, r) in zip(nodes, pairs):
        node.random = None if r is None else nodes[r]
    result = solution(namespace).copyRandomList(nodes[0] if nodes else None)
    if encode_random_list(nodes[0] if nodes else None) != pairs:
        raise ValueError('The original list was modified')
    return encode_random_list(result, {id(n) for n in nodes})


def run_lca(namespace, case, metadata):
    root_values, p, q = case['args']
    root = decode_arg(root_values, 'TreeNode')
    found, stack = {}, [root]
    while stack:
        node = stack.pop()
        if node:
            found.setdefault(node.val, node)
            stack += [node.left, node.right]
    result = solution(namespace).lowestCommonAncestor(root, found.get(p), found.get(q))
    return None if result is None else result.val


def run_codec(namespace, case, metadata):
    if 'Codec' not in namespace:
        raise NameError("Define class Codec (keep LeetCode's starter signature).")
    root = decode_arg(case['args'][0], 'TreeNode')
    data = namespace['Codec']().serialize(root)
    if not isinstance(data, str):
        raise TypeError('serialize must return a string, got ' + type(data).__name__)
    return encode_result(namespace['Codec']().deserialize(data), 'TreeNode')


def run_clone_graph(namespace, case, metadata):
    adjacency = case['args'][0]
    nodes = [GraphNode(i + 1) for i in range(len(adjacency))]
    for node, neighbors in zip(nodes, adjacency):
        node.neighbors = [nodes[v - 1] for v in neighbors]
    result = solution(namespace).cloneGraph(nodes[0] if nodes else None)
    if result is None:
        return []
    originals = {id(n) for n in nodes}
    seen, queue = {result.val: result}, collections.deque([result])
    while queue:
        node = queue.popleft()
        if id(node) in originals:
            raise ValueError('Returned graph reuses a node from the original; create a deep copy')
        for other in node.neighbors:
            if other.val not in seen:
                seen[other.val] = other
                queue.append(other)
            elif seen[other.val] is not other:
                raise ValueError('Returned graph has two different nodes with value ' + str(other.val))
    return [[n.val for n in seen[v].neighbors] for v in range(1, len(seen) + 1)]


def run_encode_decode(namespace, case, metadata):
    strs = list(case['args'][0])
    encoded = solution(namespace).encode(strs)
    if not isinstance(encoded, str):
        raise TypeError('encode must return a string, got ' + type(encoded).__name__)
    # A fresh instance proves decode does not rely on state saved by encode.
    return encode_result(solution(namespace).decode(encoded), 'string[]')


MODES = {
    'function': run_function,
    'design': run_design,
    'linked-list-cycle': run_linked_list_cycle,
    'copy-random-list': run_copy_random_list,
    'lca': run_lca,
    'codec': run_codec,
    'clone-graph': run_clone_graph,
    'encode-decode': run_encode_decode,
}


class BoundedOutput(io.StringIO):
    def write(self, text):
        remaining = max(0, 4000 - self.tell())
        super().write(text[:remaining])
        return len(text)


_PRELUDE = None


def base_namespace(mode):
    """Mirror LeetCode's Python 3 prelude: common modules plus their star imports."""
    global _PRELUDE
    if _PRELUDE is None:
        import copy
        _PRELUDE = {}
        for module in (copy, string, re, random, operator, bisect, functools, itertools, math, heapq, collections, typing):
            names = getattr(module, '__all__', None) or [key for key in dir(module) if not key.startswith('_')]
            _PRELUDE.update({key: getattr(module, key) for key in names if hasattr(module, key) and not hasattr(builtins, key)})
        for module in (copy, string, re, random, operator, bisect, functools, itertools, math, heapq, collections, typing, sys, json):
            _PRELUDE[module.__name__] = module
    namespace = dict(_PRELUDE)
    namespace.update({'__name__': '__solution__', 'ListNode': ListNode, 'TreeNode': TreeNode,
                      'Node': RandomNode if mode == 'copy-random-list' else GraphNode})
    return namespace


def progress(index):
    try:
        import js  # Pyodide worker only
        js.reportProgress(index)
    except Exception:
        pass


def execute(compiled, case, metadata, mode):
    """Run one case and return a result row (without status/compare)."""
    output = BoundedOutput()
    row = {'stdout': ''}
    started = time.perf_counter()
    namespace = base_namespace(mode)
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            exec(compiled, namespace)
            actual = MODES[mode](namespace, case, metadata)
            serialized = json.dumps(actual, allow_nan=False)
            if len(serialized) > 2_000_000:
                raise ValueError('Result is too large (2 MB limit)')
            row['actual'] = json.loads(serialized)
    except RecursionError as error:
        row['error'] = solution_error(error)[-3000:] + RECURSION_HINT
    except BaseException as error:
        row['error'] = solution_error(error)
    row['durationMs'] = round((time.perf_counter() - started) * 1000, 3)
    row['stdout'] = output.getvalue()
    namespace.clear()
    release_nodes()
    return row


def compile_solution(code):
    linecache.cache['<solution>'] = (len(code), None, code.splitlines(True), '<solution>')
    return compile(code, '<solution>', 'exec')


def preview(value, limit=4000):
    text = json.dumps(value, allow_nan=False)
    return value if len(text) <= limit else text[:limit] + '…'


def run_local(payload):
    """Run: every case, with full details (custom and example tests)."""
    metadata, judge = payload['metadata'], payload.get('judge') or {}
    mode, checker = judge.get('mode', 'function'), judge.get('checker', 'exact')
    try:
        compiled = compile_solution(payload['code'])
    except SyntaxError as error:
        return [{'index': index, 'status': 'error', 'error': solution_error(error), 'stdout': '', 'durationMs': 0}
                for index in range(len(payload['tests']))]
    results = []
    for index, case in enumerate(payload['tests']):
        row = execute(compiled, case, metadata, mode)
        row['index'] = index
        if 'error' in row:
            row['status'] = 'error'
        else:
            row['status'] = 'output'
            if 'expected' in case:
                row['expected'] = case['expected']
                row['status'] = 'passed' if matches(case, row['actual'], checker) else 'different'
            row['actual'] = preview(row['actual'], 16000)
            if 'expected' in row:
                row['expected'] = preview(row['expected'], 16000)
        results.append(row)
    return results


def submit_local(payload):
    """Submit: hidden tests in order, stopping at the first failure like LeetCode."""
    metadata, judge = payload['metadata'], payload.get('judge') or {}
    mode, checker = judge.get('mode', 'function'), judge.get('checker', 'exact')
    tests = payload['tests']
    summary = {'total': len(tests), 'passed': 0, 'runtimeMs': 0}
    try:
        compiled = compile_solution(payload['code'])
    except SyntaxError as error:
        return {**summary, 'verdict': 'compile-error', 'error': solution_error(error)}
    for index, case in enumerate(tests):
        progress(index)
        row = execute(compiled, case, metadata, mode)
        summary['runtimeMs'] = round(summary['runtimeMs'] + row['durationMs'], 3)
        failure = {'index': index, 'args': [preview(arg) for arg in case['args']], 'stdout': row['stdout']}
        if 'error' in row:
            return {**summary, 'verdict': 'runtime-error', 'error': row['error'], 'failure': failure}
        if not matches(case, row['actual'], checker):
            return {**summary, 'verdict': 'wrong-answer', 'failure': {**failure, 'actual': preview(row['actual']), 'expected': preview(case['expected'])}}
        summary['passed'] += 1
    return {**summary, 'verdict': 'accepted'}


if '_offline_payload' in globals():
    _request = json.loads(_offline_payload)
    _offline_result = json.dumps(submit_local(_request) if _request.get('submit') else run_local(_request), allow_nan=False)
