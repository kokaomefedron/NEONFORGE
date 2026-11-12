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
time.sleep(2)
r = d.execute_script("""
  const form = document.getElementById('orderForm');
  document.getElementById('fName').value = 'Тест';
  document.getElementById('fPhone').value = '+79000000000';
  form.dispatchEvent(new Event('submit', {cancelable: true}));
  const okEl = document.getElementById('formOk');
  return JSON.stringify({display: getComputedStyle(okEl).display, inline: okEl.style.display, listener: typeof form.onsubmit});
""")
print("debug:", r)
d.quit()