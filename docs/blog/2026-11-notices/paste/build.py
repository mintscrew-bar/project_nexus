#!/usr/bin/env python3
"""
공지 마크다운 → 커뮤니티 글쓰기에 붙여 넣을 HTML 페이지.

커뮤니티 에디터(Tiptap StarterKit)는 제목 2·3단, 굵게, 목록, 인용, 가로줄만 받고
표는 없다. 사진은 업로드해야만 들어간다. 그래서
- 표는 목록으로 바꾸고(첫 칸 굵게 — 나머지 칸)
- 사진은 "▶ 사진: 파일명" 표시 줄로 남긴다(옆에 그림을 배경으로 보여 주되 복사엔 안 실린다)
- 맨 위 # 제목은 본문에서 빼고 따로 "제목 복사" 버튼으로 준다

실행: python3 docs/blog/2026-11-notices/paste/build.py
"""
import html
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent
IMG_DIR = SRC.parent / "images" / "2026-11-notices"


def inline(text: str) -> str:
    """굵게(**)와 `코드`만 처리한다 — 나머지는 글자 그대로."""
    t = html.escape(text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
    return t


def table_to_list(rows: list[str]) -> str:
    """표 → 목록. 머리 줄과 구분 줄은 버리고, 칸은 '첫 칸 — 나머지 · 나머지'."""
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    body = [c for c in cells[2:]]
    items = []
    for c in body:
        head, rest = c[0], [x for x in c[1:] if x]
        first = head if head.startswith("**") else f"**{head}**"
        line = first + (" — " + " · ".join(rest) if rest else "")
        items.append(f"<li><p>{inline(line)}</p></li>")
    return "<ul>" + "".join(items) + "</ul>"


def convert(md: str) -> tuple[str, str, list[str]]:
    lines = md.splitlines()
    title = ""
    out: list[str] = []
    images: list[str] = []
    i = 0
    para: list[str] = []

    def flush_para():
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()

    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if not s:
            flush_para()
            i += 1
            continue
        if s.startswith("# "):
            flush_para()
            title = s[2:].strip()
        elif s.startswith("### "):
            flush_para()
            out.append(f"<h3>{inline(s[4:])}</h3>")
        elif s.startswith("## "):
            flush_para()
            out.append(f"<h2>{inline(s[3:])}</h2>")
        elif s == "---":
            flush_para()
            out.append("<hr>")
        elif s.startswith("!["):
            flush_para()
            m = re.match(r"!\[(.*?)\]\((.+?)\)", s)
            name = pathlib.Path(m.group(2)).name
            images.append(name)
            out.append(
                f'<p class="pic" data-img="{name}">▶ 사진: {html.escape(name)} '
                f"({html.escape(m.group(1))})</p>"
            )
        elif s.startswith("|"):
            flush_para()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(table_to_list(rows))
            continue
        elif s.startswith(">"):
            flush_para()
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                q = lines[i].strip()[1:].strip()
                if q:
                    quote.append(f"<p>{inline(q)}</p>")
                i += 1
            out.append("<blockquote>" + "".join(quote) + "</blockquote>")
            continue
        elif re.match(r"^(- |\d+\. )", s):
            flush_para()
            ordered = bool(re.match(r"^\d+\. ", s))
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines) and re.match(r"^(- |\d+\. )", lines[i].strip()):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i].strip()))
                i += 1
            out.append(
                f"<{tag}>" + "".join(f"<li><p>{inline(x)}</p></li>" for x in items) + f"</{tag}>"
            )
            continue
        else:
            para.append(s)
        i += 1
    flush_para()
    return title, "\n".join(out), images


PAGE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: system-ui, "Malgun Gothic", sans-serif; max-width: 860px; margin: 24px auto; padding: 0 16px; line-height: 1.7; background: #fff; color: #111; }}
  @media (prefers-color-scheme: dark) {{ body {{ background: #161616; color: #eee; }} .bar {{ background: #222 !important; }} }}
  .bar {{ position: sticky; top: 0; background: #f3f3f3; padding: 12px; border-radius: 10px; margin-bottom: 20px; z-index: 1; }}
  .bar button {{ font-size: 15px; padding: 8px 14px; margin-right: 6px; border-radius: 8px; border: 0; background: #5b6cff; color: #fff; cursor: pointer; }}
  .bar small {{ display: block; margin-top: 8px; opacity: .75; }}
  .pic {{ padding: 10px 12px 10px 12px; border: 2px dashed #e0a800; border-radius: 8px; font-weight: 600;
          min-height: 160px; background-repeat: no-repeat; background-size: auto 140px; background-position: right 10px center; }}
  blockquote {{ border-left: 3px solid #999; margin-left: 0; padding-left: 12px; opacity: .9; }}
  #ok {{ margin-left: 8px; color: #2a2; font-weight: 600; }}
</style></head><body>
<div class="bar">
  <button onclick="copyText('title')">제목 복사</button>
  <button onclick="copyText('body')">본문 복사</button><span id="ok"></span>
  <small>본문 복사 → 글쓰기 본문에 붙여 넣기 → 노란 「▶ 사진」 줄마다 그 자리에 사진을 끌어다 놓거나 사진 버튼으로 올린 뒤, 표시 줄은 지우세요.<br>
  사진 폴더: <code>{img_dir_win}</code></small>
</div>
<h1 id="title">{title}</h1>
<div id="body">
{body}
</div>
<script>
  // 사진 자리 옆에 그림을 배경으로 띄운다 — 배경이라 복사엔 실리지 않는다
  document.querySelectorAll('.pic').forEach(function (el) {{
    el.style.backgroundImage = "url('../../images/2026-11-notices/" + el.dataset.img + "')";
  }});
  // 선택 영역을 잡아 복사 — HTML 서식째 클립보드에 올라간다
  function copyText(id) {{
    var el = document.getElementById(id);
    var r = document.createRange(); r.selectNodeContents(el);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    var ok = document.execCommand('copy'); s.removeAllRanges();
    document.getElementById('ok').textContent = ok ? (id === 'title' ? '제목 복사됨' : '본문 복사됨') : '복사 실패 — 직접 드래그해 주세요';
  }}
</script>
</body></html>
"""

IMG_DIR_WIN = r"\\wsl.localhost\Ubuntu-24.04" + str(IMG_DIR).replace("/", "\\")

for md in sorted(SRC.glob("0*.md")):
    title, body, images = convert(md.read_text(encoding="utf-8"))
    missing = [n for n in images if not (IMG_DIR / n).exists()]
    if missing:
        raise SystemExit(f"{md.name}: 없는 사진 {missing}")
    page = PAGE.format(title=html.escape(title), body=body, img_dir_win=html.escape(IMG_DIR_WIN))
    (HERE / (md.stem + ".html")).write_text(page, encoding="utf-8")
    print(md.stem, "사진", len(images), "장")
