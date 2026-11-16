KEYS3 = "createTitle dropTitle dropHint yourName locationLbl original saveActor photoVoice changeFile".split()
T3 = {
"en": ["Create your actor","Upload a video or a photo of yourself","Video 30 s – 2 min talking to the camera → your face and your voice. Photo → your face only.","Name","Location (optional)","Original","Save actor","Photo only — a matching AI voice will speak for you.","Change file"],
"es": ["Crea tu actor","Sube un vídeo o una foto tuya","Vídeo de 30 s a 2 min hablando a cámara → tu cara y tu voz. Foto → solo tu cara.","Nombre","Lugar (opcional)","Original","Guardar actor","Solo foto: hablará una voz IA a juego.","Cambiar archivo"],
"pt": ["Crie seu ator","Envie um vídeo ou uma foto sua","Vídeo de 30 s a 2 min falando para a câmera → seu rosto e sua voz. Foto → só o rosto.","Nome","Local (opcional)","Original","Salvar ator","Só foto: uma voz de IA combinando vai falar por você.","Trocar arquivo"],
"fr": ["Créez votre acteur","Importez une vidéo ou une photo de vous","Vidéo de 30 s à 2 min face caméra → votre visage et votre voix. Photo → visage seulement.","Nom","Lieu (facultatif)","Original","Enregistrer l'acteur","Photo seule : une voix IA assortie parlera pour vous.","Changer de fichier"],
"de": ["Eigenen Darsteller erstellen","Lade ein Video oder Foto von dir hoch","Video 30 s – 2 min in die Kamera gesprochen → dein Gesicht und deine Stimme. Foto → nur das Gesicht.","Name","Ort (optional)","Original","Darsteller speichern","Nur Foto – eine passende KI-Stimme spricht für dich.","Datei ändern"],
"it": ["Crea il tuo attore","Carica un video o una foto di te","Video da 30 s a 2 min parlando in camera → il tuo volto e la tua voce. Foto → solo il volto.","Nome","Luogo (facoltativo)","Originale","Salva attore","Solo foto: parlerà una voce IA adatta.","Cambia file"],
"ru": ["Создайте своего актёра","Загрузите видео или фото себя","Видео 30 с – 2 мин, говорите в камеру → ваше лицо и ваш голос. Фото → только лицо.","Имя","Локация (необязательно)","Оригинал","Сохранить актёра","Только фото — за вас будет говорить подходящий ИИ-голос.","Заменить файл"],
"kk": ["Өз актеріңізді жасаңыз","Өзіңіздің видеоңызды не фотоңызды жүктеңіз","Камераға сөйлеген 30 с – 2 мин видео → бетіңіз бен дауысыңыз. Фото → тек бетіңіз.","Аты","Локация (міндетті емес)","Түпнұсқа","Актерді сақтау","Тек фото — сізге сай ИИ-дауыс сөйлейді.","Файлды ауыстыру"],
"tr": ["Kendi oyuncunu oluştur","Kendi videonu ya da fotoğrafını yükle","Kameraya konuştuğun 30 sn – 2 dk video → yüzün ve sesin. Fotoğraf → sadece yüzün.","Ad","Mekân (isteğe bağlı)","Orijinal","Oyuncuyu kaydet","Sadece fotoğraf — uygun bir YZ sesi senin yerine konuşur.","Dosyayı değiştir"],
"ar": ["أنشئ ممثلك","ارفع فيديو أو صورة لك","فيديو من 30 ث إلى دقيقتين تتحدث فيه للكاميرا ← وجهك وصوتك. صورة ← وجهك فقط.","الاسم","المكان (اختياري)","الأصل","حفظ الممثل","صورة فقط — سيتحدث عنك صوت ذكاء اصطناعي مناسب.","تغيير الملف"],
"hi": ["अपना एक्टर बनाएं","अपना वीडियो या फ़ोटो अपलोड करें","कैमरे से बात करते 30 सेकंड – 2 मिनट का वीडियो → आपका चेहरा और आवाज़। फ़ोटो → सिर्फ़ चेहरा।","नाम","लोकेशन (वैकल्पिक)","मूल","एक्टर सेव करें","सिर्फ़ फ़ोटो — एक मेल खाती AI आवाज़ बोलेगी।","फ़ाइल बदलें"],
"zh": ["创建你的演员","上传你自己的视频或照片","对着镜头说话的 30 秒–2 分钟视频 → 你的脸和声音。照片 → 只有脸。","名字","场景（可选）","原图","保存演员","仅照片——将由匹配的 AI 声音替你说话。","更换文件"],
"ja": ["自分の俳優を作成","自分の動画か写真をアップロード","カメラに向かって話す 30 秒〜2 分の動画 → 顔と声。写真 → 顔のみ。","名前","ロケーション（任意）","オリジナル","俳優を保存","写真のみ — 合う AI ボイスが話します。","ファイルを変更"],
"ko": ["나만의 배우 만들기","내 영상이나 사진을 올리세요","카메라를 보고 말하는 30초–2분 영상 → 얼굴과 목소리. 사진 → 얼굴만.","이름","장소 (선택)","원본","배우 저장","사진만 — 어울리는 AI 목소리가 대신 말해요.","파일 변경"],
"id": ["Buat aktormu sendiri","Unggah video atau foto dirimu","Video 30 dtk – 2 mnt bicara ke kamera → wajah dan suaramu. Foto → wajah saja.","Nama","Lokasi (opsional)","Asli","Simpan aktor","Hanya foto — suara AI yang cocok akan bicara untukmu.","Ganti file"],
"vi": ["Tạo diễn viên của bạn","Tải lên video hoặc ảnh của bạn","Video 30 giây – 2 phút nói trước camera → khuôn mặt và giọng của bạn. Ảnh → chỉ khuôn mặt.","Tên","Bối cảnh (tùy chọn)","Ảnh gốc","Lưu diễn viên","Chỉ có ảnh — giọng AI phù hợp sẽ nói thay bạn.","Đổi tệp"],
"pl": ["Stwórz swojego aktora","Prześlij swój film lub zdjęcie","Film 30 s – 2 min mówiąc do kamery → twoja twarz i głos. Zdjęcie → tylko twarz.","Imię","Miejsce (opcjonalnie)","Oryginał","Zapisz aktora","Tylko zdjęcie — za ciebie przemówi pasujący głos AI.","Zmień plik"],
"uk": ["Створіть свого актора","Завантажте своє відео або фото","Відео 30 с – 2 хв, говоріть у камеру → ваше обличчя і голос. Фото → лише обличчя.","Ім'я","Локація (необов'язково)","Оригінал","Зберегти актора","Лише фото — за вас говоритиме відповідний ШІ-голос.","Змінити файл"],
}
for k,v in T3.items(): assert len(v)==len(KEYS3),(k,len(v))
KEYS += KEYS3
for k in T: T[k] = T[k] + T3[k]
