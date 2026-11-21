import collections
import functools
import heapq
from lib import problem, ints, word
from p_arrays import bounded_product

# ---- Advanced graphs ---------------------------------------------------------


def gen_delay(rng, size):
    n = rng.randint(1, 6) if size == 'small' else 100
    edges = {}
    for _ in range(rng.randint(0, n * 3) if size == 'small' else 6000):
        u, v = rng.sample(range(1, n + 1), 2) if n > 1 else (1, 1)
        if u != v:
            edges[(u, v)] = rng.randint(0, 20 if size == 'small' else 100)
    return ([[u, v, w] for (u, v), w in edges.items()], n, rng.randint(1, n))


@problem('network-delay-time', fixed=[([[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2), ([[1, 2, 1]], 2, 1), ([[1, 2, 1]], 2, 2), ([], 1, 1), ([[1, 2, 1], [2, 3, 2], [1, 3, 4]], 3, 1)],
         gen=gen_delay, large=2)
def network_delay(times, n, k):
    adj = collections.defaultdict(list)
    for u, v, w in times:
        adj[u].append((v, w))
    dist, heap = {}, [(0, k)]
    while heap:
        d, u = heapq.heappop(heap)
        if u in dist:
            continue
        dist[u] = d
        for v, w in adj[u]:
            if v not in dist:
                heapq.heappush(heap, (d + w, v))
    return max(dist.values()) if len(dist) == n else -1


AIRPORTS = ['JFK', 'SFO', 'ATL', 'LAX', 'MUC', 'LHR', 'SJC', 'AAA', 'BBB']


def gen_itinerary(rng, size):
    length = rng.randint(1, 8) if size == 'small' else 300
    pool = AIRPORTS[:rng.randint(2, len(AIRPORTS))]
    path = ['JFK']
    for _ in range(length):
        path.append(rng.choice([a for a in pool if a != path[-1]]))
    tickets = [[a, b] for a, b in zip(path, path[1:])]
    rng.shuffle(tickets)
    return (tickets,)


@problem('reconstruct-itinerary', fixed=[([['MUC', 'LHR'], ['JFK', 'MUC'], ['SFO', 'SJC'], ['LHR', 'SFO']],), ([['JFK', 'SFO'], ['JFK', 'ATL'], ['SFO', 'ATL'], ['ATL', 'JFK'], ['ATL', 'SFO']],), ([['JFK', 'KUL'], ['JFK', 'NRT'], ['NRT', 'JFK']],), ([['JFK', 'AAA']],)],
         gen=gen_itinerary, large=2)
def itinerary(tickets):
    adj = collections.defaultdict(list)
    for a, b in sorted(tickets, reverse=True):
        adj[a].append(b)
    route, stack = [], ['JFK']
    while stack:
        while adj[stack[-1]]:
            stack.append(adj[stack[-1]].pop())
        route.append(stack.pop())
    return route[::-1]


def gen_points(rng, size):
    n = rng.randint(1, 8) if size == 'small' else 1000
    pts = set()
    while len(pts) < n:
        pts.add((rng.randint(-20, 20), rng.randint(-20, 20)) if size == 'small' else (rng.randint(-10**6, 10**6), rng.randint(-10**6, 10**6)))
    return ([list(p) for p in pts],)


@problem('min-cost-to-connect-all-points', fixed=[([[0, 0], [2, 2], [3, 10], [5, 2], [7, 0]],), ([[3, 12], [-2, 5], [-4, 1]],), ([[0, 0]],), ([[0, 0], [1, 1], [1, 0], [-1, 1]],)],
         gen=gen_points, large=2)
def min_cost_points(points):
    n = len(points)
    best, seen, total = [float('inf')] * n, [False] * n, 0
    best[0] = 0
    for _ in range(n):
        u = min((d, i) for i, d in enumerate(best) if not seen[i])[1]
        seen[u] = True
        total += best[u]
        for v in range(n):
            if not seen[v]:
                best[v] = min(best[v], abs(points[u][0] - points[v][0]) + abs(points[u][1] - points[v][1]))
    return total


def gen_swim(rng, size):
    n = rng.randint(1, 6) if size == 'small' else 25
    values = list(range(n * n))
    rng.shuffle(values)
    return ([values[r * n:(r + 1) * n] for r in range(n)],)


@problem('swim-in-rising-water', fixed=[([[0, 2], [1, 3]],), ([[0, 1, 2, 3, 4], [24, 23, 22, 21, 5], [12, 13, 14, 15, 16], [11, 17, 18, 19, 20], [10, 9, 8, 7, 6]],), ([[0]],), ([[3, 2], [0, 1]],)],
         gen=gen_swim, large=2)
def swim(grid_):
    n = len(grid_)
    heap, seen = [(grid_[0][0], 0, 0)], {(0, 0)}
    while heap:
        t, r, c = heapq.heappop(heap)
        if (r, c) == (n - 1, n - 1):
            return t
        for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen:
                seen.add((nr, nc))
                heapq.heappush(heap, (max(t, grid_[nr][nc]), nr, nc))


def gen_alien(rng, size):
    letters = list('abcdefghijklmnopqrstuvwxyz'[:rng.randint(2, 6) if size == 'small' else 26])
    rng.shuffle(letters)
    rank = {c: i for i, c in enumerate(letters)}
    words = [word(rng, rng.randint(1, 4 if size == 'small' else 12), letters) for _ in range(rng.randint(1, 8) if size == 'small' else 1000)]
    words.sort(key=lambda w: [rank[c] for c in w])
    roll = rng.random()
    if roll < 0.15 and len(words) > 1:
        i = rng.randrange(len(words) - 1)
        words[i], words[i + 1] = words[i + 1], words[i]  # possibly contradictory
    elif roll < 0.25:
        words = [w + 'x' if w and i == 0 else w for i, w in enumerate(words)] + ([words[0]] if words else [])
    return (words,)


@problem('alien-dictionary', checker='alien-order', fixed=[(['wrt', 'wrf', 'er', 'ett', 'rftt'],), (['z', 'x'],), (['z', 'x', 'z'],), (['abc', 'ab'],), (['z', 'z'],), (['ab', 'adc'],), (['hrn', 'hrf', 'er', 'enn', 'rfnn'],)],
         gen=gen_alien, large=1,
         metadata={'name': 'alienOrder', 'params': [{'name': 'words', 'type': 'string[]'}], 'return': {'type': 'string'}})
def alien_order(words):
    letters = {c for w in words for c in w}
    adj, indeg = {c: set() for c in letters}, {c: 0 for c in letters}
    for a, b in zip(words, words[1:]):
        for x, y in zip(a, b):
            if x != y:
                if y not in adj[x]:
                    adj[x].add(y)
                    indeg[y] += 1
                break
        else:
            if len(a) > len(b):
                return ''
    q = collections.deque(sorted(c for c in letters if indeg[c] == 0))
    out = []
    while q:
        c = q.popleft()
        out.append(c)
        for d in sorted(adj[c]):
            indeg[d] -= 1
            if indeg[d] == 0:
                q.append(d)
    return ''.join(out) if len(out) == len(letters) else ''


def gen_flights(rng, size):
    n = rng.randint(2, 7) if size == 'small' else 100
    flights = {}
    for _ in range(rng.randint(0, n * 3) if size == 'small' else 3000):
        a, b = rng.sample(range(n), 2)
        flights[(a, b)] = rng.randint(1, 20 if size == 'small' else 10**4)
    src, dst = rng.sample(range(n), 2)
    return (n, [[a, b, p] for (a, b), p in flights.items()], src, dst, rng.randint(0, n - 1))


@problem('cheapest-flights-within-k-stops', fixed=[(4, [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]], 0, 3, 1), (3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 1), (3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 0), (2, [], 0, 1, 1)],
         gen=gen_flights, large=2)
def cheapest(n, flights, src, dst, k):
    cost = [float('inf')] * n
    cost[src] = 0
    for _ in range(k + 1):
        nxt = cost[:]
        for a, b, p in flights:
            if cost[a] + p < nxt[b]:
                nxt[b] = cost[a] + p
        cost = nxt
    return -1 if cost[dst] == float('inf') else cost[dst]


# ---- 1-D dynamic programming ------------------------------------------------


@problem('climbing-stairs', fixed=[(2,), (3,), (1,), (45,), (10,)], gen=lambda rng, size: (rng.randint(1, 45),), random_cases=10)
def climb(n):
    a, b = 1, 1
    for _ in range(n):
        a, b = b, a + b
    return a


@problem('min-cost-climbing-stairs', fixed=[([10, 15, 20],), ([1, 100, 1, 1, 1, 100, 1, 1, 100, 1],), ([0, 0],), ([5, 1],)],
         gen=lambda rng, size: (ints(rng, rng.randint(2, 12) if size == 'small' else 600, 0, 999),), large=1)
def min_cost_stairs(cost):
    a = b = 0
    for c in cost:
        a, b = b, min(a, b) + c
    return min(a, b)


def gen_rob(rng, size):
    return (ints(rng, rng.randint(1, 12) if size == 'small' else 100, 0, 400),)


@problem('house-robber', fixed=[([1, 2, 3, 1],), ([2, 7, 9, 3, 1],), ([0],), ([2, 1, 1, 2],), ([5, 1],)], gen=gen_rob, large=1)
def rob(nums):
    a = b = 0
    for v in nums:
        a, b = b, max(b, a + v)
    return b


@problem('house-robber-ii', fixed=[([2, 3, 2],), ([1, 2, 3, 1],), ([1, 2, 3],), ([1],), ([1, 2],), ([200, 3, 140, 20, 10],)], gen=gen_rob, large=1)
def rob2(nums):
    if len(nums) == 1:
        return nums[0]
    return max(rob(nums[1:]), rob(nums[:-1]))


def gen_pal(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 1000
    return (word(rng, n, 'ab' if rng.random() < 0.5 else 'abcd') if size == 'small' else word(rng, n, 'ab'),)


@problem('longest-palindromic-substring', checker='longest-palindrome', fixed=[('babad',), ('cbbd',), ('a',), ('ac',), ('aaaa',), ('forgeeksskeegfor',)], gen=gen_pal, large=2)
def longest_palindrome(s):
    best = ''
    for center in range(2 * len(s) - 1):
        lo, hi = center // 2, center // 2 + center % 2
        while lo >= 0 and hi < len(s) and s[lo] == s[hi]:
            lo -= 1
            hi += 1
        if hi - lo - 1 > len(best):
            best = s[lo + 1:hi]
    return best


@problem('palindromic-substrings', fixed=[('abc',), ('aaa',), ('a',), ('abba',)], gen=gen_pal, large=2)
def count_substrings(s):
    count = 0
    for center in range(2 * len(s) - 1):
        lo, hi = center // 2, center // 2 + center % 2
        while lo >= 0 and hi < len(s) and s[lo] == s[hi]:
            count += 1
            lo -= 1
            hi += 1
    return count


@problem('decode-ways', fixed=[('12',), ('226',), ('06',), ('0',), ('10',), ('2101',), ('11106',), ('27',)],
         gen=lambda rng, size: (word(rng, rng.randint(1, 12) if size == 'small' else 100, '1122001' if rng.random() < 0.5 else '1234567890'),), large=1)
def num_decodings(s):
    a, b = 1, 1 if s[0] != '0' else 0
    for i in range(1, len(s)):
        c = (b if s[i] != '0' else 0) + (a if 10 <= int(s[i - 1:i + 1]) <= 26 else 0)
        a, b = b, c
    return b


def gen_coins(rng, size):
    coins = rng.sample(range(1, 20) if size == 'small' else range(15, 500), rng.randint(1, 4) if size == 'small' else 12)
    return (coins, rng.randint(0, 40 if size == 'small' else 10000))


@problem('coin-change', fixed=[([1, 2, 5], 11), ([2], 3), ([1], 0), ([186, 419, 83, 408], 6249), ([2, 5, 10, 1], 27)], gen=gen_coins, large=2)
def coin_change(coins, amount):
    dp = [0] + [float('inf')] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return -1 if dp[amount] == float('inf') else dp[amount]


@problem('maximum-product-subarray', fixed=[([2, 3, -2, 4],), ([-2, 0, -1],), ([-2],), ([-2, 3, -4],), ([0, 2],), ([-1, -1],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 12), -10, 10) if size == 'small' else bounded_product(rng, 20000, 3),), large=2)
def max_product(nums):
    best = hi = lo = nums[0]
    for v in nums[1:]:
        hi, lo = max(v, hi * v, lo * v), min(v, hi * v, lo * v)
        best = max(best, hi)
    return best


def gen_word_break(rng, size):
    words = list({word(rng, rng.randint(1, 4), 'ab' if size == 'small' else 'abc') for _ in range(rng.randint(1, 6) if size == 'small' else 30)})
    if size == 'large':
        return ('a' * 299 + 'b', ['a', 'aa', 'aaa', 'aaaa', 'aaaaa', 'aaaaaa', 'aaaaaaa', 'aaaaaaaa', 'aaaaaaaaa', 'aaaaaaaaaa'])
    s = ''.join(rng.choice(words) for _ in range(rng.randint(1, 6)))
    if rng.random() < 0.4:
        s += rng.choice('abc')
    return (s, words)


@problem('word-break', fixed=[('leetcode', ['leet', 'code']), ('applepenapple', ['apple', 'pen']), ('catsandog', ['cats', 'dog', 'sand', 'and', 'cat']), ('a', ['b']), ('aaaaaaa', ['aaaa', 'aaa'])],
         gen=gen_word_break, large=1)
def word_break(s, wordDict):
    words = set(wordDict)
    dp = [True] + [False] * len(s)
    for i in range(1, len(s) + 1):
        dp[i] = any(dp[j] and s[j:i] in words for j in range(max(0, i - 20), i))
    return dp[-1]


@problem('longest-increasing-subsequence', fixed=[([10, 9, 2, 5, 3, 7, 101, 18],), ([0, 1, 0, 3, 2, 3],), ([7, 7, 7, 7, 7, 7, 7],), ([1],), ([4, 10, 4, 3, 8, 9],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 12) if size == 'small' else 700, -10, 10) if size == 'small' else ints(rng, 700, -10**4, 10**4),), large=2)
def lis(nums):
    import bisect
    tails = []
    for v in nums:
        i = bisect.bisect_left(tails, v)
        tails[i:i + 1] = [v]
    return len(tails)


@problem('partition-equal-subset-sum', fixed=[([1, 5, 11, 5],), ([1, 2, 3, 5],), ([1],), ([2, 2],), ([1, 2, 5],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 10) if size == 'small' else 200, 1, 20 if size == 'small' else 100),), large=2)
def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    bits = 1
    for v in nums:
        bits |= bits << v
    return bool(bits >> (total // 2) & 1)


# ---- 2-D dynamic programming ------------------------------------------------


@problem('unique-paths', fixed=[(3, 7), (3, 2), (1, 1), (10, 10), (1, 100), (23, 12)], gen=lambda rng, size: (rng.randint(1, 15), rng.randint(1, 15)), random_cases=12)
def unique_paths(m, n):
    from math import comb
    return comb(m + n - 2, m - 1)


def gen_two_words(rng, size, alphabet='abc', n_small=8, n_large=300):
    a = word(rng, rng.randint(1, n_small) if size == 'small' else n_large, alphabet)
    b = word(rng, rng.randint(1, n_small) if size == 'small' else n_large, alphabet)
    return (a, b)


@problem('longest-common-subsequence', fixed=[('abcde', 'ace'), ('abc', 'abc'), ('abc', 'def'), ('a', 'a'), ('bsbininm', 'jmjkbkjkv')], gen=gen_two_words, large=1)
def lcs(text1, text2):
    prev = [0] * (len(text2) + 1)
    for a in text1:
        cur = [0]
        for j, b in enumerate(text2):
            cur.append(prev[j] + 1 if a == b else max(prev[j + 1], cur[j]))
        prev = cur
    return prev[-1]


@problem('best-time-to-buy-and-sell-stock-with-cooldown', fixed=[([1, 2, 3, 0, 2],), ([1],), ([1, 2, 4],), ([6, 1, 6, 4, 3, 0, 2],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 12) if size == 'small' else 600, 0, 10 if size == 'small' else 1000),), large=1)
def cooldown(prices):
    hold, sold, rest = float('-inf'), 0, 0
    for p in prices:
        hold, sold, rest = max(hold, rest - p), hold + p, max(rest, sold)
    return max(sold, rest)


def gen_change(rng, size):
    coins = rng.sample(range(1, 15) if size == 'small' else range(10, 300), rng.randint(1, 4) if size == 'small' else 30)
    return (rng.randint(0, 30 if size == 'small' else 5000), coins)


@problem('coin-change-ii', fixed=[(5, [1, 2, 5]), (3, [2]), (10, [10]), (0, [7]), (500, [3, 5, 7, 8, 9, 10, 11])], gen=gen_change, large=1)
def change(amount, coins):
    dp = [1] + [0] * amount
    for c in coins:
        for a in range(c, amount + 1):
            dp[a] += dp[a - c]
    return dp[amount]


def gen_target_sum(rng, size):
    nums = ints(rng, rng.randint(1, 8) if size == 'small' else 20, 0, 5 if size == 'small' else 50)
    return (nums, rng.randint(-sum(nums) - 1, sum(nums) + 1))


@problem('target-sum', fixed=[([1, 1, 1, 1, 1], 3), ([1], 1), ([1], 2), ([0, 0, 0], 0), ([100], -200)], gen=gen_target_sum, large=2)
def target_sum(nums, target):
    ways = collections.Counter({0: 1})
    for v in nums:
        nxt = collections.Counter()
        for s, c in ways.items():
            nxt[s + v] += c
            nxt[s - v] += c
        ways = nxt
    return ways[target]


def gen_interleave(rng, size):
    a = word(rng, rng.randint(0, 6) if size == 'small' else 100, 'ab')
    b = word(rng, rng.randint(0, 6) if size == 'small' else 100, 'ab')
    ia, ib, out = 0, 0, []
    while ia < len(a) or ib < len(b):
        if ib >= len(b) or (ia < len(a) and rng.random() < 0.5):
            out.append(a[ia])
            ia += 1
        else:
            out.append(b[ib])
            ib += 1
    c = ''.join(out)
    if rng.random() < 0.4 and c:
        i = rng.randrange(len(c))
        c = c[:i] + ('a' if c[i] == 'b' else 'b') + c[i + 1:]
    if rng.random() < 0.1:
        c += 'a'
    return (a, b, c)


@problem('interleaving-string', fixed=[('aabcc', 'dbbca', 'aadbbcbcac'), ('aabcc', 'dbbca', 'aadbbbaccc'), ('', '', ''), ('a', '', 'a'), ('', '', 'a'), ('ab', 'bc', 'babc')],
         gen=gen_interleave, large=2)
def interleave(s1, s2, s3):
    if len(s1) + len(s2) != len(s3):
        return False

    @functools.lru_cache(None)
    def go(i, j):
        if i + j == len(s3):
            return True
        return (i < len(s1) and s1[i] == s3[i + j] and go(i + 1, j)) or (j < len(s2) and s2[j] == s3[i + j] and go(i, j + 1))
    return go(0, 0)


def matrix_of(rng, size):
    m, n = (rng.randint(1, 5), rng.randint(1, 5)) if size == 'small' else (60, 60)
    return [ints(rng, n, 0, 9 if size == 'small' else 10**4) for _ in range(m)]


@problem('longest-increasing-path-in-a-matrix', fixed=[([[9, 9, 4], [6, 6, 8], [2, 1, 1]],), ([[3, 4, 5], [3, 2, 6], [2, 2, 1]],), ([[1]],), ([[1, 2]],)],
         gen=lambda rng, size: (matrix_of(rng, size),), large=2)
def lip(matrix):
    m, n = len(matrix), len(matrix[0])
    order = sorted((matrix[r][c], r, c) for r in range(m) for c in range(n))
    best = [[1] * n for _ in range(m)]
    for v, r, c in order:
        for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n and matrix[nr][nc] < v:
                best[r][c] = max(best[r][c], best[nr][nc] + 1)
    return max(max(row) for row in best)


@problem('distinct-subsequences', fixed=[('rabbbit', 'rabbit'), ('babgbag', 'bag'), ('a', 'b'), ('aaa', 'a'), ('b', 'bb')],
         gen=lambda rng, size: (word(rng, rng.randint(1, 10) if size == 'small' else 500, 'ab'), word(rng, rng.randint(1, 4) if size == 'small' else 8, 'ab')), large=1)
def num_distinct(s, t):
    dp = [1] + [0] * len(t)
    for c in s:
        for j in range(len(t), 0, -1):
            if t[j - 1] == c:
                dp[j] += dp[j - 1]
    return dp[-1]


@problem('edit-distance', fixed=[('horse', 'ros'), ('intention', 'execution'), ('', ''), ('', 'a'), ('abc', 'abc'), ('zoologicoarchaeologist', 'zoogeologist')],
         gen=lambda rng, size: gen_two_words(rng, size, 'abc', 8, 300), large=1)
def edit_distance(word1, word2):
    prev = list(range(len(word2) + 1))
    for i, a in enumerate(word1, 1):
        cur = [i]
        for j, b in enumerate(word2, 1):
            cur.append(prev[j - 1] if a == b else 1 + min(prev[j - 1], prev[j], cur[j - 1]))
        prev = cur
    return prev[-1]


@problem('burst-balloons', fixed=[([3, 1, 5, 8],), ([1, 5],), ([7],), ([9, 76, 64, 21],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 8) if size == 'small' else 120, 0, 100),), large=1)
def burst(nums):
    vals = [1] + nums + [1]
    n = len(vals)
    dp = [[0] * n for _ in range(n)]
    for length in range(2, n):
        for lo in range(n - length):
            hi = lo + length
            dp[lo][hi] = max(vals[lo] * vals[k] * vals[hi] + dp[lo][k] + dp[k][hi] for k in range(lo + 1, hi))
    return dp[0][n - 1]


def gen_regex(rng, size):
    s = word(rng, rng.randint(1, 8) if size == 'small' else 20, 'ab')
    p = ''
    for _ in range(rng.randint(1, 6) if size == 'small' else 12):
        p += rng.choice('ab.')
        if rng.random() < 0.4:
            p += '*'
    if size == 'large':
        return ('a' * 20 + 'b', 'a*' * 10 + 'c')
    return (s, p)


@problem('regular-expression-matching', fixed=[('aa', 'a'), ('aa', 'a*'), ('ab', '.*'), ('aab', 'c*a*b'), ('mississippi', 'mis*is*p*.'), ('a', 'ab*'), ('ab', '.*c')],
         gen=gen_regex, large=1)
def is_match(s, p):
    @functools.lru_cache(None)
    def go(i, j):
        if j == len(p):
            return i == len(s)
        first = i < len(s) and p[j] in (s[i], '.')
        if j + 1 < len(p) and p[j + 1] == '*':
            return go(i, j + 2) or (first and go(i + 1, j))
        return first and go(i + 1, j + 1)
    return go(0, 0)


# ---- Greedy ------------------------------------------------------------------


@problem('maximum-subarray', fixed=[([-2, 1, -3, 4, -1, 2, 1, -5, 4],), ([1],), ([5, 4, -1, 7, 8],), ([-3, -1, -2],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 12) if size == 'small' else 30000, -10, 10 if size == 'small' else 10**4),), large=2)
def max_subarray(nums):
    best = cur = nums[0]
    for v in nums[1:]:
        cur = max(v, cur + v)
        best = max(best, cur)
    return best


def gen_jump(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 10000
    return (ints(rng, n, 0, 3 if size == 'small' else 3),)


@problem('jump-game', fixed=[([2, 3, 1, 1, 4],), ([3, 2, 1, 0, 4],), ([0],), ([2, 0, 0],), ([1, 0, 1],)], gen=gen_jump, large=2)
def can_jump(nums):
    reach = 0
    for i, v in enumerate(nums):
        if i > reach:
            return False
        reach = max(reach, i + v)
    return True


def gen_jump2(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 10000
    return ([rng.randint(1, 4) for _ in range(n)],)


@problem('jump-game-ii', fixed=[([2, 3, 1, 1, 4],), ([2, 3, 0, 1, 4],), ([0],), ([1, 2],), ([1, 1, 1, 1],)], gen=gen_jump2, large=2)
def jump(nums):
    jumps = end = far = 0
    for i in range(len(nums) - 1):
        far = max(far, i + nums[i])
        if i == end:
            jumps += 1
            end = far
    return jumps


def gen_gas(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 30000
    return (ints(rng, n, 0, 6 if size == 'small' else 10**4), ints(rng, n, 0, 6 if size == 'small' else 10**4))


@problem('gas-station', fixed=[([1, 2, 3, 4, 5], [3, 4, 5, 1, 2]), ([2, 3, 4], [3, 4, 3]), ([5], [4]), ([2], [2]), ([5, 1, 2, 3, 4], [4, 4, 1, 5, 1])], gen=gen_gas, large=2)
def gas_station(gas, cost):
    if sum(gas) < sum(cost):
        return -1
    start = tank = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            start, tank = i + 1, 0
    return start


def gen_hand(rng, size):
    g = rng.randint(1, 4) if size == 'small' else rng.choice([3, 50])
    groups = rng.randint(1, 4) if size == 'small' else 10000 // g
    hand = []
    for _ in range(groups):
        start = rng.randint(0, 20 if size == 'small' else 10**6)
        hand += list(range(start, start + g))
    if rng.random() < 0.4:
        hand[rng.randrange(len(hand))] += 1
    rng.shuffle(hand)
    return (hand, g)


@problem('hand-of-straights', fixed=[([1, 2, 3, 6, 2, 3, 4, 7, 8], 3), ([1, 2, 3, 4, 5], 4), ([1], 1), ([1, 1, 2, 2, 3, 3], 3), ([8, 10, 12], 3)], gen=gen_hand, large=2)
def straights(hand, groupSize):
    if len(hand) % groupSize:
        return False
    count = collections.Counter(hand)
    for v in sorted(count):
        c = count[v]
        if c:
            for x in range(v, v + groupSize):
                if count[x] < c:
                    return False
                count[x] -= c
    return True


def gen_triplets(rng, size):
    n = rng.randint(1, 8) if size == 'small' else 20000
    target = ints(rng, 3, 1, 10 if size == 'small' else 1000)
    return ([ints(rng, 3, 1, 10 if size == 'small' else 1000) for _ in range(n)], target)


@problem('merge-triplets-to-form-target-triplet', fixed=[([[2, 5, 3], [1, 8, 4], [1, 7, 5]], [2, 7, 5]), ([[3, 4, 5], [4, 5, 6]], [3, 2, 5]), ([[2, 5, 3], [2, 3, 4], [1, 2, 5], [5, 2, 3]], [5, 5, 5]), ([[1, 1, 1]], [1, 1, 1])],
         gen=gen_triplets, large=1)
def merge_triplets(triplets, target):
    good = set()
    for t in triplets:
        if all(t[i] <= target[i] for i in range(3)):
            good |= {i for i in range(3) if t[i] == target[i]}
    return len(good) == 3


@problem('partition-labels', fixed=[('ababcbacadefegdehijhklij',), ('eccbbbbdec',), ('a',), ('abc',)],
         gen=lambda rng, size: (word(rng, rng.randint(1, 15) if size == 'small' else 500, 'abcdefghijklmnopqrstuvwxyz'[:rng.randint(1, 26)]),), large=1)
def partition_labels(s):
    last = {c: i for i, c in enumerate(s)}
    out, start, end = [], 0, 0
    for i, c in enumerate(s):
        end = max(end, last[c])
        if i == end:
            out.append(end - start + 1)
            start = i + 1
    return out


@problem('valid-parenthesis-string', fixed=[('()',), ('(*)',), ('(*))',), ('(',), ('*',), ('((*)',), ('(((((*(()((((*((**(((()()*)()()()*((((**)())*)*)))))))(())(()))())((*()()(((()((()*(())*(()**)()(())',)],
         gen=lambda rng, size: (word(rng, rng.randint(1, 12) if size == 'small' else 100, '()*'),), large=1)
def check_valid(s):
    lo = hi = 0
    for c in s:
        lo += 1 if c == '(' else -1
        hi += 1 if c != ')' else -1
        if hi < 0:
            return False
        lo = max(lo, 0)
    return lo == 0


# ---- Intervals ---------------------------------------------------------------


def disjoint_intervals(rng, n, span):
    points = sorted(rng.sample(range(span), 2 * n))
    return [[points[2 * i], points[2 * i + 1]] for i in range(n)]


def gen_insert(rng, size):
    n = rng.randint(0, 6) if size == 'small' else 10000
    span = 40 if size == 'small' else 10**5
    a = rng.randint(0, span - 2)
    return (disjoint_intervals(rng, n, span), [a, rng.randint(a, span)])


@problem('insert-interval', fixed=[([[1, 3], [6, 9]], [2, 5]), ([[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]), ([], [5, 7]), ([[1, 5]], [2, 3]), ([[1, 5]], [6, 8]), ([[3, 5]], [0, 1])],
         gen=gen_insert, large=1)
def insert(intervals, newInterval):
    return merge(intervals + [newInterval])


def random_intervals(rng, size, n_small=(1, 8), n_large=10000, span_small=20, span_large=10**4):
    n = rng.randint(*n_small) if size == 'small' else n_large
    span = span_small if size == 'small' else span_large
    out = []
    for _ in range(n):
        a = rng.randint(0, span)
        out.append([a, rng.randint(a, min(span, a + span // 4 + 1))])
    return out


@problem('merge-intervals', checker='unordered', fixed=[([[1, 3], [2, 6], [8, 10], [15, 18]],), ([[1, 4], [4, 5]],), ([[4, 7], [1, 4]],), ([[1, 4], [2, 3]],), ([[1, 1]],)],
         gen=lambda rng, size: (random_intervals(rng, size),), large=1)
def merge(intervals):
    out = []
    for a, b in sorted(intervals):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


@problem('non-overlapping-intervals', fixed=[([[1, 2], [2, 3], [3, 4], [1, 3]],), ([[1, 2], [1, 2], [1, 2]],), ([[1, 2], [2, 3]],), ([[0, 2], [1, 3], [2, 4], [3, 5], [4, 6]],)],
         gen=lambda rng, size: ([[a, b + 1 if a == b else b] for a, b in random_intervals(rng, size)],), large=2)
def erase_overlap(intervals):
    end, kept = float('-inf'), 0
    for a, b in sorted(intervals, key=lambda x: x[1]):
        if a >= end:
            kept += 1
            end = b
    return len(intervals) - kept


METADATA_MEETING = {'name': 'canAttendMeetings', 'params': [{'name': 'intervals', 'type': 'integer[][]'}], 'return': {'type': 'boolean'}}


def gen_meetings(rng, size):
    if rng.random() < 0.5:
        n = rng.randint(0, 6) if size == 'small' else 5000
        iv = disjoint_intervals(rng, n, 40 if size == 'small' else 10**6)
        rng.shuffle(iv)
        return (iv,)
    return ([[a, b + 1] for a, b in random_intervals(rng, size, (0, 6))],)


@problem('meeting-rooms', fixed=[([[0, 30], [5, 10], [15, 20]],), ([[7, 10], [2, 4]],), ([],), ([[1, 5], [5, 10]],), ([[5, 8], [6, 8]],)], gen=gen_meetings, large=2, metadata=METADATA_MEETING)
def can_attend(intervals):
    iv = sorted(intervals)
    return all(a[1] <= b[0] for a, b in zip(iv, iv[1:]))


@problem('meeting-rooms-ii', fixed=[([[0, 30], [5, 10], [15, 20]],), ([[7, 10], [2, 4]],), ([[1, 5], [5, 10]],), ([[1, 10], [2, 9], [3, 8]],), ([[13, 15], [1, 13]],)],
         gen=lambda rng, size: ([[a, b + 1] for a, b in random_intervals(rng, size)],), large=2,
         metadata={'name': 'minMeetingRooms', 'params': [{'name': 'intervals', 'type': 'integer[][]'}], 'return': {'type': 'integer'}})
def min_rooms(intervals):
    events = sorted([(a, 1) for a, _ in intervals] + [(b, -1) for _, b in intervals])
    best = cur = 0
    for _, d in events:
        cur += d
        best = max(best, cur)
    return best


def gen_min_interval(rng, size):
    return (random_intervals(rng, size, (1, 6), 20000, 20, 10**6), ints(rng, rng.randint(1, 6) if size == 'small' else 20000, 0, 22 if size == 'small' else 10**6))


@problem('minimum-interval-to-include-each-query', fixed=[([[1, 4], [2, 4], [3, 6], [4, 4]], [2, 3, 4, 5]), ([[2, 3], [2, 5], [1, 8], [20, 25]], [2, 19, 5, 22]), ([[1, 1]], [1, 2])],
         gen=gen_min_interval, large=2)
def min_interval(intervals, queries):
    iv = sorted(intervals)
    out, heap, i = {}, [], 0
    for q in sorted(set(queries)):
        while i < len(iv) and iv[i][0] <= q:
            heapq.heappush(heap, (iv[i][1] - iv[i][0] + 1, iv[i][1]))
            i += 1
        while heap and heap[0][1] < q:
            heapq.heappop(heap)
        out[q] = heap[0][0] if heap else -1
    return [out[q] for q in queries]


# ---- Math & geometry ---------------------------------------------------------


def square(rng, size):
    n = rng.randint(1, 6) if size == 'small' else 200
    return ([ints(rng, n, -1000, 1000) for _ in range(n)],)


@problem('rotate-image', observe=0, fixed=[([[1, 2, 3], [4, 5, 6], [7, 8, 9]],), ([[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]],), ([[1]],), ([[1, 2], [3, 4]],)],
         gen=square, large=1)
def rotate(matrix):
    return [list(row) for row in zip(*matrix[::-1])]


def rect(rng, size, lo=-100, hi=100, zero=0.0):
    m, n = (rng.randint(1, 6), rng.randint(1, 6)) if size == 'small' else (200, 200)
    return [[0 if rng.random() < zero else rng.randint(lo, hi) for _ in range(n)] for _ in range(m)]


@problem('spiral-matrix', fixed=[([[1, 2, 3], [4, 5, 6], [7, 8, 9]],), ([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],), ([[1]],), ([[1], [2], [3]],), ([[1, 2, 3]],)],
         gen=lambda rng, size: (rect(rng, size),), large=1)
def spiral(matrix):
    out, m = [], [row[:] for row in matrix]
    while m:
        out += m.pop(0)
        m = [list(r) for r in zip(*m)][::-1]
    return out


@problem('set-matrix-zeroes', observe=0, fixed=[([[1, 1, 1], [1, 0, 1], [1, 1, 1]],), ([[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]],), ([[0]],), ([[1, 0]],)],
         gen=lambda rng, size: (rect(rng, size, -5, 5, 0.05),), large=1)
def set_zeroes(matrix):
    rows = {r for r, row in enumerate(matrix) for v in row if v == 0}
    cols = {c for row in matrix for c, v in enumerate(row) if v == 0}
    return [[0 if r in rows or c in cols else v for c, v in enumerate(row)] for r, row in enumerate(matrix)]


@problem('happy-number', fixed=[(19,), (2,), (1,), (7,), (2147483647,)], gen=lambda rng, size: (rng.randint(1, 2**31 - 1) if rng.random() < 0.5 else rng.randint(1, 200),), random_cases=25)
def happy(n):
    seen = set()
    while n != 1 and n not in seen:
        seen.add(n)
        n = sum(int(d) ** 2 for d in str(n))
    return n == 1


@problem('plus-one', fixed=[([1, 2, 3],), ([4, 3, 2, 1],), ([9],), ([9, 9, 9],), ([0],)],
         gen=lambda rng, size: ([rng.randint(1, 9)] + [rng.choice([9, 9, rng.randint(0, 9)]) for _ in range(rng.randint(0, 10) if size == 'small' else 100)],), large=1)
def plus_one(digits):
    return [int(c) for c in str(int(''.join(map(str, digits))) + 1)]


def gen_pow(rng, size):
    x = round(rng.uniform(-3, 3), 5)
    n = rng.randint(-12, 12) if rng.random() < 0.7 else rng.choice([2**31 - 1, -2**31, 10**6]) if abs(x) in (0.0, 1.0) else rng.randint(-12, 12)
    if x == 0 and n <= 0:
        x = 1.5
    return (x, n)


@problem('powx-n', fixed=[(2.0, 10), (2.1, 3), (2.0, -2), (1.0, 2147483647), (-1.0, -2147483648), (0.5, 0), (0.00001, 2147483647)],
         gen=gen_pow, random_cases=25)
def my_pow(x, n):
    try:
        return x ** n
    except OverflowError:
        return 0.0


@problem('multiply-strings', fixed=[('2', '3'), ('123', '456'), ('0', '52'), ('9999', '9999'), ('1', '1')],
         gen=lambda rng, size: (str(rng.randint(0, 10 ** rng.randint(1, 8 if size == 'small' else 200))), str(rng.randint(0, 10 ** rng.randint(1, 8 if size == 'small' else 200)))), large=1)
def multiply(num1, num2):
    return str(int(num1) * int(num2))


# ---- Bit manipulation --------------------------------------------------------


def gen_single(rng, size):
    pairs = rng.sample(range(-3 * 10**4, 3 * 10**4), rng.randint(0, 5) if size == 'small' else 10000)
    single = rng.choice([v for v in range(-30, 30) if v not in pairs])
    nums = pairs * 2 + [single]
    rng.shuffle(nums)
    return (nums,)


@problem('single-number', fixed=[([2, 2, 1],), ([4, 1, 2, 1, 2],), ([1],), ([-1, -1, -2],)], gen=gen_single, large=1)
def single(nums):
    out = 0
    for v in nums:
        out ^= v
    return out


@problem('number-of-1-bits', fixed=[(11,), (128,), (2147483645,), (1,), (4294967295,)], gen=lambda rng, size: (rng.randint(1, 2**31 - 1),), random_cases=20)
def hamming(n):
    return bin(n).count('1')


@problem('counting-bits', fixed=[(2,), (5,), (0,), (1,)], gen=lambda rng, size: (rng.randint(0, 50) if size == 'small' else 30000,), random_cases=8, large=1)
def count_bits(n):
    return [bin(i).count('1') for i in range(n + 1)]


@problem('reverse-bits', fixed=[(43261596,), (2147483644,), (0,), (1,), (4294967293,)], gen=lambda rng, size: (rng.randint(0, 2**32 - 1) if rng.random() < 0.5 else rng.randint(0, 2**31 - 2),), random_cases=20)
def reverse_bits(n):
    return int(format(n, '032b')[::-1], 2)


def gen_missing(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 10000
    nums = list(range(n + 1))
    nums.remove(rng.randint(0, n))
    rng.shuffle(nums)
    return (nums,)


@problem('missing-number', fixed=[([3, 0, 1],), ([0, 1],), ([9, 6, 4, 2, 3, 5, 7, 0, 1],), ([0],), ([1],)], gen=gen_missing, large=1)
def missing(nums):
    n = len(nums)
    return n * (n + 1) // 2 - sum(nums)


@problem('sum-of-two-integers', fixed=[(1, 2), (2, 3), (-1, 1), (-1000, -1000), (0, 0), (-12, -8), (1000, -999)],
         gen=lambda rng, size: (rng.randint(-1000, 1000), rng.randint(-1000, 1000)), random_cases=25)
def get_sum(a, b):
    return a + b


@problem('reverse-integer', fixed=[(123,), (-123,), (120,), (0,), (1534236469,), (-2147483648,), (2147483647,), (-2147483412,)],
         gen=lambda rng, size: (rng.randint(-2**31, 2**31 - 1) if rng.random() < 0.6 else rng.randint(-1000, 1000),), random_cases=25)
def reverse_int(x):
    r = int(str(abs(x))[::-1]) * (1 if x >= 0 else -1)
    return r if -2**31 <= r <= 2**31 - 1 else 0
