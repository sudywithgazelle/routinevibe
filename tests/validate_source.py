"""Static validation for Study With Gazelle v2; uses only Python stdlib + Node."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]

class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.local_refs = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        for key in ('src', 'href'):
            value = attrs.get(key, '')
            if value and not value.startswith(('https://', 'http://', 'data:', '#', 'mailto:')):
                self.local_refs.append(value.split('?', 1)[0])

html = Markup()
html.feed((ROOT / 'index.html').read_text())
counts = Counter(html.ids)
duplicates = sorted(key for key, count in counts.items() if count > 1)
assert not duplicates, f'Duplicate HTML IDs: {duplicates}'

for source in ('app.js', 'games.js'):
    text = (ROOT / source).read_text()
    refs = set(re.findall(r"\$\(['\"]([^'\"]+)['\"]\)", text))
    missing = sorted(refs - set(html.ids))
    assert not missing, f'{source} references missing HTML IDs: {missing}'
    subprocess.run(['node', '--check', str(ROOT / source)], check=True)

for ref in html.local_refs:
    assert (ROOT / ref).exists(), f'Missing local HTML asset: {ref}'
css = (ROOT / 'styles.css').read_text()
for ref in re.findall(r"url\(['\"]?([^)'\"]+)", css):
    if ref.startswith('assets/'):
        assert (ROOT / ref).exists(), f'Missing CSS asset: {ref}'

app = (ROOT / 'app.js').read_text()
sql = (ROOT / 'supabase/schema.sql').read_text()
called = set(re.findall(r"rpc\(['\"]([^'\"]+)['\"]", app))
granted = set(re.findall(r'grant execute on function public\.([a-z_]+)\s*\(', sql, re.I))
missing_grants = sorted(called - granted)
assert not missing_grants, f'RPCs called by app but not granted in schema: {missing_grants}'

# Validate new feature wiring and all referenced achievement assets.
for asset in re.findall(r"asset:'([^']+\.svg)'", app):
    assert (ROOT / 'assets' / asset).exists(), f'Missing achievement asset: {asset}'
assert app.count("id:'") >= 12, 'Expected the expanded achievement catalogue'
assert 'start_study_with_subject' in app and 'get_my_study_analytics' in app and 'get_my_study_records' in app
assert 'Infinite focus' in (ROOT / 'index.html').read_text()
assert 'repeat_count' in app and 'completed_repeats' in app
migration = (ROOT / 'supabase/migrations/20261126_routinevibe_feature_upgrade.sql').read_text()
for required in ('start_study_with_subject', 'period_seconds', 'is_studying', 'get_my_study_records', 'get_my_study_analytics', 'repeat_count', 'subject'):
    assert required in migration, f'Migration missing {required}'
assert 'drop table' not in migration.lower(), 'Feature migration must not drop user tables'

# Validate the seeded Sudoku solution and all original clue cells.
games = (ROOT / 'games.js').read_text()
solution = re.search(r"const BASE_SOLUTION='([0-9]+)'", games).group(1)
puzzle = re.search(r"const BASE_PUZZLE='([0-9]+)'", games).group(1)
assert len(solution) == len(puzzle) == 81
sol = [int(x) for x in solution]
for r in range(9):
    assert set(sol[r*9:(r+1)*9]) == set(range(1, 10)), f'Invalid Sudoku row {r}'
for c in range(9):
    assert {sol[r*9+c] for r in range(9)} == set(range(1, 10)), f'Invalid Sudoku column {c}'
for br in range(3):
    for bc in range(3):
        cells = {sol[(br*3+r)*9+bc*3+c] for r in range(3) for c in range(3)}
        assert cells == set(range(1, 10)), f'Invalid Sudoku box {br},{bc}'
assert all(p == '0' or int(p) == sol[i] for i, p in enumerate(puzzle)), 'Sudoku clue conflicts with solution'

# Validate the crossword coordinates and all crossing letters.
words = re.findall(r"\{w:'([A-Z]+)',r:(\d+),c:(\d+),d:'(across|down)'", games)
assert len(words) == 10, f'Expected 10 crossword clues; found {len(words)}'
cells = {}
counts = Counter()
for word, row, col, direction in words:
    row, col = int(row), int(col)
    for offset, letter in enumerate(word):
        point = (row + (offset if direction == 'down' else 0), col + (offset if direction == 'across' else 0))
        assert 0 <= point[0] < 11 and 0 <= point[1] < 11, f'Crossword cell outside 11x11: {point}'
        assert point not in cells or cells[point] == letter, f'Conflicting crossword intersection at {point}'
        cells[point] = letter
        counts[point] += 1
assert sum(1 for count in counts.values() if count > 1) >= 5, 'Crossword is not sufficiently interconnected'

# Ensure the current archive does not accidentally include a service-role credential.
config = (ROOT / 'config.js').read_text()
assert 'SUPABASE_SERVICE_ROLE_KEY:' not in config and 'SUPABASE_SERVICE_ROLE_KEY =' not in config
assert not re.search(r'eyJ[a-zA-Z0-9_-]{20,}\.', config), 'JWT-like key found in config.js'

print(f'Static validation passed: {len(html.ids)} unique HTML IDs, local assets, RPC grants, JS syntax and seeded Sudoku.')
if not (ROOT / 'config.js').read_text().count("SUPABASE_URL: ''"):
    print('Supabase URL appears configured; verify it is a project URL and not a secret.')
else:
    print('Supabase URL/key are blank: local preview works, cloud auth still needs configuration.')
