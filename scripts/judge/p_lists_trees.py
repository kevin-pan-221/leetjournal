import bisect
import collections
from lib import problem, ints, to_tree, from_tree, random_tree, random_bst, tree_values, TreeNode

# ---- Binary search -----------------------------------------------------------


def gen_search(rng, size):
    n = rng.randint(1, 15) if size == 'small' else 30000
    nums = sorted(rng.sample(range(-50, 50) if size == 'small' else range(-10**6, 10**6), n))
    target = rng.choice(nums) if rng.random() < 0.6 else rng.randint(-55, 55)
    return (nums, target)


@problem('binary-search', fixed=[([-1, 0, 3, 5, 9, 12], 9), ([-1, 0, 3, 5, 9, 12], 2), ([5], 5), ([5], -5), ([1, 3], 3)],
         gen=gen_search, large=2)
def binary_search(nums, target):
    i = bisect.bisect_left(nums, target)
    return i if i < len(nums) and nums[i] == target else -1


def gen_matrix(rng, size):
    m, n = (rng.randint(1, 5), rng.randint(1, 5)) if size == 'small' else (100, 100)
    flat = sorted(rng.sample(range(-100, 100) if size == 'small' else range(-10**4, 10**4), m * n))
    target = rng.choice(flat) if rng.random() < 0.5 else rng.randint(-105, 105)
    return ([flat[r * n:(r + 1) * n] for r in range(m)], target)


@problem('search-a-2d-matrix', fixed=[([[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 3), ([[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 13), ([[1]], 1), ([[1, 3]], 3), ([[1], [3]], 2)],
         gen=gen_matrix, large=2)
def search_matrix(matrix, target):
    flat = [v for row in matrix for v in row]
    i = bisect.bisect_left(flat, target)
    return i < len(flat) and flat[i] == target


def gen_koko(rng, size):
    n = rng.randint(1, 8) if size == 'small' else 10000
    piles = ints(rng, n, 1, 30) if size == 'small' else ints(rng, n, 1, 10**9)
    return (piles, rng.randint(n, n * 3 if size == 'small' else 10**9))


@problem('koko-eating-bananas', fixed=[([3, 6, 7, 11], 8), ([30, 11, 23, 4, 20], 5), ([30, 11, 23, 4, 20], 6), ([1], 1), ([1000000000], 2), ([312884470], 312884469)],
         gen=gen_koko, large=2)
def koko(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if sum((p + mid - 1) // mid for p in piles) <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo


def gen_rotated(rng, size, with_target=False):
    n = rng.randint(1, 12) if size == 'small' else 30000
    nums = sorted(rng.sample(range(-50, 50) if size == 'small' else range(-10**6, 10**6), n))
    k = rng.randrange(n)
    nums = nums[k:] + nums[:k]
    if with_target:
        return (nums, rng.choice(nums) if rng.random() < 0.6 else rng.randint(-55, 55))
    return (nums,)


@problem('find-minimum-in-rotated-sorted-array', fixed=[([3, 4, 5, 1, 2],), ([4, 5, 6, 7, 0, 1, 2],), ([11, 13, 15, 17],), ([1],), ([2, 1],)],
         gen=gen_rotated, large=2)
def find_min(nums):
    return min(nums)


@problem('search-in-rotated-sorted-array', fixed=[([4, 5, 6, 7, 0, 1, 2], 0), ([4, 5, 6, 7, 0, 1, 2], 3), ([1], 0), ([1, 3], 3), ([3, 1], 1), ([5, 1, 3], 5)],
         gen=lambda rng, size: gen_rotated(rng, size, True), large=2)
def search_rotated(nums, target):
    return nums.index(target) if target in nums else -1


def gen_median(rng, size):
    m, n = (rng.randint(0, 6), rng.randint(0, 6)) if size == 'small' else (20000, 20000)
    if m + n == 0:
        n = 1
    return (sorted(ints(rng, m, -20, 20) if size == 'small' else ints(rng, m, -10**6, 10**6)),
            sorted(ints(rng, n, -20, 20) if size == 'small' else ints(rng, n, -10**6, 10**6)))


@problem('median-of-two-sorted-arrays', fixed=[([1, 3], [2]), ([1, 2], [3, 4]), ([], [1]), ([2], []), ([1, 1], [1, 1]), ([1, 2, 3, 4, 5], [6, 7, 8])],
         gen=gen_median, large=1)
def median(nums1, nums2):
    a = sorted(nums1 + nums2)
    n = len(a)
    return float(a[n // 2]) if n % 2 else (a[n // 2 - 1] + a[n // 2]) / 2


# ---- Linked list -------------------------------------------------------------

def gen_list(rng, size, lo=-5000, hi=5000, n_small=(0, 10), n_large=800):
    n = rng.randint(*n_small) if size == 'small' else n_large
    return (ints(rng, n, lo, hi),)


@problem('reverse-linked-list', fixed=[([1, 2, 3, 4, 5],), ([1, 2],), ([],), ([7],)], gen=gen_list, large=1)
def reverse_list(head):
    return head[::-1]


def gen_two_sorted(rng, size):
    n1, n2 = (rng.randint(0, 6), rng.randint(0, 6)) if size == 'small' else (50, 50)
    return (sorted(ints(rng, n1, -100, 100)), sorted(ints(rng, n2, -100, 100)))


@problem('merge-two-sorted-lists', fixed=[([1, 2, 4], [1, 3, 4]), ([], []), ([], [0]), ([5], [1, 2, 4])], gen=gen_two_sorted, large=1)
def merge_two(list1, list2):
    return sorted(list1 + list2)


def gen_cycle(rng, size):
    n = rng.randint(0, 10) if size == 'small' else 10000
    return (ints(rng, n, -10**5, 10**5), rng.randint(-1, n - 1) if n else -1)


@problem('linked-list-cycle', mode='linked-list-cycle', fixed=[([3, 2, 0, -4], 1), ([1, 2], 0), ([1], -1), ([], -1), ([1], 0), ([1, 2, 3], 2)],
         gen=gen_cycle, large=2,
         metadata={'name': 'hasCycle', 'params': [{'name': 'head', 'type': 'ListNode'}, {'name': 'pos', 'type': 'integer'}], 'return': {'type': 'boolean'}})
def has_cycle(head, pos):
    return pos >= 0


def gen_reorder(rng, size):
    return gen_list(rng, size, 1, 1000, (1, 10), 20000)


@problem('reorder-list', observe=0, fixed=[([1, 2, 3, 4],), ([1, 2, 3, 4, 5],), ([1],), ([1, 2],)], gen=gen_reorder, large=1)
def reorder(head):
    out, lo, hi = [], 0, len(head) - 1
    while lo <= hi:
        out.append(head[lo])
        if lo != hi:
            out.append(head[hi])
        lo += 1
        hi -= 1
    return out


def gen_remove_nth(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 30
    return (ints(rng, n, 0, 100), rng.randint(1, n))


@problem('remove-nth-node-from-end-of-list', fixed=[([1, 2, 3, 4, 5], 2), ([1], 1), ([1, 2], 1), ([1, 2], 2)], gen=gen_remove_nth)
def remove_nth(head, n):
    return head[:len(head) - n] + head[len(head) - n + 1:]


def gen_random_list(rng, size):
    n = rng.randint(0, 10) if size == 'small' else 600
    return ([[rng.randint(-10**4, 10**4), rng.choice([None, rng.randrange(n)]) if n else None] for _ in range(n)],)


@problem('copy-list-with-random-pointer', mode='copy-random-list',
         fixed=[([[7, None], [13, 0], [11, 4], [10, 2], [1, 0]],), ([[1, 1], [2, 1]],), ([[3, None], [3, 0], [3, None]],), ([],)],
         gen=gen_random_list, large=1,
         metadata={'name': 'copyRandomList', 'params': [{'name': 'head', 'type': 'json'}], 'return': {'type': 'json'}})
def copy_random(head):
    return head


def gen_add_two(rng, size):
    a, b = (rng.randint(1, 8), rng.randint(1, 8)) if size == 'small' else (100, 100)
    def digits(n):
        d = ints(rng, n, 0, 9)
        if n > 1 and d[-1] == 0:
            d[-1] = rng.randint(1, 9)
        return d
    return (digits(a), digits(b))


@problem('add-two-numbers', fixed=[([2, 4, 3], [5, 6, 4]), ([0], [0]), ([9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9]), ([5], [5])], gen=gen_add_two, large=1)
def add_two(l1, l2):
    a = int(''.join(map(str, reversed(l1))))
    b = int(''.join(map(str, reversed(l2))))
    return [int(c) for c in reversed(str(a + b))]


def gen_duplicate(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 20000
    dup = rng.randint(1, n)
    nums = list(range(1, n + 1))
    extra = rng.randint(1, max(1, n // 3)) if size == 'small' else rng.randint(1, 5)
    for _ in range(extra):
        nums[rng.randrange(len(nums))] = dup
    nums.append(dup)
    rng.shuffle(nums)
    return (nums,)


@problem('find-the-duplicate-number', fixed=[([1, 3, 4, 2, 2],), ([3, 1, 3, 4, 2],), ([3, 3, 3, 3, 3],), ([1, 1],), ([2, 2, 2],)],
         gen=gen_duplicate, large=2)
def find_duplicate(nums):
    return collections.Counter(nums).most_common(1)[0][0]


def gen_merge_k(rng, size):
    k = rng.randint(0, 6) if size == 'small' else 500
    return ([sorted(ints(rng, rng.randint(0, 5 if size == 'small' else 20), -50, 50 if size == 'small' else 10**4)) for _ in range(k)],)


@problem('merge-k-sorted-lists', fixed=[([[1, 4, 5], [1, 3, 4], [2, 6]],), ([],), ([[]],), ([[], [1]],)], gen=gen_merge_k, large=2)
def merge_k(lists):
    return sorted(v for lst in lists for v in lst)


def gen_k_group(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 1500
    return (ints(rng, n, 0, 1000), rng.randint(1, n) if size == 'small' else rng.choice([2, 7, 5000]))


@problem('reverse-nodes-in-k-group', fixed=[([1, 2, 3, 4, 5], 2), ([1, 2, 3, 4, 5], 3), ([1], 1), ([1, 2], 2), ([1, 2, 3], 1)], gen=gen_k_group, large=2)
def k_group(head, k):
    out = []
    for i in range(0, len(head), k):
        chunk = head[i:i + k]
        out += chunk[::-1] if len(chunk) == k else chunk
    return out


# ---- Trees -------------------------------------------------------------------

def gen_tree(rng, size, n_small=(0, 12), n_large=2000, lo=-100, hi=100):
    n = rng.randint(*n_small) if size == 'small' else n_large
    return (random_tree(rng, n, lo, hi, shape=rng.random() if size == 'small' else 0.4),)


def gen_deep_tree(rng, size):
    n = rng.randint(0, 12) if size == 'small' else 900
    return (random_tree(rng, n, -100, 100, shape=0.95 if size == 'large' else rng.random()),)


T1 = [4, 2, 7, 1, 3, 6, 9]


@problem('invert-binary-tree', fixed=[(T1,), ([2, 1, 3],), ([],), ([1, 2],)], gen=gen_tree, large=1)
def invert(root):
    def go(n):
        if n:
            n.left, n.right = go(n.right), go(n.left)
        return n
    return from_tree(go(to_tree(root)))


def depth(n):
    return 0 if not n else 1 + max(depth(n.left), depth(n.right))


@problem('maximum-depth-of-binary-tree', fixed=[([3, 9, 20, None, None, 15, 7],), ([1, None, 2],), ([],), ([0],)], gen=gen_deep_tree, large=1)
def max_depth(root):
    return depth(to_tree(root))


@problem('diameter-of-binary-tree', fixed=[([1, 2, 3, 4, 5],), ([1, 2],), ([1],), ([4, -7, -3, None, None, -9, -3, 9, -7, -4, None, 6, None, -6, -6, None, None, 0, 6, 5, None, 9, None, None, -1, -4, None, None, None, -2],)],
         gen=lambda rng, size: gen_tree(rng, size, (1, 12)), large=1)
def diameter(root):
    best = 0

    def go(n):
        nonlocal best
        if not n:
            return 0
        l, r = go(n.left), go(n.right)
        best = max(best, l + r)
        return 1 + max(l, r)
    go(to_tree(root))
    return best


def gen_balanced(rng, size):
    n = rng.randint(0, 12) if size == 'small' else 2000
    if rng.random() < 0.5:
        # Complete trees are balanced; perturb sometimes to make them not.
        values = ints(rng, n, -10**4, 10**4)
        if rng.random() < 0.4 and n > 4:
            values += [None] * (n // 2) + ints(rng, 2, 0, 5)
        return (values[:n] + values[n:],)
    return (random_tree(rng, n, -10**4, 10**4, shape=rng.random() if size == 'small' else 0.4),)


@problem('balanced-binary-tree', fixed=[([3, 9, 20, None, None, 15, 7],), ([1, 2, 2, 3, 3, None, None, 4, 4],), ([],), ([1, 2, 2, 3, None, None, 3, 4, None, None, 4],)],
         gen=gen_balanced, large=1)
def balanced(root):
    def go(n):
        if not n:
            return 0
        l, r = go(n.left), go(n.right)
        if l < 0 or r < 0 or abs(l - r) > 1:
            return -1
        return 1 + max(l, r)
    return go(to_tree(root)) >= 0


def gen_same(rng, size):
    p = random_tree(rng, rng.randint(0, 10) if size == 'small' else 2000, -10, 10)
    if rng.random() < 0.5:
        return (p, list(p))
    q = list(p)
    if q and rng.random() < 0.7:
        i = rng.randrange(len(q))
        q[i] = None if (q[i] is not None and i and rng.random() < 0.3) else rng.randint(-10, 10)
        while q and q[-1] is None:
            q.pop()
        q = from_tree(to_tree(q))
    return (p, q)


@problem('same-tree', fixed=[([1, 2, 3], [1, 2, 3]), ([1, 2], [1, None, 2]), ([1, 2, 1], [1, 1, 2]), ([], []), ([0], [])], gen=gen_same, large=1)
def same_tree(p, q):
    return from_tree(to_tree(p)) == from_tree(to_tree(q))


def gen_subtree(rng, size):
    root = random_tree(rng, rng.randint(1, 12) if size == 'small' else 2000, -3, 3)
    tree = to_tree(root)
    nodes, stack = [], [tree]
    while stack:
        n = stack.pop()
        if n:
            nodes.append(n)
            stack += [n.left, n.right]
    sub = from_tree(rng.choice(nodes))
    if rng.random() < 0.4 and len(sub) > 1:
        sub = from_tree(to_tree(sub[:-1]))
    return (root, sub or [0])


@problem('subtree-of-another-tree', fixed=[([3, 4, 5, 1, 2], [4, 1, 2]), ([3, 4, 5, 1, 2, None, None, None, None, 0], [4, 1, 2]), ([1, 1], [1]), ([12], [2])],
         gen=gen_subtree, large=1)
def is_subtree(root, subRoot):
    key = lambda n: None if not n else (n.val, key(n.left), key(n.right))
    target, stack = key(to_tree(subRoot)), [to_tree(root)]
    while stack:
        n = stack.pop()
        if n:
            if key(n) == target:
                return True
            stack += [n.left, n.right]
    return False


def gen_lca(rng, size):
    root = random_bst(rng, rng.randint(2, 15) if size == 'small' else 2000, -10**4, 10**4)
    p, q = rng.sample(tree_values(root), 2)
    return (root, p, q)


@problem('lowest-common-ancestor-of-a-binary-search-tree', mode='lca',
         fixed=[([6, 2, 8, 0, 4, 7, 9, None, None, 3, 5], 2, 8), ([6, 2, 8, 0, 4, 7, 9, None, None, 3, 5], 2, 4), ([2, 1], 2, 1), ([2, 1, 3], 3, 1)],
         gen=gen_lca, large=1,
         metadata={'name': 'lowestCommonAncestor', 'params': [{'name': 'root', 'type': 'TreeNode'}, {'name': 'p', 'type': 'integer'}, {'name': 'q', 'type': 'integer'}], 'return': {'type': 'integer'}})
def lca(root, p, q):
    node = to_tree(root)
    while True:
        if p < node.val and q < node.val:
            node = node.left
        elif p > node.val and q > node.val:
            node = node.right
        else:
            return node.val


def levels(root):
    out, level = [], [to_tree(root)] if root else []
    while level:
        out.append([n.val for n in level])
        level = [c for n in level for c in (n.left, n.right) if c]
    return out


@problem('binary-tree-level-order-traversal', fixed=[([3, 9, 20, None, None, 15, 7],), ([1],), ([],), ([1, 2, None, 3, None, 4],)], gen=gen_tree, large=1)
def level_order(root):
    return levels(root)


@problem('binary-tree-right-side-view', fixed=[([1, 2, 3, None, 5, None, 4],), ([1, 2, 3, 4, None, None, None, 5],), ([1, None, 3],), ([],)], gen=gen_tree, large=1)
def right_side(root):
    return [level[-1] for level in levels(root)]


@problem('count-good-nodes-in-binary-tree', fixed=[([3, 1, 4, 3, None, 1, 5],), ([3, 3, None, 4, 2],), ([1],), ([2, None, 4, 10, 8, None, None, 4],)],
         gen=lambda rng, size: gen_tree(rng, size, (1, 12)), large=1)
def good_nodes(root):
    def go(n, best):
        if not n:
            return 0
        return (n.val >= best) + go(n.left, max(best, n.val)) + go(n.right, max(best, n.val))
    return go(to_tree(root), -10**9)


def gen_valid_bst(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 2000
    root = random_bst(rng, n, -20 if size == 'small' else -2**31, 20 if size == 'small' else 2**31 - 1, distinct=rng.random() < 0.8)
    if rng.random() < 0.4:
        i = rng.randrange(len(root))
        if root[i] is not None:
            root[i] += rng.choice([-3, -1, 1, 3])
    return (root,)


@problem('validate-binary-search-tree', fixed=[([2, 1, 3],), ([5, 1, 4, None, None, 3, 6],), ([2, 2, 2],), ([5, 4, 6, None, None, 3, 7],), ([2147483647],), ([-2147483648, None, 2147483647],), ([1, 1],)],
         gen=gen_valid_bst, large=1)
def valid_bst(root):
    vals = []

    def go(n):
        if n:
            go(n.left)
            vals.append(n.val)
            go(n.right)
    go(to_tree(root))
    return all(a < b for a, b in zip(vals, vals[1:]))


def gen_kth(rng, size):
    root = random_bst(rng, rng.randint(1, 12) if size == 'small' else 2000, 0, 10**4)
    return (root, rng.randint(1, len(tree_values(root))))


@problem('kth-smallest-element-in-a-bst', fixed=[([3, 1, 4, None, 2], 1), ([5, 3, 6, 2, 4, None, None, 1], 3), ([1], 1), ([2, 1, 3], 3)], gen=gen_kth, large=1)
def kth_smallest(root, k):
    return sorted(tree_values(root))[k - 1]


def gen_build_tree(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 2000
    root = to_tree(random_tree(rng, n, values=rng.sample(range(-3000, 3001), n), shape=rng.random() if size == 'small' else 0.4))
    pre, ino = [], []

    def walk(node):
        if node:
            pre.append(node.val)
            walk(node.left)
            ino.append(node.val)
            walk(node.right)
    walk(root)
    return (pre, ino)


@problem('construct-binary-tree-from-preorder-and-inorder-traversal', fixed=[([3, 9, 20, 15, 7], [9, 3, 15, 20, 7]), ([-1], [-1]), ([1, 2], [2, 1]), ([1, 2], [1, 2])],
         gen=gen_build_tree, large=1)
def build_tree(preorder, inorder):
    index = {v: i for i, v in enumerate(inorder)}
    it = iter(preorder)

    def go(lo, hi):
        if lo > hi:
            return None
        v = next(it)
        node = TreeNode(v)
        node.left = go(lo, index[v] - 1)
        node.right = go(index[v] + 1, hi)
        return node
    return from_tree(go(0, len(inorder) - 1))


@problem('binary-tree-maximum-path-sum', fixed=[([1, 2, 3],), ([-10, 9, 20, None, None, 15, 7],), ([-3],), ([2, -1],), ([-2, -1],), ([5, 4, 8, 11, None, 13, 4, 7, 2, None, None, None, 1],)],
         gen=lambda rng, size: gen_tree(rng, size, (1, 12), 5000, -1000, 1000), large=1)
def max_path(root):
    best = -10**9

    def go(n):
        nonlocal best
        if not n:
            return 0
        l, r = max(0, go(n.left)), max(0, go(n.right))
        best = max(best, n.val + l + r)
        return n.val + max(l, r)
    go(to_tree(root))
    return best


@problem('serialize-and-deserialize-binary-tree', mode='codec', fixed=[([1, 2, 3, None, None, 4, 5],), ([],), ([1],), ([-1000, None, 1000],), ([1, 2, None, 3, None, 4],)],
         gen=lambda rng, size: gen_tree(rng, size, (0, 15), 5000, -1000, 1000), large=1,
         metadata={'name': 'serialize', 'params': [{'name': 'root', 'type': 'TreeNode'}], 'return': {'type': 'TreeNode'}})
def codec(root):
    return from_tree(to_tree(root))
