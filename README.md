# ZYQMORA AI

**Developed by Al-Qmishi**  
*Create Beyond Limits*

منصة عربية قيد التطوير لحفظ أفكار ومشاريع إنشاء المواقع، مع تسجيل دخول Google عبر Firebase.

## الموجود حالياً

- واجهة عربية متجاوبة مع الجوال.
- تسجيل الدخول عبر Google باستخدام Firebase Authentication (Redirect مناسب للهواتف).
- إنشاء ملف مستخدم خاص في Cloud Firestore.
- حفظ طلبات المشاريع كمسودات خاصة.
- عرض المشاريع وحذفها.
- قواعد Firestore تمنع المستخدم من قراءة مشاريع مستخدم آخر.
- إعداد Firebase Hosting لتطبيق Vite.

## متطلبات التشغيل

- Node.js 20 أو أحدث.
- npm.
- مشروع Firebase باسم المشروع الحالي `zyqmora-ai`.

## التشغيل محلياً

```bash
npm install
npm run dev
```

افتح عنوان Vite الذي يظهر في الطرفية.

## إعداد Firebase

1. في Firebase Console، افتح Authentication ثم Sign-in method وتأكد أن Google مفعّل.
2. في Authentication > Settings > Authorized domains أضف `localhost` للتطوير المحلي، وأضف نطاق الاستضافة بعد النشر.
3. أنشئ Cloud Firestore إذا لم يكن موجوداً.
4. افتح Firestore Database > Rules، وانسخ محتوى الملف `firestore.rules` ثم اضغط Publish.
5. إعدادات تطبيق الويب العامة موجودة في `src/firebase.js`. هذه الإعدادات ليست Service Account ولا تمنح صلاحية إدارية بحد ذاتها. أمان البيانات يعتمد على قواعد Firestore وقيود Google Cloud المناسبة.

## البناء والنشر على Firebase Hosting

```bash
npm run build
npm install -g firebase-tools
firebase login
firebase use zyqmora-ai
firebase deploy --only hosting
```

لنشر قواعد Firestore أيضاً باستخدام CLI:

```bash
firebase deploy --only firestore:rules
```

يمكن كذلك نشر Hosting والقواعد معاً:

```bash
firebase deploy --only hosting,firestore:rules
```

## حدود النسخة الحالية

هذه نسخة تأسيسية: تحفظ وصف المشروع وتدير جلسة المستخدم، لكنها **لا تولّد كود المواقع بعد**. لم يتم توصيل نموذج ذكاء اصطناعي أو محرك معاينة/نشر لمواقع العملاء حتى الآن. الخطوة التالية هي تجهيز خادم آمن لمحرك النموذج، ثم بيئة معاينة معزولة ونظام نشر بموافقة المستخدم.

لا تضع Service Account JSON أو مفاتيح خاصة أو كلمات مرور في هذا المستودع. ولا تنفّذ أكواد المشاريع التي يرسلها المستخدمون على خادم الواجهة مباشرة.
