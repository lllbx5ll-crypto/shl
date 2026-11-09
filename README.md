# ZYQMORA AI

**Developed by Al-Qmishi**  
*Create Beyond Limits*

منصة عربية لبناء المواقع بالمحادثة، مع Firebase للمستخدمين والمشاريع ومحرك نماذج مفتوح المصدر يعمل محلياً عبر Ollama.

## الموجود في المستودع

- واجهة React/Vite عربية متجاوبة وتسجيل الدخول عبر Google.
- حفظ ملفات المستخدم ومشاريعه في Cloud Firestore.
- دردشة برمجية في صفحة الذكاء الاصطناعي.
- إنشاء موقع HTML/CSS/JavaScript من وصف عربي، مع معاينة داخل iframe معزول.
- اختيار نموذج من النماذج المثبتة محلياً في Ollama.
- Backend بـ Express يتحقق من Firebase ID tokens في وضع الإنتاج.
- إعداد Docker Compose لتشغيل التطبيق وOllama معاً.
- قواعد Firestore تسمح بحفظ ملفات الموقع مع كل مشروع خاص.

## هل يحتاج API Key؟

لا يحتاج مفتاح API مدفوع من OpenAI أو غيرها. النموذج يعمل على جهاز/خادم تملكه عبر Ollama. يوجد اتصال HTTP داخلي بين خادم ZYQMORA وOllama المحلي، لكنه ليس حساب مزود خارجي ولا يحتاج مفتاحاً مدفوعاً.

**مهم:** GitHub يحفظ الكود ولا يشغّل نموذج الذكاء الاصطناعي. وFirebase Hosting يستضيف الواجهة فقط؛ يجب أن يبقى جهاز/خادم يشغّل Ollama والـBackend متصلاً حتى تعمل الدردشة للزوار.

## النماذج المقترحة

- الافتراضي: `qwen2.5-coder:7b` (حجمه التقريبي 4.7GB).
- للأجهزة الأضعف: `qwen2.5-coder:3b` (حجمه التقريبي 1.9GB).
- يمكن تنزيل نماذج أخرى في Ollama، وستظهر النماذج المثبتة في قائمة الاختيار.

## تشغيل محلياً

### 1. المتطلبات

- Node.js 20 أو أحدث.
- Ollama مثبت على جهازك: https://ollama.com/download
- ذاكرة كافية للنموذج المختار؛ تنزيل النموذج يحتاج مساحة تخزين واتصال إنترنت أول مرة.

### 2. تنزيل النموذج

شغّل Ollama ثم نفّذ:

```bash
ollama pull qwen2.5-coder:7b
```

إذا كان الجهاز محدود الموارد:

```bash
ollama pull qwen2.5-coder:3b
```

### 3. إعداد المشروع

```bash
npm install
```

انسخ `.env.example` إلى `.env`، ثم في التطوير المحلي اترك الإعدادات كالتالي:

```env
NODE_ENV=development
ALLOW_LOCAL_DEV_WITHOUT_ADMIN=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:7b
FIREBASE_PROJECT_ID=zyqmora-ai
```

لا ترفع ملف `.env` إلى GitHub.

### 4. تشغيل الخادم والواجهة

افتح نافذتين طرفية داخل مجلد المشروع:

النافذة الأولى:

```bash
npm run server
```

النافذة الثانية:

```bash
npm run dev
```

افتح عنوان Vite الذي يظهر، سجّل الدخول بحساب Google، ثم افتح «الذكاء الاصطناعي».

## تشغيل Docker

1. ثبّت Docker Desktop أو Docker Engine.
2. أنشئ ملف `.env` خاصاً بالخادم ولا ترفعه إلى GitHub.
3. في وضع الإنتاج يجب توفير `FIREBASE_SERVICE_ACCOUNT_JSON` كسرّ في بيئة التشغيل. لا تستخدم تجاوز المصادقة المحلي في الإنتاج.
4. شغّل:

```bash
docker compose up -d --build
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

ثم افتح `http://localhost:3001`.

## إعداد Firebase

1. تأكد من تفعيل Google في Authentication.
2. أضف `localhost` ونطاق الواجهة المنشورة إلى Authorized domains.
3. انشر قواعد Firestore الموجودة في `firestore.rules` من Firebase Console.
4. في وضع الإنتاج، أنشئ Service Account للخادم فقط، وضع JSON في متغير البيئة `FIREBASE_SERVICE_ACCOUNT_JSON`. لا تضعه في الواجهة ولا في المستودع.

## نشر الواجهة والخادم

- يمكن نشر الواجهة الثابتة على Firebase Hosting.
- يجب تشغيل Backend وOllama على جهاز أو خادم متصل بالإنترنت. عند فصل الواجهة عن الخادم، عيّن `VITE_API_BASE_URL` أثناء بناء الواجهة إلى عنوان Backend، واضبط `CORS_ORIGINS` على نطاق الواجهة.
- Firebase Hosting وحده لا يشغّل أوزان النماذج أو خادم Ollama.
- لا يوجد ضمان لاستضافة مجانية دائمة أو توليد غير محدود؛ موارد المعالجة والذاكرة والتخزين مطلوبة.

## حدود المرحلة الحالية

- الدردشة وتوليد مواقع ثابتة HTML/CSS/JS ومعاينتها محلياً مدعومة بالكود المضاف.
- لم يتم تشغيل Ollama أو تنزيل أوزان النموذج على حسابك/جهازك من GitHub؛ هذه خطوة تشغيل على الجهاز المضيف.
- لا يوجد بعد نشر عام بنقرة واحدة لمواقع العملاء، ولا محرر متعدد الملفات متقدم، ولا نظام اشتراكات.
- معاينة الكود معزولة داخل iframe؛ لا تنفّذ ملفات المستخدمين على خادم المنصة.

## مراجع مفتوحة المصدر

راجع `OPEN_SOURCE_STACK.md` لمصادر Ollama وQwen وbolt.diy وتراخيصها ومبررات الاختيار.
