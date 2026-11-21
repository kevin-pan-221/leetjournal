"""Design problems use LeetCode's operation format: (["Ctor","op",...], [[ctor args],[op args],...])."""
import bisect
import collections
import heapq
import itertools
from lib import problem, word


def design(slug, cls, gen, fixed, large=1, random_cases=25):
    def solve(operations, arguments):
        obj = cls(*arguments[0])
        out = [None]
        for op, args in zip(operations[1:], arguments[1:]):
            out.append(getattr(obj, op)(*args))
        return out
    problem(slug, mode='design', fixed=fixed, gen=gen, large=large, random_cases=random_cases,
            metadata={'name': cls.__name__, 'params': [{'name': 'operations', 'type': 'string[]'}, {'name': 'arguments', 'type': 'json'}], 'return': {'type': 'json'}})(solve)


def sequence(rng, size, ctor, ctor_args, choose, small=15, large=3000):
    ops, args = [ctor], [ctor_args]
    for _ in range(rng.randint(1, small) if size == 'small' else large):
        op, a = choose()
        ops.append(op)
        args.append(a)
    return (ops, args)


class MinStack:
    def __init__(self):
        self.s = []

    def push(self, val):
        self.s.append((val, min(val, self.s[-1][1]) if self.s else val))

    def pop(self):
        self.s.pop()

    def top(self):
        return self.s[-1][0]

    def getMin(self):
        return self.s[-1][1]


def gen_min_stack(rng, size):
    depth = [0]

    def choose():
        if depth[0] == 0 or rng.random() < 0.45:
            depth[0] += 1
            return 'push', [rng.randint(-10, 10) if size == 'small' else rng.randint(-2**31, 2**31 - 1)]
        op = rng.choice(['pop', 'top', 'getMin', 'getMin'])
        if op == 'pop':
            depth[0] -= 1
        return op, []
    return sequence(rng, size, 'MinStack', [], choose, large=10000)


design('min-stack', MinStack, gen_min_stack, [(['MinStack', 'push', 'push', 'push', 'getMin', 'pop', 'top', 'getMin'], [[], [-2], [0], [-3], [], [], [], []]),
                                              (['MinStack', 'push', 'push', 'getMin', 'pop', 'getMin'], [[], [1], [1], [], [], []])], large=2)


class TimeMap:
    def __init__(self):
        self.d = collections.defaultdict(list)

    def set(self, key, value, timestamp):
        self.d[key].append((timestamp, value))

    def get(self, key, timestamp):
        items = self.d.get(key, [])
        i = bisect.bisect_right(items, (timestamp, chr(0x10FFFF)))
        return items[i - 1][1] if i else ''


def gen_time_map(rng, size):
    t = [0]
    keys = ['foo', 'bar', 'love', 'k'] if size == 'small' else [word(rng, 5) for _ in range(50)]

    def choose():
        if rng.random() < 0.5:
            t[0] += rng.randint(1, 3)
            return 'set', [rng.choice(keys), word(rng, rng.randint(1, 5)), t[0]]
        return 'get', [rng.choice(keys), rng.randint(0, t[0] + 2)]
    return sequence(rng, size, 'TimeMap', [], choose, large=10000)


design('time-based-key-value-store', TimeMap, gen_time_map, [(['TimeMap', 'set', 'get', 'get', 'set', 'get', 'get'], [[], ['foo', 'bar', 1], ['foo', 1], ['foo', 3], ['foo', 'bar2', 4], ['foo', 4], ['foo', 5]]),
                                                             (['TimeMap', 'get', 'set', 'get'], [[], ['a', 5], ['a', 'x', 10], ['a', 9]])], large=2)


class LRUCache:
    def __init__(self, capacity):
        self.cap, self.d = capacity, collections.OrderedDict()

    def get(self, key):
        if key not in self.d:
            return -1
        self.d.move_to_end(key)
        return self.d[key]

    def put(self, key, value):
        self.d[key] = value
        self.d.move_to_end(key)
        if len(self.d) > self.cap:
            self.d.popitem(last=False)


def gen_lru(rng, size):
    cap = rng.randint(1, 4) if size == 'small' else 1000
    space = 8 if size == 'small' else 3000

    def choose():
        if rng.random() < 0.5:
            return 'put', [rng.randint(0, space), rng.randint(0, 10**5)]
        return 'get', [rng.randint(0, space)]
    return sequence(rng, size, 'LRUCache', [cap], choose, large=15000)


design('lru-cache', LRUCache, gen_lru, [(['LRUCache', 'put', 'put', 'get', 'put', 'get', 'put', 'get', 'get', 'get'], [[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]),
                                        (['LRUCache', 'put', 'get', 'put', 'get', 'get'], [[1], [2, 1], [2], [3, 2], [2], [3]]),
                                        (['LRUCache', 'put', 'put', 'put', 'get'], [[2], [1, 1], [1, 5], [2, 2], [1]])], large=2)


class KthLargest:
    def __init__(self, k, nums):
        self.k, self.h = k, sorted(nums)[-k:]
        heapq.heapify(self.h)

    def add(self, val):
        heapq.heappush(self.h, val)
        if len(self.h) > self.k:
            heapq.heappop(self.h)
        return self.h[0]


def gen_kth_stream(rng, size):
    k = rng.randint(1, 5) if size == 'small' else 500
    nums = [rng.randint(-20, 20) if size == 'small' else rng.randint(-10**4, 10**4) for _ in range(rng.randint(max(0, k - 1), k + 5) if size == 'small' else 10000)]
    return sequence(rng, size, 'KthLargest', [k, nums], lambda: ('add', [rng.randint(-20, 20) if size == 'small' else rng.randint(-10**4, 10**4)]), large=10000)


design('kth-largest-element-in-a-stream', KthLargest, gen_kth_stream, [(['KthLargest', 'add', 'add', 'add', 'add', 'add'], [[3, [4, 5, 8, 2]], [3], [5], [10], [9], [4]]),
                                                                       (['KthLargest', 'add', 'add', 'add', 'add'], [[4, [7, 7, 7, 7, 8, 3]], [2], [10], [9], [9]]),
                                                                       (['KthLargest', 'add', 'add'], [[1, []], [-3], [-2]])], large=2)


class Twitter:
    def __init__(self):
        self.time = itertools.count()
        self.tweets = collections.defaultdict(list)
        self.follows = collections.defaultdict(set)

    def postTweet(self, userId, tweetId):
        self.tweets[userId].append((next(self.time), tweetId))

    def getNewsFeed(self, userId):
        users = self.follows[userId] | {userId}
        return [t for _, t in heapq.nlargest(10, (x for u in users for x in self.tweets[u][-10:]))]

    def follow(self, followerId, followeeId):
        if followerId != followeeId:
            self.follows[followerId].add(followeeId)

    def unfollow(self, followerId, followeeId):
        self.follows[followerId].discard(followeeId)


def gen_twitter(rng, size):
    users = 4 if size == 'small' else 200
    tweet = itertools.count(rng.randint(1, 50) if size == 'small' else 1)

    def choose():
        r = rng.random()
        if r < 0.35:
            return 'postTweet', [rng.randint(1, users), next(tweet)]
        if r < 0.65:
            return 'getNewsFeed', [rng.randint(1, users)]
        a, b = rng.randint(1, users), rng.randint(1, users)
        if a == b:
            b = a % users + 1
        return ('follow' if r < 0.85 else 'unfollow'), [a, b]
    return sequence(rng, size, 'Twitter', [], choose, small=20, large=3000)


design('design-twitter', Twitter, gen_twitter, [(['Twitter', 'postTweet', 'getNewsFeed', 'follow', 'postTweet', 'getNewsFeed', 'unfollow', 'getNewsFeed'], [[], [1, 5], [1], [1, 2], [2, 6], [1], [1, 2], [1]]),
                                                (['Twitter', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'postTweet', 'getNewsFeed'], [[]] + [[1, i] for i in range(11)] + [[1]]),
                                                (['Twitter', 'follow', 'getNewsFeed', 'unfollow', 'unfollow'], [[], [1, 2], [1], [1, 2], [1, 3]])], large=1)


class MedianFinder:
    def __init__(self):
        self.lo, self.hi = [], []

    def addNum(self, num):
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))
        if len(self.hi) > len(self.lo):
            heapq.heappush(self.lo, -heapq.heappop(self.hi))

    def findMedian(self):
        return float(-self.lo[0]) if len(self.lo) > len(self.hi) else (-self.lo[0] + self.hi[0]) / 2


def gen_median(rng, size):
    count = [0]

    def choose():
        if count[0] == 0 or rng.random() < 0.6:
            count[0] += 1
            return 'addNum', [rng.randint(-10, 10) if size == 'small' else rng.randint(-10**5, 10**5)]
        return 'findMedian', []
    return sequence(rng, size, 'MedianFinder', [], choose, large=10000)


design('find-median-from-data-stream', MedianFinder, gen_median, [(['MedianFinder', 'addNum', 'addNum', 'findMedian', 'addNum', 'findMedian'], [[], [1], [2], [], [3], []]),
                                                                  (['MedianFinder', 'addNum', 'findMedian', 'addNum', 'findMedian'], [[], [-1], [], [-2], []])], large=2)


class Trie:
    def __init__(self):
        self.words, self.prefixes = set(), set()

    def insert(self, word_):
        self.words.add(word_)
        self.prefixes.update(word_[:i] for i in range(1, len(word_) + 1))

    def search(self, word_):
        return word_ in self.words

    def startsWith(self, prefix):
        return prefix in self.prefixes


def gen_trie(rng, size):
    alphabet = 'ab' if size == 'small' else 'abcde'

    def choose():
        op = rng.choice(['insert', 'search', 'startsWith'])
        return op, [word(rng, rng.randint(1, 4 if size == 'small' else 10), alphabet)]
    return sequence(rng, size, 'Trie', [], choose, large=10000)


design('implement-trie-prefix-tree', Trie, gen_trie, [(['Trie', 'insert', 'search', 'search', 'startsWith', 'insert', 'search'], [[], ['apple'], ['apple'], ['app'], ['app'], ['app'], ['app']])], large=2)


class WordDictionary:
    def __init__(self):
        self.by_len = collections.defaultdict(set)

    def addWord(self, word_):
        self.by_len[len(word_)].add(word_)

    def search(self, word_):
        return any(all(p in ('.', c) for p, c in zip(word_, w)) for w in self.by_len[len(word_)])


def gen_word_dict(rng, size):
    alphabet = 'ab' if size == 'small' else 'abcdefgh'
    added = [False]

    def choose():
        if not added[0] or rng.random() < 0.4:
            added[0] = True
            return 'addWord', [word(rng, rng.randint(1, 4 if size == 'small' else 8), alphabet)]
        w = list(word(rng, rng.randint(1, 4 if size == 'small' else 8), alphabet))
        for _ in range(rng.randint(0, 2)):
            w[rng.randrange(len(w))] = '.'
        return 'search', [''.join(w)]
    return sequence(rng, size, 'WordDictionary', [], choose, large=6000)


design('design-add-and-search-words-data-structure', WordDictionary, gen_word_dict,
       [(['WordDictionary', 'addWord', 'addWord', 'addWord', 'search', 'search', 'search', 'search'], [[], ['bad'], ['dad'], ['mad'], ['pad'], ['bad'], ['.ad'], ['b..']]),
        (['WordDictionary', 'addWord', 'search', 'search', 'search'], [[], ['a'], ['.'], ['a.'], ['..']])], large=1)


class DetectSquaresRef:
    def __init__(self):
        self.points = collections.Counter()

    def add(self, point):
        self.points[tuple(point)] += 1

    def count(self, point):
        x, y = point
        total = 0
        for (px, py), c in list(self.points.items()):
            if abs(px - x) == abs(py - y) and px != x:
                total += c * self.points.get((px, y), 0) * self.points.get((x, py), 0)
        return total


DetectSquaresRef.__name__ = 'DetectSquares'


def gen_squares(rng, size):
    span = 4 if size == 'small' else 30

    def choose():
        op = 'add' if rng.random() < 0.6 else 'count'
        return op, [[rng.randint(0, span), rng.randint(0, span)]]
    return sequence(rng, size, 'DetectSquares', [], choose, small=25, large=3000)


design('detect-squares', DetectSquaresRef, gen_squares, [(['DetectSquares', 'add', 'add', 'add', 'count', 'count', 'add', 'count'], [[], [[3, 10]], [[11, 2]], [[3, 2]], [[11, 10]], [[14, 8]], [[11, 2]], [[11, 10]]])], large=1)
