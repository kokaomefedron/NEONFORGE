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

# UI-путь: липа 7 л (через каталог) + гречневая 8 л (через setCartLiters — как степпер в корзине)
d.execute_script("document.querySelectorAll('[data-liters]')[0].value = 7; document.querySelector('.add-btn').click();")
time.sleep(0.5)
d.execute_script("window.setCartLiters('grech', 8);")
time.sleep(0.4)
r1 = d.execute_script(
    "return JSON.stringify({items: document.querySelectorAll('.cart-item').length,"
    " badge: document.getElementById('cartCnt').textContent,"
    " disc: (document.querySelector('.cart-foot .tl.disc b')||{}).textContent,"
    " honey: document.querySelector('.cart-foot .tl.total .sum').textContent,"
    " hint: document.querySelector('.cart-body .pvz-hint').textContent.slice(0, 80)})")
print("L=15: ", r1)  # ожидание: 2 позиции, -15% (2 903 ₽), 16 448 ₽, "ещё 5 л до -20%"

# шаг 2: Владивосток, ПВЗ СДЭК — 15 л = 2 короба => 250*2 = 500; итого 16948
d.execute_script("document.querySelector('.cart-foot .btn').click();")
time.sleep(0.4)
r2 = d.execute_script(
    "return JSON.stringify({boxes: document.querySelector('.pvz-card .rate span').textContent,"
    " rate: document.querySelector('.pvz-card .rate').textContent,"
    " total: document.querySelector('.cart-foot .tl.total .sum').textContent})")
print("Владивосток 2 короба:", r2)

# Почта России (190*2=380) + подтверждение внизу
d.execute_script("window.setPvz(2);")
time.sleep(0.4)
r3 = d.execute_script("return document.querySelector('.cart-foot .tl.total .sum').textContent")
print("Почта 2 короба:", r3)  # ожидание: 16448 + 380 = 16828

# курьер вне Владивостока: Хабаровск Boxberry 330*2 + 250 = 910 => 17358
d.execute_script("window.setCity('hab'); window.setMode('courier');")
time.sleep(0.4)
r4 = d.execute_script(
    "return JSON.stringify({dest: document.querySelector('.cart-foot .tl:nth-child(3) span').textContent,"
    " del: document.querySelector('.cart-foot .tl:nth-child(2) b').textContent,"
    " total: document.querySelector('.cart-foot .tl.total .sum').textContent})")
print("Хабаровск курьер:", r4)

# кап 20%: докидываем до 21 л и проверяем хинт (должен быть "максимум достигнут")
d.execute_script("window.setCartLiters('akats', 6); window.cartStep = 1; window.renderCart();")
time.sleep(0.4)
r5 = d.execute_script(
    "return JSON.stringify({L: document.getElementById('cartCnt').textContent,"
    " disc: (document.querySelector('.cart-foot .tl.disc b')||{}).textContent,"
    " hint: document.querySelector('.cart-body .pvz-hint').textContent.slice(0, 50)})")
print("L=21 (кап):", r5)

errs = d.execute_script("return (window.__errs||[]).slice(0,3)")
print("JS errors:", errs)
d.quit()
