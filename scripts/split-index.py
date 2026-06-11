#!/usr/bin/env python3
"""Split monolithic index.html into css/ and js/ modules."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

CSS_CHUNKS = [
    ("css/base.css", 11, 50),
    ("css/lineup.css", 51, 184),
    ("css/modals.css", 185, 229),
    ("css/tabs-workflow.css", 230, 308),
    ("css/latest-match.css", 309, 400),
]

JS_CHUNKS = [
    ("js/config.js", [(712, 810), (3385, 3389)]),
    ("js/utils.js", [(5523, 5548)]),
    ("js/permissions.js", [(812, 961)]),
    ("js/workflow.js", [(962, 1316)]),
    ("js/api.js", [(1318, 1341)]),
    ("js/match-data.js", [(1343, 1810)]),
    ("js/match-result.js", [(1811, 2145)]),
    ("js/stats.js", [(2146, 2243)]),
    ("js/auth-admin.js", [(2245, 2511)]),
    ("js/latest-match.js", [(2513, 2967)]),
    ("js/tabs-history.js", [(2969, 3112)]),
    ("js/player-helpers.js", [(3114, 3186)]),
    ("js/lineup-confirm.js", [(3188, 3384)]),
    ("js/roster.js", [(3391, 3807)]),
    ("js/lineup-algorithm.js", [(3808, 4342)]),
    ("js/lineup-random.js", [(4344, 4420)]),
    ("js/lineup-hlv.js", [(4422, 4906)]),
    ("js/lineup-render.js", [(4907, 5159)]),
    ("js/lineup-export.js", [(5160, 5521)]),
    ("js/app.js", [(5549, 5564)]),
]

JS_LOAD_ORDER = [
    "js/config.js",
    "js/utils.js",
    "js/permissions.js",
    "js/workflow.js",
    "js/api.js",
    "js/match-data.js",
    "js/match-result.js",
    "js/stats.js",
    "js/auth-admin.js",
    "js/latest-match.js",
    "js/tabs-history.js",
    "js/player-helpers.js",
    "js/lineup-confirm.js",
    "js/roster.js",
    "js/lineup-algorithm.js",
    "js/lineup-random.js",
    "js/lineup-hlv.js",
    "js/lineup-render.js",
    "js/lineup-export.js",
    "js/app.js",
]

FILE_HEADERS = {
    "css/base.css": "/* Base: variables, layout, forms, cards */",
    "css/lineup.css": "/* Lineup: pitch, player cards, HLV panel, bench */",
    "css/modals.css": "/* Modals, overlay, toast, confirm dialog */",
    "css/tabs-workflow.css": "/* Tabs, workflow, history, stats, auth bar */",
    "css/latest-match.css": "/* Latest match view, scoreboard, responsive */",
    "js/config.js": "/* Constants, API URLs, global state */",
    "js/utils.js": "/* Shared utilities: toast, escape, wait */",
    "js/permissions.js": "/* Auth helpers, role checks, labels */",
    "js/workflow.js": "/* HLV confirm workflow, lock UI, polling */",
    "js/api.js": "/* Cloudflare / legacy API client */",
    "js/match-data.js": "/* Match rebuild, pending restore, formations */",
    "js/match-result.js": "/* Result modal, save match scores */",
    "js/stats.js": "/* MVP / rating / goals rankings */",
    "js/auth-admin.js": "/* Login, admin user management */",
    "js/latest-match.js": "/* Public latest match + ongoing match view */",
    "js/tabs-history.js": "/* Tab switching, match history list */",
    "js/player-helpers.js": "/* Position/side normalization helpers */",
    "js/lineup-confirm.js": "/* HLV confirm team, formation change */",
    "js/roster.js": "/* Roster load, OCR, player picker */",
    "js/lineup-algorithm.js": "/* Split teams, build lineup, cap optimize */",
    "js/lineup-random.js": "/* Random animation flow */",
    "js/lineup-hlv.js": "/* HLV drag-drop lineup editor */",
    "js/lineup-render.js": "/* Pitch render, cards, cap lineups */",
    "js/lineup-export.js": "/* Publish, export image, save history */",
    "js/app.js": "/* App bootstrap */",
}


def read_lines():
    return INDEX.read_text(encoding="utf-8").splitlines(keepends=True)


def extract_css_chunk(lines, start, end):
    out = []
    for line in lines[start - 1 : end]:
        if line.startswith("    "):
            out.append(line[4:])
        else:
            out.append(line)
    return "".join(out)


def extract_js_ranges(lines, ranges):
    parts = []
    for start, end in ranges:
        parts.extend(lines[start - 1 : end])
    return "".join(parts).rstrip() + "\n"


def write_chunk(rel_path, body, is_css=False):
    path = ROOT / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    header = FILE_HEADERS.get(rel_path, "")
    content = f"{header}\n\n{body}" if header else body
    if not content.endswith("\n"):
        content += "\n"
    path.write_text(content, encoding="utf-8")
    print(f"  wrote {rel_path} ({path.stat().st_size} bytes)")


def build_index_html(lines):
    head = "".join(lines[0:9])
    css_links = "\n".join(
        f'  <link rel="stylesheet" href="{path}">' for path, _, _ in CSS_CHUNKS
    )
    body = "".join(lines[401:710])
    scripts = "\n".join(
        f'  <script src="{path}"></script>' for path in JS_LOAD_ORDER
    )
    tail = "\n</body>\n</html>\n<!-- v1.8.4: removed preferred_side and fit text from player cards -->\n"
    return (
        head
        + css_links
        + "\n</head>\n"
        + body
        + "\n"
        + scripts
        + "\n"
        + tail
    )


def main():
    lines = read_lines()
    print("Extracting CSS...")
    for rel, start, end in CSS_CHUNKS:
        write_chunk(rel, extract_css_chunk(lines, start, end), is_css=True)

    print("Extracting JS...")
    chunk_map = {path: ranges for path, ranges in JS_CHUNKS}
    for rel in JS_LOAD_ORDER:
        write_chunk(rel, extract_js_ranges(lines, chunk_map[rel]))

    print("Writing slim index.html...")
    INDEX.write_text(build_index_html(lines), encoding="utf-8")
    print(f"Done. index.html -> {INDEX.stat().st_size} bytes")


if __name__ == "__main__":
    main()
