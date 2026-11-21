import collections
import heapq
import itertools
from lib import problem, ints, word, grid

# ---- Heap / priority queue ---------------------------------------------------


@problem('last-stone-weight', fixed=[([2, 7, 4, 1, 8, 1],), ([1],), ([2, 2],), ([3, 7, 2],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 10) if size == 'small' else 30, 1, 1000),))
def last_stone(stones):
    heap = [-s for s in stones]
    heapq.heapify(heap)
    while len(heap) > 1:
        a, b = -heapq.heappop(heap), -heapq.heappop(heap)
        if a != b:
            heapq.heappush(heap, -(a - b))
    return -heap[0] if heap else 0


def gen_k_closest(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 10000
    while True:
        pts = [[rng.randint(-20, 20), rng.randint(-20, 20)] if size == 'small' else [rng.randint(-10**4, 10**4), rng.randint(-10**4, 10**4)] for _ in range(n)]
        k = rng.randint(1, n)
        d = sorted(x * x + y * y for x, y in pts)
        if k == n or d[k - 1] != d[k]:  # unique answer, as LeetCode guarantees
            return (pts, k)


@problem('k-closest-points-to-origin', checker='unordered', fixed=[([[1, 3], [-2, 2]], 1), ([[3, 3], [5, -1], [-2, 4]], 2), ([[0, 1]], 1), ([[1, 1], [2, 2], [3, 3]], 3)],
         gen=gen_k_closest, large=2)
def k_closest(points, k):
    return sorted(points, key=lambda p: p[0] ** 2 + p[1] ** 2)[:k]


def gen_kth_largest(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 30000
    nums = ints(rng, n, -10, 10) if size == 'small' else ints(rng, n, -10**4, 10**4)
    return (nums, rng.randint(1, n))


@problem('kth-largest-element-in-an-array', fixed=[([3, 2, 1, 5, 6, 4], 2), ([3, 2, 3, 1, 2, 4, 5, 5, 6], 4), ([1], 1), ([2, 1], 2), ([-1, -1], 2)],
         gen=gen_kth_largest, large=2)
def kth_largest(nums, k):
    return sorted(nums, reverse=True)[k - 1]


def gen_tasks(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 10000
    return ([rng.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[:rng.randint(1, 26)] if size == 'large' else 'ABC') for _ in range(n)], rng.randint(0, 4 if size == 'small' else 100))


@problem('task-scheduler', fixed=[(['A', 'A', 'A', 'B', 'B', 'B'], 2), (['A', 'C', 'A', 'B', 'D', 'B'], 1), (['A', 'A', 'A', 'B', 'B', 'B'], 3), (['A'], 0), (['A', 'A', 'A', 'A', 'A', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], 2)],
         gen=gen_tasks, large=2)
def least_interval(tasks, n):
    counts = collections.Counter(tasks).values()
    top = max(counts)
    return max(len(tasks), (top - 1) * (n + 1) + sum(1 for c in counts if c == top))


# ---- Backtracking ------------------------------------------------------------

def gen_distinct(rng, size, n_max=8):
    return (rng.sample(range(-10, 11), rng.randint(1, n_max) if size == 'small' else 10),)


@problem('subsets', checker='nested-unordered', fixed=[([1, 2, 3],), ([0],), ([1, 2],)], gen=gen_distinct, random_cases=12, large=1)
def subsets(nums):
    return [list(c) for r in range(len(nums) + 1) for c in itertools.combinations(nums, r)]


def gen_comb(rng, size):
    cands = rng.sample(range(2, 15 if size == 'small' else 40), rng.randint(1, 6) if size == 'small' else 12)
    return (cands, rng.randint(1, 20 if size == 'small' else 40))


@problem('combination-sum', checker='nested-unordered', fixed=[([2, 3, 6, 7], 7), ([2, 3, 5], 8), ([2], 1), ([1], 2), ([7, 3, 2], 18)], gen=gen_comb, random_cases=20, large=1)
def combination_sum(candidates, target):
    out = []

    def go(i, remaining, path):
        if remaining == 0:
            out.append(list(path))
            return
        for j in range(i, len(candidates)):
            if candidates[j] <= remaining:
                path.append(candidates[j])
                go(j, remaining - candidates[j], path)
                path.pop()
    go(0, target, [])
    return out


def gen_comb2(rng, size):
    cands = ints(rng, rng.randint(1, 10) if size == 'small' else 100, 1, 10 if size == 'small' else 50)
    return (cands, rng.randint(1, 15 if size == 'small' else 30))


@problem('combination-sum-ii', checker='nested-unordered', fixed=[([10, 1, 2, 7, 6, 1, 5], 8), ([2, 5, 2, 1, 2], 5), ([1], 2), ([1, 1, 1, 1, 1], 3)], gen=gen_comb2, random_cases=20, large=1)
def combination_sum2(candidates, target):
    cands, out = sorted(candidates), []

    def go(i, remaining, path):
        if remaining == 0:
            out.append(list(path))
            return
        for j in range(i, len(cands)):
            if j > i and cands[j] == cands[j - 1]:
                continue
            if cands[j] > remaining:
                break
            path.append(cands[j])
            go(j + 1, remaining - cands[j], path)
            path.pop()
    go(0, target, [])
    return out


@problem('permutations', checker='unordered', fixed=[([1, 2, 3],), ([0, 1],), ([1],)],
         gen=lambda rng, size: (rng.sample(range(-10, 11), rng.randint(1, 5) if size == 'small' else 6),), random_cases=10, large=1)
def permute(nums):
    return [list(p) for p in itertools.permutations(nums)]


@problem('subsets-ii', checker='nested-unordered', fixed=[([1, 2, 2],), ([0],), ([4, 4, 4, 1, 4],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 8) if size == 'small' else 10, -3, 3),), random_cases=12, large=1)
def subsets_dup(nums):
    return [list(c) for c in sorted({c for r in range(len(nums) + 1) for c in itertools.combinations(sorted(nums), r)})]


@problem('generate-parentheses', checker='unordered', fixed=[(3,), (1,), (2,), (4,), (5,), (6,), (7,), (8,)], random_cases=0)
def generate_parens(n):
    out = []

    def go(s, o, c):
        if len(s) == 2 * n:
            out.append(s)
            return
        if o < n:
            go(s + '(', o + 1, c)
        if c < o:
            go(s + ')', o, c + 1)
    go('', 0, 0)
    return out


def gen_word_search(rng, size):
    m, n = (rng.randint(1, 4), rng.randint(1, 4)) if size == 'small' else (6, 6)
    board = grid(rng, m, n, 'ABC' if size == 'small' else 'ABCDEF')
    if rng.random() < 0.6:
        r, c, path = rng.randrange(m), rng.randrange(n), []
        seen = set()
        for _ in range(rng.randint(1, 6 if size == 'small' else 15)):
            path.append(board[r][c])
            seen.add((r, c))
            moves = [(r + dr, c + dc) for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)) if 0 <= r + dr < m and 0 <= c + dc < n and (r + dr, c + dc) not in seen]
            if not moves:
                break
            r, c = rng.choice(moves)
        return (board, ''.join(path))
    return (board, word(rng, rng.randint(1, 6), 'ABC'))


BOARD = [['A', 'B', 'C', 'E'], ['S', 'F', 'C', 'S'], ['A', 'D', 'E', 'E']]


@problem('word-search', fixed=[(BOARD, 'ABCCED'), (BOARD, 'SEE'), (BOARD, 'ABCB'), ([['a']], 'a'), ([['a', 'b'], ['c', 'd']], 'abcd'), ([['C', 'A', 'A'], ['A', 'A', 'A'], ['B', 'C', 'D']], 'AAB')],
         gen=gen_word_search, large=1)
def exist(board, word_):
    m, n = len(board), len(board[0])

    def go(r, c, i):
        if i == len(word_):
            return True
        if not (0 <= r < m and 0 <= c < n) or board[r][c] != word_[i]:
            return False
        board[r][c] = '#'
        found = any(go(r + dr, c + dc, i + 1) for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)))
        board[r][c] = word_[i]
        return found
    return any(go(r, c, 0) for r in range(m) for c in range(n))


@problem('palindrome-partitioning', checker='unordered', fixed=[('aab',), ('a',), ('efe',), ('aaaa',)],
         gen=lambda rng, size: (word(rng, rng.randint(1, 8) if size == 'small' else 14, 'ab'),), random_cases=12, large=1)
def partition(s):
    out = []

    def go(i, path):
        if i == len(s):
            out.append(list(path))
            return
        for j in range(i + 1, len(s) + 1):
            if s[i:j] == s[i:j][::-1]:
                path.append(s[i:j])
                go(j, path)
                path.pop()
    go(0, [])
    return out


KEYS = {'2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl', '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz'}


@problem('letter-combinations-of-a-phone-number', checker='unordered', fixed=[('23',), ('',), ('2',), ('79',), ('9999',)],
         gen=lambda rng, size: (word(rng, rng.randint(0, 4), '23456789'),), random_cases=10)
def letter_combinations(digits):
    if not digits:
        return []
    return [''.join(p) for p in itertools.product(*(KEYS[d] for d in digits))]


@problem('n-queens', checker='unordered', fixed=[(4,), (1,), (2,), (3,), (5,), (6,), (7,), (8,), (9,)], random_cases=0)
def n_queens(n):
    out = []

    def go(row, cols, d1, d2, placed):
        if row == n:
            out.append(['.' * c + 'Q' + '.' * (n - c - 1) for c in placed])
            return
        for c in range(n):
            if c not in cols and row - c not in d1 and row + c not in d2:
                go(row + 1, cols | {c}, d1 | {row - c}, d2 | {row + c}, placed + [c])
    go(0, frozenset(), frozenset(), frozenset(), [])
    return out


# ---- Tries -------------------------------------------------------------------

def gen_word_search_ii(rng, size):
    m, n = (rng.randint(1, 4), rng.randint(1, 4)) if size == 'small' else (12, 12)
    board = grid(rng, m, n, 'abcde' if size == 'small' else 'abcdefghij')
    words = list({word(rng, rng.randint(1, 5 if size == 'small' else 10), 'abcde' if size == 'small' else 'abcdefghij') for _ in range(rng.randint(1, 8) if size == 'small' else 3000)})
    return (board, words)


@problem('word-search-ii', checker='unordered',
         fixed=[([['o', 'a', 'a', 'n'], ['e', 't', 'a', 'e'], ['i', 'h', 'k', 'r'], ['i', 'f', 'l', 'v']], ['oath', 'pea', 'eat', 'rain']), ([['a', 'b'], ['c', 'd']], ['abcb']), ([['a']], ['a']), ([['a', 'a']], ['aaa']), ([['a', 'b'], ['a', 'a']], ['aba', 'baa', 'bab', 'aaab', 'aaa', 'aaaa', 'aaba'])],
         gen=gen_word_search_ii, random_cases=20, large=1)
def find_words(board, words):
    return [w for w in words if exist([row[:] for row in board], w)]


# ---- Graphs ------------------------------------------------------------------

DIRS = ((0, 1), (1, 0), (0, -1), (-1, 0))


def flood(g, r, c, keep):
    m, n = len(g), len(g[0])
    stack, size = [(r, c)], 0
    g[r][c] = None
    while stack:
        r, c = stack.pop()
        size += 1
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n and g[nr][nc] == keep:
                g[nr][nc] = None
                stack.append((nr, nc))
    return size


def gen_islands(rng, size, chars=('1', '0')):
    m, n = (rng.randint(1, 6), rng.randint(1, 6)) if size == 'small' else (24, 24)
    p = rng.random()
    return ([[chars[0] if rng.random() < p else chars[1] for _ in range(n)] for _ in range(m)],)


@problem('number-of-islands', fixed=[([['1', '1', '1', '1', '0'], ['1', '1', '0', '1', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '0', '0', '0']],), ([['1', '1', '0', '0', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '1', '0', '0'], ['0', '0', '0', '1', '1']],), ([['0']],), ([['1']],), ([['1', '0', '1'], ['0', '1', '0'], ['1', '0', '1']],)],
         gen=gen_islands, large=2,
         metadata={'name': 'numIslands', 'params': [{'name': 'grid', 'type': 'character[][]'}], 'return': {'type': 'integer'}})
def num_islands(grid_):
    g = [row[:] for row in grid_]
    return sum(1 for r in range(len(g)) for c in range(len(g[0])) if g[r][c] == '1' and flood(g, r, c, '1'))


@problem('max-area-of-island', fixed=[([[0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0], [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0]],), ([[0, 0, 0, 0, 0, 0, 0, 0]],), ([[1]],)],
         gen=lambda rng, size: gen_islands(rng, size, (1, 0)), large=2)
def max_area_island(grid_):
    g = [row[:] for row in grid_]
    return max([flood(g, r, c, 1) for r in range(len(g)) for c in range(len(g[0])) if g[r][c] == 1] or [0])


def gen_graph(rng, size):
    n = rng.randint(0, 8) if size == 'small' else 100
    if n == 0:
        return ([],)
    edges = set()
    for v in range(2, n + 1):
        edges.add((rng.randint(1, v - 1), v))  # connected
    for _ in range(rng.randint(0, n * 2)):
        a, b = rng.sample(range(1, n + 1), 2) if n > 1 else (1, 1)
        if a != b:
            edges.add((min(a, b), max(a, b)))
    adj = [[] for _ in range(n)]
    for a, b in sorted(edges):
        adj[a - 1].append(b)
        adj[b - 1].append(a)
    return ([sorted(x) for x in adj],)


@problem('clone-graph', mode='clone-graph', fixed=[([[2, 4], [1, 3], [2, 4], [1, 3]],), ([[]],), ([],), ([[2], [1]],)], gen=gen_graph, large=1,
         metadata={'name': 'cloneGraph', 'params': [{'name': 'adjList', 'type': 'integer[][]'}], 'return': {'type': 'integer[][]'}})
def clone_graph(adjList):
    return adjList


INF = 2147483647


def gen_rooms(rng, size):
    m, n = (rng.randint(1, 6), rng.randint(1, 6)) if size == 'small' else (24, 24)
    return ([[rng.choice([INF, INF, INF, -1, 0]) for _ in range(n)] for _ in range(m)],)


@problem('walls-and-gates', observe=0,
         fixed=[([[INF, -1, 0, INF], [INF, INF, INF, -1], [INF, -1, INF, -1], [0, -1, INF, INF]],), ([[-1]],), ([[INF]],), ([[0]],), ([[0, INF, INF, INF, INF]],)],
         gen=gen_rooms, large=1,
         metadata={'name': 'wallsAndGates', 'params': [{'name': 'rooms', 'type': 'integer[][]'}], 'return': {'type': 'void'}})
def walls_and_gates(rooms):
    g = [row[:] for row in rooms]
    m, n = len(g), len(g[0])
    q = collections.deque((r, c) for r in range(m) for c in range(n) if g[r][c] == 0)
    while q:
        r, c = q.popleft()
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n and g[nr][nc] == INF:
                g[nr][nc] = g[r][c] + 1
                q.append((nr, nc))
    return g


def gen_oranges(rng, size):
    m, n = (rng.randint(1, 6), rng.randint(1, 6)) if size == 'small' else (10, 10)
    weights = rng.choice([[0, 1, 1, 1, 2], [1, 1, 1, 1, 1, 1, 2], [0, 0, 1]])
    return ([[rng.choice(weights) for _ in range(n)] for _ in range(m)],)


@problem('rotting-oranges', fixed=[([[2, 1, 1], [1, 1, 0], [0, 1, 1]],), ([[2, 1, 1], [0, 1, 1], [1, 0, 1]],), ([[0, 2]],), ([[0]],), ([[1]],), ([[2, 2], [1, 1], [0, 0], [2, 0]],)],
         gen=gen_oranges, large=2)
def oranges(grid_):
    g = [row[:] for row in grid_]
    m, n = len(g), len(g[0])
    q = collections.deque((r, c, 0) for r in range(m) for c in range(n) if g[r][c] == 2)
    t = 0
    while q:
        r, c, t = q.popleft()
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n and g[nr][nc] == 1:
                g[nr][nc] = 2
                q.append((nr, nc, t + 1))
    return -1 if any(1 in row for row in g) else t


def gen_heights_grid(rng, size):
    m, n = (rng.randint(1, 6), rng.randint(1, 6)) if size == 'small' else (24, 24)
    return ([ints(rng, n, 0, 6 if size == 'small' else 10**5) for _ in range(m)],)


@problem('pacific-atlantic-water-flow', checker='unordered',
         fixed=[([[1, 2, 2, 3, 5], [3, 2, 3, 4, 4], [2, 4, 5, 3, 1], [6, 7, 1, 4, 5], [5, 1, 1, 2, 4]],), ([[1]],), ([[1, 1], [1, 1]],), ([[3, 3, 3], [3, 1, 3], [0, 2, 4]],)],
         gen=gen_heights_grid, large=2)
def pacific_atlantic(heights):
    m, n = len(heights), len(heights[0])

    def reach(starts):
        seen, stack = set(starts), list(starts)
        while stack:
            r, c = stack.pop()
            for dr, dc in DIRS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < m and 0 <= nc < n and (nr, nc) not in seen and heights[nr][nc] >= heights[r][c]:
                    seen.add((nr, nc))
                    stack.append((nr, nc))
        return seen
    pac = reach([(0, c) for c in range(n)] + [(r, 0) for r in range(m)])
    atl = reach([(m - 1, c) for c in range(n)] + [(r, n - 1) for r in range(m)])
    return sorted([list(x) for x in pac & atl])


@problem('surrounded-regions', observe=0,
         fixed=[([['X', 'X', 'X', 'X'], ['X', 'O', 'O', 'X'], ['X', 'X', 'O', 'X'], ['X', 'O', 'X', 'X']],), ([['X']],), ([['O', 'O'], ['O', 'O']],), ([['X', 'O', 'X'], ['O', 'X', 'O'], ['X', 'O', 'X']],)],
         gen=lambda rng, size: gen_islands(rng, size, ('O', 'X')), large=2)
def surrounded(board):
    g = [row[:] for row in board]
    m, n = len(g), len(g[0])
    for r in range(m):
        for c in range(n):
            if (r in (0, m - 1) or c in (0, n - 1)) and g[r][c] == 'O':
                stack = [(r, c)]
                g[r][c] = 'S'
                while stack:
                    a, b = stack.pop()
                    for dr, dc in DIRS:
                        na, nb = a + dr, b + dc
                        if 0 <= na < m and 0 <= nb < n and g[na][nb] == 'O':
                            g[na][nb] = 'S'
                            stack.append((na, nb))
    return [['O' if v == 'S' else 'X' for v in row] for row in g]


def gen_prereq(rng, size, unique_pairs=True):
    n = rng.randint(1, 8) if size == 'small' else 500
    order = list(range(n))
    rng.shuffle(order)
    pos = {v: i for i, v in enumerate(order)}
    edges = set()
    for _ in range(rng.randint(0, n * 2) if size == 'small' else 1500):
        a, b = rng.sample(range(n), 2) if n > 1 else (0, 0)
        if a != b:
            edges.add((a, b) if pos[a] > pos[b] else (b, a))  # acyclic: a requires earlier b
    edges = [list(e) for e in edges]
    if edges and rng.random() < 0.35:
        a, b = rng.choice(edges)
        edges.append([b, a])  # introduce a cycle
    rng.shuffle(edges)
    return (n, edges)


def topo(n, prerequisites):
    indeg, adj = [0] * n, collections.defaultdict(list)
    for a, b in prerequisites:
        adj[b].append(a)
        indeg[a] += 1
    q = collections.deque(i for i in range(n) if indeg[i] == 0)
    out = []
    while q:
        v = q.popleft()
        out.append(v)
        for w in adj[v]:
            indeg[w] -= 1
            if indeg[w] == 0:
                q.append(w)
    return out if len(out) == n else []


@problem('course-schedule', fixed=[(2, [[1, 0]]), (2, [[1, 0], [0, 1]]), (1, []), (3, [[0, 1], [1, 2], [2, 0]]), (5, [[1, 4], [2, 4], [3, 1], [3, 2]])], gen=gen_prereq, large=2)
def can_finish(numCourses, prerequisites):
    return len(topo(numCourses, prerequisites)) == numCourses


@problem('course-schedule-ii', checker='topological-order', fixed=[(2, [[1, 0]]), (4, [[1, 0], [2, 0], [3, 1], [3, 2]]), (1, []), (2, [[0, 1], [1, 0]]), (3, [[1, 0], [1, 2], [0, 1]])],
         gen=gen_prereq, large=2)
def find_order(numCourses, prerequisites):
    return topo(numCourses, prerequisites)


def gen_undirected(rng, size, tree_bias=0.5):
    n = rng.randint(1, 8) if size == 'small' else 500
    edges = []
    if rng.random() < tree_bias:
        for v in range(1, n):
            edges.append([rng.randrange(v), v])
    else:
        pairs = set()
        for _ in range(rng.randint(0, n + 1) if size == 'small' else n):
            a, b = rng.sample(range(n), 2) if n > 1 else (0, 0)
            if a != b and (min(a, b), max(a, b)) not in pairs:
                pairs.add((min(a, b), max(a, b)))
                edges.append([a, b])
    rng.shuffle(edges)
    return (n, edges)


def components(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    count = n
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            count -= 1
    return count


@problem('graph-valid-tree', fixed=[(5, [[0, 1], [0, 2], [0, 3], [1, 4]]), (5, [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]), (1, []), (2, []), (4, [[0, 1], [2, 3]]), (3, [[0, 1], [1, 2], [2, 0]])],
         gen=gen_undirected, large=2,
         metadata={'name': 'validTree', 'params': [{'name': 'n', 'type': 'integer'}, {'name': 'edges', 'type': 'integer[][]'}], 'return': {'type': 'boolean'}})
def valid_tree(n, edges):
    return len(edges) == n - 1 and components(n, edges) == 1


@problem('number-of-connected-components-in-an-undirected-graph', fixed=[(5, [[0, 1], [1, 2], [3, 4]]), (5, [[0, 1], [1, 2], [2, 3], [3, 4]]), (1, []), (3, []), (4, [[0, 1], [1, 2], [2, 0]])],
         gen=lambda rng, size: gen_undirected(rng, size, 0.2), large=2,
         metadata={'name': 'countComponents', 'params': [{'name': 'n', 'type': 'integer'}, {'name': 'edges', 'type': 'integer[][]'}], 'return': {'type': 'integer'}})
def count_components(n, edges):
    return components(n, edges)


def gen_redundant(rng, size):
    n = rng.randint(3, 10) if size == 'small' else 500
    edges = [[rng.randint(1, v - 1), v] for v in range(2, n + 1)]
    a, b = rng.sample(range(1, n + 1), 2)
    while [min(a, b), max(a, b)] in [sorted(e) for e in edges]:
        a, b = rng.sample(range(1, n + 1), 2)
    edges.append([min(a, b), max(a, b)])
    rng.shuffle(edges)
    return ([sorted(e) for e in edges],)


@problem('redundant-connection', fixed=[([[1, 2], [1, 3], [2, 3]],), ([[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]],), ([[1, 4], [3, 4], [1, 3], [1, 2], [4, 5]],)], gen=gen_redundant, large=2)
def redundant(edges):
    parent = list(range(len(edges) + 1))

    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            return [a, b]
        parent[ra] = rb


def gen_ladder(rng, size):
    length = rng.randint(1, 3) if size == 'small' else 5
    alphabet = 'abc' if size == 'small' else 'abcdefghij'
    words = list({word(rng, length, alphabet) for _ in range(rng.randint(1, 12) if size == 'small' else 5000)})
    begin = word(rng, length, alphabet)
    end = rng.choice(words) if rng.random() < 0.8 else word(rng, length, alphabet)
    if begin == end:
        begin = word(rng, length, alphabet)
    if begin == end:
        return gen_ladder(rng, size)
    return (begin, end, words)


@problem('word-ladder', fixed=[('hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log', 'cog']), ('hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log']), ('a', 'c', ['a', 'b', 'c']), ('hot', 'dog', ['hot', 'dog']), ('hit', 'hot', ['hot'])],
         gen=gen_ladder, large=2)
def ladder(beginWord, endWord, wordList):
    words = set(wordList)
    if endWord not in words:
        return 0
    q, seen = collections.deque([(beginWord, 1)]), {beginWord}
    while q:
        w, d = q.popleft()
        if w == endWord:
            return d
        for i in range(len(w)):
            for c in 'abcdefghijklmnopqrstuvwxyz':
                nw = w[:i] + c + w[i + 1:]
                if nw in words and nw not in seen:
                    seen.add(nw)
                    q.append((nw, d + 1))
    return 0
