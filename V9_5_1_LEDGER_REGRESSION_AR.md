# V9.5.1 — إصلاح إسناد العامل في دفتر الإيرادات

## ROOT CAUSE

أعادت بوابة الـHandler الأصلية إنتاج الفشل على محاكي `demo-el-mezaen-gate` باستخدام Java 21: **41 ناجحًا من 42**. في `updateBooking()` كانت عمليتا إنشاء سجل الدفع عند `checkout` وإنشاء سجل الدفع/الاسترداد عند `markPaid` أو `refund` تكتبان `staffId: booking.staffId` مباشرة. الحجز الصحيح بلا عامل ينتج قيمة `undefined`، فيرفض Firestore Admin SDK المستند كاملًا داخل المعاملة. ظهر الفشل في اختبار استرداد V9.2 الاختياري، وكان موضع الدفع معرضًا للفشل نفسه.

## FILES CHANGED

- `functions/src/index.js`: موضعا إنشاء `revenueLedger` في `updateBooking()` فقط.
- `tests/v6-1-production-gate.emulator.mjs`: توكيد غياب الحقل في اختبار الاسترداد الأصلي، واختبار تغطية الدفع عند `checkout` و`markPaid` مع عامل وبلا عامل.
- هذا التقرير.

## EXACT FIX

استُبدل الحقل غير المشروط في الموضعين بـ:

```js
...(booking.staffId ? { staffId: sanitizeText(booking.staffId, 100) } : {})
```

الحجز بلا عامل لا يكتب `staffId` في سجل الدفتر. الحجز بعامل يحتفظ بالمعرّف المنقح. لم تتغير بنية الحجز، ولا إعداد `ignoreUndefinedProperties`، ولا حساب المبلغ أو طريقة الدفع أو الفرع أو قواعد الصلاحيات. لا تنشأ كتابة إضافية.

## HANDLER GATE RESULT

شُغّل `npm run test:gate:handlers` فعليًا على Auth وFirestore Emulator بمشروع `demo-el-mezaen-gate` وJava 21.

- قبل الإصلاح: **41/42 PASS، 1 FAIL** مع رسالة Firestore: `Cannot use "undefined" as a Firestore value (found in field "staffId")`.
- بعد الإصلاح: **43/43 PASS**. الاختبار الأصلي للاسترداد نجح، والاختبار المضاف نجح.
- الاسترداد بلا عامل: فرع المشاية، طريقة الدفع الأصلية `card` رغم طلب `cash`، مبلغ `-37`، وغياب `staffId`، وتكرار الطلب يعيد `idempotent: true` مع سجل دفتر واحد.
- الدفع بلا عامل: `checkout` و`markPaid` ينجحان ولا يكتبان `staffId`. `checkout` المكرر لا ينشئ سجلًا آخر. الدفع بحجز له عامل يحفظ `mashaya-staff`.

## RULES RESULT

شُغّل `npm run test:rules` فعليًا على Firestore وStorage Emulator بمشروع `demo-el-mezaen-rules` وJava 21: **18/18 PASS**. رسائل `PERMISSION_DENIED` في السجل تخص حالات الرفض المقصودة في الاختبارات.

## FULL REGRESSION

| الأمر | النتيجة |
| --- | --- |
| `npm run test:gate:handlers` | 43/43 PASS |
| `npm run test:functions` | 45/45 PASS |
| `npm test` | 188/188 PASS |
| `npm run test:rules` | 18/18 PASS |

شُغلت الأوامر بالترتيب المطلوب. لم تشمل هذه المهمة تشغيل HTTP Functions Emulator أو فحص Production Gate النهائي؛ نجاح Handler Emulator لا يثبت جاهزية نشر Production.

## READY FOR NEXT SECURITY GATE: YES

انتهى انحدار `undefined staffId` واختباراته على المحاكي. **هذا ليس تصريحًا بأن Production Ready**؛ تبقى بوابة الأمن والإنتاج النهائية مستقلة.
