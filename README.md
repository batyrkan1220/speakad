# SpeakAd.ai — Talking Actors

Сценарийден UGC стиліндегі «сөйлейтін актер» жарнама видеоларын жасайтын платформа.

## Мүмкіндіктер
- **Актер кітапханасы**: 24 дайын актер, іздеу, сұрыптау, фильтрлер (жынысы, жасы, түрі, жағдай, аксессуарлар, эмоция), таңдаулылар.
- **Актер жасау**: промпттан (+ референс сурет), суреттен немесе видеодан клондау (бет пен дауыс).
- **Сценарий**: 5000 таңбаға дейін, `[excited]`, `[whispers]`, `[laughs]` сияқты эмоция тегтері (қолмен немесе автоматты).
- **Аудио**: Text to Speech (ElevenLabs v3) немесе Speech to Speech (өз аудиоңызды жүктеу/жазу, актер дауысына ауыстыру не өз дауысыңызды қалдыру).
- **Модель**: OmniHuman 1.5 / Turbo (fal.ai), 720p немесе 1080p.
- **Бірнеше актер бір сценарийге**: әр актерге жеке видео.
- Жобалар, тарих, жүктеп алу.

## Деректер қайда сақталады
Барлық деректер **Supabase**-те: жобалар, генерациялар, актерлер, баптаулар (Postgres), видео/аудио/суреттер (`media` bucket), сервер логтары (`logs` кестесі). Render тек қосымшаны іске қосады. Схема: `supabase/migrations/0001_init.sql`. Supabase бапталмаса, қосымша браузердің localStorage-іне қайтады.

## Іске қосу
```bash
npm install
cp .env.example .env.local   # FAL_KEY, ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
npm run dev                  # http://localhost:3000
```
Алғаш ашқанда **Add actors → Generate actor library** батырмасын басыңыз: дайын актерлердің портреттері fal FLUX арқылы жасалады (шамамен $0.60).

Өз суреттеріңізді қолдану үшін `data/seed.ts` ішіндегі актерге `image: "/actors/<id>.jpg"` деп жазып, файлды `public/actors/` папкасына салыңыз.

## Vercel-ге орналастыру
`vercel deploy` және Environment Variables бөліміне `FAL_KEY` пен `ELEVENLABS_API_KEY` қосыңыз.
Ескерту: Vercel сұраныс көлемін ~4.5 MB-қа шектейді, сондықтан ұзын аудио/видео жүктеу үшін файлды кішірейтіңіз.

## Құны (шамамен)
- OmniHuman 1.5: $0.16 / видео секундына
- ElevenLabs: тарифіңіз бойынша (таңба саны)

## Құрылымы
- `app/page.tsx`: студия (сайдбар, нәтижелер торы, сценарий жазатын өріс, баптаулар)
- `components/ActorPicker.tsx`, `components/CreateActorModal.tsx`
- `app/api/generate`: TTS/STS → fal storage → OmniHuman кезегі
- `app/api/status`: генерация күйін тексеру
- `app/api/create-actor`, `app/api/clone-voice`, `app/api/upload`, `app/api/voices`
