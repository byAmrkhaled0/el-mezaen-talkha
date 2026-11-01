export async function requestDeviceNotificationPermission(notification = globalThis.Notification) {
  if (!notification) throw new Error('PUSH_NOT_CONFIGURED');
  // Invoke from the click handler before loading Firebase or registering a worker.
  const permission = notification.permission === 'default'
    ? await notification.requestPermission() : notification.permission;
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'PUSH_DENIED' : 'PUSH_DISMISSED');
  return permission;
}

export function deviceNotificationControls({permission, ready = false, busy = false}) {
  const supported = ['default', 'granted', 'denied'].includes(permission);
  return {
    label: busy ? 'جارٍ التفعيل…' : permission === 'granted' ? 'ربط تنبيهات الجهاز' : 'تفعيل تنبيهات الجهاز',
    disabled: busy || !supported || permission === 'denied',
    hidden: permission === 'granted' && ready,
    canTest: !busy && permission === 'granted' && ready,
    help: permission === 'denied' ? 'اسمح بالإشعارات من إعدادات الموقع في المتصفح، ثم أعد التفعيل.'
      : !supported ? 'جرّب متصفحًا يدعم الإشعارات. على iPhone افتح الموقع من أيقونته بعد إضافته للشاشة الرئيسية.'
      : 'التفعيل لهذا الجهاز فقط. إشعارات اللوحة تظل متاحة أثناء فتحها.'
  };
}

export async function showDeviceNotification(registration, title, options) {
  if (typeof registration?.showNotification !== 'function') throw new Error('PUSH_NOT_CONFIGURED');
  // The window Notification constructor is unavailable on several mobile browsers.
  await registration.showNotification(title, options);
}
