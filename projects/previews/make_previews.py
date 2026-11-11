# -*- coding: utf-8 -*-
"""Снимает headless-скриншоты всех 40 демо-сайтов в projects/previews/<slug>.png.
Запуск: python make_previews.py  (использует ff.py из скилла firefox-agent)"""
import os, subprocess, sys

ROOT = r"C:\Users\swap\Desktop\ббаки_успех\projects"
FF = os.path.join(os.environ["USERPROFILE"], ".config", "opencode", "skills", "firefox-agent", "scripts", "ff.py")

SLUGS = [
    # лендинги
    "respawn-bar","sattva-yoga","britva-barbershop","marsipan-bakery","corkscrew-wine",
    "grom-crossfit","volna-surf","orbita-planetarium","zerno-coffee","puls-clinic",
    # корпоративные
    "vektor-prava","monolit-stroy","kodeks-it","transline-logistics","massiv-furniture",
    "labwest-medical","pole-agro","baltic-advisory","kadr-media","znanium-edu",
    # магазины
    "drop-streetwear","voltmarket","svazhiy-pomol","bloom-lab","skandi-dom",
    "hvost-lapa","tipograf-books","reps-nutrition","lukomorye-toys","garage-parts",
    # custom
    "neon-runner","cosmo-clicker","neon-15","snake-forge","neo-pc-config",
    "metrika-live","hronika-timeline","svadba-invite","sinesteziya-visual","kviz-master",
]

PORT = 8931

def main():
    only = sys.argv[1:] or SLUGS
    missing = [s for s in only if not os.path.exists(os.path.join(ROOT, s, "index.html"))]
    if missing:
        print("НЕТ ФАЙЛОВ:", ", ".join(missing)); sys.exit(1)
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
                              cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok, fail = [], []
    try:
        for s in only:
            out = os.path.join(ROOT, "previews", s + ".png")
            url = f"http://127.0.0.1:{PORT}/{s}/index.html"
            r = subprocess.run([sys.executable, FF, "shot", url, out],
                               capture_output=True, text=True, timeout=120)
            if r.returncode == 0 and os.path.exists(out):
                ok.append(s); print("OK ", s)
            else:
                fail.append(s); print("FAIL", s, (r.stderr or "")[-200:])
    finally:
        server.terminate()
    print(f"\nготово: {len(ok)}, провал: {len(fail)}", ("; ".join(fail)) if fail else "")

if __name__ == "__main__":
    main()
