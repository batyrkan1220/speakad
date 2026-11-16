KEYS6 = "startTemplate createVideo".split()
EN6 = ["Start with a template","Create video"]
T6 = {"ru": ["Начните с шаблона","Создать видео"], "kk": ["Үлгіден бастаңыз","Видео жасау"]}
KEYS += KEYS6
for k in T: T[k] = T[k] + T6.get(k, EN6)
KEYS += ["aiClone"]
for k in T: T[k] = T[k] + [{"ru": "ИИ-клон", "kk": "ИИ-клон"}.get(k, "AI clone")]
