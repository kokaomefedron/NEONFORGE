# -*- coding: utf-8 -*-
import os, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

p = r"C:\Users\swap\Desktop\ббаки_успех\projects\taiga-honey\index.html"
opts = Options()
opts.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
opts.add_argument("-headless")
opts.add_argument("-profile")
opts.add_argument(os.path.join(os.environ["APPDATA"], "Mozilla", "Firefox", "Profiles", "agent-forge"))
d = webdriver.Firefox(options=opts)
d.get("file:///" + p.replace("\\", "/"))
time.sleep(2.5)
d.execute_script("window.__errs=[]; window.onerror=function(m){window.__errs.push(String(m))};")

# целостность файла
t = open(p, encoding="utf-8").read()
print("complete:", t.rstrip().endswith("</html>"), "| ru:", 'lang="ru"' in t, "| title:", (d.title or "")[:40])

# шаг 1: базовое состояние (10 л → −10%)
r1 = d.execute_script(
    "return JSON.stringify({"
    " lit: document.getElementById('litersOut').textContent,"
    " disc: document.getElementById('sumDiscount').textContent,"
    " total: document.getElementById('sumTotal').textContent,"
    " tiers: document.querySelectorAll('.tier').length,"
    " sorta: document.querySelectorAll('.honey-card').length,"
    " faq: document.querySelectorAll('.faq-item').length,"
    " errs: (window.__errs||[]).slice(0,3)})")
print("step1 (10л):", r1)

# шаг 2: прогон слайдера 5 / 15 / 20 / 40 (кап 20%)
for val in (5, 15, 20, 40):
    d.execute_script(
        "const L=document.getElementById('liters'); L.value=%d; L.dispatchEvent(new Event('input'));" % val)
    r = d.execute_script(
        "return JSON.stringify({disc: document.getElementById('sumDiscount').textContent,"
        " total: document.getElementById('sumTotal').textContent})")
    print("liters=%d ->" % val, r)

# шаг 3: FAQ и форма
d.execute_script("document.querySelector('.faq-q').click()")
time.sleep(0.6)
faq_open = d.execute_script("return document.querySelectorAll('.faq-item.open').length")
d.execute_script(
    "document.getElementById('fName').value='Тест';"
    "document.getElementById('fPhone').value='+79000000000';"
    "document.getElementById('orderForm').dispatchEvent(new Event('submit'));")
time.sleep(0.5)
ok_visible = d.execute_script("return getComputedStyle(document.getElementById('formOk')).display")
print("faq_open:", faq_open, "| formOk display:", ok_visible)

errs = d.execute_script("return (window.__errs||[]).slice(0,3)")
print("JS errors:", errs)
d.quit()
