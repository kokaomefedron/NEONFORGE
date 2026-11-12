# -*- coding: utf-8 -*-
import os
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

ROOT = r"C:\Users\swap\Desktop\ббаки_успех\projects"
NEW = ["skandi-dom","hvost-lapa","tipograf-books","reps-nutrition","lukomorye-toys","garage-parts",
       "neo-pc-config","metrika-live","hronika-timeline","svadba-invite","sinesteziya-visual","kviz-master"]
opts = Options()
opts.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
opts.add_argument("-headless")
opts.add_argument("-profile")
opts.add_argument(os.path.join(os.environ["APPDATA"], "Mozilla", "Firefox", "Profiles", "agent-forge"))
d = webdriver.Firefox(options=opts)
d.set_script_timeout(30)
bad = []
for s in NEW:
    p = os.path.join(ROOT, s, "index.html")
    d.get("file:///" + p.replace("\\", "/"))
    try:
        errs = d.execute_script("return 0")  # загрузка ок
        # целостность
        t = open(p, encoding="utf-8").read()
        complete = t.rstrip().endswith("</html>")
        ru = 'lang="ru"' in t
        vp = "user-scalable=no" in t
        title = (d.title or "")[:44]
        ok = complete and ru and vp
        if not ok:
            bad.append(s)
        print(("OK  " if ok else "BAD "), s, "|", title, "| complete:", complete, "ru:", ru, "vp:", vp)
    except Exception as e:
        bad.append(s)
        print("ERR ", s, "|", str(e)[:100])
d.quit()
print("ИТОГ проблемных:", len(bad), bad)
