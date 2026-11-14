# -*- coding: utf-8 -*-
import os, time, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

p = r"C:\Users\swap\Desktop\ббаки_успех\projects\crypto-screener\index.html"
opts = Options()
opts.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
opts.add_argument("-headless")
opts.add_argument("-profile")
opts.add_argument(os.path.join(os.environ["APPDATA"], "Mozilla", "Firefox", "Profiles", "agent-forge"))
d = webdriver.Firefox(options=opts)
d.get("file:///" + p.replace("\\", "/"))
time.sleep(6)
d.execute_script("window.__errs=[]; window.onerror=function(m){window.__errs.push(String(m))};")

def sc():
    return json.loads(d.execute_script("return window.__scState()"))

def ui():
    return json.loads(d.execute_script("return JSON.stringify({"
        "cards: document.querySelectorAll('.crypto-card').length,"
        "wsOnline: document.getElementById('status-dot').classList.contains('online'),"
        "status: document.getElementById('status-text').textContent,"
        "tableRows: document.querySelectorAll('#table-body tr').length,"
        "movers: document.querySelectorAll('.mover-item').length,"
        "banner: document.getElementById('net-banner').classList.contains('show')"
        "})"))

s = sc()
print("start:", s["charts"], "charts |", s["symbols"], "| ws:", s["status"])
print("ui:", ui())

# --- 2. таблица: переключение вида, сортировка ---
d.execute_script("document.querySelector('.view-btn[data-view=\"table\"]').click();")
time.sleep(0.5)
r = d.execute_script("return JSON.stringify({"
    "tableActive: document.getElementById('table-view').classList.contains('active'),"
    "filtersShown: document.getElementById('filters-bar').classList.contains('active'),"
    "rows: document.querySelectorAll('#table-body tr').length"
    "})")
print("table view:", r)
d.execute_script("document.querySelector('th[data-sort=\"change24\"]').click();")
time.sleep(0.3)
r = d.execute_script("return JSON.stringify({first: document.querySelector('#table-body tr td').textContent.trim(), rows: document.querySelectorAll('#table-body tr').length})")
print("sorted by 24h:", r)

# --- 3. избранное: звезда -> пресет избранного ---
d.execute_script("document.querySelector('.fav-btn').click();")
d.execute_script("document.querySelector('.preset-btn[data-preset=\"fav\"]').click();")
time.sleep(0.4)
s = sc()
r = d.execute_script("return JSON.stringify({rows: document.querySelectorAll('#table-body tr').length, favSaved: JSON.parse(localStorage.getItem('screener_v2')||'{}').favorites})")
print("favorites:", r, "| preset:", s["preset"])
d.execute_script("document.querySelector('.preset-btn[data-preset=\"all\"]').click();")

# --- 4. модалка: поиск из всех пар USDT ---
d.execute_script("document.getElementById('add-chart-btn').click();")
for i in range(15):
    n = d.execute_script("return document.querySelectorAll('.coin-option').length")
    if n > 20: break
    time.sleep(1)
r = d.execute_script("return JSON.stringify({modalOpen: document.getElementById('coin-modal').classList.contains('active'), options: document.querySelectorAll('.coin-option').length})")
print("modal:", r)
d.execute_script("const i = document.getElementById('coin-search-input'); i.value = 'TON'; i.dispatchEvent(new Event('input'));")
time.sleep(0.4)
r = d.execute_script("return JSON.stringify({options: document.querySelectorAll('.coin-option').length, first: (document.querySelector('.coin-option')||{}).dataset.symbol})")
print("search TON:", r)
d.execute_script("document.querySelector('.coin-option').click();")
time.sleep(4)
s = sc()
print("added TON card:", s["charts"], "charts |", s["symbols"])

# --- 5. пресет «Пампы» скрывает карточки ---
d.execute_script("document.querySelector('.preset-btn[data-preset=\"pumps\"]').click();")
time.sleep(0.4)
r = d.execute_script("return JSON.stringify({hidden: Array.from(document.querySelectorAll('.crypto-card')).filter(c => c.style.display === 'none').length, total: document.querySelectorAll('.crypto-card').length})")
print("pumps preset:", r)
d.execute_script("document.querySelector('.preset-btn[data-preset=\"all\"]').click();")

# --- 6. превью по клику из таблицы ---
d.execute_script("document.querySelector('.view-btn[data-view=\"table\"]').click();")
time.sleep(0.5)
d.execute_script("document.querySelector('#table-body tr').click();")
time.sleep(2)
r = d.execute_script("return JSON.stringify({open: document.getElementById('chart-preview').classList.contains('active'), title: document.getElementById('preview-title').textContent, tf: document.querySelector('#preview-tf .active').textContent})")
print("preview:", r)
d.execute_script("document.getElementById('preview-close').click();")
time.sleep(0.3)
r = d.execute_script("return document.getElementById('chart-preview').classList.contains('active')")
print("preview closed:", r == False)

# --- 7. WS данные текут ---
time.sleep(8)
s = sc()
print("ws live:", s["status"])

# --- 8. Esc закрывает модалку ---
d.execute_script("document.getElementById('add-chart-btn').click();")
time.sleep(0.5)
d.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));")
time.sleep(0.3)
r = d.execute_script("return document.getElementById('coin-modal').classList.contains('active')")
print("esc closes modal:", r == False)

errs = d.execute_script("return (window.__errs||[]).slice(0,5)")
print("JS errors:", errs)
d.quit()
