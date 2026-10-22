// Local state only. The callable remains the authorization boundary.
export function latestWorkerContext(load, commit) {
  let generation = 0;
  return async branchId => {
    const current = ++generation;
    try {
      const result = await load(branchId);
      if (current !== generation) return false;
      commit(result);
      return true;
    } catch (error) {
      if (current !== generation) return false;
      throw error;
    }
  };
}

export function validateWorkerPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)
      || file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error('اختر صورة JPG أو PNG أو WebP أو AVIF بحد أقصى 10MB قبل الضغط');
  }
}

// Retain the uploaded URL if linking fails, so retrying does not upload twice.
export function workerPhotoSave(upload, link) {
  let uploadedFile, uploadedUrl, uploadedStaffId, pending = false;
  return async (file, staffId, progress) => {
    validateWorkerPhoto(file);
    if (pending) throw new Error('جارٍ حفظ الصورة؛ انتظر اكتمال الطلب');
    pending = true;
    try {
      if (file !== uploadedFile || staffId !== uploadedStaffId || !uploadedUrl) {
        const url = await upload(file, `staff/${staffId}`, progress);
        uploadedFile = file;
        uploadedStaffId = staffId;
        uploadedUrl = url;
      }
      await link(uploadedUrl);
      return uploadedUrl;
    } finally { pending = false; }
  };
}
