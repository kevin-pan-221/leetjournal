import collections
import heapq
from lib import problem, ints, word


def _n(rng, size, small=12, large=20000):
    return rng.randint(0 if small < 0 else 1, small) if size == 'small' else large


# ---- Arrays & hashing ------------------------------------------------------

def gen_contains_duplicate(rng, size):
    n = rng.randint(1, 15) if size == 'small' else 20000
    if rng.random() < 0.5:
        return (rng.sample(range(-10**9, 10**9), n),)
    return (ints(rng, n, -5, 5) if size == 'small' else rng.sample(range(-10**9, 10**9), n - 1) + [7],)


@problem('contains-duplicate', fixed=[([1, 2, 3, 1],), ([1, 2, 3, 4],), ([1, 1, 1, 3, 3, 4, 3, 2, 4, 2],), ([0],), ([-1, -1],)],
         gen=gen_contains_duplicate, large=2)
def contains_duplicate(nums):
    return len(set(nums)) < len(nums)


def gen_anagram(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 20000
    s = word(rng, n, 'abcde' if size == 'small' else 'abcdefghijklmnopqrstuvwxyz')
    t = list(s)
    rng.shuffle(t)
    if rng.random() < 0.5:
        t[rng.randrange(n)] = rng.choice('abcdefz')
    if rng.random() < 0.2:
        t = t[:-1]
    return (s, ''.join(t))


@problem('valid-anagram', fixed=[('anagram', 'nagaram'), ('rat', 'car'), ('a', 'a'), ('a', 'ab'), ('ab', 'a'), ('aacc', 'ccac')],
         gen=gen_anagram, large=2)
def valid_anagram(s, t):
    return collections.Counter(s) == collections.Counter(t)


def gen_two_sum(rng, size):
    n = rng.randint(2, 12) if size == 'small' else 20000
    while True:
        nums = ints(rng, n, -50, 50) if size == 'small' else rng.sample(range(-10**9, 10**9), n)
        i, j = rng.sample(range(n), 2)
        target = nums[i] + nums[j]
        pairs = sum(1 for a in range(n) for b in range(a + 1, n) if nums[a] + nums[b] == target) if n <= 50 else 1
        if pairs == 1:
            return (nums, target)


@problem('two-sum', checker='unordered', fixed=[([2, 7, 11, 15], 9), ([3, 2, 4], 6), ([3, 3], 6), ([-1, -2, -3, -4, -5], -8), ([0, 4, 3, 0], 0)],
         gen=gen_two_sum, large=2)
def two_sum(nums, target):
    seen = {}
    for i, value in enumerate(nums):
        if target - value in seen:
            return [seen[target - value], i]
        seen[value] = i


def gen_group_anagrams(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 10000
    bases = [word(rng, rng.randint(0, 5), 'abcdeft') for _ in range(max(1, n // 3))]
    out = []
    for _ in range(n):
        letters = list(rng.choice(bases))
        rng.shuffle(letters)
        out.append(''.join(letters))
    return (out,)


@problem('group-anagrams', checker='nested-unordered', fixed=[(['eat', 'tea', 'tan', 'ate', 'nat', 'bat'],), ([''],), (['a'],), (['', ''],), (['ab', 'ba', 'abc'],)],
         gen=gen_group_anagrams, large=2)
def group_anagrams(strs):
    groups = collections.defaultdict(list)
    for s in strs:
        groups[''.join(sorted(s))].append(s)
    return list(groups.values())


def gen_top_k(rng, size):
    n = rng.randint(1, 15) if size == 'small' else 20000
    nums = ints(rng, n, -5, 5) if size == 'small' else ints(rng, n, -2000, 2000)
    counts = sorted(collections.Counter(nums).values(), reverse=True)
    # Answer must be unique: only pick k where the k-th and (k+1)-th counts differ.
    valid = [k for k in range(1, len(counts) + 1) if k == len(counts) or counts[k - 1] != counts[k]]
    return (nums, rng.choice(valid))


@problem('top-k-frequent-elements', checker='unordered', fixed=[([1, 1, 1, 2, 2, 3], 2), ([1], 1), ([1, 2, 1, 2, 1, 2, 3, 1, 3, 2], 2), ([4, 4, -1, -1, -1], 1)],
         gen=gen_top_k, large=2)
def top_k(nums, k):
    return [v for v, _ in collections.Counter(nums).most_common(k)]


def gen_encode(rng, size):
    n = rng.randint(0, 8) if size == 'small' else 2000
    alphabet = 'ab#:,;/ 0123456789\\"\''
    return ([word(rng, rng.randint(0, 8 if size == 'small' else 100), alphabet) for _ in range(n)],)


@problem('encode-and-decode-strings', mode='encode-decode',
         fixed=[(['neet', 'code', 'love', 'you'],), (['we', 'say', ':', 'yes'],), ([],), ([''],), (['', ''],), (['#', '4#', '5#abc'],), (['a,b', '1:2'],)],
         gen=gen_encode, large=1,
         metadata={'name': 'encode', 'params': [{'name': 'strs', 'type': 'string[]'}], 'return': {'type': 'string[]'}})
def encode_decode(strs):
    return list(strs)


def gen_product(rng, size):
    n = rng.randint(2, 10) if size == 'small' else 20000
    if size == 'small':
        return (ints(rng, n, -3, 3),)
    return (bounded_product(rng, n),)


def bounded_product(rng, n, zeros=0):
    # Every prefix/suffix product must fit in a 32-bit integer.
    nums = [rng.choice([-1, 1]) for _ in range(n)]
    for i in rng.sample(range(n), 20):
        nums[i] = rng.choice([2, -2, 3])
    for i in rng.sample(range(n), zeros):
        nums[i] = 0
    return nums


@problem('product-of-array-except-self', fixed=[([1, 2, 3, 4],), ([-1, 1, 0, -3, 3],), ([0, 0],), ([2, 3],), ([1, 0, 2, 0],)],
         gen=gen_product, large=2)
def product_except_self(nums):
    n = len(nums)
    out = [1] * n
    left = 1
    for i in range(n):
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] *= right
        right *= nums[i]
    return out


def gen_sudoku(rng, size):
    base = [[(r * 3 + r // 3 + c) % 9 + 1 for c in range(9)] for r in range(9)]
    digits = list(range(1, 10))
    rng.shuffle(digits)
    board = [[str(digits[v - 1]) if rng.random() < 0.35 else '.' for v in row] for row in base]
    if rng.random() < 0.5:
        r, c = rng.randrange(9), rng.randrange(9)
        board[r][c] = str(rng.randint(1, 9))
    return (board,)


SUDOKU_OK = [["5", "3", ".", ".", "7", ".", ".", ".", "."], ["6", ".", ".", "1", "9", "5", ".", ".", "."], [".", "9", "8", ".", ".", ".", ".", "6", "."], ["8", ".", ".", ".", "6", ".", ".", ".", "3"], ["4", ".", ".", "8", ".", "3", ".", ".", "1"], ["7", ".", ".", ".", "2", ".", ".", ".", "6"], [".", "6", ".", ".", ".", ".", "2", "8", "."], [".", ".", ".", "4", "1", "9", ".", ".", "5"], [".", ".", ".", ".", "8", ".", ".", "7", "9"]]
SUDOKU_BAD = [["8"] + r[1:] for r in SUDOKU_OK[:1]] + SUDOKU_OK[1:]


@problem('valid-sudoku', fixed=[(SUDOKU_OK,), (SUDOKU_BAD,), ([['.'] * 9 for _ in range(9)],)], gen=gen_sudoku)
def valid_sudoku(board):
    seen = set()
    for r in range(9):
        for c in range(9):
            v = board[r][c]
            if v == '.':
                continue
            keys = (('r', r, v), ('c', c, v), ('b', r // 3, c // 3, v))
            if any(k in seen for k in keys):
                return False
            seen.update(keys)
    return True


def gen_consecutive(rng, size):
    n = rng.randint(0, 15) if size == 'small' else 20000
    return (ints(rng, n, -10, 10) if size == 'small' else ints(rng, n, -60000, 60000),)


@problem('longest-consecutive-sequence', fixed=[([100, 4, 200, 1, 3, 2],), ([0, 3, 7, 2, 5, 8, 4, 6, 0, 1],), ([],), ([1, 0, 1, 2],), ([-1, 1, 0],), ([9],)],
         gen=gen_consecutive, large=2)
def longest_consecutive(nums):
    s, best = set(nums), 0
    for v in s:
        if v - 1 not in s:
            end = v
            while end + 1 in s:
                end += 1
            best = max(best, end - v + 1)
    return best


# ---- Two pointers ------------------------------------------------------------

def gen_palindrome(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 30000
    half = word(rng, n // 2, 'aAbB, :.0')
    s = half + (rng.choice('xX,') if rng.random() < 0.5 else '') + half[::-1].swapcase()
    if rng.random() < 0.4:
        s = word(rng, len(s), 'abAB01 ,.')
    return (s or 'a',)


@problem('valid-palindrome', fixed=[('A man, a plan, a canal: Panama',), ('race a car',), (' ',), ('0P',), ('a.',), ('ab_a',), ('.,',)],
         gen=gen_palindrome, large=2)
def valid_palindrome(s):
    t = [c.lower() for c in s if c.isalnum()]
    return t == t[::-1]


def gen_two_sum_sorted(rng, size):
    n = rng.randint(2, 12) if size == 'small' else 30000
    while True:
        nums = sorted(ints(rng, n, -20, 20) if size == 'small' else rng.sample(range(-10**6, 10**6), n))
        i, j = sorted(rng.sample(range(n), 2))
        target = nums[i] + nums[j]
        if n > 50 or sum(1 for a in range(n) for b in range(a + 1, n) if nums[a] + nums[b] == target) == 1:
            return (nums, target)


@problem('two-sum-ii-input-array-is-sorted', fixed=[([2, 7, 11, 15], 9), ([2, 3, 4], 6), ([-1, 0], -1), ([1, 2, 3, 4, 4, 9, 56, 90], 8)],
         gen=gen_two_sum_sorted, large=2)
def two_sum_sorted(numbers, target):
    lo, hi = 0, len(numbers) - 1
    while numbers[lo] + numbers[hi] != target:
        if numbers[lo] + numbers[hi] < target:
            lo += 1
        else:
            hi -= 1
    return [lo + 1, hi + 1]


def gen_3sum(rng, size):
    n = rng.randint(3, 12) if size == 'small' else 2500
    return (ints(rng, n, -6, 6) if size == 'small' else ints(rng, n, -10**5, 10**5),)


@problem('3sum', checker='nested-unordered', fixed=[([-1, 0, 1, 2, -1, -4],), ([0, 1, 1],), ([0, 0, 0],), ([0, 0, 0, 0],), ([-2, 0, 1, 1, 2],), ([1, 2, -2, -1],)],
         gen=gen_3sum, large=2)
def three_sum(nums):
    nums = sorted(nums)
    out = []
    for i in range(len(nums) - 2):
        if i and nums[i] == nums[i - 1]:
            continue
        lo, hi = i + 1, len(nums) - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if s < 0:
                lo += 1
            elif s > 0:
                hi -= 1
            else:
                out.append([nums[i], nums[lo], nums[hi]])
                lo += 1
                while lo < hi and nums[lo] == nums[lo - 1]:
                    lo += 1
                hi -= 1
    return out


def gen_heights(rng, size, lo=0, hi=10, n_small=(2, 12), n_large=20000):
    n = rng.randint(*n_small) if size == 'small' else n_large
    return (ints(rng, n, lo, hi) if size == 'small' else ints(rng, n, 0, 10**4),)


@problem('container-with-most-water', fixed=[([1, 8, 6, 2, 5, 4, 8, 3, 7],), ([1, 1],), ([4, 3, 2, 1, 4],), ([1, 2, 1],), ([0, 0],)],
         gen=gen_heights, large=2)
def max_area(height):
    lo, hi, best = 0, len(height) - 1, 0
    while lo < hi:
        best = max(best, (hi - lo) * min(height[lo], height[hi]))
        if height[lo] < height[hi]:
            lo += 1
        else:
            hi -= 1
    return best


@problem('trapping-rain-water', fixed=[([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1],), ([4, 2, 0, 3, 2, 5],), ([1],), ([5, 4, 3],), ([2, 0, 2],)],
         gen=lambda rng, size: gen_heights(rng, size, n_small=(1, 14)), large=2)
def trap(height):
    lo, hi, lmax, rmax, water = 0, len(height) - 1, 0, 0, 0
    while lo < hi:
        if height[lo] < height[hi]:
            lmax = max(lmax, height[lo])
            water += lmax - height[lo]
            lo += 1
        else:
            rmax = max(rmax, height[hi])
            water += rmax - height[hi]
            hi -= 1
    return water


# ---- Sliding window ----------------------------------------------------------

@problem('best-time-to-buy-and-sell-stock', fixed=[([7, 1, 5, 3, 6, 4],), ([7, 6, 4, 3, 1],), ([1],), ([2, 4, 1],), ([3, 3, 3],)],
         gen=lambda rng, size: gen_heights(rng, size, n_small=(1, 12), n_large=30000), large=2)
def max_profit(prices):
    low, best = float('inf'), 0
    for p in prices:
        low = min(low, p)
        best = max(best, p - low)
    return best


def gen_substring(rng, size):
    n = rng.randint(0, 15) if size == 'small' else 20000
    alphabet = 'abcd' if size == 'small' else 'abcdefghijklmnopqrstuvwxyz0123456789 !'
    return (word(rng, n, alphabet),)


@problem('longest-substring-without-repeating-characters', fixed=[('abcabcbb',), ('bbbbb',), ('pwwkew',), ('',), (' ',), ('dvdf',), ('abba',)],
         gen=gen_substring, large=2)
def longest_substring(s):
    last, start, best = {}, 0, 0
    for i, c in enumerate(s):
        if last.get(c, -1) >= start:
            start = last[c] + 1
        last[c] = i
        best = max(best, i - start + 1)
    return best


def gen_replacement(rng, size):
    n = rng.randint(1, 15) if size == 'small' else 30000
    s = word(rng, n, 'ABC' if size == 'small' else 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    return (s, rng.randint(0, n))


@problem('longest-repeating-character-replacement', fixed=[('ABAB', 2), ('AABABBA', 1), ('A', 0), ('ABCD', 0), ('AAAA', 2)],
         gen=gen_replacement, large=2)
def character_replacement(s, k):
    count, start, top, best = collections.Counter(), 0, 0, 0
    for i, c in enumerate(s):
        count[c] += 1
        top = max(top, count[c])
        while i - start + 1 - top > k:
            count[s[start]] -= 1
            start += 1
        best = max(best, i - start + 1)
    return best


def gen_inclusion(rng, size):
    n2 = rng.randint(1, 15) if size == 'small' else 10000
    s2 = word(rng, n2, 'abc' if size == 'small' else 'abcdefghij')
    n1 = rng.randint(1, min(5, n2) if size == 'small' else 1000)
    if rng.random() < 0.5 and n1 <= n2:
        start = rng.randint(0, n2 - n1)
        letters = list(s2[start:start + n1])
        rng.shuffle(letters)
        return (''.join(letters), s2)
    return (word(rng, n1, 'abcd' if size == 'small' else 'abcdefghijk'), s2)


@problem('permutation-in-string', fixed=[('ab', 'eidbaooo'), ('ab', 'eidboaoo'), ('adc', 'dcda'), ('a', 'a'), ('abc', 'ab'), ('hello', 'ooolleoooleh')],
         gen=gen_inclusion, large=2)
def check_inclusion(s1, s2):
    n = len(s1)
    if n > len(s2):
        return False
    need, window = collections.Counter(s1), collections.Counter(s2[:n])
    if need == window:
        return True
    for i in range(n, len(s2)):
        window[s2[i]] += 1
        window[s2[i - n]] -= 1
        if window[s2[i - n]] == 0:
            del window[s2[i - n]]
        if window == need:
            return True
    return False


def gen_min_window(rng, size):
    m = rng.randint(1, 15) if size == 'small' else 20000
    s = word(rng, m, 'ABCab' if size == 'small' else 'ABCDEFGHIJKLMNOPQRSTUVWXYZabc')
    t = word(rng, rng.randint(1, 4 if size == 'small' else 30), 'ABCab' if size == 'small' else 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    # The answer must be unique when it exists, as LeetCode guarantees.
    windows = _all_min_windows(s, t) if m <= 15 else None
    if windows is not None and len(set(windows)) > 1:
        return gen_min_window(rng, size)
    return (s, t)


def _all_min_windows(s, t):
    need = collections.Counter(t)
    best, out = None, []
    for i in range(len(s)):
        for j in range(i + 1, len(s) + 1):
            if not need - collections.Counter(s[i:j]):
                if best is None or j - i < best:
                    best, out = j - i, [i]
                elif j - i == best:
                    out.append(i)
                break
    return out


@problem('minimum-window-substring', fixed=[('ADOBECODEBANC', 'ABC'), ('a', 'a'), ('a', 'aa'), ('ab', 'b'), ('bba', 'ab'), ('aa', 'aa')],
         gen=gen_min_window, large=2)
def min_window(s, t):
    need, missing = collections.Counter(t), len(t)
    start, best = 0, (0, float('inf'))
    for end, c in enumerate(s, 1):
        if need[c] > 0:
            missing -= 1
        need[c] -= 1
        if missing == 0:
            while need[s[start]] < 0:
                need[s[start]] += 1
                start += 1
            if end - start < best[1] - best[0]:
                best = (start, end)
            need[s[start]] += 1
            missing += 1
            start += 1
    return '' if best[1] == float('inf') else s[best[0]:best[1]]


def gen_window_max(rng, size):
    n = rng.randint(1, 15) if size == 'small' else 30000
    nums = ints(rng, n, -10, 10) if size == 'small' else ints(rng, n, -10**4, 10**4)
    return (nums, rng.randint(1, n) if size == 'small' else rng.choice([1, 500, 20000]))


@problem('sliding-window-maximum', fixed=[([1, 3, -1, -3, 5, 3, 6, 7], 3), ([1], 1), ([1, -1], 1), ([9, 11], 2), ([4, -2], 2), ([7, 2, 4], 2)],
         gen=gen_window_max, large=2)
def window_max(nums, k):
    q, out = collections.deque(), []
    for i, v in enumerate(nums):
        while q and nums[q[-1]] <= v:
            q.pop()
        q.append(i)
        if q[0] <= i - k:
            q.popleft()
        if i >= k - 1:
            out.append(nums[q[0]])
    return out


# ---- Stack -------------------------------------------------------------------

def gen_parens(rng, size):
    n = rng.randint(1, 12) if size == 'small' else 30000
    if rng.random() < 0.5:
        stack, out = [], []
        pairs = {'(': ')', '[': ']', '{': '}'}
        for _ in range(n // 2):
            if stack and rng.random() < 0.5:
                out.append(pairs[stack.pop()])
            else:
                c = rng.choice('([{')
                stack.append(c)
                out.append(c)
        out += [pairs[c] for c in reversed(stack)]
        if rng.random() < 0.3 and out:
            out[rng.randrange(len(out))] = rng.choice('()[]{}')
        return (''.join(out) or '()',)
    return (word(rng, n, '()[]{}'),)


@problem('valid-parentheses', fixed=[('()',), ('()[]{}',), ('(]',), ('([])',), ('([)]',), ('(',), (']',), ('{[]}',)],
         gen=gen_parens, large=2)
def valid_parentheses(s):
    stack, pairs = [], {')': '(', ']': '[', '}': '{'}
    for c in s:
        if c in pairs:
            if not stack or stack.pop() != pairs[c]:
                return False
        else:
            stack.append(c)
    return not stack


def gen_rpn(rng, size):
    target = rng.randint(1, 6) if size == 'small' else 5000

    def build(n):
        if n == 1:
            return [str(rng.randint(-20, 20))]
        left = rng.randint(1, n - 1)
        op = rng.choice('+-*/' if target <= 6 else '+-')
        right = build(n - left)
        if op == '/' and int(right[0]) == 0 and len(right) == 1:
            right = ['3']
        return build(left) + right + [op]
    while True:
        tokens = build(target)
        try:
            value = eval_rpn(tokens)
            if abs(value) < 2**31:
                return (tokens,)
        except ZeroDivisionError:
            pass


@problem('evaluate-reverse-polish-notation', fixed=[(['2', '1', '+', '3', '*'],), (['4', '13', '5', '/', '+'],), (['10', '6', '9', '3', '+', '-11', '*', '/', '*', '17', '+', '5', '+'],), (['18'],), (['-7', '2', '/'],)],
         gen=gen_rpn, large=1)
def eval_rpn(tokens):
    stack = []
    for t in tokens:
        if t in '+-*/' and len(t) == 1:
            b, a = stack.pop(), stack.pop()
            if t == '/':
                q = abs(a) // abs(b)  # truncate toward zero
                stack.append(q if (a < 0) == (b < 0) else -q)
            else:
                stack.append(a + b if t == '+' else a - b if t == '-' else a * b)
            if abs(stack[-1]) >= 2**31:
                raise ZeroDivisionError  # generator retries: keep values in 32-bit range
        else:
            stack.append(int(t))
    return stack[0]


def gen_temps(rng, size):
    n = rng.randint(1, 15) if size == 'small' else 30000
    return (ints(rng, n, 30, 40) if size == 'small' else ints(rng, n, 30, 100),)


@problem('daily-temperatures', fixed=[([73, 74, 75, 71, 69, 72, 76, 73],), ([30, 40, 50, 60],), ([30, 60, 90],), ([50],), ([90, 80, 70],)],
         gen=gen_temps, large=2)
def daily_temperatures(temperatures):
    out, stack = [0] * len(temperatures), []
    for i, t in enumerate(temperatures):
        while stack and temperatures[stack[-1]] < t:
            j = stack.pop()
            out[j] = i - j
        stack.append(i)
    return out


def gen_fleet(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 20000
    target = rng.randint(n + 1, 30) if size == 'small' else 10**6
    position = rng.sample(range(target), n)
    return (target, position, ints(rng, n, 1, 5 if size == 'small' else 10**6))


@problem('car-fleet', fixed=[(12, [10, 8, 0, 5, 3], [2, 4, 1, 1, 3]), (10, [3], [3]), (100, [0, 2, 4], [4, 2, 1]), (10, [6, 8], [3, 2]), (10, [0, 4, 2], [2, 1, 3])],
         gen=gen_fleet, large=2)
def car_fleet(target, position, speed):
    from fractions import Fraction
    fleets, slowest = 0, Fraction(-1)
    for p, s in sorted(zip(position, speed), reverse=True):
        t = Fraction(target - p, s)
        if t > slowest:
            fleets += 1
            slowest = t
    return fleets


@problem('largest-rectangle-in-histogram', fixed=[([2, 1, 5, 6, 2, 3],), ([2, 4],), ([0],), ([1, 1],), ([2, 1, 2],), ([6, 2, 5, 4, 5, 1, 6],)],
         gen=lambda rng, size: gen_heights(rng, size, n_small=(1, 12), n_large=30000), large=2)
def largest_rectangle(heights):
    stack, best = [], 0
    for i, h in enumerate(heights + [0]):
        start = i
        while stack and stack[-1][1] >= h:
            j, height = stack.pop()
            best = max(best, height * (i - j))
            start = j
        stack.append((start, h))
    return best
