import {canonicalManagedStoragePath} from './managed-media.js';
export const SITE_MEDIA_FIELDS = Object.freeze({heroImageUrl:'homepage',hairSystemImageUrl:'homepage',aboutImageUrl:'homepage',brandLogoUrl:'branding',brandFaviconUrl:'branding'});
export async function validateSiteMediaSettings(payload, previous, {role,bucket,metadata,canEditSiteMedia=false}) {
 for(const [field,folder] of Object.entries(SITE_MEDIA_FIELDS)) {
  if(!(field in payload))continue;
  const value=payload[field];
  if(typeof value!=='string' || value.length>1200)throw Error('SITE_MEDIA_INVALID');
  if(role!=='admin'&&!(role==='media'&&canEditSiteMedia))throw Error('SITE_MEDIA_ADMIN_REQUIRED');
  if(!value || value===previous?.[field])continue;
  const path=canonicalManagedStoragePath(value,bucket);
  if(!path.startsWith(`public/${folder}/`) || !/\.(?:jpe?g|png|webp|avif)$/i.test(path))throw Error('SITE_MEDIA_PATH');
  const meta=await metadata(path);
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(meta.contentType) || !Number.isFinite(Number(meta.size)) || Number(meta.size)<=0 || Number(meta.size)>=5*1024*1024)throw Error('SITE_MEDIA_IMAGE');
  if(field==='brandFaviconUrl' && (meta.contentType!=='image/png' || !path.toLowerCase().endsWith('.png')))throw Error('SITE_MEDIA_FAVICON_PNG');
 }
}
