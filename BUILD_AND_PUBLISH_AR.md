# أوامر البناء والنشر — PowerShell

انسخ محتويات مجلد el-mezaen من الأرشيف داخل مجلد مستودع Git الموجود عندك. احتفظ بمجلد .git وملفات إعداداتك المحلية. افتح Terminal داخل مجلد المشروع نفسه. استخدم Node.js 22 وFirebase CLI.

## 1) بناء وفحص النسخة
```powershell
npm ci --include=dev
npm --prefix functions ci
npm run build
npm run verify:build
npm run audit:links
```
توقف عند أي فشل قبل تنفيذ الخطوات التالية. اختبارات الكود تم تنفيذها محليًا قبل تجهيز النسخة. لإعادتها على Windows، اضبط PYTHON وQA_PYTHON على مسار Python عندك وQA_VITE_CONFIG_LOADER=runner، ثم شغّل npm test وnpm --prefix functions test.

## 2) تجهيز Firebase قبل نشر الواجهة
```powershell
firebase login
firebase deploy --project el-mezaen-talkha --only "firestore:indexes,storage"
.\DEPLOY_RELEASE.ps1 -Mode Backend
.\DEPLOY_RELEASE.ps1 -Mode Verify
```
انتظر Enabled للفهارس الجديدة في Firebase Console / Firestore / Indexes قبل تجربة الوظائف الجديدة. إذا طلب Firebase حذف Functions أو Indexes، اختار No وتوقف للمراجعة. لا تستخدم --force. هذا الترتيب ينشر وظائف ومخططات وقواعد؛ لا يشغّل أي ترحيل بيانات أو أدوات حسابات.

## 3) رفع الواجهة على GitHub
```powershell
git status --short
git add --pathspec-from-file=GITHUB_FILES.txt
git diff --cached --stat
git commit -m "Complete worker and cashier booking workflows"
git push origin main
```
الأوامر تفترض إن origin هو https://github.com/byAmrkhaled0/el-mezaen-talkha.git وإن الفرع main. تم التحقق من الربط وقت تجهيز الأرشيف. ملف GITHUB_FILES.txt يحدد الملفات المقصودة؛ لا تستخدم git add . ولا تضف أي ملفات خارج القائمة دون مراجعة.

main مربوط بـVercel؛ بعد نجاح النشر افتح:
https://el-mezaen-talkha.vercel.app/login/

لو ظهر خطأ في أي خطوة ابعت نص الخطأ فقط، بدون مفاتيح أو Tokens أو كلمات مرور. لم يتم Push أو Deploy أثناء تجهيز النسخة.
