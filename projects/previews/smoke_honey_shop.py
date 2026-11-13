# -*- coding: utf-8 -*-
import os, time, json
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

t = open(p, encoding="utf-8").read()
print("complete:", t.rstrip().endswith("</html>"), "| cities grid:", d.execute_script("return document.querySelectorAll('#cityGrid .city-card').length"))

# --- 1. клик по карточке мёда: +7 л липового в корзину, корзина открылась
d.execute_script("document.querySelectorAll('[data-liters]')[0].value = 7;")
d.execute_script("document.querySelector('.add-btn').click();")
time.sleep(0.6)
r1 = d.execute_script(
    "return JSON.stringify({"
    " cartShown: document.getElementById('cart').classList.contains('show'),"
    " badge: document.getElementById('cartCnt').textContent,"
    " items: document.querySelectorAll('.cart-item').length,"
    " itemSum: document.querySelector('.cart-item .sum').textContent,"
    " footTotal: document.querySelector('.cart-foot .tl.total .sum').textContent,"
    " hint: (document.querySelector('.cart-body .pvz-hint b')||{}).textContent})")
print("step1 (7л липы):", r1)

# --- 2. добавить 8 л гречневого: литраж 15 -> скидка -15%
d.execute_script("window.cart['grech']=8; window.cartStep=1; window.renderCart();")
time.sleep(0.4)
r2 = d.execute_script(
    "return JSON.stringify({items: document.querySelectorAll('.cart-item').length,"
    " disc: (document.querySelector('.cart-foot .tl.disc b')||{}).textContent,"
    " honey: document.querySelector('.cart-foot .tl.total .sum').textContent})")
print("step2 (7+8=15л):", r2)

# --- 3. шаг 2: город Владивосток, ПВЗ, 15 л = 2 короба
d.execute_script("document.querySelector('.cart-foot .btn').click();")
time.sleep(0.4)
r3 = d.execute_script(
    "return JSON.stringify({chips: document.querySelectorAll('.city-chips .chip').length,"
    " pvz: document.querySelectorAll('.pvz-card').length,"
    " firstPvz: document.querySelector('.pvz-card .net').textContent,"
    " firstRate: document.querySelector('.pvz-card .rate').textContent,"
    " firstActive: document.querySelector('.pvz-card').classList.contains('active'),"
    " total: document.querySelector('.cart-foot .tl.total .sum').textContent})")
print("step3 (Владивосток ПВЗ, 2 короба):", r3)

# --- 4. выбрать Москву (СДЭК 700, 2 короба = 1400) и взять Boxberry (660*2=1320)
d.execute_script("window.setCity('msk');")
time.sleep(0.4)
d.execute_script("window.setPvz(1);")
time.sleep(0.4)
r4 = d.execute_script(
    "return JSON.stringify({"
    " pvzNets: Array.from(document.querySelectorAll('.pvz-card .net')).map(e=>e.textContent),"
    " bxbRate: document.querySelectorAll('.pvz-card')[1].querySelector('.rate').textContent,"
    " total: document.querySelector('.cart-foot .tl.total .sum').textContent})")
print("step4 (Москва Boxberry):", r4)

# --- 5. курьер до двери (тариф 660*2 + 250 = 1570)
d.execute_script("window.setMode('courier');")
time.sleep(0.4)
r5 = d.execute_script(
    "return JSON.stringify({total: document.querySelector('.cart-foot .tl.total .sum').textContent,"
    " hint: document.querySelector('.cart-body .pvz-hint').textContent.slice(0,60)})")
print("step5 (курьер Москва):", r5)

# --- 6. курьер во Владивостоке, 15 л (>=10 => бесплатно)
d.execute_script("window.setCity('vlad');")
time.sleep(0.4)
r6 = d.execute_script(
    "return JSON.stringify({total: document.querySelector('.cart-foot .tl.total .sum').textContent,"
    " free: document.querySelector('.cart-foot .tl:nth-child(2) b').textContent})")
print("step6 (курьер Владивосток, от 10 л):", r6)

# --- 7. оформление: имя + телефон -> экран успеха с номером
d.execute_script("document.getElementById('cName').value='Тест'; document.getElementById('cPhone').value='+79001112233';")
d.execute_script("document.querySelector('.cart-foot .btn-amber').click();")
time.sleep(0.4)
r7 = d.execute_script(
    "return JSON.stringify({title: document.getElementById('cartTitle').textContent,"
    " num: (document.querySelector('.order-ok .num')||{}).textContent,"
    " pay: (document.querySelector('.order-ok .tl.total .sum')||{}).textContent})")
print("step7 (оформлено):", r7)

# --- 8. пустая корзина
d.execute_script("window.resetCart(); window.openCart();")
time.sleep(0.4)
r8 = d.execute_script("return JSON.stringify({empty: document.querySelector('.cart-empty') !== null, badge: document.getElementById('cartCnt').textContent})")
print("step8 (пустая):", r8)

errs = d.execute_script("return (window.__errs||[]).slice(0,3)")
print("JS errors:", errs)
d.quit()
