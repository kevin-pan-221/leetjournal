"""Shared helpers for the offline NeetCode 150 judge pack.

Reference solutions work on the same JSON shapes LeetCode shows (lists for
linked lists, level-order arrays for trees). Expected outputs are computed by
these solutions, so every generated case is consistent with the checker.
"""
import collections
import random

PROBLEMS = {}


def problem(slug, *, checker='exact', fixed=(), gen=None, random_cases=30, large=(),
            observe=None, mode='function', metadata=None, design=None):
    """Register a reference solution.

    fixed:  hand-written argument tuples (edge cases, LeetCode examples first).
    gen:    gen(rng, size) -> argument tuple; size is 'small' or 'large'.
    large:  how many large cases (complexity / TLE checks) to generate.
    """
    def wrap(solve):
        PROBLEMS[slug] = dict(slug=slug, solve=solve, checker=checker, fixed=list(fixed), gen=gen,
                              random_cases=random_cases, large=large, observe=observe, mode=mode,
                              metadata=metadata, design=design)
        return solve
    return wrap


# ---- Random helpers -------------------------------------------------------

def ints(rng, n, lo, hi):
    return [rng.randint(lo, hi) for _ in range(n)]


def word(rng, n, alphabet='abcdefghijklmnopqrstuvwxyz'):
    return ''.join(rng.choice(alphabet) for _ in range(n))


def grid(rng, rows, cols, choices):
    return [[rng.choice(choices) for _ in range(cols)] for _ in range(rows)]


# ---- Linked lists ---------------------------------------------------------

class ListNode:
    __slots__ = ('val', 'next')

    def __init__(self, val=0, next=None):
        self.val, self.next = val, next


def to_list(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head


def from_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out


# ---- Binary trees ---------------------------------------------------------

class TreeNode:
    __slots__ = ('val', 'left', 'right')

    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right


def to_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue, items = collections.deque([root]), iter(values[1:])
    while queue:
        node = queue.popleft()
        for side in ('left', 'right'):
            try:
                value = next(items)
            except StopIteration:
                return root
            if value is not None:
                child = TreeNode(value)
                setattr(node, side, child)
                queue.append(child)
    return root


def from_tree(root):
    out, queue = [], collections.deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.extend((node.left, node.right))
    while out and out[-1] is None:
        out.pop()
    return out


def random_tree(rng, n, lo=-100, hi=100, shape=0.5, values=None):
    """Random binary tree with n nodes, returned as a level-order list."""
    if n == 0:
        return []
    vals = list(values) if values is not None else [rng.randint(lo, hi) for _ in range(n)]
    root = TreeNode(vals[0])
    slots = [(root, 'left'), (root, 'right')]
    for value in vals[1:]:
        # shape near 1 favours deep, list-like trees; near 0 favours bushy ones.
        index = len(slots) - 1 - rng.randrange(min(2, len(slots))) if rng.random() < shape else rng.randrange(len(slots))
        parent, side = slots.pop(index)
        child = TreeNode(value)
        setattr(parent, side, child)
        slots += [(child, 'left'), (child, 'right')]
    return from_tree(root)


def random_bst(rng, n, lo=-1000, hi=1000, distinct=True):
    if n == 0:
        return []
    if distinct:
        values = rng.sample(range(lo, hi + 1), n)
    else:
        values = [rng.randint(lo, hi) for _ in range(n)]
    root = None
    for value in values:
        if root is None:
            root = TreeNode(value)
            continue
        node = root
        while True:
            side = 'left' if value < node.val else 'right'
            if getattr(node, side) is None:
                setattr(node, side, TreeNode(value))
                break
            node = getattr(node, side)
    return from_tree(root)


def tree_values(level):
    return [v for v in level if v is not None]


def make_rng(slug):
    # Deterministic per problem, so regenerating the pack is reproducible.
    return random.Random('neetcode150:' + slug)
