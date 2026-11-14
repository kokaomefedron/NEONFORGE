# -*- coding: utf-8 -*-
import os, time, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

def st(d):
    return json.loads(d.execute_script("return window.__shopState()"))

p = r"C:\Users\swap\Desktop\ббаки_успех\projects\taiga-honey\index.html"
opts = Options()
opts.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
opts.add_argument("-headless")
opts.add_argument("-profile")
opts.add_argument(os.path.join(os.environ["APPDATA"], "Mozilla", "Firefox", "Profiles", "agent-forge"))
d = webdriver.Firefox(options=opts)
d.get("file:///" + p.replace("\\", "/"))
time.sleep(3)
d.execute_script("window.__errs=[]; window.onerror=function(m){window.__errs.push(String(m))};")

# --- 1. липа 7 л в корзину -> шаг 1
d.execute_script("document.querySelectorAll('[data-liters]')[0].value = 7; document.querySelector('.add-btn').click();")
time.sleep(0.6)
s = st(d)
r1 = d.execute_script(
    "return JSON.stringify({shown: document.getElementById('cart').classList.contains('show'),"
    " items: document.querySelectorAll('.cart-item').length,"
    " footTotal: document.querySelector('.cart-foot .tl.total .sum').textContent})")
print("step1:", r1, "| state:", s)

# --- 2. шаг 2: Владивосток, ждём OSM/офлайн загрузку ПВЗ
d.execute_script("document.querySelector('.cart-foot .btn').click();")
for i in range(40):
    if not st(d)["pvzLoading"]:
        break
    time.sleep(1)
s = st(d)
r2 = d.execute_script(
    "return JSON.stringify({mapDiv: !!document.getElementById('pvzMap'),"
    " markers: document.querySelectorAll('.pvz-pin').length,"
    " cards: document.querySelectorAll('.pvz-card').length,"
    " tariff: document.querySelector('.cart-foot').textContent.includes('Посылка склад-склад'),"
    " footTotal: document.querySelector('.cart-foot .tl.total .sum').textContent,"
    " mapSrc: (document.querySelector('.map-src')||{}).textContent})")
print("step2 (Владивосток):", r2, "| zone:", s["geo"]["zone"], "km:", round(s["geo"]["km"]), "pvz:", s["pvzCount"], s["pvzSource"])

# --- 3. выбор второго ПВЗ
d.execute_script("document.querySelectorAll('.pvz-card')[1].click();")
time.sleep(0.5)
s = st(d)
r3 = d.execute_script(
    "return JSON.stringify({selMarkers: document.querySelectorAll('.pvz-pin.sel').length,"
    " dest: (document.querySelectorAll('.cart-foot .tl')[3]||{}).textContent.slice(0, 90)})")
print("step3 (ПВЗ выбран):", r3, "| idx:", s["pvzIdx"])

# --- 4. Москва: зона 6, пересчёт цены
d.execute_script("window.pickCity('Москва');")
for i in range(45):
    if not st(d)["pvzLoading"]:
        break
    time.sleep(1)
s = st(d)
r4 = d.execute_script(
    "return JSON.stringify({markers: document.querySelectorAll('.pvz-pin').length,"
    " activeChip: (document.querySelector('.chip.active')||{}).textContent,"
    " footZone: document.querySelector('.cart-foot').textContent.includes('зона 6'),"
    " footTotal: document.querySelector('.cart-foot .tl.total .sum').textContent,"
    " src: (document.querySelector('.map-src')||{}).textContent})")
print("step4 (Москва):", r4, "| zone:", s["geo"]["zone"], "km:", round(s["geo"]["km"]), "boxPrice:", __import__("builtins").round((s["delivery"] or 0) / 2), "pvz:", s["pvzCount"], s["pvzSource"])

# --- 5. свой город через поиск (Казань)
d.execute_script("window.pickCity('Казань');")
for i in range(45):
    if not st(d)["pvzLoading"]:
        break
    time.sleep(1)
s = st(d)
print("step5 (Казань): zone:", s["geo"]["zone"], "km:", round(s["geo"]["km"]), "pvz:", s["pvzCount"], s["pvzSource"])

# --- 6. курьер и оформление
d.execute_script("window.setMode('courier');")
time.sleep(0.5)
foot = d.execute_script("return document.querySelector('.cart-foot').textContent")
print("step6 (курьер): склад-дверь:", "склад-дверь" in foot, "| total:", d.execute_script("return document.querySelector('.cart-foot .tl.total .sum').textContent"))
d.execute_script("document.getElementById('cName').value='Тест'; document.getElementById('cPhone').value='+79001112233';")
d.execute_script("document.querySelector('.cart-foot .btn-amber').click();")
time.sleep(0.4)
r7 = d.execute_script(
    "return JSON.stringify({title: document.getElementById('cartTitle').textContent,"
    " num: (document.querySelector('.order-ok .num')||{}).textContent})")
print("step7 (оформлено):", r7)

errs = d.execute_script("return (window.__errs||[]).slice(0,4)")
print("JS errors:", errs)
d.quit()
