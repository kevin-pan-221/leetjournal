"""Submit a known-correct solution for every pack problem through the real harness.

    python3 scripts/judge/selfcheck.py            # CPython, all problems
    python3 scripts/judge/selfcheck.py --emit DIR # write solutions for the Pyodide check

Function and design problems wrap the reference solutions (converting LeetCode's
node objects to the JSON shapes they use). Problems with custom drivers get
hand-written solutions, which also exercises the driver plumbing end to end.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PACK = ROOT / 'public' / 'offline-judge'

DRIVER_SOLUTIONS = {
    'linked-list-cycle': '''
class Solution:
    def hasCycle(self, head):
        slow = fast = head
        while fast and fast.next:
            slow, fast = slow.next, fast.next.next
            if slow is fast:
                return True
        return False
''',
    'copy-list-with-random-pointer': '''
class Solution:
    def copyRandomList(self, head):
        copies = {None: None}
        node = head
        while node:
            copies[node] = Node(node.val)
            node = node.next
        node = head
        while node:
            copies[node].next = copies[node.next]
            copies[node].random = copies[node.random]
            node = node.next
        return copies[head]
''',
    'lowest-common-ancestor-of-a-binary-search-tree': '''
class Solution:
    def lowestCommonAncestor(self, root, p, q):
        while True:
            if p.val < root.val and q.val < root.val:
                root = root.left
            elif p.val > root.val and q.val > root.val:
                root = root.right
            else:
                return root
''',
    'serialize-and-deserialize-binary-tree': '''
class Codec:
    def serialize(self, root):
        out, stack = [], [root]
        while stack:
            node = stack.pop()
            if node is None:
                out.append('#')
            else:
                out.append(str(node.val))
                stack += [node.right, node.left]
        return ','.join(out)

    def deserialize(self, data):
        values = iter(data.split(','))
        def build():
            value = next(values)
            if value == '#':
                return None
            node = TreeNode(int(value))
            node.left = build()
            node.right = build()
            return node
        return build()
''',
    'clone-graph': '''
class Solution:
    def cloneGraph(self, node):
        if not node:
            return None
        copies = {node: Node(node.val)}
        queue = deque([node])
        while queue:
            cur = queue.popleft()
            for other in cur.neighbors:
                if other not in copies:
                    copies[other] = Node(other.val)
                    queue.append(other)
                copies[cur].neighbors.append(copies[other])
        return copies[node]
''',
    'encode-and-decode-strings': '''
class Solution:
    def encode(self, strs):
        return ''.join(f'{len(s)}#{s}' for s in strs)

    def decode(self, s):
        out, i = [], 0
        while i < len(s):
            j = s.index('#', i)
            n = int(s[i:j])
            out.append(s[j + 1:j + 1 + n])
            i = j + 1 + n
        return out
''',
}

WRAPPER = '''
import sys as _sys
_sys.path.insert(0, {path!r})
import lib as _lib, p_arrays, p_lists_trees, p_search, p_dp, p_design, p_extra
_spec = _lib.PROBLEMS[{slug!r}]
_params, _ret = {params!r}, {ret!r}

def _to_json(value, kind):
    if kind == 'ListNode':
        out = []
        while value:
            out.append(value.val); value = value.next
        return out
    if kind == 'TreeNode':
        out, queue = [], deque([value])
        while queue:
            n = queue.popleft()
            if n is None:
                out.append(None); continue
            out.append(n.val); queue += [n.left, n.right]
        while out and out[-1] is None:
            out.pop()
        return out
    if kind.endswith('[]') and kind[:-2] in ('ListNode', 'TreeNode'):
        return [_to_json(v, kind[:-2]) for v in value]
    return value

def _from_json(value, kind):
    if kind == 'ListNode':
        head = None
        for v in reversed(value):
            head = ListNode(v, head)
        return head
    if kind == 'TreeNode':
        if not value:
            return None
        nodes = [None if v is None else TreeNode(v) for v in value]
        kids = iter(nodes[1:])
        for n in nodes:
            if n:
                n.left, n.right = next(kids, None), next(kids, None)
        return nodes[0]
    return value

class Solution:
    def {name}(self, *args):
        values = [_to_json(a, p['type']) for a, p in zip(args, _params)]
        result = _spec['solve'](*values)
        observe = _spec['observe']
        if observe is not None:
            target = args[observe]
            if isinstance(target, list):
                target[:] = result
            else:  # linked list mutated in place: rewrite the existing chain
                node = target
                for v in result:
                    node.val = v
                    last, node = node, node.next
                last.next = None
            return None
        return _from_json(result, _ret)
'''

DESIGN_WRAPPER = '''
import sys as _sys
_sys.path.insert(0, {path!r})
import lib, p_arrays, p_lists_trees, p_search, p_dp, p_design, p_extra
from p_design import *
DetectSquares = p_design.DetectSquaresRef
'''


def solution_for(slug, pack, path=str(HERE)):
    if slug in DRIVER_SOLUTIONS:
        return DRIVER_SOLUTIONS[slug]
    if pack['mode'] == 'design':
        return DESIGN_WRAPPER.format(path=path)
    meta = pack['metadata']
    return WRAPPER.format(path=path, slug=slug, name=meta['name'], params=meta['params'], ret=meta['return']['type'])


def main():
    harness = {}
    exec(compile((ROOT / 'public' / 'offline-harness.py').read_text(), 'offline-harness.py', 'exec'), harness)
    emit = sys.argv[sys.argv.index('--emit') + 1] if '--emit' in sys.argv else None
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
    failures = 0
    index = json.loads((PACK / 'index.json').read_text())['problems']
    for slug in index:
        if only and slug not in only:
            continue
        pack = json.loads((PACK / f'{slug}.json').read_text())
        code = solution_for(slug, pack)
        payload = {'code': code, 'tests': pack['tests'], 'metadata': pack['metadata'], 'judge': {'mode': pack['mode'], 'checker': pack['checker']}, 'submit': True}
        if emit:
            pathlib.Path(emit).mkdir(parents=True, exist_ok=True)
            (pathlib.Path(emit) / f'{slug}.json').write_text(json.dumps(payload))
            continue
        result = harness['submit_local'](payload)
        ok = result['verdict'] == 'accepted'
        failures += not ok
        print(('ok  ' if ok else 'FAIL'), slug, f"{result['passed']}/{result['total']}", f"{result['runtimeMs']:.0f}ms",
              '' if ok else json.dumps({k: result.get(k) for k in ('verdict', 'error', 'failure')})[:600])
    if failures:
        raise SystemExit(f'{failures} problems failed the self-check')


if __name__ == '__main__':
    main()
