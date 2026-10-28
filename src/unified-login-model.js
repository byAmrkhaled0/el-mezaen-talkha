import {staffDestination} from './staff-routing.js';
import {normalizePhone} from '../functions/src/core.js';
export function loginIdentifier(value){const text=String(value||'').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));if(/^[+\d٠-٩۰-۹\s()-]+$/.test(text)){try{return {kind:'phone',value:'+2'+normalizePhone(text)};}catch{}}
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))return {kind:'email',value:text};
 if(/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(text))return {kind:'username',value:text.toLowerCase()};
 throw Error('اكتب إيميلك أو اسم المستخدم أو رقم موبايل مصري صحيح');}
export function loginDestination(role,user){const staff=staffDestination(role);if(staff)return staff;return !role&&user?.phoneNumber?'/account/':null;}
