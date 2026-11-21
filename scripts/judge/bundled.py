"""Original statements for NeetCode 150 problems whose LeetCode statement is Premium-only.

These are written for LeetJournal (not copied from LeetCode) so they can be practiced
offline. Signatures match LeetCode's Python 3 starters, so code transfers either way.
"""


def example(inputs, output, explanation=None):
    text = 'Input: ' + inputs + '\nOutput: ' + output
    if explanation:
        text += '\nExplanation: ' + explanation
    return '<pre>' + text.replace('<', '&lt;').replace('>', '&gt;') + '</pre>'


def page(intro, examples, constraints):
    parts = [intro]
    for i, ex in enumerate(examples, 1):
        parts.append('<p><strong>Example ' + str(i) + ':</strong></p>' + ex)
    parts.append('<p><strong>Constraints:</strong></p><ul>' + ''.join('<li><code>' + c.replace('<', '&lt;') + '</code></li>' for c in constraints) + '</ul>')
    return '\n'.join(parts)


BUNDLED = {
    'encode-and-decode-strings': dict(
        title='Encode and Decode Strings',
        content=page(
            '<p>Design a scheme that turns a list of strings into a <strong>single string</strong> and back again. '
            'Implement <code>encode(strs)</code>, which returns one string, and <code>decode(s)</code>, which returns the original list exactly.</p>'
            '<p>Strings may contain <strong>any</strong> printable ASCII character, including delimiters you might be tempted to use such as <code>#</code>, <code>,</code> or <code>:</code>. '
            '<code>decode</code> runs on a fresh object, so it cannot rely on anything <code>encode</code> stored.</p>',
            [example('strs = ["neet","code","love","you"]', '["neet","code","love","you"]'),
             example('strs = ["we","say",":","yes"]', '["we","say",":","yes"]'),
             example('strs = ["", "#4", ""]', '["","#4",""]', 'Empty strings and strings that look like your format must survive the round trip.')],
            ['0 <= strs.length < 200', '0 <= strs[i].length < 200', 'strs[i] contains printable ASCII characters']),
        starter='class Solution:\n\n    def encode(self, strs: List[str]) -> str:\n        \n\n    def decode(self, s: str) -> List[str]:\n        \n',
        examples='["neet","code","love","you"]\n["we","say",":","yes"]'),
    'graph-valid-tree': dict(
        title='Graph Valid Tree',
        content=page(
            '<p>You are given <code>n</code> nodes labelled <code>0</code> to <code>n - 1</code> and a list of undirected <code>edges</code>, where <code>edges[i] = [a, b]</code> connects <code>a</code> and <code>b</code>.</p>'
            '<p>Return <code>true</code> if these edges form a valid tree: every node is reachable from every other node and there are no cycles. Otherwise return <code>false</code>.</p>',
            [example('n = 5, edges = [[0,1],[0,2],[0,3],[1,4]]', 'true'),
             example('n = 5, edges = [[0,1],[1,2],[2,3],[1,3],[1,4]]', 'false', 'Nodes 1, 2 and 3 form a cycle.'),
             example('n = 4, edges = [[0,1],[2,3]]', 'false', 'The graph has two separate pieces.')],
            ['1 <= n <= 2000', '0 <= edges.length <= 5000', 'edges[i].length == 2', '0 <= a, b < n', 'a != b', 'No edge appears twice']),
        starter='class Solution:\n    def validTree(self, n: int, edges: List[List[int]]) -> bool:\n        \n',
        examples='5\n[[0,1],[0,2],[0,3],[1,4]]\n5\n[[0,1],[1,2],[2,3],[1,3],[1,4]]\n4\n[[0,1],[2,3]]'),
    'number-of-connected-components-in-an-undirected-graph': dict(
        title='Number of Connected Components in an Undirected Graph',
        content=page(
            '<p>There are <code>n</code> nodes labelled <code>0</code> to <code>n - 1</code> and a list of undirected <code>edges</code>, where <code>edges[i] = [a, b]</code>.</p>'
            '<p>Return the number of <strong>connected components</strong>: groups of nodes that can reach each other, with no edge leading outside the group.</p>',
            [example('n = 5, edges = [[0,1],[1,2],[3,4]]', '2', '{0, 1, 2} and {3, 4}.'),
             example('n = 5, edges = [[0,1],[1,2],[2,3],[3,4]]', '1'),
             example('n = 3, edges = []', '3', 'Each node is its own component.')],
            ['1 <= n <= 2000', '0 <= edges.length <= 5000', 'edges[i].length == 2', '0 <= a, b < n', 'a != b', 'No edge appears twice']),
        starter='class Solution:\n    def countComponents(self, n: int, edges: List[List[int]]) -> int:\n        \n',
        examples='5\n[[0,1],[1,2],[3,4]]\n5\n[[0,1],[1,2],[2,3],[3,4]]\n3\n[]'),
    'walls-and-gates': dict(
        title='Walls and Gates',
        content=page(
            '<p>You are given an <code>m x n</code> grid <code>rooms</code> where each cell is one of:</p>'
            '<ul><li><code>-1</code>: a wall or obstacle,</li><li><code>0</code>: a gate,</li><li><code>2147483647</code> (<code>INF</code>): an empty room.</li></ul>'
            '<p>Fill each empty room <strong>in place</strong> with the number of steps to its nearest gate, moving up, down, left or right through non-wall cells. '
            'Rooms that cannot reach any gate stay <code>INF</code>. The function returns nothing; the judge inspects <code>rooms</code> afterwards.</p>',
            [example('rooms = [[INF,-1,0,INF],[INF,INF,INF,-1],[INF,-1,INF,-1],[0,-1,INF,INF]]', '[[3,-1,0,1],[2,2,1,-1],[1,-1,2,-1],[0,-1,3,4]]'),
             example('rooms = [[-1]]', '[[-1]]'),
             example('rooms = [[0,INF,INF]]', '[[0,1,2]]')],
            ['m == rooms.length', 'n == rooms[i].length', '1 <= m, n <= 250', 'rooms[i][j] is -1, 0 or 2147483647']),
        starter='class Solution:\n    def wallsAndGates(self, rooms: List[List[int]]) -> None:\n        """\n        Do not return anything, modify rooms in-place instead.\n        """\n        \n',
        examples='[[2147483647,-1,0,2147483647],[2147483647,2147483647,2147483647,-1],[2147483647,-1,2147483647,-1],[0,-1,2147483647,2147483647]]\n[[-1]]\n[[0,2147483647,2147483647]]'),
    'alien-dictionary': dict(
        title='Alien Dictionary',
        content=page(
            '<p>An alien language uses lowercase English letters in an unknown order. You are given <code>words</code>, a list that is claimed to be sorted '
            '<strong>lexicographically</strong> by that language\'s rules.</p>'
            '<p>Return a string containing every distinct letter that appears in <code>words</code>, ordered consistently with the alien alphabet. '
            'If no valid order exists (the list contradicts itself, or a word comes before its own prefix), return <code>""</code>. '
            'If several orders are valid, return any of them.</p>',
            [example('words = ["wrt","wrf","er","ett","rftt"]', '"wertf"'),
             example('words = ["z","x"]', '"zx"'),
             example('words = ["z","x","z"]', '""', '"z" cannot come both before and after "x".'),
             example('words = ["abc","ab"]', '""', 'A word cannot come before its own prefix.')],
            ['1 <= words.length <= 1000', '1 <= words[i].length <= 100', 'words[i] consists of lowercase English letters']),
        starter='class Solution:\n    def alienOrder(self, words: List[str]) -> str:\n        \n',
        examples='["wrt","wrf","er","ett","rftt"]\n["z","x"]\n["z","x","z"]\n["abc","ab"]'),
    'meeting-rooms': dict(
        title='Meeting Rooms',
        content=page(
            '<p>Given a list of meeting time <code>intervals</code> where <code>intervals[i] = [start, end]</code>, determine whether one person could attend every meeting.</p>'
            '<p>A meeting that ends at time <code>t</code> does not conflict with one that starts at <code>t</code>.</p>',
            [example('intervals = [[0,30],[5,10],[15,20]]', 'false'),
             example('intervals = [[7,10],[2,4]]', 'true'),
             example('intervals = [[1,5],[5,10]]', 'true', 'Back-to-back meetings are fine.')],
            ['0 <= intervals.length <= 10^4', 'intervals[i].length == 2', '0 <= start < end <= 10^6']),
        starter='class Solution:\n    def canAttendMeetings(self, intervals: List[List[int]]) -> bool:\n        \n',
        examples='[[0,30],[5,10],[15,20]]\n[[7,10],[2,4]]\n[[1,5],[5,10]]'),
    'meeting-rooms-ii': dict(
        title='Meeting Rooms II',
        content=page(
            '<p>Given a list of meeting time <code>intervals</code> where <code>intervals[i] = [start, end]</code>, return the minimum number of conference rooms needed to hold every meeting.</p>'
            '<p>A room freed at time <code>t</code> can host a meeting that starts at <code>t</code>.</p>',
            [example('intervals = [[0,30],[5,10],[15,20]]', '2'),
             example('intervals = [[7,10],[2,4]]', '1'),
             example('intervals = [[1,10],[2,9],[3,8]]', '3')],
            ['1 <= intervals.length <= 10^4', 'intervals[i].length == 2', '0 <= start < end <= 10^6']),
        starter='class Solution:\n    def minMeetingRooms(self, intervals: List[List[int]]) -> int:\n        \n',
        examples='[[0,30],[5,10],[15,20]]\n[[7,10],[2,4]]\n[[1,10],[2,9],[3,8]]'),
}
