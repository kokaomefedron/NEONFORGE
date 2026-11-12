# -*- coding: utf-8 -*-
"""Вставляет 40 карточек кейсов в index.html + добавляет фильтр Custom.
УСТАРЕЛ: кейсы переделаны в папки (#casesFolders), карточки уже внутри index.html.
Скрипт оставлен для истории — при запуске упадёт (маркер casesGrid больше не существует)."""
import re, subprocess, sys, os

PAGE = r"C:\Users\swap\Desktop\ббаки_успех\index.html"
GEN = r"C:\Users\swap\Desktop\ббаки_успех\projects\previews\gen_cards.py"

src = open(PAGE, encoding="utf-8").read()

# 1) новый фильтр Custom после «Магазины»
if 'data-filter="custom"' not in src:
    src = src.replace(
        'data-filter="shop" data-cursor>Магазины</button>',
        'data-filter="shop" data-cursor>Магазины</button>\n        <button class="filter-btn glass rounded-full px-5 py-2.5 text-sm font-bold text-white/70 hover:text-white transition-all" data-filter="custom" data-cursor>Custom</button>'
    )

# 2) сетка: 2 колонки на md, 3 на xl
src = src.replace('class="mt-14 grid md:grid-cols-2 gap-7" id="casesGrid"',
                  'class="mt-14 grid md:grid-cols-2 xl:grid-cols-3 gap-7" id="casesGrid"')

# 3) замена содержимого сетки
m = re.search(r'(<div class="mt-14 grid md:grid-cols-2 xl:grid-cols-3 gap-7" id="casesGrid">)(.*?)(\n    </div>\n  </div>\n</section>)',
              src, re.S)
if not m:
    print("!! маркер сетки не найден"); sys.exit(1)

env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
cards = subprocess.run([sys.executable, GEN], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env)
if cards.returncode != 0 or not (cards.stdout or "").strip():
    err = (cards.stderr or "")[-800:]
    print("!! gen_cards.py упал:\n" + err); sys.exit(1)

new_grid_inner = "\n" + cards.stdout.strip() + m.group(3)
src = src[:m.start(2)] + new_grid_inner + src[m.end(2):]

open(PAGE, "w", encoding="utf-8", newline="\n").write(src)
n = cards.stdout.count('<a href="projects/')
print(f"OK: вставлено карточек: {n}")
