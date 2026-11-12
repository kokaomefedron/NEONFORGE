# -*- coding: utf-8 -*-
import os, time, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

opts = Options()
opts.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
opts.add_argument("-headless")
opts.add_argument("-profile")
opts.add_argument(os.path.join(os.environ["APPDATA"], "Mozilla", "Firefox", "Profiles", "agent-forge"))
d = webdriver.Firefox(options=opts)
d.get("file:///C:/Users/swap/Desktop/ббаки_успех/index.html")
time.sleep(4)
d.execute_script("window.__errs=[]; window.onerror=function(m){window.__errs.push(String(m))};")
r = d.execute_script(
    "return JSON.stringify({folders: document.querySelectorAll('.folder').length,"
    " cards: document.querySelectorAll('.case-card').length,"
    " imgs: document.querySelectorAll('.case-card img').length,"
    " bodyH0: document.querySelector('.folder-body').getBoundingClientRect().height,"
    " straySections: document.querySelectorAll('section').length})")
print("step1:", r)
d.execute_script("document.querySelector('.folder .folder-head').click()")
time.sleep(1.5)
r2 = d.execute_script(
    "return JSON.stringify({openFolders: document.querySelectorAll('.folder.open').length,"
    " bodyH: document.querySelector('.folder-body').getBoundingClientRect().height,"
    " cardOpacity: getComputedStyle(document.querySelector('.case-card')).opacity})")
print("step2:", r2)
d.execute_script("document.querySelectorAll('.folder')[1].querySelector('.folder-head').click()")
time.sleep(1.5)
r3 = d.execute_script(
    "return JSON.stringify({openFolders: document.querySelectorAll('.folder.open').length,"
    " firstH: document.querySelectorAll('.folder-body')[0].getBoundingClientRect().height,"
    " secondH: document.querySelectorAll('.folder-body')[1].getBoundingClientRect().height,"
    " errs: (window.__errs||[]).slice(0,3)})")
print("step3:", r3)
d.quit()
