# تدقيق بيانات فروع العمال — Phase 11.3

**نطاق القراءة:** كتالوج المصدر المحلي فقط. لا جرد إنتاج حي ولا استنتاج ربط إنتاج. الصور التشغيلية تستخدم fixtures؛ لا تُعتمد كإثبات لتوزيع العمال الفعلي.

| المجموعة في المصدر المحلي | العدد |
|---|---:|
| طلخا فقط |0|
| المشاية فقط |0|
| كلا الفرعين |21|
| ربط مفقود |0|
| ربط غير صالح |0|

الجدول التفصيلي لكل staffId/name/active/available/branchIds/serviceIds/linked UID في PHASE11_3_STAFF_LOCAL_AUDIT.json. توزيع المصدر لا يفسر لماذا الإنتاج يُظهر صفرًا في طلخا ولا يمنح ترخيصًا لنسخه للإنتاج. **جرد الإنتاج وmapping المالك unresolved.**

واجهة الإدارة تعرض حالة العامل، الفروع، UID المرتبط عند وجوده، حالة الصورة، وتنبيه «غير مربوط بفرع» أو ربط غير صالح. «تحديد فروع العامل» يفتح editor الحالي فقط لـAdmin؛ الخادم وقواعد النطاق لم تتغير. Team public يحتفظ بفلتر branchIds. عند صفر: «فريق الفرع بيتحدث حاليًا»، وتحذير release في audit لفرع نشط بدون عمال نشطين. لا إدخال seed workers كحل للإنتاج.

الأداة الآمنة تعمل على export مصرح:

```sh
node scripts/staff-branch-audit.mjs approved-read-only-export.json
```

لا اتصال Firebase أو write في السكربت. للحصول على proposal عند mapping معتمد:

```sh
node scripts/staff-branch-merge-plan.mjs approved-read-only-export.json owner-approved-mapping.json
```

mapping يتطلب approvedBy وapprovedAt وstaff:[{staffId,branchIds}]. المخرجات merge:true فقط لحقل branchIds، ومقارنة changed تجعل إعادة الاقتراح idempotent. لا حذف أو إعادة كتابة booking history. لا apply تلقائي أو prod credentials. لم يقدم المالك mapping، لذلك لم ننشئ تعيينات ولم ننفذ migration.
