"""Problems beyond NeetCode 150 (listed in extra.txt), for the All LeetCode Problems book."""
import collections
import heapq

from lib import problem, ints, word


# ---- Course Schedule III ---------------------------------------------------

def gen_courses(rng, size):
    n = rng.randint(1, 8) if size == 'small' else 10_000
    top = 20 if size == 'small' else 10_000
    return ([[rng.randint(1, top), rng.randint(1, top)] for _ in range(n)],)


@problem('course-schedule-iii', fixed=[([[100, 200], [200, 1300], [1000, 1250], [2000, 3200]],), ([[1, 2]],), ([[3, 2], [4, 3]],),
                                       ([[5, 5], [4, 6], [2, 6]],), ([[7, 17], [3, 12], [10, 20], [9, 10], [5, 20], [10, 19], [4, 18]],)],
         gen=gen_courses, large=2)
def schedule_course(courses):
    taken, time = [], 0
    for duration, last in sorted(courses, key=lambda c: c[1]):
        heapq.heappush(taken, -duration)
        time += duration
        if time > last:
            time += heapq.heappop(taken)
    return len(taken)


# ---- Arrays ---------------------------------------------------------------

def gen_majority(rng, size):
    n = rng.randint(1, 9) if size == 'small' else 20_000
    value = rng.randint(-10**9, 10**9) if size == 'large' else rng.randint(-5, 5)
    count = n // 2 + 1
    nums = [value] * count + [rng.randint(-5, 5) if size == 'small' else rng.randint(-10**9, 10**9) for _ in range(n - count)]
    rng.shuffle(nums)
    return (nums,)


@problem('majority-element', fixed=[([3, 2, 3],), ([2, 2, 1, 1, 1, 2, 2],), ([1],), ([-1, -1, 5],)], gen=gen_majority, large=2)
def majority_element(nums):
    return collections.Counter(nums).most_common(1)[0][0]


def gen_zeros(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 10_000
    return ([0 if rng.random() < 0.4 else rng.randint(-50, 50) for _ in range(n)],)


@problem('move-zeroes', observe=0, fixed=[([0, 1, 0, 3, 12],), ([0],), ([1, 2],), ([0, 0, 1],)], gen=gen_zeros, large=2)
def move_zeroes(nums):
    rest = [x for x in nums if x != 0]
    return rest + [0] * (len(nums) - len(rest))


@problem('sort-colors', observe=0, fixed=[([2, 0, 2, 1, 1, 0],), ([2, 0, 1],), ([0],), ([1, 1],)],
         gen=lambda rng, size: (ints(rng, rng.randint(1, 10) if size == 'small' else 300, 0, 2),), large=2)
def sort_colors(nums):
    return sorted(nums)


def gen_perm(rng, size):
    n = rng.randint(1, 6) if size == 'small' else 100
    return (ints(rng, n, 0, 4 if size == 'small' else 100),)


@problem('next-permutation', observe=0, fixed=[([1, 2, 3],), ([3, 2, 1],), ([1, 1, 5],), ([1],), ([1, 3, 2],), ([2, 3, 1],), ([5, 1, 1],)],
         gen=gen_perm, large=2)
def next_permutation(nums):
    nums = list(nums)
    i = len(nums) - 2
    while i >= 0 and nums[i] >= nums[i + 1]:
        i -= 1
    if i >= 0:
        j = len(nums) - 1
        while nums[j] <= nums[i]:
            j -= 1
        nums[i], nums[j] = nums[j], nums[i]
    nums[i + 1:] = reversed(nums[i + 1:])
    return nums


def gen_merge(rng, size):
    m = rng.randint(0, 6) if size == 'small' else 100
    n = rng.randint(0 if m else 1, 6) if size == 'small' else 100
    a, b = sorted(ints(rng, m, -20, 20)), sorted(ints(rng, n, -20, 20))
    return (a + [0] * n, m, b, n)


@problem('merge-sorted-array', observe=0, fixed=[([1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3), ([1], 1, [], 0), ([0], 0, [1], 1), ([4, 5, 6, 0, 0, 0], 3, [1, 2, 3], 3)],
         gen=gen_merge, large=2)
def merge_sorted(nums1, m, nums2, n):
    return sorted(nums1[:m] + nums2)


def gen_rotate(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 30_000
    return (ints(rng, n, -100, 100) if size == 'small' else ints(rng, n, -1000, 1000), rng.randint(0, 25 if size == 'small' else 100_000))


@problem('rotate-array', observe=0, fixed=[([1, 2, 3, 4, 5, 6, 7], 3), ([-1, -100, 3, 99], 2), ([1], 0), ([1, 2], 3)], gen=gen_rotate, large=1)
def rotate_array(nums, k):
    k %= len(nums)
    return nums[-k:] + nums[:-k] if k else list(nums)


def gen_subarray(rng, size):
    n = rng.randint(1, 10) if size == 'small' else 20_000
    nums = ints(rng, n, -3, 3) if size == 'small' else ints(rng, n, -1000, 1000)
    k = rng.randint(-5, 5) if size == 'small' else rng.choice([0, 7, -1000, 3000])
    return (nums, k)


@problem('subarray-sum-equals-k', fixed=[([1, 1, 1], 2), ([1, 2, 3], 3), ([1], 0), ([1, -1, 0], 0), ([0, 0, 0], 0)], gen=gen_subarray, large=2)
def subarray_sum(nums, k):
    seen, total, count = collections.Counter({0: 1}), 0, 0
    for x in nums:
        total += x
        count += seen[total - k]
        seen[total] += 1
    return count


def gen_asteroids(rng, size):
    n = rng.randint(2, 10) if size == 'small' else 10_000
    top = 6 if size == 'small' else 1000
    return ([rng.choice([-1, 1]) * rng.randint(1, top) for _ in range(n)],)


@problem('asteroid-collision', fixed=[([5, 10, -5],), ([8, -8],), ([10, 2, -5],), ([-2, -1, 1, 2],), ([1, -2, -2, -2],)], gen=gen_asteroids, large=2)
def asteroid_collision(asteroids):
    stack = []
    for a in asteroids:
        while a < 0 and stack and stack[-1] > 0:
            if stack[-1] < -a:
                stack.pop()
                continue
            if stack[-1] == -a:
                stack.pop()
            break
        else:
            stack.append(a)
    return stack


def gen_intervals(rng, size):
    def side():
        out, t = [], 0
        for _ in range(rng.randint(0, 5) if size == 'small' else 1000):
            start = t + rng.randint(0, 4 if size == 'small' else 400)
            end = start + rng.randint(0, 4 if size == 'small' else 400)
            out.append([start, end])
            t = end + 1
        return out
    return (side(), side())


@problem('interval-list-intersections', fixed=[([[0, 2], [5, 10], [13, 23], [24, 25]], [[1, 5], [8, 12], [15, 24], [25, 26]]), ([[1, 3], [5, 9]], []),
                                               ([[1, 7]], [[3, 10]]), ([], [[4, 8], [10, 12]])],
         gen=gen_intervals, large=2)
def interval_intersection(firstList, secondList):
    i = j = 0
    out = []
    while i < len(firstList) and j < len(secondList):
        lo = max(firstList[i][0], secondList[j][0])
        hi = min(firstList[i][1], secondList[j][1])
        if lo <= hi:
            out.append([lo, hi])
        if firstList[i][1] < secondList[j][1]:
            i += 1
        else:
            j += 1
    return out


@problem('maximum-swap', fixed=[(2736,), (9973,), (0,), (98368,), (1993,), (10,)],
         gen=lambda rng, size: (rng.randint(0, 10**8),), random_cases=40)
def maximum_swap(num):
    digits = list(str(num))
    last = {d: i for i, d in enumerate(digits)}
    for i, d in enumerate(digits):
        for bigger in '9876543210':
            if bigger <= d:
                break
            if last.get(bigger, -1) > i:
                digits[i], digits[last[bigger]] = digits[last[bigger]], digits[i]
                return int(''.join(digits))
    return num


# ---- Strings ---------------------------------------------------------------

def gen_prefix(rng, size):
    n = rng.randint(1, 5) if size == 'small' else 200
    stem = word(rng, rng.randint(0, 4 if size == 'small' else 150), 'ab' if size == 'small' else 'abcdefghijklmnopqrstuvwxyz')
    return ([stem[:rng.randint(0, len(stem))] if rng.random() < 0.1 else stem + word(rng, rng.randint(0, 4 if size == 'small' else 50), 'ab')
             for _ in range(n)],)


@problem('longest-common-prefix', fixed=[(['flower', 'flow', 'flight'],), (['dog', 'racecar', 'car'],), ([''],), (['a'],), (['ab', 'a'],)],
         gen=gen_prefix, large=2)
def longest_common_prefix(strs):
    prefix = min(strs)
    last = max(strs)
    i = 0
    while i < len(prefix) and prefix[i] == last[i]:
        i += 1
    return prefix[:i]


def gen_encoded(rng, size):
    budget = [30 if size == 'small' else 60_000]

    def build(depth):
        parts = []
        for _ in range(rng.randint(1, 3)):
            if depth < 3 and rng.random() < 0.5:
                k = rng.randint(1, 12)
                inner, length = build(depth + 1)
                if length * k <= budget[0]:
                    budget[0] -= length * (k - 1)
                    parts.append((f'{k}[{inner}]', length * k))
                    continue
            text = word(rng, rng.randint(1, 3), 'abc')
            parts.append((text, len(text)))
        return ''.join(p for p, _ in parts), sum(n for _, n in parts)
    while True:  # LeetCode limits s to 30 characters
        budget[0] = 30 if size == 'small' else 60_000
        s = build(0)[0]
        if len(s) <= 30:
            return (s,)


@problem('decode-string', fixed=[('3[a]2[bc]',), ('3[a2[c]]',), ('2[abc]3[cd]ef',), ('abc',), ('10[a]',), ('9[8[7[6[ab]]]]',), ('100[leetcode]',)],
         gen=gen_encoded, random_cases=40)
def decode_string(s):
    stack, text, count = [], '', 0
    for ch in s:
        if ch.isdigit():
            count = count * 10 + int(ch)
        elif ch == '[':
            stack.append((text, count))
            text, count = '', 0
        elif ch == ']':
            before, k = stack.pop()
            text = before + text * k
        else:
            text += ch
    return text


def gen_expression(rng, size):
    terms = rng.randint(1, 5) if size == 'small' else 30_000
    out, chain = [str(rng.randint(0, 20))], 0
    for _ in range(terms - 1):
        op = rng.choice('+-*/' if chain < 3 else '+-')
        chain = chain + 1 if op in '*/' else 0
        value = rng.randint(1, 9) if op in '*/' else rng.randint(0, 100)
        out.append(op)
        out.append(str(value))
    space = (lambda: ' ' * rng.randint(0, 2)) if size == 'small' else (lambda: ' ')
    return (''.join(space() + part for part in out) + space(),)


@problem('basic-calculator-ii', fixed=[('3+2*2',), (' 3/2 ',), (' 3+5 / 2 ',), ('0',), ('14-3/2',), ('1-1+1',)], gen=gen_expression, large=1)
def calculate(s):
    stack, num, op = [], 0, '+'
    for i, ch in enumerate(s):
        if ch.isdigit():
            num = num * 10 + int(ch)
        if ch in '+-*/' or i == len(s) - 1:
            if op == '+':
                stack.append(num)
            elif op == '-':
                stack.append(-num)
            elif op == '*':
                stack.append(stack.pop() * num)
            else:
                top = stack.pop()
                stack.append(-(-top // num) if top < 0 else top // num)
            op, num = ch, 0
    return sum(stack)


def gen_words(rng, size):
    pool = [word(rng, rng.randint(1, 3 if size == 'small' else 6), 'abcde' if size == 'small' else 'abcdefghijklmnopqrstuvwxyz')
            for _ in range(6 if size == 'small' else 400)]
    words = [rng.choice(pool) for _ in range(rng.randint(1, 10) if size == 'small' else 500)]
    return (words, rng.randint(1, len(set(words))))


@problem('top-k-frequent-words', fixed=[(['i', 'love', 'leetcode', 'i', 'love', 'coding'], 2),
                                        (['the', 'day', 'is', 'sunny', 'the', 'the', 'the', 'sunny', 'is', 'is'], 4), (['a'], 1), (['b', 'a', 'c'], 3)],
         gen=gen_words, large=2)
def top_k_frequent_words(words, k):
    counts = collections.Counter(words)
    return sorted(counts, key=lambda w: (-counts[w], w))[:k]
